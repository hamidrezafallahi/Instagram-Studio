import { z } from 'zod';
import {
  Channel,
  ContentFormat,
  IanaTimezone,
  IsoDate,
  LocalTime,
  Locale,
  Money,
  Role,
  Sha256,
  Slug,
  UtcTimestamp,
  Uuid,
  Weekday,
} from './primitives.ts';
import {
  ActionState,
  ApprovalDecision,
  AuthorityMode,
  BillingMode,
  BrandStatus,
  FundingRequestState,
  ManualTaskState,
  ContentState,
  RunState,
  SpendMode,
  StepState,
} from './states.ts';
import {
  AuditEvent,
  Capability,
  Claim,
  ContentBrief,
  PackRef,
  QaResult,
  SourceRef,
} from './entities.ts';
import { BrandProfile, BrandReadiness } from './brand.ts';
import { IndustryPack, IndustryPackSummary } from './industry-pack.ts';
import {
  AuthKind,
  CapabilityRegisterEntry,
  ConnectionHealth,
  ConnectorManifest,
} from './connector.ts';
import { AuthorityPolicy } from './policy.ts';
import { ErrorCode } from './errors.ts';

/* ───────────────────────────── راه‌اندازی و نشست ───────────────────────────── */

export const SetupStatus = z
  .strictObject({
    needs_owner_setup: z.boolean(),
    profile: z.enum(['local', 'server']),
    sample_data: z.boolean(),
    api_version: z.string(),
    schema_version: z.string(),
  })
  .meta({ id: 'SetupStatus' });
export type SetupStatus = z.infer<typeof SetupStatus>;

/** رمز فقط در همین درخواست می‌آید، هش می‌شود و هرگز بازنمایی یا log نمی‌شود. */
export const Password = z.string().min(12).max(200);

export const SetupOwnerBody = z
  .strictObject({
    email: z.email().max(254),
    password: Password,
    display_name: z.string().min(1).max(120),
    workspace_name: z.string().min(1).max(120),
  })
  .meta({ id: 'SetupOwnerBody' });
export type SetupOwnerBody = z.infer<typeof SetupOwnerBody>;

export const LoginBody = z
  .strictObject({ email: z.email().max(254), password: z.string().min(1).max(200) })
  .meta({ id: 'LoginBody' });
export type LoginBody = z.infer<typeof LoginBody>;

export const SessionInfo = z
  .strictObject({
    user: z.strictObject({ id: Uuid, email: z.string(), display_name: z.string() }),
    /** نشانهٔ CSRF؛ در سرآیند x-csrf-token همهٔ درخواست‌های تغییردهنده لازم است. */
    csrf_token: z.string(),
    workspaces: z.array(z.strictObject({ id: Uuid, name: z.string(), role: Role })),
    expires_at: UtcTimestamp,
  })
  .meta({ id: 'SessionInfo' });
export type SessionInfo = z.infer<typeof SessionInfo>;

export const Ok = z.strictObject({ ok: z.literal(true) }).meta({ id: 'Ok' });
export type Ok = z.infer<typeof Ok>;

/* ─────────────────────────────────── برند ─────────────────────────────────── */

export const BrandSummary = z
  .strictObject({
    id: Uuid,
    workspace_id: Uuid,
    name: z.string(),
    status: BrandStatus,
    industry_pack: PackRef,
    /** برند نمونه: همهٔ خروجی‌های آن برچسب sample دارند. */
    is_sample: z.boolean(),
    timezone: IanaTimezone,
    locale: Locale,
    current_revision: z.int().positive(),
    readiness: BrandReadiness,
    created_at: UtcTimestamp,
    updated_at: UtcTimestamp,
  })
  .meta({ id: 'BrandSummary' });
export type BrandSummary = z.infer<typeof BrandSummary>;

export const BrandDetail = z
  .strictObject({
    brand: BrandSummary,
    profile: BrandProfile,
    pack: IndustryPack,
  })
  .meta({ id: 'BrandDetail' });
export type BrandDetail = z.infer<typeof BrandDetail>;

export const CreateBrandBody = z
  .strictObject({
    name: z.string().min(1).max(120),
    industry_pack_id: Slug,
    timezone: IanaTimezone.optional(),
    locale: Locale.optional(),
    is_sample: z.boolean().optional(),
  })
  .meta({ id: 'CreateBrandBody' });
export type CreateBrandBody = z.infer<typeof CreateBrandBody>;

/** expected_revision جلوی «آخرین نویسنده برنده است» را می‌گیرد. */
export const UpdateBrandProfileBody = z
  .strictObject({ expected_revision: z.int().positive(), profile: BrandProfile })
  .meta({ id: 'UpdateBrandProfileBody' });
export type UpdateBrandProfileBody = z.infer<typeof UpdateBrandProfileBody>;

export const BrandRevisionSummary = z
  .strictObject({
    revision: z.int().positive(),
    hash: Sha256,
    created_at: UtcTimestamp,
    created_by: z.string(),
    note: z.string().nullable(),
  })
  .meta({ id: 'BrandRevisionSummary' });
export type BrandRevisionSummary = z.infer<typeof BrandRevisionSummary>;

export const RollbackBrandBody = z
  .strictObject({ expected_revision: z.int().positive(), target_revision: z.int().positive() })
  .meta({ id: 'RollbackBrandBody' });
export type RollbackBrandBody = z.infer<typeof RollbackBrandBody>;

export const SetBrandStatusBody = z
  .strictObject({ status: BrandStatus })
  .meta({ id: 'SetBrandStatusBody' });
export type SetBrandStatusBody = z.infer<typeof SetBrandStatusBody>;

/* ────────────────────────────── اتصال و قابلیت ────────────────────────────── */

export const ConnectionStatus = z.enum(['active', 'needs_access', 'error', 'revoked']);
export type ConnectionStatus = z.infer<typeof ConnectionStatus>;

export const ConnectionView = z
  .strictObject({
    id: Uuid,
    brand_id: Uuid,
    provider: Slug,
    title_fa: z.string(),
    label: z.string(),
    status: ConnectionStatus,
    is_sample: z.boolean(),
    auth_kind: AuthKind,
    external_account_id: z.string().nullable(),
    /** فقط وجود راز اعلام می‌شود؛ مقدار آن پس از ذخیره هرگز بازنمایی نمی‌شود. */
    has_secret: z.boolean(),
    health: ConnectionHealth.nullable(),
    capabilities: z.array(Capability),
    created_at: UtcTimestamp,
    updated_at: UtcTimestamp,
  })
  .meta({ id: 'ConnectionView' });
export type ConnectionView = z.infer<typeof ConnectionView>;

