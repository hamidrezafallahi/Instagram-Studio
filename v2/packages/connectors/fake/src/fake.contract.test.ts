/**
 * آزمون قرارداد adapter (packages/connectors/README.md):
 * happy path، expired auth، quota، unknown outcome و unsupported action.
 * این آزمون با کانکتور نمونه اجراست و گواه اتصال واقعی به هیچ سرویسی نیست.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { ConnectorRegistry, buildProviderCatalog, guardConnector, requireCapability } from '@studio/connectors';
import { loadCapabilityRegister } from '@studio/config';
import {
  CONNECTOR_PORT_METHODS,
  ConnectorManifest,
  ConnectorResult,
  StudioError,
  type Capability,
  type ConnectorContext,
  type PublishInput,
} from '@studio/contracts';
import { FakeProviderState, createFakeConnector, fakeManifest, type FakeScenario } from './index.ts';

const NOW = new Date('2026-11-11T08:00:00.000Z');

function context(scenario: FakeScenario = 'happy'): ConnectorContext {
  return {
    connection: {
      id: randomUUID(),
      workspace_id: randomUUID(),
      brand_id: randomUUID(),
      provider: 'fake',
      external_account_id: null,
      config: { scenario },
    },
    resolveSecret: async () => null,
    now: () => NOW,
    trace_id: 'test',
  };
}

function publishInput(ctx: ConnectorContext, key = `key-${randomUUID()}`): PublishInput {
  return {
    action: 'feed_publish',
    intent_id: randomUUID(),
    idempotency_key: key,
    target: {
      connection_id: ctx.connection.id,
      channel: 'instagram',
      format: 'post',
      destination_id: 'sample-account',
      scheduled_at_utc: NOW.toISOString(),
      timezone: 'Asia/Tehran',
    },
    content: { content_id: randomUUID(), revision: 1, text: 'متن نمونه', hash: 'a'.repeat(64), media: [] },
  };
}

async function capabilitiesOf(port: ReturnType<typeof createFakeConnector>, ctx: ConnectorContext): Promise<Capability[]> {
  return (await port.discoverCapabilities(ctx)).map((item) => ({ ...item, connection_id: ctx.connection.id }));
}

describe('قرارداد کانکتور نمونه', () => {
  it('manifest معتبر است، برچسب نمونه دارد و همهٔ متدهای port پیاده شده‌اند', () => {
    assert.equal(ConnectorManifest.safeParse(fakeManifest).success, true);
    assert.equal(fakeManifest.is_sample, true);
    const port = createFakeConnector() as unknown as Record<string, unknown>;
    for (const method of CONNECTOR_PORT_METHODS) assert.equal(typeof port[method], 'function', method);
  });

  it('happy path: انتشار موفق با رسید؛ نشانی ساختگی از دامنهٔ ‎.invalid', async () => {
    const port = createFakeConnector();
    const ctx = context();
    const result = await port.publish(ctx, publishInput(ctx));
    assert.equal(ConnectorResult.safeParse(result).success, true);
    assert.equal(result.status, 'succeeded');
    assert.match(result.external_url ?? '', /^https:\/\/sample\.invalid\//);
    assert.deepEqual(result.cost_actual, { amount_minor: 0, currency: 'IRR' });
    assert.ok(result.evidence_ref);
  });

  it('تکرار همان کلید یکتایی side effect دوم نمی‌سازد', async () => {
    const state = new FakeProviderState();
    const port = createFakeConnector(state);
    const ctx = context();
    const input = publishInput(ctx);
    const first = await port.publish(ctx, input);
    const second = await port.publish(ctx, input);
    assert.equal(first.external_id, second.external_id);
    assert.equal(state.publishCalls, 1);
    await port.publish(ctx, publishInput(ctx));
    assert.equal(state.publishCalls, 2);
  });

  it('auth منقضی: آزمون اتصال شکست می‌خورد و قابلیت‌ها needs_access می‌شوند', async () => {
    const port = createFakeConnector();
    const ctx = context('auth_expired');
    const health = await port.validateConnection(ctx);
    assert.equal(health.ok, false);
    assert.equal(health.error_code, 'AUTH_EXPIRED');
    const capabilities = await port.discoverCapabilities(ctx);
    assert.equal(capabilities.some((item) => item.status === 'verified'), false);
    assert.equal((await port.publish(ctx, publishInput(ctx))).error_code, 'AUTH_EXPIRED');
  });

  it('سهمیهٔ تمام‌شده و محدودیت نرخ خطای مشخص با retry_after می‌دهند', async () => {
    const port = createFakeConnector();
    const quota = context('quota_exhausted');
    assert.equal((await port.publish(quota, publishInput(quota))).error_code, 'QUOTA_EXHAUSTED');
    const limited = context('rate_limited');
    const result = await port.publish(limited, publishInput(limited));
    assert.equal(result.error_code, 'RATE_LIMITED');
    assert.equal(result.retry_after, 30);
  });

  it('نتیجهٔ نامعلوم: accepted/unknown انتشار حساب نمی‌شود و فقط reconcile آن را روشن می‌کند', async () => {
    const state = new FakeProviderState();
    const port = createFakeConnector(state);
    const ctx = context('unknown_outcome');
    const input = publishInput(ctx);
    const result = await port.publish(ctx, input);
    assert.equal(result.status, 'unknown');
    assert.equal(result.error_code, 'UNKNOWN_OUTCOME');
    assert.equal(result.external_id, null);
    const status = await port.getOperationStatus(ctx, { action: 'feed_publish', idempotency_key: input.idempotency_key });
    assert.equal(status.status, 'succeeded');
    assert.ok(status.external_id);
    assert.equal(state.publishCalls, 1, 'reconcile نباید دوباره منتشر کند');
  });

  it('عملیاتی که ارائه‌دهنده ردی از آن ندارد «رخ نداده» گزارش می‌شود', async () => {
    const port = createFakeConnector();
    const ctx = context();
    const status = await port.getOperationStatus(ctx, { action: 'feed_publish', idempotency_key: 'never-sent-key' });
    assert.equal(status.status, 'failed');
    assert.equal(status.error_code, 'NOT_FOUND');
  });

  it('قابلیت پشتیبانی‌نشده یا دستی با UNSUPPORTED_CAPABILITY رد می‌شود، نه موفقیت تهی', async () => {
    const port = createFakeConnector();
    const ctx = context();
    const guarded = guardConnector(port, async () => capabilitiesOf(port, ctx));
    for (const action of ['trial_reel_publish', 'dm_reply', 'no_such_action']) {
      await assert.rejects(
        guarded.publish(ctx, { ...publishInput(ctx), action }),
        (error: unknown) => error instanceof StudioError && error.code === 'UNSUPPORTED_CAPABILITY',
        action,
      );
    }
    assert.equal((await guarded.publish(ctx, publishInput(ctx))).status, 'succeeded');
  });

  it('قابلیت منقضی‌شده قابل استفاده نیست', async () => {
    const port = createFakeConnector();
    const ctx = context();
    const expired = (await capabilitiesOf(port, ctx)).map((item) => ({ ...item, expires_at: '2026-11-10T00:00:00.000Z' }));
    assert.throws(() => requireCapability(expired, 'feed_publish', NOW));
  });

  it('سنجهٔ ناموجود null است نه صفر و همهٔ مقدارها برچسب sample دارند', async () => {
    const port = createFakeConnector();
    const ctx = context();
    const batch = await port.fetchMetrics(ctx, {
      action: 'metrics_read',
      object_ids: [],
      period_start: '2026-11-06T20:30:00.000Z',
      period_end: '2026-11-13T20:30:00.000Z',
    });
    assert.equal(batch.is_sample, true);
    const retention = batch.points.find((point) => point.metric === 'retention_rate');
    assert.equal(retention?.value, null);
    assert.equal(retention?.quality, 'unavailable');
    assert.ok(batch.points.filter((point) => point.value !== null).every((point) => point.quality === 'sample'));
    const again = await port.fetchMetrics(ctx, {
      action: 'metrics_read', object_ids: [],
      period_start: '2026-11-06T20:30:00.000Z', period_end: '2026-11-13T20:30:00.000Z',
    });
    assert.deepEqual(again.points, batch.points, 'دادهٔ نمونه باید قطعی باشد');
  });
});

describe('فهرست ارائه‌دهنده‌ها', () => {
  it('فقط adapter واقعاً موجود قابل اتصال است؛ بقیه دلیل و مسیر جایگزین دارند', () => {
    const registry = new ConnectorRegistry().register(createFakeConnector());
    const catalog = buildProviderCatalog(loadCapabilityRegister(), registry);
    const connectable = catalog.filter((entry) => entry.connectable).map((entry) => entry.manifest.provider_id);
    assert.deepEqual(connectable, ['fake']);
    for (const entry of catalog.filter((item) => !item.connectable)) {
      assert.equal(entry.manifest.implemented, false, entry.manifest.provider_id);
      assert.ok((entry.blocked_reason_fa ?? '').length > 20, entry.manifest.provider_id);
      assert.equal(
        entry.manifest.capabilities.some((capability) => capability.status === 'verified'),
        false,
        `${entry.manifest.provider_id}: بدون آزمون حساب verified نمایش داده شد`,
      );
    }
    assert.ok(catalog.some((entry) => entry.manifest.provider_id === 'instagram'));
    assert.throws(() => registry.get('instagram'), (error: unknown) => error instanceof StudioError);
  });
});
