'use client';

import { ACTION_STATE_LABEL_FA, type ActionState, type ContentItemDetail, type IntentView } from '@studio/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Banner, Button, ErrorNote, Field } from '@/components/ui.tsx';
import { api, newIdempotencyKey } from '@/lib/api.ts';
import { useBrand } from '@/lib/brand.ts';
import { useMutation, useQuery } from '@/lib/hooks.ts';

const STATE_TONE: Record<ActionState, 'neutral' | 'ok' | 'warn' | 'danger' | 'info'> = {
  proposed: 'neutral',
  authorized: 'info',
  reserved: 'info',
  executing: 'info',
  succeeded: 'ok',
  awaiting_approval: 'warn',
  denied: 'neutral',
  awaiting_funds: 'warn',
  failed: 'danger',
  unknown: 'warn',
  manual_required: 'warn',
};

export function IntentStateBadge({ state }: { state: ActionState }) {
  return <Badge tone={STATE_TONE[state]}>{ACTION_STATE_LABEL_FA[state]}</Badge>;
}

const PUBLISHABLE_STATES = new Set(['ready_for_review', 'approved', 'scheduled', 'failed']);

/**
 * درخواست انتشار یک محتوا. هر بار باز شدن پنل یک کلید یکتایی دارد؛ دوبار کلیک همان قصد را برمی‌گرداند.
 * تصمیم (تأیید لازم، مسیر دستی، رد سیاست) در سرور گرفته می‌شود و این‌جا فقط نمایش داده می‌شود.
 */
export function PublishPanel({ detail }: { detail: ContentItemDetail }) {
  const { params, brandId } = useBrand();
  const connections = useQuery(`connections:${brandId}`, () => api('listConnections', { params }));
  const intents = useQuery(`intents:${brandId}:${detail.item.id}`, () =>
    api('listIntents', { params, query: { content_id: detail.item.id } }),
  );
  const [connectionId, setConnectionId] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);
  const [created, setCreated] = useState<IntentView | null>(null);

  const usable = (connections.data?.items ?? []).filter((item) => item.status !== 'revoked');
  const selected = connectionId || usable[0]?.id || '';
  const publishable = PUBLISHABLE_STATES.has(detail.item.state) && detail.item.qa_status !== 'fail';

  const request = useMutation(async () => {
    const intent = await api('createPublishIntent', {
      params: { ...params, content_id: detail.item.id },
      body: { connection_id: selected, idempotency_key: key },
    });
    setCreated(intent);
    setKey(newIdempotencyKey());
    intents.reload();
  });

  const live = (intents.data?.items ?? []).filter((item) => !['denied', 'failed', 'succeeded'].includes(item.state));

  return (
    <div className="stack stack--tight">
      <h3 className="h3">انتشار</h3>
      {live.length > 0 ? (
        <Banner tone="info">
          این محتوا قصد انتشار فعال دارد: <IntentStateBadge state={live[0]?.state as ActionState} />{' '}
          <Link href={`/b/${brandId}/approvals`}>مشاهده در «تأییدها و صف»</Link>
        </Banner>
      ) : null}
      {usable.length > 0 ? (
        <Field label="اتصال مقصد" hint="هر انتشار دقیقاً یک مقصد دارد؛ برای مقصد دیگر درخواست جدا ثبت کنید.">
          {(props) => (
            <select {...props} className="input" value={selected} onChange={(event) => setConnectionId(event.target.value)}>
              {usable.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title_fa} — {item.label}
                  {item.is_sample ? ' (نمونه)' : ''}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
      <ErrorNote error={request.error} />
      {created ? (
        <Banner tone={created.state === 'manual_required' ? 'warn' : 'ok'}>
          قصد انتشار ثبت شد: <IntentStateBadge state={created.state} /> — {created.policy_reason_fa}
        </Banner>
      ) : null}
      <div className="row">
        <Button
          variant="primary"
          pending={request.pending}
          disabledReason={
            usable.length === 0
              ? 'اتصالی برای این برند نیست؛ ابتدا در «اتصال‌ها» اتصال بسازید.'
              : !publishable
                ? 'فقط محتوای آمادهٔ بازبینی با QA قابل قبول را می‌توان برای انتشار فرستاد.'
                : live.length > 0
                  ? 'برای این محتوا قصد انتشار فعال وجود دارد.'
                  : undefined
          }
          onClick={() => void request.run()}
        >
          درخواست انتشار
        </Button>
      </div>
      <p className="small muted">
        پس از ثبت، تأیید شما به hash همین نسخه بسته می‌شود؛ هر ویرایش بعدی تأیید را باطل می‌کند.
      </p>
    </div>
  );
}
