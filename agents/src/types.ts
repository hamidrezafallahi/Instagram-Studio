import type { ModelMode, ModelSpec } from '@studio/ai';
import type { z } from 'zod';

/**
 * قرارداد هر نقش هوشمند (agents/README.md): نسخهٔ prompt، schema ورودی/خروجی، سقف فراخوانی،
 * مهلت، مدل‌های مجاز و فهرست ابزار مجاز. هیچ نقشی ابزار ارسال، انتشار یا پرداخت ندارد.
 */
export interface AgentRole<I, O> {
  readonly role: string;
  readonly title_fa: string;
  readonly prompt_version: string;
  readonly output_schema: z.ZodType<O>;
  readonly max_calls: number;
  readonly timeout_ms: number;
  readonly allowed_modes: readonly ModelMode[];
  /** ابزارهایی که این نقش اجازهٔ صدازدن دارد. خالی یعنی فقط خروجی ساخت‌یافته می‌دهد. */
  readonly tool_allowlist: readonly string[];
  readonly authority_fa: string;
  /** تولید deterministic بدون مدل؛ فقط از دادهٔ ورودی استفاده می‌کند و چیزی حدس نمی‌زند. */
  template(input: I): O;
  /** مسیر مدل زبانی (اختیاری)؛ بدون آن نقش فقط قالبی اجرا می‌شود. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly model?: ModelSpec<I, O, any>;
}
