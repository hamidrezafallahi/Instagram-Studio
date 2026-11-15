'use client';

import { AUTHORITY_MODE_LABEL_FA, SPEND_MODE_LABEL_FA, type AuthorityMode } from '@studio/contracts';
import { useState } from 'react';
import { Badge, Banner, Button, Dialog, ErrorNote, PageHeader, QueryView } from '@/components/ui.tsx';
import { api } from '@/lib/api.ts';
import { useBrand } from '@/lib/brand.ts';
import { faNumber, formatDateTime } from '@/lib/format.ts';
import { useMutation, useQuery } from '@/lib/hooks.ts';

const MODES: readonly { mode: AuthorityMode; description: string; blocked?: string }[] = [
  { mode: 'draft_only', description: 'استودیو فقط برنامه و پیش‌نویس می‌سازد. هیچ‌چیز منتشر یا ارسال نمی‌شود.' },
  { mode: 'review_required', description: 'هر انتشار یا پاسخ فقط پس از تأیید شما روی همان نسخه انجام می‌شود.' },
  {
    mode: 'auto_scoped',
    description: 'انتشار خودکار فقط در محدوده‌ای که خودتان تعریف می‌کنید (کانال، نوع کار، بازهٔ زمانی، موضوع).',
    blocked: 'قواعد محدوده، تأییدها و اجرای کنترل‌شده در مرحلهٔ M2 ساخته می‌شود.',
  },
];

const OUTCOME_FA = { succeeded: 'انجام شد', denied: 'رد شد', failed: 'ناموفق' } as const;