export const CreateConnectionBody = z
  .strictObject({
    provider: Slug,
    label: z.string().min(1).max(120).optional(),
    /** تنظیمات غیرمحرمانهٔ adapter (مثلاً سناریوی کانکتور نمونه). */
    config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    /** راز از فرم امن؛ بلافاصله رمزگذاری می‌شود و فقط secret_ref نگه داشته می‌شود. */
    secret: z.string().min(1).max(4000).optional(),
  })
  .meta({ id: 'CreateConnectionBody' });
export type CreateConnectionBody = z.infer<typeof CreateConnectionBody>;

export const ProviderCatalogEntry = z
  .strictObject({
    manifest: ConnectorManifest,
    register: z.array(CapabilityRegisterEntry),
    /** آیا در این نسخه می‌توان از داشبورد اتصال ساخت؛ اگر نه، دلیل و راه رفع. */
    connectable: z.boolean(),
    blocked_reason_fa: z.string().nullable(),
  })
  .meta({ id: 'ProviderCatalogEntry' });
export type ProviderCatalogEntry = z.infer<typeof ProviderCatalogEntry>;

/* ─────────────────────────────── برنامه و تقویم ─────────────────────────────── */

export const ScheduleEntryStatus = z.enum(['planned', 'drafted', 'skipped', 'cancelled']);
export type ScheduleEntryStatus = z.infer<typeof ScheduleEntryStatus>;

export const ScheduleEntry = z
  .strictObject({
    id: Uuid,
    plan_id: Uuid,
    brand_id: Uuid,
    weekday: Weekday,
    /** تاریخ و ساعت محلی برند؛ مرجع ذخیره‌شده scheduled_at_utc است. */
    local_date: IsoDate,
    local_time: LocalTime,
    scheduled_at_utc: UtcTimestamp,
    channel: Channel,
    format: ContentFormat,
    pillar: Slug,
    pillar_title_fa: z.string(),
    topic_fa: z.string(),
    goal_fa: z.string(),
    cta_fa: z.string(),
    status: ScheduleEntryStatus,
    content_id: Uuid.nullable(),
    version: z.int().positive(),
  })
  .meta({ id: 'ScheduleEntry' });
export type ScheduleEntry = z.infer<typeof ScheduleEntry>;

export const GeneratorInfo = z
  .strictObject({
    /** template: تولید قالبی محلی بدون هزینه؛ model: درگاه مدل؛ human: نوشتهٔ انسان. */
    kind: z.enum(['template', 'model', 'human']),
    provider: z.string(),
    role: z.string().nullable(),
    prompt_version: z.string().nullable(),
  })
  .meta({ id: 'GeneratorInfo' });
export type GeneratorInfo = z.infer<typeof GeneratorInfo>;

export const Plan = z
  .strictObject({
    id: Uuid,
    brand_id: Uuid,
    week_start: IsoDate,
    week_end: IsoDate,
    timezone: IanaTimezone,
    version: z.int().positive(),
    status: z.enum(['proposed', 'active', 'superseded']),
    is_sample: z.boolean(),
    brand_revision: z.int().positive(),
    generator: GeneratorInfo,
    notes_fa: z.array(z.string()),
    entries: z.array(ScheduleEntry),
    created_at: UtcTimestamp,
  })
  .meta({ id: 'Plan' });
export type Plan = z.infer<typeof Plan>;

export const UpdateScheduleEntryBody = z
  .strictObject({
    expected_version: z.int().positive(),
    topic_fa: z.string().min(1).max(300).optional(),
    local_date: IsoDate.optional(),
    local_time: LocalTime.optional(),
    status: z.enum(['planned', 'skipped', 'cancelled']).optional(),
  })
  .meta({ id: 'UpdateScheduleEntryBody' });
export type UpdateScheduleEntryBody = z.infer<typeof UpdateScheduleEntryBody>;

/* ─────────────────────────────────── محتوا ─────────────────────────────────── */

export const ContentRevisionView = z
  .strictObject({
    revision: z.int().positive(),
    text: z.string(),
    hash: Sha256,
    source_refs: z.array(SourceRef),
    claims: z.array(Claim),
    qa_result: QaResult,
    generator: GeneratorInfo,
    /** دارایی‌های همین نسخه به ترتیب نمایش (مثلاً اسلایدهای کاروسل). */
    asset_ids: z.array(Uuid),
    note: z.string().nullable(),
    created_by: z.string(),
    created_at: UtcTimestamp,
  })
  .meta({ id: 'ContentRevisionView' });
export type ContentRevisionView = z.infer<typeof ContentRevisionView>;

export const ContentItemSummary = z
  .strictObject({
    id: Uuid,
    brand_id: Uuid,
    schedule_entry_id: Uuid.nullable(),
    channel: Channel,
    format: ContentFormat,
    pillar: Slug,
    title_fa: z.string(),
    state: ContentState,
    current_revision: z.int().nonnegative(),
    qa_status: QaResult.shape.status,
    is_sample: z.boolean(),
    scheduled_at_utc: UtcTimestamp.nullable(),
    version: z.int().positive(),
    updated_at: UtcTimestamp,
  })
  .meta({ id: 'ContentItemSummary' });
export type ContentItemSummary = z.infer<typeof ContentItemSummary>;

export const ContentItemDetail = z
  .strictObject({
    item: ContentItemSummary,
    brief: ContentBrief,
    revisions: z.array(ContentRevisionView),
  })
  .meta({ id: 'ContentItemDetail' });
export type ContentItemDetail = z.infer<typeof ContentItemDetail>;

/** هر ویرایش نسخهٔ تازه می‌سازد و محتوا را به بازبینی برمی‌گرداند. */
export const CreateContentRevisionBody = z
  .strictObject({
    expected_revision: z.int().nonnegative(),
    text: z.string().min(1).max(20000),
    /** دارایی‌های نسخهٔ تازه به ترتیب؛ نبودن یعنی همان دارایی‌های نسخهٔ قبلی. همه باید از همین برند باشند. */
    asset_ids: z.array(Uuid).max(20).optional(),
    note: z.string().max(500).optional(),
  })
  .meta({ id: 'CreateContentRevisionBody' });
export type CreateContentRevisionBody = z.infer<typeof CreateContentRevisionBody>;

/* ─────────────────────────────────── دارایی ─────────────────────────────────── */

export const AssetKind = z.enum(['image', 'video', 'audio', 'font', 'logo', 'subtitle']);
export type AssetKind = z.infer<typeof AssetKind>;
export const AssetProvenance = z.enum(['owner_upload', 'rendered', 'canva_import', 'sample']);
export type AssetProvenance = z.infer<typeof AssetProvenance>;
/** رضایت اشخاص حاضر در تصویر/صدا؛ missing یعنی فایل تا رفع آن قابل انتشار نیست. */
export const AssetConsent = z.enum(['not_applicable', 'obtained', 'missing']);
export type AssetConsent = z.infer<typeof AssetConsent>;

