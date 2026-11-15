import {
  StudioError,
  type CostModel,
  type GeneratorInfo,
  type SpendMode,
} from '@studio/contracts';
import type { z } from 'zod';

/**
 * درگاه مدل (packages/ai/README.md).
 * حالت‌ها: template (تولید قالبی محلی و بدون هزینه)، local_model، harness_assisted، paid_api.
 * قواعد ثابت:
 *  - fallback پولی خودکار ممنوع است؛ در free_only هیچ provider پولی انتخاب نمی‌شود (A23).
 *  - خروجی همیشه با schema اعتبارسنجی می‌شود؛ خروجی نامعتبر به بازبینی انسانی می‌رود.
 *  - هر run سقف تعداد فراخوانی و مهلت زمانی دارد.
 */

export type ModelMode = 'template' | 'local_model' | 'harness_assisted' | 'paid_api';

export interface GenerateRequest<I, O> {
  role: string;
  prompt_version: string;
  input: I;
  output_schema: z.ZodType<O>;
  /** تولید deterministic همان نقش؛ فقط provider قالبی از آن استفاده می‌کند. */
  template?: (input: I) => unknown;
}

export interface ModelProvider {
  readonly id: string;
  readonly mode: ModelMode;
  readonly cost_model: CostModel;
  health(): Promise<{ ok: boolean; detail_fa: string }>;
  generate<I, O>(request: GenerateRequest<I, O>, signal: AbortSignal): Promise<unknown>;
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

  #select(): ModelProvider {
    for (const mode of this.#limits.allowed_modes) {
      const provider = this.#providers.find((item) => item.mode === mode);
      if (!provider) continue;
      if (provider.cost_model !== 'free' && this.#limits.spend_mode === 'free_only') continue;
      return provider;
    }
    const paidExists = this.#providers.some(
      (provider) => this.#limits.allowed_modes.includes(provider.mode) && provider.cost_model !== 'free',
    );
    if (paidExists) {
      throw new StudioError('PAYMENT_REQUIRED', {
        message_fa: 'تنها مدل در دسترس پولی است و حالت «فقط رایگان» فعال است؛ مدل پولی خودکار انتخاب نمی‌شود.',
        action_required: 'تولید قالبی را ادامه دهید یا درخواست هزینه را بررسی کنید.',
      });
    }
    throw new StudioError('PROVIDER_UNAVAILABLE', { message_fa: 'هیچ تولیدکنندهٔ متنی برای این اجرا در دسترس نیست.' });
  }

  async generate<I, O>(request: GenerateRequest<I, O>): Promise<GenerateResult<O>> {
    if (this.#calls >= this.#limits.max_calls) {
      throw new StudioError('QUOTA_EXHAUSTED', { message_fa: 'سقف فراخوانی تولید متن برای این اجرا پر شد.' });
    }
    const provider = this.#select();
    this.#calls += 1;
    const raw = await Promise.race([
      provider.generate(request, AbortSignal.timeout(this.#limits.timeout_ms)),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new StudioError('PROVIDER_UNAVAILABLE', { message_fa: 'مهلت تولید متن تمام شد.' })),
          this.#limits.timeout_ms,
        );
        timer.unref();
      }),
    ]);
    const parsed = request.output_schema.safeParse(raw);
    if (!parsed.success) {
      throw new StudioError('VALIDATION_FAILED', {
        message_fa: `خروجی نقش «${request.role}» با قرارداد خروجی سازگار نیست و به بازبینی انسانی نیاز دارد.`,
        details: parsed.error.issues.slice(0, 5).map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      });
    }
    return {
      output: parsed.data,
      generator: {
        kind: provider.mode === 'template' ? 'template' : 'model',
        provider: provider.id,
        role: request.role,
        prompt_version: request.prompt_version,
      },
    };
  }
}

export class ModelGateway {
  readonly #providers: readonly ModelProvider[];

  constructor(providers: readonly ModelProvider[] = [templateProvider]) {
    this.#providers = providers;
  }

  /** هر run نشست خودش را دارد تا سقف فراخوانی و حالت هزینه جدا شمرده شود. */
  session(limits: Partial<SessionLimits> = {}): ModelSession {
    return new ModelSession(this.#providers, { ...DEFAULT_SESSION_LIMITS, ...limits });
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
