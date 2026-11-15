import {
  StudioError,
  isStudioError,
  type CostModel,
  type GeneratorInfo,
  type SpendMode,
} from '@studio/contracts';
import type { z } from 'zod';

export { createOpenRouterProvider, OPENROUTER_API, type OpenRouterOptions } from './openrouter.ts';

/**
 * درگاه مدل (packages/ai/README.md).
 * حالت‌ها: template (تولید قالبی محلی و بدون هزینه)، free_api (API بیرونی فقط با مدل‌های رایگان)،
 * local_model، harness_assisted، paid_api.
 * قواعد ثابت:
 *  - fallback پولی خودکار ممنوع است؛ در free_only هیچ provider پولی انتخاب نمی‌شود (A23).
 *  - اگر provider رایگان هزینه‌ای بیش از صفر گزارش کند، کل نشست متوقف می‌شود و fallback ندارد.
 *  - خروجی همیشه با schema اعتبارسنجی می‌شود؛ خروجی مدل یک بار اصلاح می‌شود و بعد provider بعدی.
 *  - هر run سقف تعداد فراخوانی و مهلت زمانی دارد.
 */

export type ModelMode = 'template' | 'free_api' | 'local_model' | 'harness_assisted' | 'paid_api';

export interface Prompt {
  system: string;
  user: string;
}

/** پاسخ خام یک مدل زبانی. */
export interface Completion {
  text: string;
  /** شناسهٔ مدلی که واقعاً پاسخ داد. */
  model_id: string;
  /** هزینهٔ گزارش‌شده توسط ارائه‌دهنده (دلار)؛ null یعنی گزارش نشد. */
  cost_usd: number | null;
}

/**
 * مسیر مدل زبانی یک نقش: prompt، قرارداد خروجی خام مدل و تبدیل آن به خروجی نهایی نقش.
 * مدل فقط بخش متنی را می‌سازد؛ منبع‌ها و ادعاها را کد از دادهٔ برند می‌سازد.
 */
export interface ModelSpec<I, O, M = unknown> {
  prompt_version: string;
  build(input: I): Prompt;
  schema: z.ZodType<M>;
  finish(input: I, output: M): O;
}

export interface GenerateRequest<I, O> {
  role: string;
  prompt_version: string;
  input: I;
  output_schema: z.ZodType<O>;
  /** تولید deterministic همان نقش؛ فقط provider قالبی از آن استفاده می‌کند. */
  template?: (input: I) => unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model?: ModelSpec<I, O, any>;
  /** حالت‌های مجاز همین نقش؛ با حالت‌های نشست اشتراک گرفته می‌شود. */
  allowed_modes?: readonly ModelMode[];
}

export interface ModelProvider {
  readonly id: string;
  readonly mode: ModelMode;
  readonly cost_model: CostModel;
  /** مهلت هر فراخوانی این provider؛ در غیر این صورت مهلت نشست. */
  readonly timeout_ms?: number;
  health(): Promise<{ ok: boolean; detail_fa: string }>;
  /** provider قالبی یا آزمونی: خروجی ساخت‌یافته را مستقیم می‌دهد. */
  generate?<I, O>(request: GenerateRequest<I, O>, signal: AbortSignal): Promise<unknown>;
  /** مدل زبانی: متن خام برای یک prompt. */
  complete?(prompt: Prompt, signal: AbortSignal): Promise<Completion>;
}

export interface SessionLimits {
  spend_mode: SpendMode;
  /** ترتیب ترجیح حالت‌ها برای این run. */
  allowed_modes: readonly ModelMode[];
  max_calls: number;
  timeout_ms: number;
}

export const DEFAULT_SESSION_LIMITS: SessionLimits = {
  spend_mode: 'free_only',
  allowed_modes: ['template'],
  max_calls: 40,
  timeout_ms: 20_000,
};

export interface GenerateResult<O> {
  output: O;
  generator: GeneratorInfo;
  /** دلیل کنار رفتن providerهای پیشین (مثلاً «مدل رایگان در دسترس نبود»)؛ برای نمایش صادقانه. */
  fallbacks_fa: string[];
}

/** provider قالبی: هیچ مدلی صدا زده نمی‌شود و هزینه‌ای ندارد. */
export const templateProvider: ModelProvider = {
  id: 'local-template',
  mode: 'template',
  cost_model: 'free',
  async health() {
    return { ok: true, detail_fa: 'تولید قالبی محلی آماده است (بدون مدل زبانی و بدون هزینه).' };
  },
  async generate(request) {
    if (!request.template) {
      throw new StudioError('NOT_IMPLEMENTED', {
        message_fa: `نقش «${request.role}» تولید قالبی ندارد و به مدل زبانی نیاز دارد.`,
      });
    }
    return request.template(request.input);
  },
};

/** هزینه‌مدل‌هایی که در free_only مجازند: رایگان، یا رایگان با سهمیه. */
const FREE_COST_MODELS: ReadonlySet<CostModel> = new Set(['free', 'free_quota']);