export const AssetView = z
  .strictObject({
    id: Uuid,
    brand_id: Uuid,
    kind: AssetKind,
    provenance: AssetProvenance,
    mime: z.string(),
    byte_size: z.int().positive(),
    checksum: Sha256,
    width: z.int().positive().nullable(),
    height: z.int().positive().nullable(),
    duration_ms: z.int().positive().nullable(),
    language: z.string().nullable(),
    filename: z.string(),
    title_fa: z.string(),
    license: z.string(),
    consent: AssetConsent,
    parent_asset_id: Uuid.nullable(),
    version: z.int().positive(),
    is_sample: z.boolean(),
    created_by: z.string(),
    created_at: UtcTimestamp,
  })
  .meta({ id: 'AssetView', description: 'دارایی immutable؛ ویرایش یعنی نسخهٔ تازه با parent_asset_id' });
export type AssetView = z.infer<typeof AssetView>;

/** فرادادهٔ upload در query؛ بدنهٔ درخواست خود فایل (application/octet-stream) است. */
export const UploadAssetQuery = z
  .strictObject({
    kind: AssetKind.exclude(['subtitle']),
    filename: z.string().trim().min(1).max(200),
    title_fa: z.string().trim().min(1).max(200).optional(),
    license: z.string().trim().min(1).max(300),
    consent: AssetConsent.default('not_applicable'),
    language: z.string().trim().min(2).max(10).optional(),
    /** نسخهٔ تازهٔ یک دارایی موجود. */
    parent_asset_id: Uuid.optional(),
  })
  .meta({ id: 'UploadAssetQuery' });
export type UploadAssetQuery = z.infer<typeof UploadAssetQuery>;

/* ─────────────────────────────────── اجرا ─────────────────────────────────── */

export const RunIntent = z.enum(['build_weekly_plan', 'generate_drafts', 'collect_metrics']);
export type RunIntent = z.infer<typeof RunIntent>;

/**
 * یک کلیک = یک command با idempotency_key. تکرار همان کلید همان run را برمی‌گرداند
 * و run دوم نمی‌سازد؛ همان کلید با ورودی متفاوت خطای IDEMPOTENCY_KEY_REUSED است.
 */
export const CreateRunBody = z
  .strictObject({
    intent: RunIntent,
    idempotency_key: z.string().min(8).max(128),
    params: z
      .strictObject({
        /** هر روزی از هفتهٔ هدف؛ سرور آن را به شروع هفتهٔ برند گرد می‌کند. */
        week_of: IsoDate.optional(),
        schedule_entry_ids: z.array(Uuid).max(50).optional(),
      })
      .default({}),
  })
  .meta({ id: 'CreateRunBody' });
export type CreateRunBody = z.infer<typeof CreateRunBody>;

export const RunStepView = z
  .strictObject({
    seq: z.int().positive(),
    name: z.string(),
    title_fa: z.string(),
    status: StepState,
    started_at: UtcTimestamp.nullable(),
    finished_at: UtcTimestamp.nullable(),
    summary_fa: z.string().nullable(),
    error_code: ErrorCode.nullable(),
  })
  .meta({ id: 'RunStepView' });
export type RunStepView = z.infer<typeof RunStepView>;

export const RunView = z
  .strictObject({
    id: Uuid,
    brand_id: Uuid,
    intent: RunIntent,
    status: RunState,
    idempotency_key: z.string(),
    workflow: z.strictObject({ id: z.string(), version: z.string() }),
    is_sample: z.boolean(),
    /** خلاصهٔ محدوده و سقف هزینه که پیش از شروع به مالک نشان داده شد. */
    scope_fa: z.string(),
    cost_cap: Money.nullable(),
    result: z
      .strictObject({
        plan_id: Uuid.nullable(),
        content_ids: z.array(Uuid),
        skipped: z.array(z.strictObject({ ref: z.string(), reason_fa: z.string() })),
        summary_fa: z.string(),
      })
      .nullable(),
    error: z.strictObject({ code: ErrorCode, message_fa: z.string() }).nullable(),
    steps: z.array(RunStepView),
    /** true یعنی این پاسخ تکرار یک command قبلی با همان کلید است. */
    replayed: z.boolean(),
    created_at: UtcTimestamp,
    started_at: UtcTimestamp.nullable(),
    finished_at: UtcTimestamp.nullable(),
  })
  .meta({ id: 'RunView' });
export type RunView = z.infer<typeof RunView>;

/* ─────────────────────────────────── گزارش ─────────────────────────────────── */

export const MetricRow = z
  .strictObject({
    metric: Slug,
    label_fa: z.string(),
    definition_fa: z.string(),
    unit: z.string(),
    channel: Channel.nullable(),
    /** null یعنی «در دسترس نیست» و N/A نمایش داده می‌شود؛ هرگز صفر جایگزین آن نمی‌شود. */
    value: z.number().nullable(),
    quality: z.enum(['actual', 'estimated', 'sample', 'unavailable']),
    source: z.string(),
    fetched_at: UtcTimestamp.nullable(),
  })
  .meta({ id: 'MetricRow' });
export type MetricRow = z.infer<typeof MetricRow>;

export const WeeklyReport = z
  .strictObject({
    brand_id: Uuid,
    brand_name: z.string(),
    week_start: IsoDate,
    week_end: IsoDate,
    timezone: IanaTimezone,
    generated_at: UtcTimestamp,
    /** گزارش نمونه: هیچ عدد آن واقعی نیست و باید با همین برچسب نمایش داده شود. */
    is_sample: z.boolean(),
    work: z.strictObject({
      planned_entries: z.int().nonnegative(),
      drafts_created: z.int().nonnegative(),
      ready_for_review: z.int().nonnegative(),
      needs_revision: z.int().nonnegative(),
      published: z.int().nonnegative(),
      overdue_entries: z.int().nonnegative(),
    }),
    metrics: z.array(MetricRow),
    business: z.array(MetricRow),
    cost: z.strictObject({
      spend_mode: SpendMode,
      /** به تفکیک ارز؛ ارزهای مختلف هرگز با هم جمع نمی‌شوند. */
      totals: z.array(Money),
      note_fa: z.string(),
    }),
    data_gaps_fa: z.array(z.string()),
    suggestions_fa: z.array(z.string()),
    fresh_at: UtcTimestamp.nullable(),
  })
  .meta({ id: 'WeeklyReport' });
export type WeeklyReport = z.infer<typeof WeeklyReport>;

/* ────────────────────────────── سیاست و نمای کل ────────────────────────────── */

export const PolicyView = z
  .strictObject({
    brand_id: Uuid,
    revision: z.int().positive(),
    authority: AuthorityPolicy,
    updated_at: UtcTimestamp,
    updated_by: z.string(),
  })
  .meta({ id: 'PolicyView' });
