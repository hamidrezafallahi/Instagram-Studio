import { StudioError } from '@studio/contracts';
import type { Completion, ModelProvider, Prompt } from './index.ts';

/**
 * provider مدل زبانی از طریق OpenRouter، فقط با مدل‌های رایگان (شناسه‌های «:free»).
 * مستندات: https://openrouter.ai/docs/api-reference/chat-completion (بررسی 2026-11-15).
 *
 * سه لایهٔ صفر هزینه:
 *  ۱) هر شناسهٔ مدل باید به «:free» ختم شود؛ در غیر این صورت provider ساخته نمی‌شود.
 *  ۲) ModelSession هر پاسخی را که هزینهٔ بیش از صفر گزارش کند متوقف می‌کند (بدون fallback).
 *  ۳) سقف خرج خود کلید در OpenRouter صفر است (بیرون از کد؛ مالک تنظیم می‌کند).
 *
 * فقط دادهٔ برند و بریف به مدل فرستاده می‌شود؛ هیچ پیام مشتری، سرنخ یا دادهٔ شخصی.
 * کلید فقط در سرآیند Authorization است و در هیچ پیام خطا یا log قرار نمی‌گیرد.
 */

export const OPENROUTER_API = 'https://openrouter.ai/api/v1';

export interface OpenRouterOptions {
  apiKey: string;
  /** مدل‌ها به ترتیب ترجیح؛ همه باید «:free» باشند. */
  models: readonly string[];
  /** مهلت هر درخواست (میلی‌ثانیه). */
  timeoutMs?: number;
  maxTokens?: number;
  /** تزریق در آزمون. */
  fetch?: typeof fetch;
  /** عنوان برنامه در داشبورد OpenRouter. */
  appTitle?: string;
}

interface ChatResponse {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { cost?: number | null };
  error?: { code?: number; message?: string };
}

/** خطاهایی که با مدل بعدی قابل جبران‌اند: محدودیت نرخ، نبود مدل، خطای موقت ارائه‌دهنده. */
const TRY_NEXT_STATUS = new Set([404, 408, 409, 429, 500, 502, 503, 504, 529]);

export function createOpenRouterProvider(options: OpenRouterOptions): ModelProvider {
  const models = [...options.models];
  if (models.length === 0) throw new Error('OpenRouter: دست‌کم یک مدل لازم است.');
  const notFree = models.filter((model) => !model.endsWith(':free'));
  if (notFree.length > 0) {
    throw new Error(`OpenRouter: فقط مدل‌های رایگان («:free») مجازند؛ رد شد: ${notFree.join(', ')}`);
  }
  if (!options.apiKey.trim()) throw new Error('OpenRouter: کلید API تنظیم نشده است.');
  const doFetch = options.fetch ?? fetch;
  const headers = {
    Authorization: `Bearer ${options.apiKey}`,
    'Content-Type': 'application/json',
    'X-Title': options.appTitle ?? 'Content Studio',
  };

  async function callModel(model: string, prompt: Prompt, signal: AbortSignal): Promise<Completion | { retry: string }> {
    let response: Response;
    try {
      response = await doFetch(`${OPENROUTER_API}/chat/completions`, {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          max_tokens: options.maxTokens ?? 6000,
          temperature: 0.6,
        }),
      });
    } catch (error) {
      if (signal.aborted) throw new StudioError('PROVIDER_UNAVAILABLE', { message_fa: 'مهلت پاسخ مدل تمام شد.' });
      return { retry: `${model}: اتصال برقرار نشد (${error instanceof Error ? error.name : 'خطا'})` };
    }
    if (response.status === 401 || response.status === 403) {
      throw new StudioError('AUTH_EXPIRED', {
        message_fa: 'کلید OpenRouter پذیرفته نشد؛ کلید را در STUDIO_HOME بررسی کنید.',
      });
    }
    if (response.status === 402) {
      throw new StudioError('PAYMENT_REQUIRED', {
        message_fa: 'OpenRouter برای این درخواست اعتبار خواست؛ در حالت «فقط رایگان» ادامه داده نمی‌شود.',
      });
    }
    if (!response.ok) {
      if (TRY_NEXT_STATUS.has(response.status)) return { retry: `${model}: پاسخ ${response.status}` };
      throw new StudioError('PROVIDER_UNAVAILABLE', { message_fa: `OpenRouter پاسخ ${response.status} داد.` });
    }
    let body: ChatResponse;
    try {
      body = (await response.json()) as ChatResponse;
    } catch {
      return { retry: `${model}: پاسخ قابل خواندن نبود` };
    }
    if (body.error) return { retry: `${model}: ${String(body.error.code ?? 'error')}` };
    const text = body.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) return { retry: `${model}: پاسخ خالی (${body.choices?.[0]?.finish_reason ?? 'نامعلوم'})` };
    return {
      text,
      model_id: body.model ?? model,
      cost_usd: typeof body.usage?.cost === 'number' ? body.usage.cost : null,
    };
  }

  return {
    id: 'openrouter',
    mode: 'free_api',
    cost_model: 'free_quota',
    timeout_ms: options.timeoutMs ?? 120_000,

    async health() {
      try {
        const response = await doFetch(`${OPENROUTER_API}/key`, { headers, signal: AbortSignal.timeout(10_000) });
        if (!response.ok) return { ok: false, detail_fa: `کلید OpenRouter پذیرفته نشد (${response.status}).` };
        return { ok: true, detail_fa: `OpenRouter آماده است؛ فقط مدل‌های رایگان: ${models.join('، ')}` };
      } catch {
        return { ok: false, detail_fa: 'OpenRouter در دسترس نیست.' };
      }
    },

    /** مدل‌ها به ترتیب امتحان می‌شوند؛ محدودیت نرخ یا نبود مدل → مدل بعدی. */
    async complete(prompt, signal) {
      const reasons: string[] = [];
      for (const model of models) {
        const result = await callModel(model, prompt, signal);
        if ('text' in result) return result;
        reasons.push(result.retry);
      }
      throw new StudioError('RATE_LIMITED', {
        message_fa: `هیچ مدل رایگان OpenRouter پاسخ نداد (${reasons.join('؛ ')}).`,
      });
    },
  };
}
