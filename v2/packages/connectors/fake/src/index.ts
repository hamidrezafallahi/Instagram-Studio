import { createHash } from 'node:crypto';
import type {
  ConnectionHealth,
  ConnectorContext,
  ConnectorManifest,
  ConnectorPort,
  ConnectorResult,
  DiscoveredCapability,
  ErrorCode,
  MetricPoint,
  MetricsBatch,
} from '@studio/contracts';

/**
 * کانکتور نمونه (fake) برای دمو بدون کلید و آزمون قرارداد.
 * خروجی آن همیشه برچسب sample دارد و «هرگز» گواه اتصال واقعی نیست (AGENTS.md).
 * هیچ درخواست شبکه‌ای نمی‌فرستد؛ نشانی‌های ساختگی از دامنهٔ رزروشدهٔ ‎.invalid هستند.
 *
 * سناریو با config.scenario همان اتصال انتخاب می‌شود تا رفتارهای لازم هر adapter پوشش داده شود:
 * happy، auth_expired، quota_exhausted، rate_limited، unknown_outcome، provider_down.
 */

export const FAKE_SCENARIOS = [
  'happy',
  'auth_expired',
  'quota_exhausted',
  'rate_limited',
  'unknown_outcome',
  'provider_down',
] as const;
export type FakeScenario = (typeof FAKE_SCENARIOS)[number];

interface StoredOperation {
  external_id: string;
  external_url: string;
  /** آیا «سمت ارائه‌دهنده» عملیات واقعاً ثبت شده است (برای reconcile پس از نتیجهٔ نامعلوم). */
  recorded: boolean;
}

/** حافظهٔ «سمت ارائه‌دهنده». در آزمون crash می‌توان همان نمونه را بین دو worker مشترک گذاشت. */
export class FakeProviderState {
  readonly operations = new Map<string, StoredOperation>();
  publishCalls = 0;
  replyCalls = 0;
}

const SAMPLE_ACCOUNT_LABEL = 'حساب نمونه (ساختگی)';

export const fakeManifest: ConnectorManifest = {
  provider_id: 'fake',
  title_fa: 'کانکتور نمونه',
  auth_kind: 'none',
  cost_model: 'free',
  docs_url: null,
  checked_at: '2026-11-11',
  is_sample: true,
  implemented: true,
  capabilities: [
    { action: 'feed_publish', title_fa: 'انتشار پست (نمونه)', status: 'verified', reason_code: 'SAMPLE_CONNECTOR', fallback_fa: 'بستهٔ دستی' },
    { action: 'carousel_publish', title_fa: 'انتشار کاروسل (نمونه)', status: 'verified', reason_code: 'SAMPLE_CONNECTOR', fallback_fa: 'بستهٔ دستی' },
    { action: 'story_publish', title_fa: 'انتشار استوری (نمونه)', status: 'verified', reason_code: 'SAMPLE_CONNECTOR', fallback_fa: 'بستهٔ دستی' },
    { action: 'reel_publish', title_fa: 'انتشار ریلز (نمونه)', status: 'verified', reason_code: 'SAMPLE_CONNECTOR', fallback_fa: 'بستهٔ دستی' },
    { action: 'metrics_read', title_fa: 'خواندن سنجه (نمونه)', status: 'verified', reason_code: 'SAMPLE_CONNECTOR', fallback_fa: 'ورود دستی سنجه' },
    { action: 'own_comment_reply', title_fa: 'پاسخ به کامنت (نمونه)', status: 'verified', reason_code: 'SAMPLE_CONNECTOR', fallback_fa: 'پیش‌نویس پاسخ' },
    { action: 'dm_reply', title_fa: 'پاسخ به پیام خصوصی', status: 'manual_only', reason_code: 'SAMPLE_MANUAL_PATH', fallback_fa: 'handoff به مالک' },
    { action: 'trial_reel_publish', title_fa: 'ریلز تریال', status: 'unsupported', reason_code: 'SAMPLE_UNSUPPORTED', fallback_fa: 'راهنمای انتشار دستی' },
  ],
};

function scenarioOf(ctx: ConnectorContext): FakeScenario {
  const value = ctx.connection.config['scenario'];
  return (FAKE_SCENARIOS as readonly string[]).includes(String(value)) ? (value as FakeScenario) : 'happy';
}

function result(partial: Partial<ConnectorResult> & Pick<ConnectorResult, 'status'>): ConnectorResult {
  return {
    external_id: null,
    external_url: null,
    provider_request_id: null,
    retry_after: null,
    error_code: null,
    cost_actual: null,
    evidence_ref: null,
    ...partial,
  };
}

const failed = (error_code: ErrorCode, retry_after: number | null = null): ConnectorResult =>
  result({ status: 'failed', error_code, retry_after });

/** عدد شبه‌تصادفی قطعی از یک بذر متنی؛ دادهٔ نمونه در هر اجرا یکسان است. */
function seeded(seed: string, min: number, max: number): number {
  const hash = createHash('sha256').update(seed).digest();
  return min + (hash.readUInt32BE(0) % (max - min + 1));
}