export type PolicyView = z.infer<typeof PolicyView>;

export const UpdatePolicyBody = z
  .strictObject({
    expected_revision: z.int().positive(),
    mode: AuthorityMode.optional(),
    paused: z.boolean().optional(),
  })
  .meta({ id: 'UpdatePolicyBody' });
export type UpdatePolicyBody = z.infer<typeof UpdatePolicyBody>;

export const BrandOverview = z
  .strictObject({
    brand: BrandSummary,
    counts: z.strictObject({
      entries_this_week: z.int().nonnegative(),
      drafts_ready_for_review: z.int().nonnegative(),
      drafts_needing_revision: z.int().nonnegative(),
      open_runs: z.int().nonnegative(),
      connections_total: z.int().nonnegative(),
      connections_needing_attention: z.int().nonnegative(),
    }),
    authority_mode: AuthorityMode,
    paused: z.boolean(),
    next_entry: ScheduleEntry.nullable(),
  })
  .meta({ id: 'BrandOverview' });
export type BrandOverview = z.infer<typeof BrandOverview>;

export const WorkspaceOverview = z
  .strictObject({
    workspace: z.strictObject({ id: Uuid, name: z.string() }),
    week_start: IsoDate,
    brands: z.array(BrandOverview),
    spend: z.strictObject({ spend_mode: SpendMode, totals: z.array(Money), note_fa: z.string() }),
  })
  .meta({ id: 'WorkspaceOverview' });
export type WorkspaceOverview = z.infer<typeof WorkspaceOverview>;

/* ───────────────────────────── اجرای کنترل‌شده (M2) ───────────────────────────── */

/** درخواست انتشار یک محتوا روی یک اتصال؛ یک کلیک = یک ActionIntent با کلید یکتایی. */
export const CreatePublishIntentBody = z
  .strictObject({
    connection_id: Uuid,
    idempotency_key: z.string().min(8).max(128),
    /** اگر داده نشود زمان آیتم تقویم (یا اکنون) استفاده می‌شود. */
    scheduled_at_utc: UtcTimestamp.optional(),
  })
  .meta({ id: 'CreatePublishIntentBody' });
export type CreatePublishIntentBody = z.infer<typeof CreatePublishIntentBody>;

export const ApprovalView = z
  .strictObject({
    id: Uuid,
    payload_hash: Sha256,
    approver_id: Uuid,
    decision: ApprovalDecision,
    policy_revision: z.int().positive(),
    note: z.string().nullable(),
    approved_at: UtcTimestamp,
    expires_at: UtcTimestamp,
    /** فقط تأییدی که hash آن با قصد یکی و منقضی‌نشده باشد معتبر است. */
    valid: z.boolean(),
  })
  .meta({ id: 'ApprovalView' });
export type ApprovalView = z.infer<typeof ApprovalView>;

export const IntentView = z
  .strictObject({
    id: Uuid,
    brand_id: Uuid,
    action_type: Slug,
    category: z.enum(['external_publish', 'external_message', 'external_change', 'spend']),
    connection_id: Uuid,
    content_id: Uuid,
    content_revision: z.int().positive(),
    channel: Channel,
    format: ContentFormat,
    payload_hash: Sha256,
    idempotency_key: z.string(),
    state: ActionState,
    state_fa: z.string(),
    policy_revision: z.int().positive(),
    policy_reason: z.string(),
    policy_reason_fa: z.string(),
    estimated_cost: Money,
    scheduled_at_utc: UtcTimestamp,
    expires_at: UtcTimestamp,
    attempts: z.int().nonnegative(),
    last_error: z.strictObject({ code: ErrorCode, message_fa: z.string() }).nullable(),
    result: z
      .strictObject({
        external_id: z.string().nullable(),
        external_url: z.string().nullable(),
        evidence_ref: z.string().nullable(),
        verification: z.enum(['provider', 'reconciled', 'owner_reported']),
      })
      .nullable(),
    approvals: z.array(ApprovalView),
    manual_task_id: Uuid.nullable(),
    funding_request_id: Uuid.nullable(),
    is_sample: z.boolean(),
    /** true یعنی این پاسخ تکرار درخواست قبلی با همان کلید است. */
    replayed: z.boolean(),
    created_at: UtcTimestamp,
    updated_at: UtcTimestamp,
  })
  .meta({ id: 'IntentView' });
export type IntentView = z.infer<typeof IntentView>;

/** تأیید به hash دقیق نسخه‌ای که مالک دیده است بسته می‌شود. */
export const DecideApprovalBody = z
  .strictObject({
    decision: ApprovalDecision,
    payload_hash: Sha256,
    note: z.string().max(500).optional(),
  })
  .meta({ id: 'DecideApprovalBody' });
export type DecideApprovalBody = z.infer<typeof DecideApprovalBody>;

export const RetryIntentBody = z
  .strictObject({ idempotency_key: z.string().min(8).max(128) })
  .meta({ id: 'RetryIntentBody' });
export type RetryIntentBody = z.infer<typeof RetryIntentBody>;

export const ManualTaskView = z
  .strictObject({
    id: Uuid,
    brand_id: Uuid,
    intent_id: Uuid,
    kind: z.string(),
    state: ManualTaskState,
    reason_code: z.string(),
    instructions_fa: z.string(),
    package: z.strictObject({
      channel: Channel,
      format: ContentFormat,
      text: z.string(),
      content_hash: Sha256,
      scheduled_at_utc: UtcTimestamp,
      is_sample: z.boolean(),
    }),
    completed_url: z.string().nullable(),
    completed_at: UtcTimestamp.nullable(),
    created_at: UtcTimestamp,
  })
  .meta({ id: 'ManualTaskView' });
export type ManualTaskView = z.infer<typeof ManualTaskView>;

/** اعلام انتشار دستی توسط مالک؛ نتیجه owner_reported است، نه اثبات ارائه‌دهنده. */
export const CompleteManualTaskBody = z
  .strictObject({ external_url: z.url({ protocol: /^https$/ }).max(2048) })
  .meta({ id: 'CompleteManualTaskBody' });
export type CompleteManualTaskBody = z.infer<typeof CompleteManualTaskBody>;

export const FundingRequestView = z
  .strictObject({
    id: Uuid,
    brand_id: Uuid,
    intent_id: Uuid.nullable(),
    provider: z.string(),
    purpose: z.string(),
    amount: Money,
    quote_expires_at: UtcTimestamp,
    payment_mode: BillingMode,
    status: FundingRequestState,
    decided_by: z.string().nullable(),
    decided_at: UtcTimestamp.nullable(),
    version: z.int().positive(),
    created_at: UtcTimestamp,
  })
  .meta({ id: 'FundingRequestView' });
export type FundingRequestView = z.infer<typeof FundingRequestView>;

