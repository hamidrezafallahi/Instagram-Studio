/**
 * درگاه مدل با مدل زبانی و provider ‏OpenRouter — بدون شبکه (fetch ساختگی).
 * گواه اتصال واقعی به OpenRouter نیست.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StudioError } from '@studio/contracts';
import { z } from 'zod';
import {
  ModelGateway,
  createOpenRouterProvider,
  extractJson,
  templateProvider,
  type Completion,
  type GenerateRequest,
  type ModelProvider,
} from './index.ts';

const Output = z.strictObject({ value: z.string(), source: z.string() });
type Output = z.infer<typeof Output>;
const Raw = z.object({ value: z.string() });

function request(): GenerateRequest<{ topic: string }, Output> {
  return {
    role: 'test',
    prompt_version: 'template-v1',
    input: { topic: 'سایت' },
    output_schema: Output,
    template: () => ({ value: 'قالبی', source: 'template' }),
    model: {
      prompt_version: 'model-v1',
      build: (input: { topic: string }) => ({ system: 'فقط JSON', user: input.topic }),
      schema: Raw,
      finish: (_input: { topic: string }, raw: { value: string }) => ({ value: raw.value, source: 'model' }),
    },
    allowed_modes: ['free_api', 'template'],
  };
}

function fakeLlm(replies: (Completion | Error)[]): ModelProvider & { prompts: string[] } {
  const queue = [...replies];
  const prompts: string[] = [];
  return {
    id: 'fake-llm',
    mode: 'free_api',
    cost_model: 'free_quota',
    prompts,
    async health() {
      return { ok: true, detail_fa: 'آزمون' };
    },
    async complete(prompt) {
      prompts.push(prompt.user);
      const next = queue.shift();
      if (!next) throw new StudioError('RATE_LIMITED', { message_fa: 'پاسخ آزمونی تمام شد.' });
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const reply = (text: string, cost: number | null = 0): Completion => ({ text, model_id: 'vendor/model:free', cost_usd: cost });
const gateway = (llm: ModelProvider) =>
  new ModelGateway([llm, templateProvider], { default_modes: ['free_api', 'template'] });

describe('درگاه مدل — مسیر مدل زبانی', () => {
  it('خروجی مدل با قرارداد خوانده و نام مدل در generator ثبت می‌شود', async () => {
    const llm = fakeLlm([reply('```json\n{"value": "متن مدل"}\n```')]);
    const result = await gateway(llm).session().generate(request());
    assert.deepEqual(result.output, { value: 'متن مدل', source: 'model' });
    assert.equal(result.generator.kind, 'model');
    assert.equal(result.generator.provider, 'fake-llm:vendor/model:free');
    assert.equal(result.generator.prompt_version, 'model-v1');
    assert.deepEqual(result.fallbacks_fa, []);
  });

  it('خروجی نامعتبر یک بار اصلاح می‌شود', async () => {
    const llm = fakeLlm([reply('این JSON نیست'), reply('{"value": "اصلاح‌شده"}')]);
    const session = gateway(llm).session();
    const result = await session.generate(request());
    assert.equal(result.output.value, 'اصلاح‌شده');
    assert.equal(session.calls, 2);
    assert.match(llm.prompts[1] ?? '', /سازگار نبود/);
  });

  it('دو بار نامعتبر یا در دسترس نبودن مدل → تولید قالبی با دلیل صریح', async () => {
    const invalid = await gateway(fakeLlm([reply('{}'), reply('{"x":1}')])).session().generate(request());
    assert.equal(invalid.output.source, 'template');
    assert.equal(invalid.generator.kind, 'template');
    assert.equal(invalid.fallbacks_fa.length, 1);

    const down = await gateway(fakeLlm([])).session().generate(request());
    assert.equal(down.output.source, 'template');
    assert.match(down.fallbacks_fa[0] ?? '', /fake-llm/);
  });

  it('A23 — هزینهٔ غیرصفر از provider رایگان کل تولید را متوقف می‌کند و به قالبی هم نمی‌رود', async () => {
    const session = gateway(fakeLlm([reply('{"value":"x"}', 0.002)])).session();
    await assert.rejects(
      session.generate(request()),
      (error: unknown) => error instanceof StudioError && error.code === 'PAYMENT_REQUIRED',
    );
  });

  it('نقش قالبی‌محض (بدون مسیر مدل) به مدل زبانی نمی‌رود', async () => {
    const llm = fakeLlm([reply('{"value":"x"}')]);
    const { model: _omit, ...templateOnly } = request();
    const result = await gateway(llm).session().generate({ ...templateOnly, allowed_modes: ['template'] });
    assert.equal(result.output.source, 'template');
    assert.equal(llm.prompts.length, 0);
  });

  it('JSON از پاسخ آمیخته با متن استخراج می‌شود', () => {
    assert.deepEqual(extractJson('بفرمایید:\n{"a": 1}\nپایان'), { a: 1 });
    assert.throws(() => extractJson('بدون JSON'), (error: unknown) => error instanceof StudioError);
  });
});

describe('provider ‏OpenRouter (fetch ساختگی)', () => {
  const key = 'sk-or-v1-fake-key-for-tests-0000000000';
  const ok = (body: object) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

  it('فقط مدل‌های «:free» پذیرفته می‌شوند', () => {
    assert.throws(() => createOpenRouterProvider({ apiKey: key, models: ['anthropic/claude-sonnet-5-5'] }), /:free/);
    assert.throws(() => createOpenRouterProvider({ apiKey: key, models: [] }));
    assert.throws(() => createOpenRouterProvider({ apiKey: ' ', models: ['a/b:free'] }));
  });

  it('محدودیت نرخ مدل اول → مدل دوم؛ کلید فقط در سرآیند است', async () => {
    const calls: { model: string; auth: string | null; body: string }[] = [];
    const fakeFetch: typeof fetch = async (_url, init) => {
      const body = String(init?.body);
      const model = (JSON.parse(body) as { model: string }).model;
      calls.push({ model, auth: new Headers(init?.headers).get('authorization'), body });
      if (model === 'first/model:free') return new Response('{}', { status: 429 });
      return ok({ model, choices: [{ message: { content: '{"value":"ok"}' } }], usage: { cost: 0 } });
    };
    const provider = createOpenRouterProvider({ apiKey: key, models: ['first/model:free', 'second/model:free'], fetch: fakeFetch });
    const completion = await provider.complete?.({ system: 's', user: 'u' }, AbortSignal.timeout(5_000));
    assert.equal(completion?.model_id, 'second/model:free');
    assert.equal(completion?.cost_usd, 0);
    assert.deepEqual(calls.map((call) => call.model), ['first/model:free', 'second/model:free']);
    assert.equal(calls[0]?.auth, `Bearer ${key}`);
    assert.ok(calls.every((call) => !call.body.includes(key)));
  });

  it('همهٔ مدل‌ها محدود → RATE_LIMITED بدون افشای کلید؛ 402 → PAYMENT_REQUIRED؛ 401 → AUTH_EXPIRED', async () => {
    const statusFetch = (status: number): typeof fetch => async () => new Response('{}', { status });
    const limited = createOpenRouterProvider({ apiKey: key, models: ['a/b:free', 'c/d:free'], fetch: statusFetch(429) });
    await assert.rejects(limited.complete?.({ system: 's', user: 'u' }, AbortSignal.timeout(5_000)) as Promise<Completion>, (error: unknown) =>
      error instanceof StudioError && error.code === 'RATE_LIMITED' && !error.message_fa.includes(key),
    );
    const payment = createOpenRouterProvider({ apiKey: key, models: ['a/b:free'], fetch: statusFetch(402) });
    await assert.rejects(payment.complete?.({ system: 's', user: 'u' }, AbortSignal.timeout(5_000)) as Promise<Completion>, (error: unknown) =>
      error instanceof StudioError && error.code === 'PAYMENT_REQUIRED',
    );
    const auth = createOpenRouterProvider({ apiKey: key, models: ['a/b:free'], fetch: statusFetch(401) });
    await assert.rejects(auth.complete?.({ system: 's', user: 'u' }, AbortSignal.timeout(5_000)) as Promise<Completion>, (error: unknown) =>
      error instanceof StudioError && error.code === 'AUTH_EXPIRED',
    );
  });

  it('پاسخ خالی (مدل استدلالی که توکنش تمام شد) → مدل بعدی', async () => {
    let call = 0;
    const fakeFetch: typeof fetch = async () => {
      call += 1;
      return call === 1
        ? ok({ choices: [{ message: { content: null }, finish_reason: 'length' }] })
        : ok({ model: 'c/d:free', choices: [{ message: { content: 'متن' } }] });
    };
    const provider = createOpenRouterProvider({ apiKey: key, models: ['a/b:free', 'c/d:free'], fetch: fakeFetch });
    const completion = await provider.complete?.({ system: 's', user: 'u' }, AbortSignal.timeout(5_000));
    assert.equal(completion?.text, 'متن');
    assert.equal(completion?.cost_usd, null);
  });
});