export function createFakeConnector(state: FakeProviderState = new FakeProviderState()): ConnectorPort {
  const operate = (
    ctx: ConnectorContext,
    kind: 'publish' | 'reply',
    idempotencyKey: string,
  ): ConnectorResult => {
    const scenario = scenarioOf(ctx);
    if (scenario === 'auth_expired') return failed('AUTH_EXPIRED');
    if (scenario === 'quota_exhausted') return failed('QUOTA_EXHAUSTED');
    if (scenario === 'rate_limited') return failed('RATE_LIMITED', 30);
    if (scenario === 'provider_down') return failed('PROVIDER_UNAVAILABLE', 60);

    // کلید یکتایی مثل idempotency سمت ارائه‌دهنده عمل می‌کند: تکرار همان کلید همان نتیجه را می‌دهد.
    const key = `${ctx.connection.id}:${idempotencyKey}`;
    let operation = state.operations.get(key);
    if (!operation) {
      if (kind === 'publish') state.publishCalls += 1;
      else state.replyCalls += 1;
      const id = `sample_${createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
      operation = { external_id: id, external_url: `https://sample.invalid/${kind}/${id}`, recorded: true };
      state.operations.set(key, operation);
    }
    if (scenario === 'unknown_outcome') {
      // ارائه‌دهنده عملیات را ثبت کرده ولی پاسخ به ما نرسیده است؛ فقط reconcile آن را روشن می‌کند.
      return result({ status: 'unknown', error_code: 'UNKNOWN_OUTCOME', provider_request_id: `req_${operation.external_id}` });
    }
    return result({
      status: 'succeeded',
      external_id: operation.external_id,
      external_url: operation.external_url,
      provider_request_id: `req_${operation.external_id}`,
      cost_actual: { amount_minor: 0, currency: 'IRR' },
      evidence_ref: `sample://receipt/${operation.external_id}`,
    });
  };

  return {
    manifest: fakeManifest,

    async discoverCapabilities(ctx): Promise<DiscoveredCapability[]> {
      const scenario = scenarioOf(ctx);
      const verifiedAt = ctx.now().toISOString();
      return fakeManifest.capabilities.map((capability) => {
        const degraded = scenario === 'auth_expired' && capability.status === 'verified';
        return {
          action: capability.action,
          status: degraded ? 'needs_access' : capability.status,
          reason_code: degraded ? 'AUTH_EXPIRED' : capability.reason_code,
          limits: capability.status === 'verified' ? { max_text_chars: 2200, sample: true } : {},
          scopes: [],
          evidence_url: null,
          verified_at: capability.status === 'verified' && !degraded ? verifiedAt : null,
          expires_at: null,
        };
      });
    },

    async validateConnection(ctx): Promise<ConnectionHealth> {
      const scenario = scenarioOf(ctx);
      const checked_at = ctx.now().toISOString();
      if (scenario === 'auth_expired') {
        return { ok: false, status: 'auth_expired', error_code: 'AUTH_EXPIRED', checked_at, account_label: SAMPLE_ACCOUNT_LABEL, expires_at: null };
      }
      if (scenario === 'provider_down') {
        return { ok: false, status: 'unreachable', error_code: 'PROVIDER_UNAVAILABLE', checked_at, account_label: null, expires_at: null };
      }
      return { ok: true, status: 'healthy', error_code: null, checked_at, account_label: SAMPLE_ACCOUNT_LABEL, expires_at: null };
    },

    async prepareMedia(_ctx, input) {
      return {
        ok: true,
        provider_media_ids: input.media.map((item) => `sample_media_${item.checksum.slice(0, 12)}`),
        error_code: null,
      };
    },

    async publish(ctx, input) {
      return operate(ctx, 'publish', input.idempotency_key);
    },

    async sendReply(ctx, input) {
      return operate(ctx, 'reply', input.idempotency_key);
    },

    async getOperationStatus(ctx, input) {
      if (scenarioOf(ctx) === 'provider_down') return failed('PROVIDER_UNAVAILABLE', 60);
      const byKey = input.idempotency_key
        ? state.operations.get(`${ctx.connection.id}:${input.idempotency_key}`)
        : undefined;
      const operation =
        byKey ?? [...state.operations.values()].find((item) => item.external_id === input.external_id);
      if (!operation?.recorded) {
        // ارائه‌دهنده هیچ ردی ندارد: اثبات اینکه side effect رخ نداده است.
        return failed('NOT_FOUND');
      }
      return result({
        status: 'succeeded',
        external_id: operation.external_id,
        external_url: operation.external_url,
        evidence_ref: `sample://receipt/${operation.external_id}`,
      });
    },

    async fetchMetrics(ctx, input): Promise<MetricsBatch> {
      const seed = `${ctx.connection.id}:${input.period_start}:${input.period_end}`;
      const point = (metric: string, value: number | null, unit: string): MetricPoint => ({
        object_id: null,
        metric,
        value,
        unit,
        quality: value === null ? 'unavailable' : 'sample',
        period_start: input.period_start,
        period_end: input.period_end,
      });
      const impressions = seeded(`${seed}:impressions`, 1800, 6200);
      const reach = Math.round(impressions * (seeded(`${seed}:reach`, 55, 80) / 100));
      return {
        source: 'fake',
        is_sample: true,
        fetched_at: ctx.now().toISOString(),
        points: [
          point('impressions', impressions, 'count'),
          point('reach', reach, 'count'),
          point('saves', seeded(`${seed}:saves`, 12, 90), 'count'),
          point('shares', seeded(`${seed}:shares`, 4, 45), 'count'),
          point('comments', seeded(`${seed}:comments`, 3, 40), 'count'),
          point('profile_visits', seeded(`${seed}:profile`, 20, 160), 'count'),
          point('link_clicks', seeded(`${seed}:clicks`, 5, 60), 'count'),
          // عمداً ناموجود: نمایش N/A به‌جای صفر را می‌آزماید.
          point('retention_rate', null, 'percent'),
        ],
      };
    },

    async listConversations() {
      return { items: [], next_cursor: null };
    },

    async revoke() {
      return { revoked: true };
    },
  };
}
