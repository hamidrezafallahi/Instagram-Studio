'use client';

import { STEP_STATE_LABEL_FA, type RunIntent, type RunView } from '@studio/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, newIdempotencyKey } from '@/lib/api.ts';
import { useMutation } from '@/lib/hooks.ts';
import { Banner, Button, Dialog, ErrorNote, RunStateBadge, SampleBadge } from './ui.tsx';

const TERMINAL = new Set(['succeeded', 'partially_succeeded', 'failed', 'cancelled']);

const STEP_MARK: Record<string, string> = { succeeded: '✓', failed: '✕', running: '…', skipped: '–', pending: '' };

export const INTENT_LABEL: Record<RunIntent, string> = {
  build_weekly_plan: 'ساخت برنامهٔ هفته',
  generate_drafts: 'تولید پیش‌نویس',
  collect_metrics: 'جمع‌آوری سنجه',
};

const INTENT_SCOPE: Record<RunIntent, string> = {
  build_weekly_plan:
    'برنامهٔ پیشنهادی هفته از روی الگوی هفتگی، کانال‌های فعال و اطلاعات برند ساخته می‌شود. فقط برنامه است و بعد از ساخت می‌توانید هر آیتم را ویرایش کنید.',
  generate_drafts:
    'برای آیتم‌های بدون محتوای همین هفته پیش‌نویس ساخته و بازبینی خودکار می‌شود. هر جا اطلاعات برند کافی نباشد، جای خالی علامت می‌خورد تا خودتان کاملش کنید.',
  collect_metrics:
    'سنجه‌های همین هفته از اتصال‌هایی خوانده می‌شود که قابلیت خواندن سنجهٔ آزموده دارند. اگر چنین اتصالی نباشد، گزارش «در دسترس نیست» نشان می‌دهد.',
};

/** وضعیت یک اجرا: گام‌ها، نتیجه و موارد ردشده. «منتظر …» شکست نیست. */
export function RunPanel({ run }: { run: RunView }) {
  return (
    <div className="stack stack--tight">
      <div className="row">
        <RunStateBadge state={run.status} />
        {run.is_sample ? <SampleBadge /> : null}
        {run.replayed ? <span className="small muted">همان اجرای قبلی؛ اجرای تازه‌ای ساخته نشد.</span> : null}
      </div>
      <p className="small muted">{run.scope_fa}</p>
      <ol className="steps">
        {run.steps.map((step) => (
          <li key={step.seq}>
            <span className={`steps__dot steps__dot--${step.status}`} aria-hidden="true">
              {STEP_MARK[step.status]}
            </span>
            <div>
              <div>
                {step.title_fa} <span className="small muted">— {STEP_STATE_LABEL_FA[step.status]}</span>
              </div>
              {step.summary_fa ? <div className="small muted">{step.summary_fa}</div> : null}
            </div>
          </li>
        ))}
      </ol>
      {run.error ? (
        <Banner tone="danger">{run.error.message_fa}</Banner>
      ) : run.result?.summary_fa ? (
        <Banner tone={run.status === 'succeeded' ? 'ok' : 'warn'}>{run.result.summary_fa}</Banner>
      ) : null}
      {run.result && run.result.skipped.length > 0 ? (
        <details>
          <summary className="small">موارد انجام‌نشده ({run.result.skipped.length})</summary>
          <ul className="bullets small">
            {run.result.skipped.map((item) => (
              <li key={`${item.ref}:${item.reason_fa}`}>{item.reason_fa}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/**
 * دکمهٔ اجرا. پیش از شروع، محدوده و سقف هزینه نشان داده می‌شود. کلید یکتایی هنگام بازشدن پنجره ساخته
 * می‌شود؛ پس دوبار کلیک روی «شروع» همان فرمان را می‌فرستد و اجرای دوم ساخته نمی‌شود.
 */
export function RunLauncher({
  intent,
  params,
  weekOf,
  entryIds,
  label,
  variant = 'default',
  disabledReason,
  onFinished,
}: {
  intent: RunIntent;
  params: { workspace_id: string; brand_id: string };
  weekOf?: string | undefined;
  entryIds?: string[] | undefined;
  label?: string;
  variant?: 'default' | 'primary';
  disabledReason?: string | undefined;
  onFinished?: (run: RunView) => void;
}) {
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState<RunView | null>(null);
  const key = useRef('');
  const notified = useRef<string | null>(null);

  const start = useMutation(async () => {
    const created = await api('createRun', {
      params,
      body: {
        intent,
        idempotency_key: key.current,
        params: {
          ...(weekOf ? { week_of: weekOf } : {}),
          ...(entryIds?.length ? { schedule_entry_ids: entryIds } : {}),
        },
      },
    });
    setRun(created);
  });

  // اگر اجرا هنوز تمام نشده باشد وضعیت آن پرسیده می‌شود؛ بستن پنجره اجرا را لغو نمی‌کند.
  useEffect(() => {
    if (!run || TERMINAL.has(run.status)) return;
    const timer = window.setTimeout(() => {
      api('getRun', { params: { ...params, run_id: run.id } })
        .then(setRun)
        .catch(() => undefined);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [run, params]);

  useEffect(() => {
    if (run && TERMINAL.has(run.status) && notified.current !== run.id) {
      notified.current = run.id;
      onFinished?.(run);
    }
  }, [run, onFinished]);

  const openDialog = useCallback(() => {
    key.current = newIdempotencyKey();
    setRun(null);
    start.reset();
    setOpen(true);
  }, [start]);

  const title = label ?? INTENT_LABEL[intent];
  return (
    <>
      <Button variant={variant} onClick={openDialog} disabledReason={disabledReason}>
        {title}
      </Button>
      <Dialog
        open={open}
        title={title}
        onClose={() => setOpen(false)}
        footer={
          run ? (
            <Button variant="primary" onClick={() => setOpen(false)}>
              بستن
            </Button>
          ) : (
            <>
              <Button onClick={() => setOpen(false)}>انصراف</Button>
              <Button variant="primary" pending={start.pending} onClick={() => void start.run()}>
                شروع
              </Button>
            </>
          )
        }
      >
        {run ? (
          <RunPanel run={run} />
        ) : (
          <>
            <p>{INTENT_SCOPE[intent]}</p>
            <dl className="kv small">
              <dt>اثر بیرونی</dt>
              <dd>ندارد؛ چیزی منتشر یا ارسال نمی‌شود.</dd>
              <dt>سقف هزینه</dt>
              <dd>صفر — حالت «فقط رایگان»</dd>
              {entryIds?.length ? (
                <>
                  <dt>محدوده</dt>
                  <dd>فقط آیتم انتخاب‌شده</dd>
                </>
              ) : null}
            </dl>
            <ErrorNote error={start.error} />
          </>
        )}
      </Dialog>
    </>
  );
}
