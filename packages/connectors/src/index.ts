import {
  StudioError,
  type AuthKind,
  type Capability,
  type CapabilityRegister,
  type CapabilityRegisterEntry,
  type ConnectorContext,
  type ConnectorManifest,
  type ConnectorPort,
  type CostModel,
  type DiscoveredCapability,
  type ManifestCapability,
  type ProviderCatalogEntry,
} from '@studio/contracts';

/**
 * هستهٔ کانکتورها (packages/connectors/README.md):
 * registry adapterها، نگهبان capability و فهرست ارائه‌دهنده‌ها از روی ثبت قابلیت‌ها.
 * نبود قابلیت همیشه خطای UNSUPPORTED_CAPABILITY است، نه موفقیت تهی.
 */

export class ConnectorRegistry {
  readonly #ports = new Map<string, ConnectorPort>();

  register(port: ConnectorPort): this {
    const id = port.manifest.provider_id;
    if (this.#ports.has(id)) throw new Error(`adapter «${id}» دو بار ثبت شده است.`);
    this.#ports.set(id, port);
    return this;
  }

  has(providerId: string): boolean {
    return this.#ports.has(providerId);
  }

  get(providerId: string): ConnectorPort {
    const port = this.#ports.get(providerId);
    if (!port) {
      throw new StudioError('UNSUPPORTED_CAPABILITY', {
        message_fa: `برای «${providerId}» در این نسخه adapter اجرایی وجود ندارد؛ خروجی به‌صورت دستی تحویل می‌شود.`,
      });
    }
    return port;
  }

  manifests(): ConnectorManifest[] {
    return [...this.#ports.values()].map((port) => port.manifest);
  }
}

type AnyCapability = Pick<Capability, 'action' | 'status' | 'reason_code' | 'expires_at'>;

/** فقط قابلیت verified و منقضی‌نشده قابل اجراست؛ بقیه به مسیر دستی می‌روند. */
export function isUsable(capability: AnyCapability | undefined, now: Date = new Date()): boolean {
  if (!capability || capability.status !== 'verified') return false;
  return capability.expires_at === null || new Date(capability.expires_at) > now;
}

export function requireCapability(
  capabilities: readonly AnyCapability[],
  action: string,
  now: Date = new Date(),
): void {
  const capability = capabilities.find((item) => item.action === action);
  if (isUsable(capability, now)) return;
  throw new StudioError('UNSUPPORTED_CAPABILITY', {
    message_fa: capability
      ? `قابلیت «${action}» برای این اتصال در وضعیت ${capability.status} است (${capability.reason_code}).`
      : `قابلیت «${action}» برای این اتصال کشف نشده است.`,
    action_required: 'اتصال را آزمون کنید یا از خروجی دستی استفاده کنید.',
  });
}

/**
 * پوشش نگهبان: هر متد اجرایی پیش از رسیدن به adapter، capability همان اتصال را می‌خواهد.
 * capabilityها از پایگاه داده می‌آیند (نتیجهٔ آخرین آزمون حساب)، نه از ادعای خود adapter.
 */
export function guardConnector(
  port: ConnectorPort,
  loadCapabilities: (ctx: ConnectorContext) => Promise<readonly AnyCapability[]>,
): ConnectorPort {
  const guard = async (ctx: ConnectorContext, action: string): Promise<void> => {
    requireCapability(await loadCapabilities(ctx), action, ctx.now());
  };
  return {
    manifest: port.manifest,
    discoverCapabilities: (ctx) => port.discoverCapabilities(ctx),
    validateConnection: (ctx) => port.validateConnection(ctx),
    revoke: (ctx) => port.revoke(ctx),
    async prepareMedia(ctx, input) {
      await guard(ctx, input.action);
      return port.prepareMedia(ctx, input);
    },
    async publish(ctx, input) {
      await guard(ctx, input.action);
      return port.publish(ctx, input);
    },
    async getOperationStatus(ctx, input) {
      await guard(ctx, input.action);
      return port.getOperationStatus(ctx, input);
    },
    async fetchMetrics(ctx, input) {
      await guard(ctx, input.action);
      return port.fetchMetrics(ctx, input);
    },
    async listConversations(ctx, input) {
      await guard(ctx, input.action);
      return port.listConversations(ctx, input);
    },
    async sendReply(ctx, input) {
      await guard(ctx, input.action);
      return port.sendReply(ctx, input);
    },
  };
}

interface ProviderMeta {
  title_fa: string;
  auth_kind: AuthKind;
  docs_url: string | null;
}

/** شناسنامهٔ ثابت ارائه‌دهنده‌ها؛ وضعیت هر قابلیت از ثبت قابلیت‌ها می‌آید، نه از این‌جا. */
export const PROVIDER_META: Readonly<Record<string, ProviderMeta>> = {
  instagram: { title_fa: 'اینستاگرام', auth_kind: 'oauth2', docs_url: 'https://developers.facebook.com/docs/instagram-platform/content-publishing/' },
  linkedin: { title_fa: 'لینکدین', auth_kind: 'oauth2', docs_url: 'https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api' },
  telegram: { title_fa: 'تلگرام (کنترل مالک)', auth_kind: 'bot_token', docs_url: 'https://core.telegram.org/bots/api' },
  whatsapp: { title_fa: 'واتساپ', auth_kind: 'api_key', docs_url: 'https://whatsappbusiness.com/products/platform-pricing/' },
  wordpress: { title_fa: 'وردپرس', auth_kind: 'application_password', docs_url: 'https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/' },
  cms: { title_fa: 'سایت با CMS دیگر', auth_kind: 'manual', docs_url: null },
  canva: { title_fa: 'Canva (اختیاری)', auth_kind: 'oauth2', docs_url: 'https://www.canva.dev/docs/apps/rest-apis/reference/autofills/' },
  zernio: { title_fa: 'Zernio (مسیر اختیاری)', auth_kind: 'api_key', docs_url: 'https://zernio.com/' },
  postiz: { title_fa: 'Postiz (مسیر اختیاری)', auth_kind: 'api_key', docs_url: 'https://docs.postiz.com/general/introduction' },
  tapsell: { title_fa: 'تپسل', auth_kind: 'manual', docs_url: 'https://tapsell.com/' },
  yektanet: { title_fa: 'یکتانت', auth_kind: 'manual', docs_url: 'https://www.yektanet.com/' },
  virgool: { title_fa: 'ویرگول', auth_kind: 'manual', docs_url: 'https://virgool.io/' },
  google_search_console: { title_fa: 'Google Search Console', auth_kind: 'oauth2', docs_url: 'https://developers.google.com/webmaster-tools/v1/api_reference_index' },
  ai: { title_fa: 'تولید متن', auth_kind: 'none', docs_url: null },
  media: { title_fa: 'رندر رسانهٔ محلی', auth_kind: 'none', docs_url: null },
  mcp: { title_fa: 'درگاه MCP استودیو', auth_kind: 'none', docs_url: null },
  fake: { title_fa: 'کانکتور نمونه', auth_kind: 'none', docs_url: null },
};

const ROUTE_ORDER = ['direct', 'internal', 'manual', 'zernio', 'postiz'] as const;

function manifestFromRegister(provider: string, rows: CapabilityRegisterEntry[], checkedAt: string): ConnectorManifest {
  const meta = PROVIDER_META[provider] ?? { title_fa: provider, auth_kind: 'manual' as const, docs_url: null };
  const byAction = new Map<string, ManifestCapability>();
  const sorted = [...rows].sort(
    (a, b) => ROUTE_ORDER.indexOf(a.route) - ROUTE_ORDER.indexOf(b.route),
  );
  for (const row of sorted) {
    if (byAction.has(row.action)) continue;
    byAction.set(row.action, {
      action: row.action,
      title_fa: row.title_fa,
      status: row.status,
      reason_code: row.reason_code,
      fallback_fa: row.fallback_fa,
    });
  }
  const costs = new Set<CostModel>(rows.map((row) => row.cost_model));
  return {
    provider_id: provider,
    title_fa: meta.title_fa,
    auth_kind: meta.auth_kind,
    capabilities: [...byAction.values()],
    cost_model: costs.size === 1 ? ([...costs][0] as CostModel) : 'unknown',
    docs_url: meta.docs_url,
    checked_at: checkedAt,
    is_sample: false,
    implemented: false,
  };
}

/**
 * فهرست ارائه‌دهنده‌ها برای صفحهٔ «اتصال‌ها»: adapterهای واقعاً موجود + همهٔ ردیف‌های ثبت قابلیت‌ها.
 * ارائه‌دهندهٔ بدون adapter قابل اتصال نیست و دلیل و راه رفع آن صریح برمی‌گردد.
 */
export function buildProviderCatalog(
  register: CapabilityRegister,
  registry: ConnectorRegistry,
): ProviderCatalogEntry[] {
  const providers = [...new Set(register.entries.map((entry) => entry.provider))];
  const catalog: ProviderCatalogEntry[] = [];
  for (const manifest of registry.manifests()) {
    catalog.push({
      manifest,
      register: register.entries.filter((entry) => entry.provider === manifest.provider_id),
      connectable: true,
      blocked_reason_fa: null,
    });
  }
  for (const provider of providers) {
    if (registry.has(provider)) continue;
    const rows = register.entries.filter((entry) => entry.provider === provider);
    const milestones = [...new Set(rows.map((row) => row.milestone))].sort().join('، ');
    const allManual = rows.every((row) => row.status === 'manual_only' || row.status === 'unsupported');
    const internal = rows.every((row) => row.route === 'internal');
    catalog.push({
      manifest: manifestFromRegister(provider, rows, register.checked_at),
      register: rows,
      connectable: false,
      blocked_reason_fa: internal
        ? 'این قابلیت داخلی خود استودیو است و به اتصال حساب نیاز ندارد؛ وضعیت ساخت و آزمون هر بخش در جدول آمده است.'
        : allManual
          ? 'برای این سرویس مسیر API اثبات‌شده‌ای در دست نیست؛ خروجی به‌صورت بستهٔ دستی تحویل می‌شود و اقدام نهایی با مالک است.'
          : `adapter این سرویس در مرحلهٔ ${milestones} ساخته می‌شود و به حساب و مجوز واقعی مالک نیاز دارد. تا آن زمان خروجی به‌صورت دستی تحویل می‌شود.`,
    });
  }
  return catalog;
}

export type { DiscoveredCapability };
