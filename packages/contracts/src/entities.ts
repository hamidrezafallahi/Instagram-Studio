import { z } from 'zod';
import {
  ActorType,
  Channel,
  ContentFormat,
  Currency,
  IanaTimezone,
  Locale,
  Money,
  ProviderId,
  Sha256,
  Slug,
  UtcTimestamp,
  Uuid,
} from './primitives.ts';
import {
  ApprovalDecision,
  BillingMode,
  CapabilityStatus,
  ConnectorResultStatus,
  FundingRequestState,
} from './states.ts';
import { ErrorCode } from './errors.ts';

/**
 * ده موجودیت مبادله از packages/contracts/README.md.
 * نام فیلدها همان فیلدهای الزامی سند است (CTA به‌صورت cta نوشته شده).
 */

export const Offer = z
  .strictObject({
    id: Slug,
    title: z.string().min(1).max(200),
    kind: z.enum(['service', 'product', 'course', 'other']),
    description: z.string().max(2000).optional(),
    sku: z.string().max(64).optional(),
    /** قیمت فقط از منبع معتبر با تاریخ بررسی؛ نبود قیمت یعنی «استعلام»، نه حدس. */
    price: Money.optional(),
    price_checked_at: UtcTimestamp.optional(),
    availability: z.enum(['available', 'limited', 'unavailable', 'unknown']).optional(),
    evidence_id: Slug.optional(),
    is_sample: z.boolean().optional(),
  })
  .meta({ id: 'Offer', description: 'خدمت، کالا یا دورهٔ قابل ارائهٔ برند' });
export type Offer = z.infer<typeof Offer>;

export const PackRef = z.strictObject({ id: Slug, version: z.string().min(1).max(32) });
export type PackRef = z.infer<typeof PackRef>;

export const BrandContext = z
  .strictObject({
    workspace_id: Uuid,
    brand_id: Uuid,
    revision: z.int().positive(),
    industry_pack: PackRef,
    locale: Locale,
    audience: z.strictObject({
      summary: z.string(),
      segments: z.array(z.string()),
    }),
    offers: z.array(Offer),
    voice_rules: z.array(z.string()),
    evidence_ids: z.array(Slug),
  })
  .meta({ id: 'BrandContext', description: 'تصویر نسخه‌دار دانش برند که به عامل‌ها داده می‌شود' });
export type BrandContext = z.infer<typeof BrandContext>;

export const ContentBrief = z
  .strictObject({
    id: Uuid,
    brand_id: Uuid,
    goal: z.string().min(1).max(500),
    audience: z.string().max(1000),
    pillar: Slug,
    channel: Channel,
    format: ContentFormat,
    source_ids: z.array(Slug),
    cta: z.string().max(300),
    due_at: UtcTimestamp,
  })
  .meta({ id: 'ContentBrief', description: 'بریف تولید یک قطعه محتوا' });
export type ContentBrief = z.infer<typeof ContentBrief>;

