'use client';

import {
  CHANNEL_LABEL_FA,
  CONTENT_STATE_LABEL_FA,
  FORMAT_LABEL_FA,
  type ContentState,
} from '@studio/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { RunLauncher } from '@/components/runs.tsx';
import { Badge, ContentStateBadge, EmptyState, PageHeader, QueryView, SampleBadge } from '@/components/ui.tsx';
import { api } from '@/lib/api.ts';
import { useBrand } from '@/lib/brand.ts';
import { formatDateTime } from '@/lib/format.ts';
import { useQuery } from '@/lib/hooks.ts';

const FILTERS: readonly (ContentState | 'all')[] = ['all', 'needs_revision', 'ready_for_review'];
const QA_FA = { pass: 'بدون ایراد', pass_with_warnings: 'با هشدار', fail: 'ایراد دارد', not_run: 'بررسی نشده' } as const;

export default function StudioPage() {
  const { params, brandId, summary, calendar } = useBrand();
  const [filter, setFilter] = useState<ContentState | 'all'>('all');
  const content = useQuery(`content:${brandId}:${filter}`, () =>
    api('listContent', { params, query: filter === 'all' ? {} : { state: filter } }),
  );
  const timezone = summary?.timezone ?? 'Asia/Tehran';

  return (
    <>
      <PageHeader
        title="استودیو"
        description="هر محتوا نسخه‌های immutable دارد: ویرایش، نسخهٔ تازه با بازبینی خودکار دوباره می‌سازد و نسخهٔ قبلی دست‌نخورده می‌ماند."
        actions={
          <RunLauncher
            intent="generate_drafts"
            params={params}
            variant="primary"
            disabledReason={summary && !summary.readiness.draft_ready ? 'ابتدا اطلاعات ضروری برند را کامل کنید.' : undefined}
            onFinished={content.reload}
          />
        }
      />
      <div className="row" role="group" aria-label="فیلتر وضعیت">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            className={filter === item ? 'btn btn--small btn--primary' : 'btn btn--small'}
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
          >
            {item === 'all' ? 'همه' : CONTENT_STATE_LABEL_FA[item]}
          </button>
        ))}
      </div>
      <QueryView query={content}>
        {(data) =>
          data.items.length === 0 ? (
            <div className="card">
              <EmptyState title={filter === 'all' ? 'هنوز محتوایی ساخته نشده است' : 'محتوایی با این وضعیت نیست'}>
                {filter === 'all'
                  ? 'ابتدا برنامهٔ هفته را بسازید و سپس «تولید پیش‌نویس» را اجرا کنید.'
                  : 'فیلتر دیگری را انتخاب کنید.'}
              </EmptyState>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>عنوان</th>
                    <th>کانال و قالب</th>
                    <th>وضعیت</th>
                    <th>بازبینی خودکار</th>
                    <th>زمان برنامه</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link href={`/b/${brandId}/studio/${item.id}`}>{item.title_fa}</Link>{' '}
                        {item.is_sample ? <SampleBadge /> : null}
                      </td>
                      <td className="nowrap">
                        {CHANNEL_LABEL_FA[item.channel]} · {FORMAT_LABEL_FA[item.format]}
                      </td>
                      <td>
                        <ContentStateBadge state={item.state} />
                      </td>
                      <td>
                        <Badge tone={item.qa_status === 'fail' ? 'danger' : item.qa_status === 'pass' ? 'ok' : 'warn'}>
                          {QA_FA[item.qa_status]}
                        </Badge>
                      </td>
                      <td className="nowrap">
                        {item.scheduled_at_utc ? formatDateTime(item.scheduled_at_utc, calendar, timezone) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </QueryView>
    </>
  );
}