/** مالک فقط تصمیم می‌گیرد؛ پرداخت هرگز توسط استودیو انجام نمی‌شود. */
export const DecideFundingBody = z
  .strictObject({ expected_version: z.int().positive(), decision: z.enum(['approve', 'decline', 'cancel']) })
  .meta({ id: 'DecideFundingBody' });
export type DecideFundingBody = z.infer<typeof DecideFundingBody>;

export const WorkerTickResult = z
  .strictObject({
    dispatched: z.int().nonnegative(),
    claimed: z.int().nonnegative(),
    outcomes: z.array(z.strictObject({ job_id: Uuid, kind: z.string(), outcome: z.string() })),
  })
  .meta({ id: 'WorkerTickResult' });
export type WorkerTickResult = z.infer<typeof WorkerTickResult>;

/* ─────────────────────────────── جدول مسیرها ─────────────────────────────── */

const list = <T extends z.ZodType>(item: T) => z.strictObject({ items: z.array(item) });

const WorkspaceParams = z.strictObject({ workspace_id: Uuid });
const BrandParams = z.strictObject({ workspace_id: Uuid, brand_id: Uuid });

export type RouteScope = 'public' | 'session' | 'workspace' | 'brand';

export interface RouteDef {
  readonly id: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly tag: string;
  readonly summary_fa: string;
  /** public: بدون نشست؛ session: نشست معتبر؛ workspace/brand: عضویت و scope در سرور بررسی می‌شود. */
  readonly scope: RouteScope;
  /** حداقل نقش لازم برای مسیرهای workspace و brand. */
  readonly min_role?: z.infer<typeof Role>;
  readonly params?: z.ZodType;
  readonly query?: z.ZodType;
  readonly body?: z.ZodType;
  readonly response: z.ZodType;
  readonly success_status?: 200 | 201 | 202;
  readonly errors: readonly ErrorCode[];
}

/** نوع دقیق هر مسیر حفظ می‌شود تا params/body/response در API و داشبورد یکسان استنتاج شوند. */
function route<const T extends RouteDef>(def: T): T {
  return def;
}

const BRAND = '/v1/workspaces/{workspace_id}/brands/{brand_id}';
const BRAND_ERRORS = ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION_FAILED'] as const;
const WRITE_ERRORS = [...BRAND_ERRORS, 'CSRF_FAILED'] as const;

