import type { ModelSession } from '@studio/ai';
import type {
  BrandProfile,
  Claim,
  ContentBrief,
  ContentState,
  ErrorCode,
  GeneratorInfo,
  IndustryPack,
  MetricsBatch,
  Plan,
  QaResult,
  RunIntent,
  ScheduleEntry,
  SourceRef,
} from '@studio/contracts';
import type { PlanProposal } from '@studio/agents';

/**
 * تعریف نسخه‌دار گردش‌کار (packages/orchestration/README.md): گام‌ها، مهلت و قرارداد ورودی/خروجی.
 * گردش‌کار فقط «ترتیب» است؛ ذخیره‌سازی و اتصال‌ها از طریق WorkflowTools تزریق می‌شوند تا کانکتور نمونه
 * بدون تغییر گردش‌کار جای adapter واقعی را بگیرد (پذیرش packages/README.md).
 */

export interface LoadedBrand {
  id: string;
  workspace_id: string;
  name: string;
  is_sample: boolean;
  revision: number;
  profile: BrandProfile;
  pack: IndustryPack;
}

export interface DraftToSave {
  entry: ScheduleEntry;
  brief: Omit<ContentBrief, 'id' | 'brand_id'>;
  title_fa: string;
  text: string;
  source_refs: SourceRef[];
  claims: Claim[];
  qa_result: QaResult;
  generator: GeneratorInfo;
  final_state: Extract<ContentState, 'ready_for_review' | 'needs_revision'>;
}

export interface MetricsSource {
  connection_id: string;
  provider: string;
  label: string;
  is_sample: boolean;
}

export interface WorkflowTools {
  now(): Date;
  model: ModelSession;
  loadBrand(): Promise<LoadedBrand>;
  /** برنامهٔ جاری هفته را با نسخهٔ تازه جایگزین می‌کند و برنامهٔ قبلی را superseded می‌کند. */
  savePlan(input: {
    week_start: string;
    proposal: PlanProposal;
    generator: GeneratorInfo;
    brand: LoadedBrand;
  }): Promise<Plan>;
  currentPlan(weekStart: string): Promise<Plan | null>;
  /** قابلیت متن مقصد (سقف طول و مانند آن) اگر اتصال قابل‌استفاده‌ای برای کانال باشد. */
  textLimits(channel: string): Promise<{ max_text_chars?: number } | undefined>;
  /** محتوا، بریف و نسخهٔ اول را در یک تراکنش می‌سازد؛ اگر آیتم قبلاً محتوا دارد null برمی‌گرداند. */
  saveDraft(draft: DraftToSave): Promise<{ content_id: string } | null>;
  /** محتوای تصویری هفته (یا محتواهای انتخابی) که می‌توان برایشان تصویر ساخت؛ موارد ردشده با دلیل. */
  listRenderable(weekStart: string, contentIds?: string[]): Promise<{
    candidates: RenderCandidate[];
    skipped: { ref: string; reason_fa: string }[];
  }>;
  /** رندر، ذخیرهٔ دارایی‌ها و نسخهٔ تازهٔ محتوا با QA بصری. */
  renderContent(contentId: string): Promise<RenderOutcome>;
  listMetricsSources(): Promise<MetricsSource[]>;
  fetchMetrics(source: MetricsSource, period: { start: string; end: string }): Promise<MetricsBatch>;
  saveMetrics(source: MetricsSource, batch: MetricsBatch): Promise<number>;
}

export interface RunParams {
  week_of?: string | undefined;
  schedule_entry_ids?: string[] | undefined;
  content_ids?: string[] | undefined;
}

/** محتوایی که می‌توان برایش تصویر ساخت. */
export interface RenderCandidate {
  content_id: string;
  title_fa: string;
  format: string;
}

export interface RenderOutcome {
  content_id: string;
  slides: number;
  qa_status: QaResult['status'];
  /** null یعنی نسخهٔ تازه ساخته شد؛ وگرنه دلیل کنار گذاشتن (مثلاً «تصویرها تغییری نکردند»). */
  skipped_reason_fa: string | null;
}

export interface RunOutcome {
  plan_id: string | null;
  content_ids: string[];
  skipped: { ref: string; reason_fa: string }[];
  summary_fa: string;
}

/** وضعیت درون‌حافظه‌ای یک اجرا؛ خروجی هر گام در پایگاه داده هم ثبت می‌شود. */
export interface RunContext {
  params: RunParams;
  week_start: string;
  brand?: LoadedBrand;
  proposal?: { value: PlanProposal; generator: GeneratorInfo };
  plan?: Plan;
  entries?: ScheduleEntry[];
  sources?: MetricsSource[];
  renderables?: RenderCandidate[];
  outcome: RunOutcome;
  /** شکست‌های واقعی (نه رد بی‌خطر مثل «قبلاً پیش‌نویس دارد»)؛ وضعیت نهایی run از این‌ها محاسبه می‌شود. */
  failures: { code: ErrorCode; message_fa: string }[];
  /** تعداد خروجی‌های واقعاً ذخیره‌شده (برنامه، پیش‌نویس، دستهٔ سنجه)؛ برای تشخیص موفقیت جزئی. */
  produced: number;
}

export interface StepResult {
  summary_fa: string;
  output_ref?: string | null;
}

export interface StepDefinition {
  readonly name: string;
  readonly title_fa: string;
  readonly timeout_ms: number;
  run(context: RunContext, tools: WorkflowTools): Promise<StepResult>;
}

export interface WorkflowDefinition {
  readonly id: string;
  readonly version: string;
  readonly intent: RunIntent;
  readonly title_fa: string;
  /** خلاصهٔ محدوده که پیش از شروع به مالک نشان داده می‌شود. */
  describeScope(input: { brand_name: string; week_start: string; params: RunParams }): string;
  readonly steps: readonly StepDefinition[];
}
