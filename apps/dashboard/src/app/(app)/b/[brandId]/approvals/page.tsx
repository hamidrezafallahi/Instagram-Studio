'use client';

import {
  CHANNEL_LABEL_FA,
  FORMAT_LABEL_FA,
  FUNDING_STATE_LABEL_FA,
  MANUAL_TASK_STATE_LABEL_FA,
  type FundingRequestView,
  type IntentView,
  type ManualTaskView,
} from '@studio/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { IntentStateBadge } from '@/components/publishing.tsx';
import { Badge, Banner, Button, EmptyState, ErrorNote, Field, PageHeader, QueryView, SampleBadge, Toast } from '@/components/ui.tsx';
import { api, newIdempotencyKey } from '@/lib/api.ts';
import { useBrand } from '@/lib/brand.ts';
import { faNumber, formatDateTime } from '@/lib/format.ts';
import { useMutation, useQuery } from '@/lib/hooks.ts';

function IntentCard({ intent, onChanged }: { intent: IntentView; onChanged: (message: string) => void }) {
  const { params, brandId, summary, calendar } = useBrand();
  const timezone = summary?.timezone ?? 'Asia/Tehran';
  const [note, setNote] = useState('');
  const [retryKey] = useState(newIdempotencyKey);
  const target = { ...params, intent_id: intent.id };

  const decide = useMutation(async (decision: 'approved' | 'changes_requested') => {
    await api('decideApproval', {
      params: target,
      body: { decision, payload_hash: intent.payload_hash, ...(note.trim() ? { note: note.trim() } : {}) },
    });
    onChanged(decision === 'approved' ? 'تأیید ثبت شد و انتشار در صف قرار گرفت.' : 'درخواست اصلاح ثبت شد.');
  });
  const retry = useMutation(async () => {
    await api('retryIntent', { params: target, body: { idempotency_key: retryKey } });
    onChanged('تلاش دوباره ثبت شد.');
  });
  const cancel = useMutation(async () => {
    await api('cancelIntent', { params: target });
    onChanged('قصد انتشار لغو شد.');
  });
  const cancellable = ['awaiting_approval', 'awaiting_funds', 'authorized', 'reserved', 'manual_required'].includes(intent.state);

  return (
    <div className="card card--flat stack stack--tight">
      <div className="row row--between">
        <span>
          <strong>{CHANNEL_LABEL_FA[intent.channel]} · {FORMAT_LABEL_FA[intent.format]}</strong>{' '}
          <span className="small muted">
            · نسخهٔ {faNumber(intent.content_revision)} · {formatDateTime(intent.scheduled_at_utc, calendar, timezone)}
          </span>
        </span>
        <span className="row">
          {intent.is_sample ? <SampleBadge /> : null}
          <IntentStateBadge state={intent.state} />
        </span>
      </div>
      <p className="small">{intent.policy_reason_fa}</p>
      {intent.last_error ? <Banner tone="warn">{intent.last_error.message_fa}</Banner> : null}
      {intent.result?.external_url ? (
        <p className="small">
          نتیجه ({intent.result.verification === 'owner_reported' ? 'اعلام مالک' : intent.result.verification === 'reconciled' ? 'تأییدشده با بررسی وضعیت' : 'تأیید ارائه‌دهنده'}):{' '}
          <a className="ltr" href={intent.result.external_url} target="_blank" rel="noreferrer noopener">
            {intent.result.external_url}
          </a>
        </p>
      ) : null}
      <p className="small muted">
        <Link href={`/b/${brandId}/studio/${intent.content_id}`}>مشاهدهٔ متن</Link> · hash{' '}
        <span className="ltr">{intent.payload_hash.slice(0, 12)}</span> · تلاش‌ها {faNumber(intent.attempts)}
      </p>
      {intent.state === 'awaiting_approval' ? (
        <>
          <Field label="یادداشت بازبینی" optional>
            {(props) => <input {...props} className="input" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />}
          </Field>
          <ErrorNote error={decide.error} />
          <div className="row">
            <Button variant="primary" pending={decide.pending} onClick={() => void decide.run('approved')}>
              تأیید همین نسخه
            </Button>
            <Button pending={decide.pending} onClick={() => void decide.run('changes_requested')}>
              نیاز به اصلاح
            </Button>
          </div>
        </>
      ) : null}
      <ErrorNote error={retry.error ?? cancel.error} />
      <div className="row">
        {intent.state === 'failed' ? (
          <Button pending={retry.pending} onClick={() => void retry.run()}>
            تلاش دوباره
          </Button>
        ) : null}
        {intent.state === 'unknown' ? (
          <span className="small muted">نتیجه نامعلوم است؛ worker وضعیت را از ارائه‌دهنده می‌پرسد و ارسال کور انجام نمی‌دهد.</span>
        ) : null}
        {cancellable ? (
          <Button variant="ghost" pending={cancel.pending} onClick={() => void cancel.run()}>
            لغو
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ManualTaskCard({ task, onChanged }: { task: ManualTaskView; onChanged: (message: string) => void }) {
  const { params } = useBrand();
  const [url, setUrl] = useState('');
  const complete = useMutation(async () => {
    await api('completeManualTask', { params: { ...params, task_id: task.id }, body: { external_url: url.trim() } });
    onChanged('انتشار دستی ثبت شد (به اعلام مالک).');
  });
  const open = task.state === 'assigned' || task.state === 'prepared';
  return (
    <div className="card card--flat stack stack--tight">
      <div className="row row--between">
        <strong>
          {CHANNEL_LABEL_FA[task.package.channel]} · {FORMAT_LABEL_FA[task.package.format]}
        </strong>
        <span className="row">
          {task.package.is_sample ? <SampleBadge /> : null}
          <Badge tone={open ? 'warn' : 'ok'}>{MANUAL_TASK_STATE_LABEL_FA[task.state]}</Badge>
        </span>
      </div>
      <p className="small">{task.instructions_fa}</p>
      <details>
        <summary className="small">متن آمادهٔ انتشار</summary>
        <pre className="prewrap small" dir="auto">{task.package.text}</pre>
        <Button small onClick={() => void navigator.clipboard?.writeText(task.package.text)}>رونوشت متن</Button>
      </details>
      {open ? (
        <>
          <Field label="نشانی پست منتشرشده" hint="فقط https. نتیجه «اعلام مالک» ثبت می‌شود، نه اثبات ارائه‌دهنده.">
            {(props) => <input {...props} className="input ltr" value={url} onChange={(event) => setUrl(event.target.value)} />}
          </Field>
          <ErrorNote error={complete.error} />
          <Button
            variant="primary"
            pending={complete.pending}
            disabledReason={url.trim().startsWith('https://') ? undefined : 'نشانی https پست را وارد کنید.'}
            onClick={() => void complete.run()}
          >
            ثبت انتشار دستی
          </Button>
        </>
      ) : task.completed_url ? (
        <p className="small ltr">{task.completed_url}</p>
      ) : null}
    </div>
  );
}

function FundingCard({ request, onChanged }: { request: FundingRequestView; onChanged: (message: string) => void }) {
  const { params } = useBrand();
  const decide = useMutation(async (decision: 'approve' | 'decline') => {
    await api('decideFundingRequest', {
      params: { ...params, request_id: request.id },
      body: { expected_version: request.version, decision },
    });
    onChanged(decision === 'approve' ? 'تصمیم ثبت شد؛ پرداخت را خودتان در سامانهٔ ارائه‌دهنده انجام دهید.' : 'درخواست رد شد.');
  });
  return (
    <div className="card card--flat stack stack--tight">
      <div className="row row--between">
        <strong>{request.provider}</strong>
        <Badge tone={request.status === 'proposed' ? 'warn' : 'neutral'}>{FUNDING_STATE_LABEL_FA[request.status]}</Badge>
      </div>
      <p className="small">{request.purpose}</p>
      <p className="small muted">
        مبلغ: {request.amount.amount_minor === 0 ? 'نامعلوم (نیاز به استعلام)' : `${faNumber(request.amount.amount_minor)} ${request.amount.currency}`}
      </p>
      <ErrorNote error={decide.error} />
      {request.status === 'proposed' ? (
        <div className="row">
          <Button pending={decide.pending} onClick={() => void decide.run('approve')}>تأیید هزینه</Button>
          <Button variant="ghost" pending={decide.pending} onClick={() => void decide.run('decline')}>رد</Button>
        </div>
      ) : null}
    </div>
  );
}

export default function ApprovalsPage() {
  const { params, brandId, workspaceId } = useBrand();
  const intents = useQuery(`intents:${brandId}`, () => api('listIntents', { params }));
  const tasks = useQuery(`manual-tasks:${brandId}`, () => api('listManualTasks', { params }));
  const funding = useQuery(`funding:${brandId}`, () => api('listFundingRequests', { params }));
  const [toast, setToast] = useState<string | null>(null);
  const refresh = (message: string): void => {
    setToast(message);
    intents.reload();
    tasks.reload();
    funding.reload();
  };
  const tick = useMutation(async () => {
    const result = await api('runWorkerTick', { params: { workspace_id: workspaceId } });
    refresh(result.claimed === 0 ? 'کار سررسیده‌ای در صف نبود.' : `${faNumber(result.claimed)} کار اجرا شد.`);
  });

  return (
    <>
      <PageHeader
        title="تأییدها و صف انتشار"
        description="هر انتشار یک «قصد اجرا» با کلید یکتایی است. بدون تأیید معتبر همین نسخه، چیزی ارسال نمی‌شود."
        actions={
          <Button pending={tick.pending} onClick={() => void tick.run()}>
            اجرای صف اکنون
          </Button>
        }
      />
      <ErrorNote error={tick.error} />
      <section className="stack">
        <h2 className="h2">قصدهای انتشار</h2>
        <QueryView query={intents}>
          {(data) =>
            data.items.length === 0 ? (
              <div className="card">
                <EmptyState title="قصد انتشاری ثبت نشده است">از صفحهٔ هر محتوا در «استودیو» درخواست انتشار بدهید.</EmptyState>
              </div>
            ) : (
              <div className="stack stack--tight">
                {data.items.map((intent) => (
                  <IntentCard key={`${intent.id}:${intent.state}`} intent={intent} onChanged={refresh} />
                ))}
              </div>
            )
          }
        </QueryView>
      </section>
      <section className="stack">
        <h2 className="h2">کارهای دستی</h2>
        <QueryView query={tasks}>
          {(data) =>
            data.items.length === 0 ? (
              <p className="small muted">کار دستی‌ای نیست.</p>
            ) : (
              <div className="stack stack--tight">
                {data.items.map((task) => (
                  <ManualTaskCard key={`${task.id}:${task.state}`} task={task} onChanged={refresh} />
                ))}
              </div>
            )
          }
        </QueryView>
      </section>
      <section className="stack">
        <h2 className="h2">درخواست‌های شارژ و هزینه</h2>
        <Banner tone="info">استودیو هرگز خودش پرداخت نمی‌کند؛ فقط درخواست را برای تصمیم شما ثبت می‌کند.</Banner>
        <QueryView query={funding}>
          {(data) =>
            data.items.length === 0 ? (
              <p className="small muted">درخواستی نیست؛ همهٔ کارها رایگان انجام شده‌اند.</p>
            ) : (
              <div className="stack stack--tight">
                {data.items.map((request) => (
                  <FundingCard key={`${request.id}:${request.version}`} request={request} onChanged={refresh} />
                ))}
              </div>
            )
          }
        </QueryView>
      </section>
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
