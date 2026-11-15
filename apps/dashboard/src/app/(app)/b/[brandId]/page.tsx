'use client';

import { AUTHORITY_MODE_LABEL_FA, CHANNEL_LABEL_FA, FORMAT_LABEL_FA } from '@studio/contracts';
import Link from 'next/link';
import { INTENT_LABEL, RunLauncher } from '@/components/runs.tsx';
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  PageHeader,
  QueryView,
  RunStateBadge,
  SampleBadge,
} from '@/components/ui.tsx';
import { api } from '@/lib/api.ts';
import { useBrand } from '@/lib/brand.ts';
import { faNumber, formatDateTime, todayIn } from '@/lib/format.ts';
import { useQuery } from '@/lib/hooks.ts';

export default function BrandHomePage() {
  const { params, brandId, calendar, reloadBrands, summary: known } = useBrand();
  // «این هفته» به وقت برند محاسبه می‌شود، نه ساعت دستگاه مالک.
  const today = todayIn(known?.timezone ?? 'Asia/Tehran');
  const brand = useQuery(`brand:${brandId}`, () => api('getBrand', { params }));
  const policy = useQuery(`policy:${brandId}`, () => api('getPolicy', { params }));
  const plans = useQuery(`plans-now:${brandId}:${today}`, () => api('listPlans', { params, query: { week_of: today } }));
  const content = useQuery(`content:${brandId}`, () => api('listContent', { params, query: {} }));
  const runs = useQuery(`runs:${brandId}`, () => api('listRuns', { params }));
  const connections = useQuery(`connections:${brandId}`, () => api('listConnections', { params }));

  const refresh = (): void => {
    plans.reload();
    content.reload();
    runs.reload();
    void reloadBrands();
  };

  return (
    <QueryView query={brand} skeletonLines={6}>
      {({ brand: summary, pack }) => {
        const ready = summary.readiness.draft_ready;
        const paused = policy.data?.authority.paused || summary.status !== 'active';
        const blocked = !ready
          ? 'ابتدا اطلاعات ضروری برند را کامل کنید.'
          : paused
            ? 'برند متوقف یا آرشیو است؛ از «اختیار و تنظیمات» آن را فعال کنید.'
            : undefined;
        const items = content.data?.items ?? [];
        const review = items.filter((item) => item.state === 'ready_for_review');
        const revise = items.filter((item) => item.state === 'needs_revision');
        const upcoming = (plans.data?.items[0]?.entries ?? []).filter(
          (entry) => entry.status !== 'skipped' && entry.status !== 'cancelled',
        );
        const broken = (connections.data?.items ?? []).filter(
          (item) => item.status === 'needs_access' || item.status === 'error',
        );

        return (
          <>
            <PageHeader
              title={summary.name}
              description={
                <>
                  قالب صنعت: {pack.name_fa} · منطقهٔ زمانی <span className="ltr">{summary.timezone}</span> · نسخهٔ
                  تنظیمات {faNumber(summary.current_revision)}
                </>
              }
              actions={
                <>
                  {summary.is_sample ? <SampleBadge /> : null}
                  {policy.data ? <Badge>{AUTHORITY_MODE_LABEL_FA[policy.data.authority.mode]}</Badge> : null}
                  {paused ? <Badge tone="warn">متوقف</Badge> : null}
                </>
              }
            />

            {!ready ? (
              <Banner tone="warn">
                برای ساخت برنامه و پیش‌نویس هنوز لازم است: <strong>{summary.readiness.missing_for_draft.join('، ')}</strong>.{' '}
                <Link href={`/b/${brandId}/profile`}>تکمیل اطلاعات برند</Link>
              </Banner>
            ) : summary.readiness.missing_pack_fields.length > 0 ? (
              <Banner>
                {faNumber(summary.readiness.missing_pack_fields.length)} فیلد از اطلاعات صنعت هنوز خالی است؛ پیش‌نویس‌های
                مرتبط جای خالی خواهند داشت. <Link href={`/b/${brandId}/profile`}>تکمیل</Link>
              </Banner>
            ) : null}

            <section className="card stack">
              <div className="card__title">
                <h2>اجرا</h2>
                <span className="small muted">هر اجرا پیش از شروع محدوده و سقف هزینه را نشان می‌دهد.</span>
              </div>
              <div className="row">
                <RunLauncher intent="build_weekly_plan" params={params} variant="primary" disabledReason={blocked} onFinished={refresh} />
                <RunLauncher intent="generate_drafts" params={params} disabledReason={blocked} onFinished={refresh} />
                <RunLauncher intent="collect_metrics" params={params} disabledReason={paused ? blocked : undefined} onFinished={refresh} />
                <Button disabledReason="اجرای انتشار و ارسال با تأیید وابسته به نسخه در مرحلهٔ M2 ساخته می‌شود. اکنون حالت «فقط پیش‌نویس» فعال است و چیزی منتشر نمی‌شود.">
                  اجرای موارد مجاز
                </Button>
              </div>
            </section>

            <div className="grid grid--tiles">
              <div className="tile">
                <div className="tile__value">{faNumber(upcoming.length)}</div>
                <div className="tile__label">آیتم برنامهٔ جاری</div>
              </div>
              <div className="tile">
                <div className="tile__value">{faNumber(review.length)}</div>
                <div className="tile__label">آمادهٔ بازبینی</div>
              </div>
              <div className="tile">
                <div className="tile__value">{faNumber(revise.length)}</div>
                <div className="tile__label">نیاز به اصلاح</div>
              </div>
              <div className="tile">
                <div className="tile__value">{faNumber(broken.length)}</div>
                <div className="tile__label">اتصال نیازمند رسیدگی</div>
              </div>
              <div className="tile">
                <div className="tile__value">{faNumber(0)}</div>
                <div className="tile__label">هزینهٔ دوره (فقط رایگان)</div>
              </div>
            </div>

            <div className="grid grid--2">
              <section className="card stack stack--tight">
                <div className="card__title">
                  <h2>کارهای منتظر شما</h2>
                  <Link className="small" href={`/b/${brandId}/studio`}>
                    همهٔ محتواها
                  </Link>
                </div>
                {review.length + revise.length === 0 ? (
                  <EmptyState title="کاری منتظر شما نیست">پس از تولید پیش‌نویس، موارد آمادهٔ بازبینی این‌جا می‌آیند.</EmptyState>
                ) : (
                  <ul className="list">
                    {[...revise, ...review].slice(0, 6).map((item) => (
                      <li key={item.id} className="row row--between">
                        <Link className="grow" href={`/b/${brandId}/studio/${item.id}`}>
                          {item.title_fa}
                        </Link>
                        <Badge tone={item.state === 'needs_revision' ? 'warn' : 'info'}>
                          {item.state === 'needs_revision' ? 'نیاز به اصلاح' : 'آمادهٔ بازبینی'}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card stack stack--tight">
                <div className="card__title">
                  <h2>کار بعدی در تقویم</h2>
                  <Link className="small" href={`/b/${brandId}/calendar`}>
                    تقویم
                  </Link>
                </div>
                {upcoming.length === 0 ? (
                  <EmptyState title="برنامه‌ای برای این هفته نیست">«ساخت برنامهٔ هفته» را اجرا کنید.</EmptyState>
                ) : (
                  <ul className="list">
                    {upcoming.slice(0, 5).map((entry) => (
                      <li key={entry.id}>
                        <div>{entry.topic_fa}</div>
                        <div className="small muted">
                          {formatDateTime(entry.scheduled_at_utc, calendar, summary.timezone)} ·{' '}
                          {CHANNEL_LABEL_FA[entry.channel]} · {FORMAT_LABEL_FA[entry.format]}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card stack stack--tight">
                <div className="card__title">
                  <h2>اجراهای اخیر</h2>
                  <Link className="small" href={`/b/${brandId}/runs`}>
                    همهٔ اجراها
                  </Link>
                </div>
                <QueryView query={runs} skeletonLines={3}>
                  {(data) =>
                    data.items.length === 0 ? (
                      <EmptyState title="هنوز اجرایی ثبت نشده است" />
                    ) : (
                      <ul className="list">
                        {data.items.slice(0, 5).map((run) => (
                          <li key={run.id} className="row row--between">
                            <span>
                              {INTENT_LABEL[run.intent]}
                              <span className="small muted"> · {formatDateTime(run.created_at, calendar, summary.timezone)}</span>
                            </span>
                            <RunStateBadge state={run.status} />
                          </li>
                        ))}
                      </ul>
                    )
                  }
                </QueryView>
              </section>

              <section className="card stack stack--tight">
                <div className="card__title">
                  <h2>اتصال‌ها</h2>
                  <Link className="small" href={`/b/${brandId}/connections`}>
                    مدیریت
                  </Link>
                </div>
                <QueryView query={connections} skeletonLines={2}>
                  {(data) =>
                    data.items.filter((item) => item.status !== 'revoked').length === 0 ? (
                      <EmptyState title="هیچ حسابی متصل نیست">
                        بدون اتصال هم برنامه و پیش‌نویس ساخته می‌شود؛ خروجی برای انتشار دستی آماده می‌ماند.
                      </EmptyState>
                    ) : (
                      <ul className="list">
                        {data.items
                          .filter((item) => item.status !== 'revoked')
                          .map((item) => (
                            <li key={item.id} className="row row--between">
                              <span>{item.label}</span>
                              {item.is_sample ? (
                                <SampleBadge />
                              ) : (
                                <Badge tone={item.status === 'active' ? 'ok' : 'warn'}>
                                  {item.status === 'active' ? 'آزموده' : 'نیاز به رسیدگی'}
                                </Badge>
                              )}
                            </li>
                          ))}
                      </ul>
                    )
                  }
                </QueryView>
              </section>
            </div>
          </>
        );
      }}
    </QueryView>
  );
}