export const routes = {
  setupStatus: route({
    id: 'setupStatus',
    method: 'GET',
    path: '/v1/setup/status',
    tag: 'setup',
    summary_fa: 'وضعیت راه‌اندازی اولیه',
    scope: 'public',
    response: SetupStatus,
    errors: [],
  }),
  setupOwner: route({
    id: 'setupOwner',
    method: 'POST',
    path: '/v1/setup/owner',
    tag: 'setup',
    summary_fa: 'ساخت حساب مالک و فضای کاری (فقط یک‌بار)',
    scope: 'public',
    body: SetupOwnerBody,
    response: SessionInfo,
    success_status: 201,
    errors: ['VALIDATION_FAILED', 'SETUP_ALREADY_COMPLETED'],
  }),
  login: route({
    id: 'login',
    method: 'POST',
    path: '/v1/auth/login',
    tag: 'auth',
    summary_fa: 'ورود مالک',
    scope: 'public',
    body: LoginBody,
    response: SessionInfo,
    errors: ['VALIDATION_FAILED', 'UNAUTHENTICATED', 'RATE_LIMITED'],
  }),
  logout: route({
    id: 'logout',
    method: 'POST',
    path: '/v1/auth/logout',
    tag: 'auth',
    summary_fa: 'خروج و ابطال نشست',
    scope: 'session',
    response: Ok,
    errors: ['UNAUTHENTICATED', 'CSRF_FAILED'],
  }),
  session: route({
    id: 'session',
    method: 'GET',
    path: '/v1/auth/session',
    tag: 'auth',
    summary_fa: 'نشست جاری، فضاهای کاری و نشانهٔ CSRF',
    scope: 'session',
    response: SessionInfo,
    errors: ['UNAUTHENTICATED'],
  }),
  listPacks: route({
    id: 'listPacks',
    method: 'GET',
    path: '/v1/industry-packs',
    tag: 'catalog',
    summary_fa: 'فهرست بسته‌های صنعت',
    scope: 'session',
    response: list(IndustryPackSummary),
    errors: ['UNAUTHENTICATED'],
  }),
  getPack: route({
    id: 'getPack',
    method: 'GET',
    path: '/v1/industry-packs/{pack_id}',
    tag: 'catalog',
    summary_fa: 'جزئیات یک بستهٔ صنعت',
    scope: 'session',
    params: z.strictObject({ pack_id: Slug }),
    response: IndustryPack,
    errors: ['UNAUTHENTICATED', 'NOT_FOUND'],
  }),
  listProviders: route({
    id: 'listProviders',
    method: 'GET',
    path: '/v1/providers',
    tag: 'catalog',
    summary_fa: 'فهرست ارائه‌دهنده‌ها و ثبت قابلیت‌ها با مدرک و عدم قطعیت',
    scope: 'session',
    response: list(ProviderCatalogEntry),
    errors: ['UNAUTHENTICATED'],
  }),
  workspaceOverview: route({
    id: 'workspaceOverview',
    method: 'GET',
    path: '/v1/workspaces/{workspace_id}/overview',
    tag: 'workspace',
    summary_fa: 'نمای کل مالک: خلاصهٔ مجاز همهٔ برندها',
    scope: 'workspace',
    min_role: 'viewer',
    params: WorkspaceParams,
    response: WorkspaceOverview,
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND'],
  }),
  listBrands: route({
    id: 'listBrands',
    method: 'GET',
    path: '/v1/workspaces/{workspace_id}/brands',
    tag: 'brands',
    summary_fa: 'فهرست برندهای فضای کاری',
    scope: 'workspace',
    min_role: 'viewer',
    params: WorkspaceParams,
    response: list(BrandSummary),
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND'],
  }),
  createBrand: route({
    id: 'createBrand',
    method: 'POST',
    path: '/v1/workspaces/{workspace_id}/brands',
    tag: 'brands',
    summary_fa: 'ساخت برند تازه از یک بستهٔ صنعت (بدون تغییر کد)',
    scope: 'workspace',
    min_role: 'owner',
    params: WorkspaceParams,
    body: CreateBrandBody,
    response: BrandDetail,
    success_status: 201,
    errors: [...WRITE_ERRORS],
  }),
  seedSampleBrands: route({
    id: 'seedSampleBrands',
    method: 'POST',
    path: '/v1/workspaces/{workspace_id}/sample-brands',
    tag: 'brands',
    summary_fa: 'ساخت چهار برند نمونه با برچسب sample (فقط وقتی دادهٔ نمونه فعال است)',
    scope: 'workspace',
    min_role: 'owner',
    params: WorkspaceParams,
    response: list(BrandSummary),
    success_status: 201,
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'CSRF_FAILED'],
  }),
  getBrand: route({
    id: 'getBrand',
    method: 'GET',
    path: BRAND,
    tag: 'brands',
    summary_fa: 'برند، سند تنظیمات و بستهٔ صنعت آن',
    scope: 'brand',
    min_role: 'viewer',
    params: BrandParams,
    response: BrandDetail,
    errors: [...BRAND_ERRORS],
  }),
  updateBrandProfile: route({
    id: 'updateBrandProfile',
    method: 'PUT',
    path: `${BRAND}/profile`,
    tag: 'brands',
    summary_fa: 'ذخیرهٔ سند تنظیمات برند به‌صورت نسخهٔ تازه',
    scope: 'brand',
    min_role: 'editor',
    params: BrandParams,
    body: UpdateBrandProfileBody,
    response: BrandDetail,
    errors: [...WRITE_ERRORS, 'STALE_REVISION'],
  }),
  listBrandRevisions: route({
    id: 'listBrandRevisions',
    method: 'GET',
    path: `${BRAND}/revisions`,
    tag: 'brands',
    summary_fa: 'تاریخچهٔ نسخه‌های تنظیمات برند',
    scope: 'brand',
    min_role: 'viewer',
    params: BrandParams,
    response: list(BrandRevisionSummary),
    errors: [...BRAND_ERRORS],
  }),
  rollbackBrand: route({
    id: 'rollbackBrand',
    method: 'POST',
    path: `${BRAND}/rollback`,
    tag: 'brands',
    summary_fa: 'بازگشت تنظیمات برند به یک نسخهٔ قبلی (به‌صورت نسخهٔ تازه)',
    scope: 'brand',
    min_role: 'owner',
    params: BrandParams,
    body: RollbackBrandBody,
    response: BrandDetail,
    errors: [...WRITE_ERRORS, 'STALE_REVISION'],
  }),
  setBrandStatus: route({
    id: 'setBrandStatus',
    method: 'POST',
    path: `${BRAND}/status`,
    tag: 'brands',
    summary_fa: 'فعال، متوقف یا آرشیوکردن برند',
    scope: 'brand',
    min_role: 'owner',
    params: BrandParams,
    body: SetBrandStatusBody,
    response: BrandSummary,
    errors: [...WRITE_ERRORS],
  }),
  listConnections: route({
    id: 'listConnections',
    method: 'GET',
    path: `${BRAND}/connections`,
    tag: 'connections',
    summary_fa: 'اتصال‌های برند و قابلیت واقعی هر کدام',
    scope: 'brand',
    min_role: 'viewer',
    params: BrandParams,
    response: list(ConnectionView),
    errors: [...BRAND_ERRORS],
  }),
  createConnection: route({
    id: 'createConnection',
    method: 'POST',
    path: `${BRAND}/connections`,
    tag: 'connections',
    summary_fa: 'افزودن اتصال؛ راز فقط از فرم امن و بلافاصله رمزگذاری می‌شود',
    scope: 'brand',
    min_role: 'owner',
    params: BrandParams,
    body: CreateConnectionBody,
    response: ConnectionView,
    success_status: 201,
    errors: [...WRITE_ERRORS, 'UNSUPPORTED_CAPABILITY'],
  }),
  testConnection: route({
    id: 'testConnection',
    method: 'POST',
    path: `${BRAND}/connections/{connection_id}/test`,
    tag: 'connections',
    summary_fa: 'آزمون اتصال و کشف دوبارهٔ قابلیت‌ها',
    scope: 'brand',
    min_role: 'editor',
    params: BrandParams.extend({ connection_id: Uuid }),
    response: ConnectionView,
    errors: [...WRITE_ERRORS],
  }),
  revokeConnection: route({
    id: 'revokeConnection',
    method: 'POST',
    path: `${BRAND}/connections/{connection_id}/revoke`,
    tag: 'connections',
    summary_fa: 'قطع اتصال و حذف راز آن',
    scope: 'brand',
    min_role: 'owner',
    params: BrandParams.extend({ connection_id: Uuid }),
    response: ConnectionView,
    errors: [...WRITE_ERRORS],
  }),
  listPlans: route({
    id: 'listPlans',
    method: 'GET',
    path: `${BRAND}/plans`,
    tag: 'plans',
    summary_fa: 'برنامه‌های هفتگی برند',
    scope: 'brand',
    min_role: 'viewer',
    params: BrandParams,
    query: z.strictObject({ week_of: IsoDate.optional() }),
    response: list(Plan),
    errors: [...BRAND_ERRORS],
  }),
  updateScheduleEntry: route({
    id: 'updateScheduleEntry',
    method: 'PATCH',
    path: `${BRAND}/schedule-entries/{entry_id}`,
    tag: 'plans',
    summary_fa: 'ویرایش موضوع، زمان یا وضعیت یک آیتم تقویم',
    scope: 'brand',
    min_role: 'editor',
    params: BrandParams.extend({ entry_id: Uuid }),
    body: UpdateScheduleEntryBody,
    response: ScheduleEntry,
    errors: [...WRITE_ERRORS, 'STALE_REVISION'],
  }),
  listContent: route({
    id: 'listContent',
    method: 'GET',
    path: `${BRAND}/content`,
    tag: 'content',
    summary_fa: 'فهرست محتواهای برند',
    scope: 'brand',
    min_role: 'viewer',
    params: BrandParams,
    query: z.strictObject({ state: ContentState.optional() }),
    response: list(ContentItemSummary),
    errors: [...BRAND_ERRORS],
  }),
  getContent: route({
    id: 'getContent',
    method: 'GET',
    path: `${BRAND}/content/{content_id}`,
    tag: 'content',
    summary_fa: 'یک محتوا با بریف و همهٔ نسخه‌ها',
    scope: 'brand',
    min_role: 'viewer',
    params: BrandParams.extend({ content_id: Uuid }),
    response: ContentItemDetail,
    errors: [...BRAND_ERRORS],
  }),
  listAssets: route({
    id: 'listAssets',
    method: 'GET',
    path: `${BRAND}/assets`,
    tag: 'assets',
    summary_fa: 'فهرست دارایی‌های برند (جدیدترین اول)',
    scope: 'brand',
    min_role: 'viewer',
    params: BrandParams,
    query: z.strictObject({ kind: AssetKind.optional() }),
    response: list(AssetView),
    errors: [...BRAND_ERRORS],
  }),
  getAsset: route({
    id: 'getAsset',
    method: 'GET',
    path: `${BRAND}/assets/{asset_id}`,
    tag: 'assets',
    summary_fa: 'یک دارایی با فراداده',
    scope: 'brand',
    min_role: 'viewer',
    params: BrandParams.extend({ asset_id: Uuid }),
    response: AssetView,
    errors: [...BRAND_ERRORS],
  }),
  createContentRevision: route({
    id: 'createContentRevision',
    method: 'POST',
    path: `${BRAND}/content/{content_id}/revisions`,
    tag: 'content',
    summary_fa: 'ویرایش محتوا: نسخهٔ تازه، QA دوباره و بازگشت به بازبینی',
    scope: 'brand',
    min_role: 'editor',
    params: BrandParams.extend({ content_id: Uuid }),
    body: CreateContentRevisionBody,
    response: ContentItemDetail,
    success_status: 201,
    errors: [...WRITE_ERRORS, 'STALE_REVISION', 'INVALID_TRANSITION', 'CROSS_BRAND_REFERENCE'],
  }),
  createRun: route({
    id: 'createRun',
    method: 'POST',
    path: `${BRAND}/runs`,
    tag: 'runs',
    summary_fa: 'ثبت یک فرمان اجرا با کلید یکتایی',
    scope: 'brand',
    min_role: 'editor',
    params: BrandParams,
    body: CreateRunBody,
    response: RunView,
    success_status: 202,
    errors: [...WRITE_ERRORS, 'IDEMPOTENCY_KEY_REUSED', 'BRAND_NOT_READY', 'POLICY_DENIED'],
  }),
  listRuns: route({
    id: 'listRuns',
    method: 'GET',
    path: `${BRAND}/runs`,
    tag: 'runs',
    summary_fa: 'اجراهای اخیر برند',
    scope: 'brand',
    min_role: 'viewer',
    params: BrandParams,
    response: list(RunView),
    errors: [...BRAND_ERRORS],
  }),
  getRun: route({
    id: 'getRun',
    method: 'GET',
    path: `${BRAND}/runs/{run_id}`,
    tag: 'runs',
    summary_fa: 'تصویر لحظه‌ای یک اجرا و گام‌های آن',
    scope: 'brand',
    min_role: 'viewer',
    params: BrandParams.extend({ run_id: Uuid }),
    response: RunView,
    errors: [...BRAND_ERRORS],
  }),
  weeklyReport: route({
    id: 'weeklyReport',
    method: 'GET',
    path: `${BRAND}/reports/weekly`,
    tag: 'reports',
    summary_fa: 'گزارش هفتگی؛ دادهٔ نمونه با برچسب sample و دادهٔ ناموجود با N/A',
    scope: 'brand',
    min_role: 'viewer',
    params: BrandParams,
    query: z.strictObject({ week_of: IsoDate.optional() }),
    response: WeeklyReport,
    errors: [...BRAND_ERRORS],
  }),
  getPolicy: route({
    id: 'getPolicy',
    method: 'GET',
    path: `${BRAND}/policies/authority`,
    tag: 'policy',
    summary_fa: 'سیاست اختیار برند',
    scope: 'brand',
    min_role: 'viewer',
    params: BrandParams,
    response: PolicyView,
    errors: [...BRAND_ERRORS],
  }),
  updatePolicy: route({
    id: 'updatePolicy',
    method: 'PUT',
    path: `${BRAND}/policies/authority`,
    tag: 'policy',
    summary_fa: 'تغییر حالت اختیار یا توقف برند (نسخهٔ تازهٔ سیاست)',
    scope: 'brand',
    min_role: 'owner',
    params: BrandParams,
    body: UpdatePolicyBody,
    response: PolicyView,
    errors: [...WRITE_ERRORS, 'STALE_REVISION', 'NOT_IMPLEMENTED'],
  }),
  listAuditEvents: route({
    id: 'listAuditEvents',
    method: 'GET',
    path: `${BRAND}/audit-events`,
    tag: 'audit',
    summary_fa: 'رد حسابرسی برند',
    scope: 'brand',
    min_role: 'owner',
    params: BrandParams,
    query: z.strictObject({ limit: z.coerce.number().int().min(1).max(200).optional() }),
    response: list(AuditEvent),
    errors: [...BRAND_ERRORS],
  }),
  createPublishIntent: route({
    id: 'createPublishIntent',
    method: 'POST',
    path: `${BRAND}/content/{content_id}/publish-intents`,
    tag: 'execution',
    summary_fa: 'ثبت قصد انتشار یک محتوا روی یک اتصال (ActionIntent با کلید یکتایی)',
    scope: 'brand',
    min_role: 'editor',
    params: BrandParams.extend({ content_id: Uuid }),
    body: CreatePublishIntentBody,
    response: IntentView,
    success_status: 201,
    errors: [...WRITE_ERRORS, 'IDEMPOTENCY_KEY_REUSED', 'INVALID_TRANSITION', 'CONFLICT', 'POLICY_DENIED'],
  }),
  listIntents: route({
    id: 'listIntents',
    method: 'GET',
    path: `${BRAND}/intents`,
    tag: 'execution',
    summary_fa: 'قصدهای اجرای برند و وضعیت آن‌ها',
    scope: 'brand',
    min_role: 'viewer',
    params: BrandParams,
    query: z.strictObject({ state: ActionState.optional(), content_id: Uuid.optional() }),
    response: list(IntentView),
    errors: [...BRAND_ERRORS],
  }),
  getIntent: route({
    id: 'getIntent',
    method: 'GET',
    path: `${BRAND}/intents/{intent_id}`,
    tag: 'execution',
    summary_fa: 'جزئیات یک قصد اجرا، تأییدها و نتیجه',
    scope: 'brand',
    min_role: 'viewer',
    params: BrandParams.extend({ intent_id: Uuid }),
    response: IntentView,
    errors: [...BRAND_ERRORS],
  }),
  decideApproval: route({
    id: 'decideApproval',
    method: 'POST',
    path: `${BRAND}/intents/{intent_id}/approvals`,
    tag: 'execution',
    summary_fa: 'تأیید یا رد انسانی وابسته به hash نسخه',
    scope: 'brand',
    min_role: 'reviewer',
    params: BrandParams.extend({ intent_id: Uuid }),
    body: DecideApprovalBody,
    response: IntentView,
    errors: [...WRITE_ERRORS, 'STALE_REVISION', 'INVALID_TRANSITION'],
  }),
  retryIntent: route({
    id: 'retryIntent',
    method: 'POST',
    path: `${BRAND}/intents/{intent_id}/retry`,
    tag: 'execution',
    summary_fa: 'تلاش دوباره برای قصد ناموفق (هرگز برای نتیجهٔ نامعلوم)',
    scope: 'brand',
    min_role: 'editor',
    params: BrandParams.extend({ intent_id: Uuid }),
    body: RetryIntentBody,
    response: IntentView,
    errors: [...WRITE_ERRORS, 'INVALID_TRANSITION', 'POLICY_DENIED', 'CONFLICT'],
  }),
  cancelIntent: route({
    id: 'cancelIntent',
    method: 'POST',
    path: `${BRAND}/intents/{intent_id}/cancel`,
    tag: 'execution',
    summary_fa: 'لغو قصدی که هنوز اجرا نشده است',
    scope: 'brand',
    min_role: 'editor',
    params: BrandParams.extend({ intent_id: Uuid }),
    response: IntentView,
    errors: [...WRITE_ERRORS, 'INVALID_TRANSITION'],
  }),
  listManualTasks: route({
    id: 'listManualTasks',
    method: 'GET',
    path: `${BRAND}/manual-tasks`,
    tag: 'execution',
    summary_fa: 'کارهای دستی (بستهٔ انتشار برای مسیرهای بدون API اثبات‌شده)',
    scope: 'brand',
    min_role: 'viewer',
    params: BrandParams,
    response: list(ManualTaskView),
    errors: [...BRAND_ERRORS],
  }),
  completeManualTask: route({
    id: 'completeManualTask',
    method: 'POST',
    path: `${BRAND}/manual-tasks/{task_id}/complete`,
    tag: 'execution',
    summary_fa: 'اعلام انتشار دستی توسط مالک (owner_reported)',
    scope: 'brand',
    min_role: 'owner',
    params: BrandParams.extend({ task_id: Uuid }),
    body: CompleteManualTaskBody,
    response: ManualTaskView,
    errors: [...WRITE_ERRORS, 'INVALID_TRANSITION'],
  }),
  listFundingRequests: route({
    id: 'listFundingRequests',
    method: 'GET',
    path: `${BRAND}/funding-requests`,
    tag: 'billing',
    summary_fa: 'درخواست‌های شارژ یا پرداخت',
    scope: 'brand',
    min_role: 'viewer',
    params: BrandParams,
    response: list(FundingRequestView),
    errors: [...BRAND_ERRORS],
  }),
  decideFundingRequest: route({
    id: 'decideFundingRequest',
    method: 'POST',
    path: `${BRAND}/funding-requests/{request_id}/decision`,
    tag: 'billing',
    summary_fa: 'تصمیم مالک دربارهٔ درخواست شارژ (پرداخت خودکار انجام نمی‌شود)',
    scope: 'brand',
    min_role: 'owner',
    params: BrandParams.extend({ request_id: Uuid }),
    body: DecideFundingBody,
    response: FundingRequestView,
    errors: [...WRITE_ERRORS, 'STALE_REVISION', 'INVALID_TRANSITION'],
  }),
  runWorkerTick: route({
    id: 'runWorkerTick',
    method: 'POST',
    path: '/v1/workspaces/{workspace_id}/worker/tick',
    tag: 'execution',
    summary_fa: 'اجرای یک دور worker در همین فرایند (پروفایل local؛ worker مستقل جایگزین آن است)',
    scope: 'workspace',
    min_role: 'owner',
    params: WorkspaceParams,
    response: WorkerTickResult,
    errors: ['UNAUTHENTICATED', 'FORBIDDEN', 'CSRF_FAILED'],
  }),
} as const;

