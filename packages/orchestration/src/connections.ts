import { randomUUID } from 'node:crypto';
import { buildProviderCatalog, guardConnector } from '@studio/connectors';
import {
  StudioError,
  type Capability,
  type ConnectionHealth,
  type ConnectionStatus,
  type ConnectionView,
  type ConnectorContext,
  type ConnectorPort,
  type CreateConnectionBody,
  type ProviderCatalogEntry,
} from '@studio/contracts';
import { connectionRepo, iso, type ConnectionRow, type Tx } from '@studio/data';
import { processScrubber } from '@studio/security';
import { audit, notFound, type BrandCall, type StudioDeps } from './context.ts';

const secretIdOf = (ref: string | null): string | null => (ref ? ref.slice('secret://vault/'.length) : null);

export function createConnectionService(deps: StudioDeps) {
  function view(row: ConnectionRow, capabilities: Capability[]): ConnectionView {
    const manifest = deps.connectors.has(row.provider) ? deps.connectors.get(row.provider).manifest : null;
    return {
      id: row.id,
      brand_id: row.brand_id,
      provider: row.provider,
      title_fa: manifest?.title_fa ?? row.provider,
      label: row.label,
      status: row.status,
      is_sample: row.is_sample,
      auth_kind: row.auth_kind,
      external_account_id: row.external_account_id,
      // مقدار راز هرگز برنمی‌گردد؛ فقط وجودش اعلام می‌شود.
      has_secret: row.secret_ref !== null,
      health: row.health,
      capabilities: capabilities.filter((item) => item.connection_id === row.id),
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
    };
  }

  /** آنچه adapter می‌بیند. راز فقط هنگام نیاز و فقط داخل adapter باز می‌شود و در scrubber ثبت می‌گردد. */
  function connectorContext(row: ConnectionRow, traceId: string): ConnectorContext {
    return {
      connection: {
        id: row.id,
        workspace_id: row.workspace_id,
        brand_id: row.brand_id,
        provider: row.provider,
        external_account_id: row.external_account_id,
        config: row.config,
      },
      trace_id: traceId,
      now: deps.now,
      async resolveSecret() {
        const secretId = secretIdOf(row.secret_ref);
        if (!secretId) return null;
        const sealed = await deps.db.tenant(
          { workspaceId: row.workspace_id, brandId: row.brand_id },
          (tx) => connectionRepo.getSecret(tx, secretId),
        );
        if (!sealed) return null;
        const value = deps.vault.open(sealed, {
          workspace_id: row.workspace_id,
          brand_id: row.brand_id,
          secret_id: secretId,
        });
        processScrubber.register(value);
        return value;
      },
    };
  }

  /** adapter با نگهبان capability؛ قابلیت‌ها از نتیجهٔ آخرین آزمون همان اتصال در پایگاه داده می‌آیند. */
  function guardedPort(row: ConnectionRow): ConnectorPort {
    return guardConnector(deps.connectors.get(row.provider), async () => {
      const capabilities = await deps.db.tenant(
        { workspaceId: row.workspace_id, brandId: row.brand_id },
        (tx) => connectionRepo.listCapabilities(tx, row.brand_id),
      );
      return capabilities.filter((item) => item.connection_id === row.id);
    });
  }

  /** آزمون اتصال: ابتدا validate (فقط خواندن)، سپس کشف قابلیت واقعی. شبکه بیرون از تراکنش انجام می‌شود. */
  async function probe(
    row: ConnectionRow,
    traceId: string,
  ): Promise<{ status: ConnectionStatus; health: ConnectionHealth; capabilities: Awaited<ReturnType<ConnectorPort['discoverCapabilities']>> }> {
    const port = deps.connectors.get(row.provider);
    const ctx = connectorContext(row, traceId);
    const health = await port.validateConnection(ctx);
    const capabilities = await port.discoverCapabilities(ctx);
    const status: ConnectionStatus = health.ok
      ? 'active'
      : health.error_code === 'AUTH_EXPIRED' || health.status === 'not_configured'
        ? 'needs_access'
        : 'error';
    return { status, health, capabilities };
  }

  async function loadRow(tx: Tx, connectionId: string): Promise<ConnectionRow> {
    const row = await connectionRepo.getConnection(tx, connectionId);
    if (!row) throw notFound('اتصال');
    return row;
  }

  async function test(call: BrandCall, connectionId: string): Promise<ConnectionView> {
    const scope = { workspaceId: call.workspace_id, brandId: call.brand_id };
    const row = await deps.db.tenant(scope, (tx) => loadRow(tx, connectionId));
    if (row.status === 'revoked') {
      throw new StudioError('CONFLICT', { message_fa: 'این اتصال قطع شده است؛ اتصال تازه بسازید.' });
    }
    const result = await probe(row, call.trace_id);
    return deps.db.tenant(scope, async (tx) => {
      const updated = await connectionRepo.updateConnectionState(tx, connectionId, {
        status: result.status,
        health: result.health,
      });
      await connectionRepo.replaceCapabilities(tx, row, result.capabilities);
      await audit(tx, call, {
        action: 'connection.test',
        target_type: 'connection',
        target_id: connectionId,
        outcome: result.health.ok ? 'succeeded' : 'failed',
        metadata: { status: result.status, error_code: result.health.error_code },
      });
      const capabilities = await connectionRepo.listCapabilities(tx, call.brand_id);
      return view(updated as ConnectionRow, capabilities);
    });
  }

  return {
    connectorContext,
    guardedPort,

    catalog(): ProviderCatalogEntry[] {
      return buildProviderCatalog(deps.register, deps.connectors);
    },

    async list(call: BrandCall): Promise<ConnectionView[]> {
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, async (tx) => {
        const rows = await connectionRepo.listConnections(tx, call.brand_id);
        const capabilities = await connectionRepo.listCapabilities(tx, call.brand_id);
        return rows.map((row) => view(row, capabilities));
      });
    },

    async listRows(call: BrandCall): Promise<{ rows: ConnectionRow[]; capabilities: Capability[] }> {
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, async (tx) => ({
        rows: await connectionRepo.listConnections(tx, call.brand_id),
        capabilities: await connectionRepo.listCapabilities(tx, call.brand_id),
      }));
    },

    async create(call: BrandCall, body: CreateConnectionBody): Promise<ConnectionView> {
      if (!deps.connectors.has(body.provider)) {
        const entry = buildProviderCatalog(deps.register, deps.connectors).find(
          (item) => item.manifest.provider_id === body.provider,
        );
        throw new StudioError('UNSUPPORTED_CAPABILITY', {
          message_fa:
            entry?.blocked_reason_fa ??
            `برای «${body.provider}» adapter اجرایی وجود ندارد؛ اتصال ساختگی یا حدسی ساخته نمی‌شود.`,
          action_required: 'تا آماده‌شدن adapter از خروجی دستی استفاده کنید.',
        });
      }
      const manifest = deps.connectors.get(body.provider).manifest;
      if (manifest.is_sample && !deps.settings.sampleData) {
        throw new StudioError('FORBIDDEN', { message_fa: 'اتصال نمونه در این نصب غیرفعال است.' });
      }
      if (body.secret) processScrubber.register(body.secret);

      const created = await deps.db.tenant(
        { workspaceId: call.workspace_id, brandId: call.brand_id },
        async (tx) => {
          let secretRef: string | null = null;
          if (body.secret) {
            const secretId = randomUUID();
            const sealed = deps.vault.seal(body.secret, {
              workspace_id: call.workspace_id,
              brand_id: call.brand_id,
              secret_id: secretId,
            });
            await connectionRepo.insertSecret(tx, {
              id: secretId,
              workspace_id: call.workspace_id,
              brand_id: call.brand_id,
              purpose: `connection:${body.provider}`,
              ...sealed,
            });
            secretRef = `secret://vault/${secretId}`;
          }
          const row = await connectionRepo.insertConnection(tx, {
            workspace_id: call.workspace_id,
            brand_id: call.brand_id,
            provider: body.provider,
            label: body.label?.trim() || manifest.title_fa,
            status: 'needs_access',
            is_sample: manifest.is_sample,
            auth_kind: manifest.auth_kind,
            secret_ref: secretRef,
            config: body.config ?? {},
          });
          await audit(tx, call, {
            action: 'connection.create',
            target_type: 'connection',
            target_id: row.id,
            outcome: 'succeeded',
            metadata: { provider: row.provider, is_sample: row.is_sample, has_secret: secretRef !== null },
          });
          return row;
        },
      );
      return test(call, created.id);
    },

    test,

    /** قطع اتصال: راز نابود می‌شود و قابلیت‌ها پاک می‌شوند؛ فقط همین اتصال متوقف می‌شود. */
    async revoke(call: BrandCall, connectionId: string): Promise<ConnectionView> {
      const scope = { workspaceId: call.workspace_id, brandId: call.brand_id };
      const row = await deps.db.tenant(scope, (tx) => loadRow(tx, connectionId));
      if (row.status !== 'revoked' && deps.connectors.has(row.provider)) {
        await deps.connectors
          .get(row.provider)
          .revoke(connectorContext(row, call.trace_id))
          .catch(() => undefined);
      }
      return deps.db.tenant(scope, async (tx) => {
        const secretId = secretIdOf(row.secret_ref);
        if (secretId) await connectionRepo.destroySecret(tx, secretId);
        const updated = await connectionRepo.updateConnectionState(tx, connectionId, {
          status: 'revoked',
          health: null,
          secret_ref: null,
        });
        await connectionRepo.replaceCapabilities(tx, row, []);
        await audit(tx, call, {
          action: 'connection.revoke',
          target_type: 'connection',
          target_id: connectionId,
          outcome: 'succeeded',
          metadata: { provider: row.provider },
        });
        return view(updated as ConnectionRow, []);
      });
    },
  };
}

export type ConnectionService = ReturnType<typeof createConnectionService>;
