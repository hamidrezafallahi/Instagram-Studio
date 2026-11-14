import { z } from 'zod';
import { IsoDate, ProviderId, Sha256, Slug, UtcTimestamp, Uuid } from './primitives.ts';
import { CapabilityStatus } from './states.ts';
import { Capability, ConnectorResult, PublicationTarget } from './entities.ts';
import { ErrorCode } from './errors.ts';

/**
 * Port کانکتور (packages/contracts/README.md):
 * discoverCapabilities، validateConnection، prepareMedia، publish، getOperationStatus،
 * fetchMetrics، listConversations، sendReply، revoke.
 * payload ارائه‌دهنده فقط داخل adapter می‌ماند؛ domain به جزئیات هیچ پلتفرمی وابسته نیست.
 */

export const AuthKind = z.enum([
  'none',
  'oauth2',
  'bot_token',
  'application_password',
  'api_key',
  'browser_session',
  'manual',
]);
export type AuthKind = z.infer<typeof AuthKind>;

export const CostModel = z.enum(['free', 'free_quota', 'paid', 'unknown']);
export type CostModel = z.infer<typeof CostModel>;

export const ManifestCapability = z.strictObject({
  action: Slug,
  title_fa: z.string().min(1).max(200),
  /** وضعیت پیش از آزمون حساب؛ برای ارائه‌دهندهٔ بیرونی هرگز verified نیست. */
  status: CapabilityStatus,
  reason_code: z.string().max(64),
  fallback_fa: z.string().max(400),
});
export type ManifestCapability = z.infer<typeof ManifestCapability>;

export const ConnectorManifest = z
  .strictObject({
    provider_id: Slug,
    title_fa: z.string().min(1).max(120),
    auth_kind: AuthKind,
    capabilities: z.array(ManifestCapability),
    cost_model: CostModel,
    docs_url: z.string().max(1024).nullable(),
    checked_at: IsoDate,
    /** کانکتور نمونه (fake): خروجی آن همیشه برچسب sample دارد و گواه اتصال واقعی نیست. */
    is_sample: z.boolean(),
    /** آیا در این نسخه adapter اجرایی وجود دارد؛ نبودش یعنی فقط مسیر دستی. */
    implemented: z.boolean(),
  })
  .meta({ id: 'ConnectorManifest', description: 'شناسنامهٔ هر adapter' });
export type ConnectorManifest = z.infer<typeof ConnectorManifest>;

export const ConnectionHealth = z
  .strictObject({
    ok: z.boolean(),
    status: z.enum(['healthy', 'auth_expired', 'degraded', 'unreachable', 'not_configured']),
    error_code: ErrorCode.nullable(),
    checked_at: UtcTimestamp,
    account_label: z.string().max(200).nullable(),
    expires_at: UtcTimestamp.nullable(),
  })
  .meta({ id: 'ConnectionHealth', description: 'نتیجهٔ آزمون اتصال' });
export type ConnectionHealth = z.infer<typeof ConnectionHealth>;

export const DiscoveredCapability = Capability.omit({ connection_id: true });
export type DiscoveredCapability = z.infer<typeof DiscoveredCapability>;

export const MediaRef = z.strictObject({
  asset_id: Uuid,
  version: z.int().positive(),
  checksum: Sha256,
  mime: z.string().max(128),
});
export type MediaRef = z.infer<typeof MediaRef>;

export const PrepareMediaInput = z.strictObject({ action: Slug, media: z.array(MediaRef) });
export type PrepareMediaInput = z.infer<typeof PrepareMediaInput>;

export const PreparedMedia = z.strictObject({
  ok: z.boolean(),
  provider_media_ids: z.array(ProviderId),
  error_code: ErrorCode.nullable(),
});
export type PreparedMedia = z.infer<typeof PreparedMedia>;

/** publish دقیقاً یک مقصد دارد؛ بستهٔ چندکاناله parent_run با child مستقل است. */
export const PublishInput = z.strictObject({
  action: Slug,
  intent_id: Uuid,
  idempotency_key: z.string().min(8).max(128),
  target: PublicationTarget,
  content: z.strictObject({
    content_id: Uuid,
    revision: z.int().positive(),
    text: z.string(),
    hash: Sha256,
    media: z.array(MediaRef),
  }),
});
export type PublishInput = z.infer<typeof PublishInput>;

export const OperationQuery = z.strictObject({
  action: Slug,
  external_id: ProviderId.optional(),
  provider_request_id: z.string().max(256).optional(),
  idempotency_key: z.string().max(128).optional(),
});
export type OperationQuery = z.infer<typeof OperationQuery>;

export const MetricsQuery = z.strictObject({
  action: Slug,
  object_ids: z.array(ProviderId),
  period_start: UtcTimestamp,
  period_end: UtcTimestamp,
});
export type MetricsQuery = z.infer<typeof MetricsQuery>;

/** missing یا unavailable مقدار null است، نه صفر. */
export const MetricPoint = z.strictObject({
  object_id: ProviderId.nullable(),
  metric: Slug,
  value: z.number().nullable(),
  unit: z.string().max(32),
  quality: z.enum(['actual', 'estimated', 'sample', 'unavailable']),
  period_start: UtcTimestamp,
  period_end: UtcTimestamp,
});
export type MetricPoint = z.infer<typeof MetricPoint>;

export const MetricsBatch = z.strictObject({
  source: Slug,
  is_sample: z.boolean(),
  fetched_at: UtcTimestamp,
  points: z.array(MetricPoint),
});
export type MetricsBatch = z.infer<typeof MetricsBatch>;