export type RouteId = keyof typeof routes;
export type AnyRoute = (typeof routes)[RouteId];

type Empty = Record<string, never>;
export type RouteParams<K extends RouteId> = (typeof routes)[K] extends {
  params: infer P extends z.ZodType;
}
  ? z.infer<P>
  : Empty;
export type RouteQuery<K extends RouteId> = (typeof routes)[K] extends {
  query: infer Q extends z.ZodType;
}
  ? z.infer<Q>
  : Empty;
/** آنچه handler پس از اعتبارسنجی می‌گیرد (با پیش‌فرض‌ها). */
export type RouteBody<K extends RouteId> = (typeof routes)[K] extends {
  body: infer B extends z.ZodType;
}
  ? z.infer<B>
  : undefined;
/** آنچه کلاینت می‌فرستد (پیش از اعمال پیش‌فرض‌ها). */
export type RouteBodyInput<K extends RouteId> = (typeof routes)[K] extends {
  body: infer B extends z.ZodType;
}
  ? z.input<B>
  : undefined;
export type RouteResponse<K extends RouteId> = z.infer<(typeof routes)[K]['response']>;

/** نسخهٔ API؛ مسیرهای کسب‌وکار همگی زیر /v1 هستند. */
export const API_VERSION = '1.0.0';