export default function SettingsPage() {
  const { params, brandId, summary, calendar, reloadBrands } = useBrand();
  const policy = useQuery(`policy:${brandId}`, () => api('getPolicy', { params }));
  const brand = useQuery(`brand:${brandId}`, () => api('getBrand', { params }));
  const audit = useQuery(`audit:${brandId}`, () => api('listAuditEvents', { params, query: { limit: 50 } }));
  const [archiveOpen, setArchiveOpen] = useState(false);
  const timezone = summary?.timezone ?? 'Asia/Tehran';

  const change = useMutation(async (body: { mode?: AuthorityMode; paused?: boolean }) => {
    if (!policy.data) return;
    policy.setData(await api('updatePolicy', { params, body: { expected_revision: policy.data.revision, ...body } }));
    audit.reload();
  });
  const setStatus = useMutation(async (status: 'active' | 'archived') => {
    await api('setBrandStatus', { params, body: { status } });
    await reloadBrands();
    brand.reload();
    audit.reload();
    setArchiveOpen(false);
  });

  return (
    <>
      <PageHeader
        title="اختیار و تنظیمات"
        description="اختیار انتشار، پاسخ و هزینه برای هر برند جداست. تصمیم نهایی همیشه در سرور و بر پایهٔ همین تنظیمات گرفته می‌شود."
      />
      <ErrorNote error={change.error ?? setStatus.error} />

      <QueryView query={policy}>
        {(data) => (
          <div className="stack stack--loose">
            <section className="card stack">
              <div className="card__title">
                <h2>توقف فوری</h2>
                {data.authority.paused ? <Badge tone="warn">برند متوقف است</Badge> : <Badge tone="ok">در حال کار</Badge>}
              </div>
              <p>
                توقف، شروع هر کار تازه برای این برند را می‌بندد؛ برندهای دیگر ادامه می‌دهند. توقف، پیام یا پستی را که
                قبلاً ارسال شده برنمی‌گرداند.
              </p>
              <div>
                {data.authority.paused ? (
                  <Button variant="primary" pending={change.pending} onClick={() => void change.run({ paused: false })}>
                    ادامهٔ کار برند
                  </Button>
                ) : (
                  <Button variant="danger" pending={change.pending} onClick={() => void change.run({ paused: true })}>
                    توقف همهٔ کارهای این برند
                  </Button>
                )}
              </div>
            </section>

            <section className="card stack">
              <div className="card__title">
                <h2>حالت اختیار</h2>
                <span className="small muted">نسخهٔ سیاست: {faNumber(data.revision)}</span>
              </div>
              <div className="stack stack--tight" role="radiogroup" aria-label="حالت اختیار">
                {MODES.map((item) => (
                  <label key={item.mode} className="card card--flat row" style={{ alignItems: 'flex-start', cursor: item.blocked ? 'not-allowed' : 'pointer' }}>
                    <input
                      type="radio"
                      name="authority-mode"
                      style={{ marginBlockStart: 8 }}
                      checked={data.authority.mode === item.mode}
                      disabled={Boolean(item.blocked) || change.pending}
                      onChange={() => void change.run({ mode: item.mode })}
                    />
                    <span className="grow stack stack--tight">
                      <strong>{AUTHORITY_MODE_LABEL_FA[item.mode]}</strong>
                      <span>{item.description}</span>
                      {item.blocked ? <span className="small muted">هنوز در دسترس نیست: {item.blocked}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
              {data.authority.mode !== 'draft_only' ? (
                <Banner>
                  مسیر انتشار و تأیید در مرحلهٔ M2 ساخته می‌شود؛ تا آن زمان با هر حالتی فقط پیش‌نویس ساخته می‌شود و
                  چیزی منتشر نمی‌شود.
                </Banner>
              ) : null}
            </section>

            <section className="card stack stack--tight">
              <h2>هزینه</h2>
              <div className="row">
                <Badge tone="accent">{SPEND_MODE_LABEL_FA[data.authority.spend_mode]}</Badge>
              </div>
              <p>
                هیچ سرویس پولی بدون درخواست و تأیید شما استفاده نمی‌شود. تعیین سقف و درخواست شارژ در مرحلهٔ M2 اضافه
                می‌شود؛ اکنون هیچ مصرف هزینه‌داری وجود ندارد.
              </p>
            </section>
          </div>
        )}
      </QueryView>

      <QueryView query={brand} skeletonLines={3}>
        {(data) => (
          <section className="card stack">
            <h2>نگهداری داده و وضعیت برند</h2>
            <dl className="kv">
              <dt>متن پیام‌ها</dt>
              <dd>{faNumber(data.profile.retention.message_text_days)} روز</dd>
              <dt>دادهٔ خام سرویس‌ها</dt>
              <dd>{faNumber(data.profile.retention.raw_payload_days)} روز</dd>
              <dt>رد حسابرسی</dt>
              <dd>{faNumber(data.profile.retention.audit_days)} روز</dd>
            </dl>
            <p className="small muted">این مقدارها پیش‌فرض‌اند و پاک‌سازی خودکار در مرحلهٔ M8 اجرا می‌شود.</p>
            <div>
              {data.brand.status === 'archived' ? (
                <Button pending={setStatus.pending} onClick={() => void setStatus.run('active')}>
                  بازگرداندن برند از آرشیو
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setArchiveOpen(true)}>
                  آرشیو برند
                </Button>
              )}
            </div>
            <Dialog
              open={archiveOpen}
              title="آرشیو برند"
              onClose={() => setArchiveOpen(false)}
              footer={
                <>
                  <Button onClick={() => setArchiveOpen(false)}>انصراف</Button>
                  <Button variant="danger" pending={setStatus.pending} onClick={() => void setStatus.run('archived')}>
                    آرشیو
                  </Button>
                </>
              }
            >
              <p>
                «{data.brand.name}» آرشیو می‌شود: از نمای کل کنار می‌رود و کار تازه‌ای برای آن شروع نمی‌شود. داده‌ها
                پاک نمی‌شوند و برند قابل بازگرداندن است. برندهای دیگر تغییری نمی‌کنند.
              </p>
            </Dialog>
          </section>
        )}
      </QueryView>

      <section className="stack">
        <h2>رد حسابرسی</h2>
        <p className="muted small">چه کسی، چه کاری، با چه نتیجه‌ای. متن محتوا و راز در این فهرست ذخیره نمی‌شود.</p>
        <QueryView query={audit}>
          {(data) => (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>زمان</th>
                    <th>کار</th>
                    <th>نتیجه</th>
                    <th>پیگیری</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((event) => (
                    <tr key={event.id}>
                      <td className="nowrap">{formatDateTime(event.occurred_at, calendar, timezone)}</td>
                      <td className="ltr">{event.action}</td>
                      <td>
                        <Badge tone={event.outcome === 'succeeded' ? 'ok' : event.outcome === 'denied' ? 'warn' : 'danger'}>
                          {OUTCOME_FA[event.outcome]}
                        </Badge>
                      </td>
                      <td className="ltr small">{event.trace_id.slice(0, 8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryView>
      </section>
    </>
  );
}