export const ConversationsQuery = z.strictObject({
  action: Slug,
  cursor: z.string().max(512).optional(),
  limit: z.int().min(1).max(100),
});
export type ConversationsQuery = z.infer<typeof ConversationsQuery>;

export const ConversationPage = z.strictObject({
  items: z.array(
    z.strictObject({
      external_id: ProviderId,
      participant_label: z.string().max(200),
      last_user_message_at: UtcTimestamp.nullable(),
      preview: z.string().max(500),
    }),
  ),
  next_cursor: z.string().nullable(),
});
export type ConversationPage = z.infer<typeof ConversationPage>;

export const ReplyInput = z.strictObject({
  action: Slug,
  intent_id: Uuid,
  idempotency_key: z.string().min(8).max(128),
  conversation_external_id: ProviderId,
  text: z.string().min(1).max(4000),
});
export type ReplyInput = z.infer<typeof ReplyInput>;

/** آنچه adapter از یک اتصال می‌بیند. راز فقط از resolveSecret و فقط داخل adapter خوانده می‌شود. */
export interface ConnectorContext {
  readonly connection: {
    readonly id: string;
    readonly workspace_id: string;
    readonly brand_id: string;
    readonly provider: string;
    readonly external_account_id: string | null;
    readonly config: Readonly<Record<string, unknown>>;
  };
  /** مقدار راز را برمی‌گرداند؛ نتیجه نباید log، ذخیره یا به مدل داده شود. */
  readonly resolveSecret: () => Promise<string | null>;
  readonly now: () => Date;
  readonly trace_id: string;
  readonly signal?: AbortSignal;
}

export interface ConnectorPort {
  readonly manifest: ConnectorManifest;
  discoverCapabilities(ctx: ConnectorContext): Promise<DiscoveredCapability[]>;
  validateConnection(ctx: ConnectorContext): Promise<ConnectionHealth>;
  prepareMedia(ctx: ConnectorContext, input: PrepareMediaInput): Promise<PreparedMedia>;
  publish(ctx: ConnectorContext, input: PublishInput): Promise<ConnectorResult>;
  getOperationStatus(ctx: ConnectorContext, input: OperationQuery): Promise<ConnectorResult>;
  fetchMetrics(ctx: ConnectorContext, input: MetricsQuery): Promise<MetricsBatch>;
  listConversations(ctx: ConnectorContext, input: ConversationsQuery): Promise<ConversationPage>;
  sendReply(ctx: ConnectorContext, input: ReplyInput): Promise<ConnectorResult>;
  revoke(ctx: ConnectorContext): Promise<{ revoked: boolean }>;
}

/** نام متدهای port؛ برای آزمون قرارداد و ثبت audit. */
export const CONNECTOR_PORT_METHODS = [
  'discoverCapabilities',
  'validateConnection',
  'prepareMedia',
  'publish',
  'getOperationStatus',
  'fetchMetrics',
  'listConversations',
  'sendReply',
  'revoke',
] as const;
export type ConnectorPortMethod = (typeof CONNECTOR_PORT_METHODS)[number];

/**
 * ثبت قابلیت‌ها (capability register) — خروجی M0.
 * مدرک سند (doc) و مدرک حساب (account) جدا ذخیره می‌شوند: doc_supported به معنی account_verified نیست.
 */
export const CapabilityRegisterEntry = z
  .strictObject({
    provider: Slug,
    route: z.enum(['direct', 'zernio', 'postiz', 'manual', 'internal']),
    action: Slug,
    title_fa: z.string().min(1).max(200),
    status: CapabilityStatus,
    reason_code: z.string().min(1).max(64),
    doc_evidence: z.strictObject({
      supported: z.enum(['yes', 'partial', 'no', 'unknown']),
      source_ids: z.array(z.string().regex(/^S\d{2}$/)),
      urls: z.array(z.string().max(1024)),
      checked_at: IsoDate.nullable(),
      checked_by: z.enum(['blueprint_research', 'builder', 'none']),
      api_version: z.string().max(64).nullable(),
    }),
    account_evidence: z.strictObject({
      verified: z.boolean(),
      test_result: z.enum(['not_run', 'passed', 'failed']),
      tested_at: UtcTimestamp.nullable(),
      account_type: z.string().max(64).nullable(),
      scopes: z.array(z.string()),
    }),
    cost_model: CostModel,
    fallback_fa: z.string().min(1).max(400),
    /** هر قابلیت یا مدرک دارد یا عدم قطعیتش صریح نوشته شده است (دروازهٔ M0). */
    uncertainty_fa: z.string().max(600),
    milestone: z.enum(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8']),
    next_review: IsoDate,
  })
  .meta({ id: 'CapabilityRegisterEntry', description: 'یک ردیف ثبت قابلیت‌ها با مدرک و عدم قطعیت' });
export type CapabilityRegisterEntry = z.infer<typeof CapabilityRegisterEntry>;

export const CapabilityRegister = z
  .strictObject({
    schema_version: z.string(),
    generated_from: z.string(),
    checked_at: IsoDate,
    entries: z.array(CapabilityRegisterEntry).min(1),
  })
  .meta({ id: 'CapabilityRegister', description: 'ثبت قابلیت‌ها و مسیرهای جایگزین' });
export type CapabilityRegister = z.infer<typeof CapabilityRegister>;
