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
  AuthorityMode,
  BrandStatus,
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
    note: z.string().max(500).optional(),
  })
  .meta({ id: 'CreateContentRevisionBody' });
export type CreateContentRevisionBody = z.infer<typeof CreateContentRevisionBody>;

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
    errors: [...WRITE_ERRORS, 'STALE_REVISION', 'INVALID_TRANSITION'],
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