/** JSON داخل پاسخ مدل: کل متن، بلوک ```json یا اولین شیء کامل. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) candidates.push(trimmed.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // نامزد بعدی
    }
  }
  throw new StudioError('VALIDATION_FAILED', { message_fa: 'پاسخ مدل JSON معتبر نبود.' });
}

function issuesOf(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.slice(0, 5).map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }));
}

export class ModelSession {
  readonly #providers: readonly ModelProvider[];
  readonly #limits: SessionLimits;
  #calls = 0;

  constructor(providers: readonly ModelProvider[], limits: SessionLimits) {
    this.#providers = providers;
    this.#limits = limits;
  }

  get calls(): number {
    return this.#calls;
  }

  #countCall(): void {
    if (this.#calls >= this.#limits.max_calls) {
      throw new StudioError('QUOTA_EXHAUSTED', { message_fa: 'سقف فراخوانی تولید متن برای این اجرا پر شد.' });
    }
    this.#calls += 1;
  }

  async #withTimeout<T>(provider: ModelProvider, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const timeout = provider.timeout_ms ?? this.#limits.timeout_ms;
    return Promise.race([
      run(AbortSignal.timeout(timeout)),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new StudioError('PROVIDER_UNAVAILABLE', { message_fa: 'مهلت تولید متن تمام شد.' })),
          timeout,
        );
        timer.unref();
      }),
    ]);
  }

  /** providerهای قابل استفاده برای این درخواست، به ترتیب ترجیح. */
  #candidates<I, O>(request: GenerateRequest<I, O>): { usable: ModelProvider[]; paidSkipped: boolean } {
    const modes = this.#limits.allowed_modes.filter(
      (mode) => !request.allowed_modes || request.allowed_modes.includes(mode),
    );
    const usable: ModelProvider[] = [];
    let paidSkipped = false;
    for (const mode of modes) {
      for (const provider of this.#providers.filter((item) => item.mode === mode)) {
        if (!FREE_COST_MODELS.has(provider.cost_model) && this.#limits.spend_mode === 'free_only') {
          paidSkipped = true;
          continue;
        }
        if (provider.complete && !provider.generate && !request.model) continue;
        usable.push(provider);
      }
    }
    return { usable, paidSkipped };
  }

  async #viaGenerate<I, O>(provider: ModelProvider, request: GenerateRequest<I, O>): Promise<O> {
    this.#countCall();
    const raw = await this.#withTimeout(provider, (signal) =>
      (provider.generate as NonNullable<ModelProvider['generate']>)(request, signal),
    );
    const parsed = request.output_schema.safeParse(raw);
    if (!parsed.success) {
      throw new StudioError('VALIDATION_FAILED', {
        message_fa: `خروجی نقش «${request.role}» با قرارداد خروجی سازگار نیست و به بازبینی انسانی نیاز دارد.`,
        details: issuesOf(parsed.error),
      });
    }
    return parsed.data;
  }

  async #complete(provider: ModelProvider, prompt: Prompt): Promise<Completion> {
    this.#countCall();
    const completion = await this.#withTimeout(provider, (signal) =>
      (provider.complete as NonNullable<ModelProvider['complete']>)(prompt, signal),
    );
    if (completion.cost_usd !== null && completion.cost_usd > 0 && this.#limits.spend_mode === 'free_only') {
      // provider رایگان هزینه گزارش کرد: توقف کامل، بدون fallback و بدون تکرار (A23).
      throw new SpendViolation(provider.id, completion.model_id, completion.cost_usd);
    }
    return completion;
  }

  async #viaModel<I, O>(provider: ModelProvider, request: GenerateRequest<I, O>): Promise<{ output: O; model_id: string }> {
    const spec = request.model as ModelSpec<I, O, unknown>;
    const prompt = spec.build(request.input);
    let completion = await this.#complete(provider, prompt);
    let problem: string;
    try {
      const parsed = spec.schema.safeParse(extractJson(completion.text));
      if (parsed.success) return this.#finish(request, spec, parsed.data, completion.model_id);
      problem = issuesOf(parsed.error).map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    } catch (error) {
      if (!isStudioError(error) || error.code !== 'VALIDATION_FAILED') throw error;
      problem = error.message_fa;
    }
    // یک بار اصلاح؛ پس از آن provider بعدی یا بازبینی انسانی.
    completion = await this.#complete(provider, {
      system: prompt.system,
      user: `${prompt.user}\n\nپاسخ قبلی شما با قرارداد خروجی سازگار نبود (${problem.slice(0, 500)}). فقط یک شیء JSON معتبر مطابق قرارداد برگردانید، بدون هیچ متن دیگری.`,
    });
    const parsed = spec.schema.safeParse(extractJson(completion.text));
    if (!parsed.success) {
      throw new StudioError('VALIDATION_FAILED', {
        message_fa: `خروجی مدل برای نقش «${request.role}» پس از یک بار اصلاح هم معتبر نبود.`,
        details: issuesOf(parsed.error),
      });
    }
    return this.#finish(request, spec, parsed.data, completion.model_id);
  }

  #finish<I, O>(request: GenerateRequest<I, O>, spec: ModelSpec<I, O, unknown>, raw: unknown, modelId: string) {
    const parsed = request.output_schema.safeParse(spec.finish(request.input, raw));
    if (!parsed.success) {
      throw new StudioError('VALIDATION_FAILED', {
        message_fa: `خروجی نهایی نقش «${request.role}» با قرارداد خروجی سازگار نیست.`,
        details: issuesOf(parsed.error),
      });
    }
    return { output: parsed.data, model_id: modelId };
  }

  async generate<I, O>(request: GenerateRequest<I, O>): Promise<GenerateResult<O>> {
    const { usable, paidSkipped } = this.#candidates(request);
    const fallbacks: string[] = [];
    let lastError: unknown = null;
    for (const provider of usable) {
      const useModel = Boolean(provider.complete && request.model);
      try {
        if (useModel) {
          const { output, model_id } = await this.#viaModel(provider, request);
          return {
            output,
            generator: {
              kind: 'model',
              provider: `${provider.id}:${model_id}`,
              role: request.role,
              prompt_version: (request.model as ModelSpec<I, O>).prompt_version,
            },
            fallbacks_fa: fallbacks,
          };
        }
        const output = await this.#viaGenerate(provider, request);
        return {
          output,
          generator: {
            kind: provider.mode === 'template' ? 'template' : 'model',
            provider: provider.id,
            role: request.role,
            prompt_version: request.prompt_version,
          },
          fallbacks_fa: fallbacks,
        };
      } catch (error) {
        if (error instanceof SpendViolation) throw error.toStudioError();
        if (isStudioError(error) && error.code === 'QUOTA_EXHAUSTED') throw error;
        lastError = error;
        fallbacks.push(
          `${provider.id}: ${isStudioError(error) ? error.message_fa : 'خطای پیش‌بینی‌نشده'}`,
        );
      }
    }
    if (lastError) throw lastError;
    if (paidSkipped) {
      throw new StudioError('PAYMENT_REQUIRED', {
        message_fa: 'تنها مدل در دسترس پولی است و حالت «فقط رایگان» فعال است؛ مدل پولی خودکار انتخاب نمی‌شود.',
        action_required: 'تولید قالبی را ادامه دهید یا درخواست هزینه را بررسی کنید.',
      });
    }
    throw new StudioError('PROVIDER_UNAVAILABLE', { message_fa: 'هیچ تولیدکنندهٔ متنی برای این اجرا در دسترس نیست.' });
  }
}

