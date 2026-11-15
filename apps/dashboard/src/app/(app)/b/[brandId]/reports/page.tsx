'use client';

import { CHANNEL_LABEL_FA, SPEND_MODE_LABEL_FA, type MetricRow } from '@studio/contracts';
import { useState } from 'react';
import { RunLauncher } from '@/components/runs.tsx';
import { Badge, Banner, Button, PageHeader, QueryView, SampleBadge } from '@/components/ui.tsx';
import { api, reportExportUrl } from '@/lib/api.ts';
import { useBrand } from '@/lib/brand.ts';
import { faNumber, formatDateTime, formatWeekRange, metricValue, shiftDay, todayIn } from '@/lib/format.ts';
import { useQuery } from '@/lib/hooks.ts';

const QUALITY: Record<MetricRow['quality'], { label: string; tone: 'ok' | 'warn' | 'sample' | 'neutral' }> = {
  actual: { label: 'واقعی', tone: 'ok' },
  estimated: { label: 'برآوردی', tone: 'warn' },
  sample: { label: 'نمونه', tone: 'sample' },
  unavailable: { label: 'در دسترس نیست', tone: 'neutral' },
};

function MetricTable({ rows, timezone, calendar }: { rows: MetricRow[]; timezone: string; calendar: 'persian' | 'gregory' }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>سنجه</th>
            <th>کانال</th>
            <th>مقدار</th>
            <th>کیفیت داده</th>
            <th>منبع</th>
            <th>تازه‌شده در</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.channel ?? ''}:${row.metric}`}>
              <td>
                {row.label_fa}
                <div className="small muted">{row.definition_fa}</div>
              </td>
              <td>{row.channel ? CHANNEL_LABEL_FA[row.channel] : '—'}</td>
              <td className="num">{row.value === null ? <span className="muted">در دسترس نیست</span> : metricValue(row.value, row.unit)}</td>
              <td>
                <Badge tone={QUALITY[row.quality].tone}>{QUALITY[row.quality].label}</Badge>
              </td>
              <td className="small">{row.source === 'fake' ? 'کانکتور نمونه' : row.source}</td>
              <td className="small nowrap">{row.fetched_at ? formatDateTime(row.fetched_at, calendar, timezone) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportsPage() {
  const { params, brandId, summary, calendar } = useBrand();
  const timezone = summary?.timezone ?? 'Asia/Tehran';
  const [weekOf, setWeekOf] = useState<string | null>(null);
  const target = weekOf ?? todayIn(timezone);
  const report = useQuery(`report:${brandId}:${target}`, () => api('weeklyReport', { params, query: { week_of: target } }));

  return (
    <>
      <PageHeader
        title="گزارش هفتگی"
        description="شاخص اصلی سرنخ واجد شرایط، جلسه و قرارداد است؛ بازدید فقط شاخص میانی است. مقدار ناموجود «در دسترس نیست» نشان داده می‌شود، نه صفر."
        actions={
          <>
            <Button small onClick={() => setWeekOf(shiftDay(target, -7))}>
              هفتهٔ قبل
            </Button>
            <Button small disabled={weekOf === null} onClick={() => setWeekOf(null)}>
              این هفته
            </Button>
            <Button small onClick={() => setWeekOf(shiftDay(target, 7))}>
              هفتهٔ بعد
            </Button>
          </>
        }
      />
      <QueryView query={report} skeletonLines={8}>
        {(data) => (
          <div className="stack stack--loose">
            <div className="row row--between">
              <div className="row">
                <strong>{formatWeekRange(data.week_start, data.week_end, calendar)}</strong>
                {data.is_sample ? <SampleBadge /> : null}
                <span className="small muted">
                  {data.fresh_at ? `آخرین تازه‌سازی سنجه: ${formatDateTime(data.fresh_at, calendar, timezone)}` : 'سنجه‌ای جمع‌آوری نشده است'}
                </span>
              </div>
              <div className="row">
                <RunLauncher intent="collect_metrics" params={params} weekOf={target} onFinished={report.reload} />
                <a className="btn" href={reportExportUrl(params, { week_of: target, format: 'csv' })} download>
                  دانلود CSV
                </a>
                <a className="btn" href={reportExportUrl(params, { week_of: target, format: 'json' })} download>
                  دانلود JSON
                </a>
              </div>
            </div>

            {data.is_sample ? (
              <Banner tone="sample">
                <strong>گزارش نمونه.</strong> عددهای سنجه از کانکتور نمونه ساخته شده‌اند و عملکرد واقعی هیچ حسابی را
                نشان نمی‌دهند.
              </Banner>
            ) : null}

            <section className="stack">
              <h2>کار انجام‌شده</h2>
              <div className="grid grid--tiles">
                {(
                  [
                    ['آیتم برنامه', data.work.planned_entries],
                    ['پیش‌نویس ساخته‌شده', data.work.drafts_created],
                    ['آمادهٔ بازبینی', data.work.ready_for_review],
                    ['نیاز به اصلاح', data.work.needs_revision],
                    ['منتشرشده', data.work.published],
                    ['عقب‌مانده از موعد', data.work.overdue_entries],
                  ] as const
                ).map(([label, value]) => (
                  <div className="tile" key={label}>
                    <div className="tile__value">{faNumber(value)}</div>
                    <div className="tile__label">{label}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="stack">
              <h2>سنجه‌های شبکه‌ها</h2>
              {data.metrics.length === 0 ? (
                <Banner>سنجه‌ای برای این هفته وجود ندارد؛ دلیل در بخش «کمبود داده» آمده است.</Banner>
              ) : (
                <MetricTable rows={data.metrics} timezone={timezone} calendar={calendar} />
              )}
            </section>

            <section className="stack">
              <h2>شاخص‌های کسب‌وکار</h2>
              <MetricTable rows={data.business} timezone={timezone} calendar={calendar} />
            </section>

            <div className="grid grid--2">
              <section className="card stack stack--tight">
                <h2>هزینهٔ دوره</h2>
                <div className="row">
                  <Badge tone="accent">{SPEND_MODE_LABEL_FA[data.cost.spend_mode]}</Badge>
                  {data.cost.totals.length === 0 ? <strong>بدون هزینه</strong> : null}
                </div>
                {data.cost.totals.map((total) => (
                  <div key={total.currency}>
                    {faNumber(total.amount_minor)} <span className="ltr">{total.currency}</span>
                  </div>
                ))}
                <p className="small muted">{data.cost.note_fa}</p>
              </section>
              <section className="card stack stack--tight">
                <h2>پیشنهاد برای هفتهٔ بعد</h2>
                {data.suggestions_fa.length === 0 ? (
                  <p className="muted">پیشنهادی نیست.</p>
                ) : (
                  <ul className="bullets">
                    {data.suggestions_fa.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="card card--muted stack stack--tight">
              <h2>کمبود داده</h2>
              <ul className="bullets">
                {data.data_gaps_fa.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </QueryView>
    </>
  );
}