export const SourceRef = z.strictObject({
  source_id: Slug,
  kind: z.enum(['brand_profile', 'offer', 'evidence', 'industry_pack']),
  label: z.string().max(300),
  checked_at: UtcTimestamp.optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

/** ادعا یا با evidence_id پشتیبانی می‌شود یا needs_verification است؛ ادعای ممنوع رد می‌شود. */
export const Claim = z.strictObject({
  id: Slug,
  text: z.string().max(500),
  kind: z.enum(['fact', 'price', 'availability', 'result', 'medical', 'guarantee', 'other']),
  status: z.enum(['supported', 'needs_verification', 'forbidden']),
  evidence_id: Slug.optional(),
});
export type Claim = z.infer<typeof Claim>;

export const QaCheck = z.strictObject({
  id: Slug,
  severity: z.enum(['error', 'warning', 'info']),
  passed: z.boolean(),
  message_fa: z.string(),
  excerpt: z.string().max(200).optional(),
});
export type QaCheck = z.infer<typeof QaCheck>;

export const QaResult = z
  .strictObject({
    status: z.enum(['pass', 'pass_with_warnings', 'fail', 'not_run']),
    qa_version: z.string(),
    checked_at: UtcTimestamp.optional(),
    checks: z.array(QaCheck),
  })
  .meta({ id: 'QaResult', description: 'نتیجهٔ بازبینی خودکار؛ جایگزین تأیید انسانی نیست' });
export type QaResult = z.infer<typeof QaResult>;

export const ContentRevision = z
  .strictObject({
    content_id: Uuid,
    revision: z.int().positive(),
    brand_id: Uuid,
    text: z.string(),
    asset_ids: z.array(Uuid),
    source_refs: z.array(SourceRef),
    claims: z.array(Claim),
    qa_result: QaResult,
    /** هش محتوای همین نسخه؛ تأیید به همین هش بسته می‌شود. */
    hash: Sha256,
  })
  .meta({ id: 'ContentRevision', description: 'نسخهٔ immutable محتوا' });
export type ContentRevision = z.infer<typeof ContentRevision>;

export const PublicationTarget = z
  .strictObject({
    connection_id: Uuid,
    channel: Channel,
    format: ContentFormat,
    destination_id: ProviderId,
    scheduled_at_utc: UtcTimestamp,
    timezone: IanaTimezone,
  })
  .meta({ id: 'PublicationTarget', description: 'یک مقصد انتشار؛ هر action دقیقاً یک مقصد دارد' });
export type PublicationTarget = z.infer<typeof PublicationTarget>;

export const ActionIntent = z
  .strictObject({
    id: Uuid,
    workspace_id: Uuid,
    brand_id: Uuid,
    actor_id: z.string().min(1).max(128),
    action_type: Slug,
    target: z.record(z.string(), z.unknown()),
    payload_ref: z.string().min(1).max(512),
    payload_hash: Sha256,
    revision: z.int().positive(),
    idempotency_key: z.string().min(8).max(128),
    estimated_cost: Money,
    expires_at: UtcTimestamp,
  })
  .meta({
    id: 'ActionIntent',
    description: 'قصد ثبت‌شدهٔ یک عملیات خارجی؛ بدون آن هیچ side effect اجرا نمی‌شود',
  });
export type ActionIntent = z.infer<typeof ActionIntent>;

export const Approval = z
  .strictObject({
    intent_id: Uuid,
    payload_hash: Sha256,
    approver_id: Uuid,
    decision: ApprovalDecision,
    approved_at: UtcTimestamp,
    expires_at: UtcTimestamp,
    policy_revision: z.int().positive(),
  })
  .meta({ id: 'Approval', description: 'تأیید انسانی وابسته به hash و نسخهٔ سیاست' });
export type Approval = z.infer<typeof Approval>;

export const Capability = z
  .strictObject({
    connection_id: Uuid,
    action: Slug,
    status: CapabilityStatus,
    reason_code: z.string().max(64),
    limits: z.record(z.string(), z.unknown()),
    scopes: z.array(z.string()),
    evidence_url: z.string().max(1024).nullable(),
    verified_at: UtcTimestamp.nullable(),
    expires_at: UtcTimestamp.nullable(),
  })
  .meta({
    id: 'Capability',
    description: 'قابلیت به‌ازای هر حساب و هر عملیات؛ verified فقط با آزمون واقعی حساب',
  });
export type Capability = z.infer<typeof Capability>;

export const ConnectorResult = z
  .strictObject({
    status: ConnectorResultStatus,
    external_id: ProviderId.nullable(),
    external_url: z.string().max(2048).nullable(),
    provider_request_id: z.string().max(256).nullable(),
    retry_after: z.int().nonnegative().nullable(),
    error_code: ErrorCode.nullable(),
    cost_actual: Money.nullable(),
    evidence_ref: z.string().max(512).nullable(),
  })
  .meta({ id: 'ConnectorResult', description: 'نتیجهٔ یکسان همهٔ کانکتورها؛ accepted یعنی هنوز منتشر نشده' });
export type ConnectorResult = z.infer<typeof ConnectorResult>;

export const FundingRequest = z
  .strictObject({
    id: Uuid,
    brand_id: Uuid,
    provider: Slug,
    purpose: z.string().min(1).max(500),
    amount: z.int().nonnegative(),
    currency: Currency,
    quote_expires_at: UtcTimestamp,
    payment_mode: BillingMode,
    status: FundingRequestState,
  })
  .meta({ id: 'FundingRequest', description: 'درخواست شارژ یا پرداخت که مالک دربارهٔ آن تصمیم می‌گیرد' });
export type FundingRequest = z.infer<typeof FundingRequest>;

export const DomainEvent = z
  .strictObject({
    event_id: Uuid,
    schema_version: z.string(),
    workspace_id: Uuid,
    brand_id: Uuid.nullable(),
    aggregate_id: Uuid,
    aggregate_version: z.int().nonnegative(),
    event_type: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/),
    occurred_at: UtcTimestamp,
    correlation_id: z.string().min(1).max(128),
    payload_ref: z.string().max(512).nullable(),
  })
  .meta({ id: 'Event', description: 'رویداد دامنه در outbox؛ payload با ارجاع، نه راز' });
export type DomainEvent = z.infer<typeof DomainEvent>;

/** ثبت audit: چه کسی، چه کاری، روی چه چیزی، با چه نتیجه‌ای. متن حساس ذخیره نمی‌شود. */
export const AuditEvent = z
  .strictObject({
    id: Uuid,
    workspace_id: Uuid,
    brand_id: Uuid.nullable(),
    actor_type: ActorType,
    actor_id: z.string(),
    action: z.string(),
    target_type: z.string(),
    target_id: z.string().nullable(),
    outcome: z.enum(['succeeded', 'denied', 'failed']),
    trace_id: z.string(),
    metadata: z.record(z.string(), z.unknown()),
    occurred_at: UtcTimestamp,
  })
  .meta({ id: 'AuditEvent', description: 'رد حسابرسی بدون متن حساس' });
export type AuditEvent = z.infer<typeof AuditEvent>;