/** هزینهٔ غیرصفر از provider رایگان؛ نشست را متوقف می‌کند. */
class SpendViolation extends Error {
  readonly providerId: string;
  readonly modelId: string;
  readonly costUsd: number;

  constructor(providerId: string, modelId: string, costUsd: number) {
    super('free provider reported a non-zero cost');
    this.providerId = providerId;
    this.modelId = modelId;
    this.costUsd = costUsd;
  }

  toStudioError(): StudioError {
    return new StudioError('PAYMENT_REQUIRED', {
      message_fa: `مدل «${this.modelId}» از «${this.providerId}» هزینه گزارش کرد (${this.costUsd} دلار) در حالی که فقط رایگان مجاز است؛ تولید متوقف شد.`,
      action_required: 'فهرست مدل‌های رایگان و سقف خرج کلید را بررسی کنید.',
    });
  }
}

export interface GatewayOptions {
  /** حالت‌های پیش‌فرض نشست، به ترتیب ترجیح. */
  default_modes?: readonly ModelMode[];
}

export class ModelGateway {
  readonly #providers: readonly ModelProvider[];
  readonly #defaults: Partial<SessionLimits>;

  constructor(providers: readonly ModelProvider[] = [templateProvider], options: GatewayOptions = {}) {
    this.#providers = providers;
    this.#defaults = options.default_modes ? { allowed_modes: options.default_modes } : {};
  }

  /** هر run نشست خودش را دارد تا سقف فراخوانی و حالت هزینه جدا شمرده شود. */
  session(limits: Partial<SessionLimits> = {}): ModelSession {
    return new ModelSession(this.#providers, { ...DEFAULT_SESSION_LIMITS, ...this.#defaults, ...limits });
  }

  /** شناسهٔ providerهای فعال؛ برای نمایش «تولید با چه چیزی» در داشبورد. */
  describe(): { id: string; mode: ModelMode; cost_model: CostModel }[] {
    return this.#providers.map((provider) => ({ id: provider.id, mode: provider.mode, cost_model: provider.cost_model }));
  }

  async health(): Promise<{ id: string; mode: ModelMode; cost_model: CostModel; ok: boolean; detail_fa: string }[]> {
    return Promise.all(
      this.#providers.map(async (provider) => ({
        id: provider.id,
        mode: provider.mode,
        cost_model: provider.cost_model,
        ...(await provider.health()),
      })),
    );
  }
}