/** قالب خروجی export گزارش. */
export const ReportExportFormat = z.enum(['json', 'csv']);
export type ReportExportFormat = z.infer<typeof ReportExportFormat>;

/**
 * مسیر دانلود گزارش هفتگی. پاسخ آن فایل است (نه JSON قرارداد)، پس بیرون از جدول routes تعریف می‌شود
 * ولی همان احراز هویت، عضویت و نقش را دارد و در OpenAPI هم ثبت می‌شود.
 */
export const reportExportRoute = {
  id: 'exportWeeklyReport',
  method: 'GET',
  path: `${BRAND}/reports/weekly/export`,
  tag: 'reports',
  summary_fa: 'دانلود گزارش هفتگی به‌صورت CSV یا JSON',
  scope: 'brand',
  min_role: 'viewer',
  params: BrandParams,
  query: z.strictObject({ week_of: IsoDate.optional(), format: ReportExportFormat.default('csv') }),
} as const;

/**
 * upload دارایی. بدنه فایل خام (application/octet-stream) است، پس بیرون از جدول routes تعریف می‌شود؛
 * همان احراز هویت، CSRF، عضویت و نقش را دارد. نوع فایل از محتوا تشخیص داده می‌شود، نه از نام یا سرآیند.
 */
export const assetUploadRoute = {
  id: 'uploadAsset',
  method: 'POST',
  path: `${BRAND}/assets`,
  tag: 'assets',
  summary_fa: 'بارگذاری دارایی (تصویر، ویدئو، صدا یا فونت)',
  scope: 'brand',
  min_role: 'editor',
  params: BrandParams,
  query: UploadAssetQuery,
  response: AssetView,
  success_status: 201,
  errors: [...WRITE_ERRORS, 'INVALID_MEDIA', 'CROSS_BRAND_REFERENCE'],
} as const;

/** دانلود فایل یک دارایی؛ فقط با نشست مالک یا عضو برند و هرگز با نشانی عمومی. */
export const assetFileRoute = {
  id: 'getAssetFile',
  method: 'GET',
  path: `${BRAND}/assets/{asset_id}/file`,
  tag: 'assets',
  summary_fa: 'دریافت فایل دارایی',
  scope: 'brand',
  min_role: 'viewer',
  params: BrandParams.extend({ asset_id: Uuid }),
} as const;
