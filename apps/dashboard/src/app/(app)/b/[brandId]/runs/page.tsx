'use client';

import { INTENT_LABEL, RunPanel } from '@/components/runs.tsx';
import { EmptyState, PageHeader, QueryView, RunStateBadge } from '@/components/ui.tsx';
import { api } from '@/lib/api.ts';
import { useBrand } from '@/lib/brand.ts';
import { formatDateTime } from '@/lib/format.ts';
import { useQuery } from '@/lib/hooks.ts';

export default function RunsPage() {
  const { params, brandId, summary, calendar } = useBrand();
  const runs = useQuery(`runs:${brandId}`, () => api('listRuns', { params }));
  const timezone = summary?.timezone ?? 'Asia/Tehran';

  return (
    <>
      <PageHeader
        title="اجراها"
        description="هر کلیک اجرا یک فرمان با کلید یکتایی است و وضعیت هر گام آن ثبت می‌شود. «منتظر …» شکست نیست."
      />
      <QueryView query={runs}>
        {(data) =>
          data.items.length === 0 ? (
            <div className="card">
              <EmptyState title="هنوز اجرایی ثبت نشده است">از «خانهٔ برند» برنامهٔ هفته را بسازید.</EmptyState>
            </div>
          ) : (
            <div className="stack stack--tight">
              {data.items.map((run) => (
                <details className="card card--flat" key={run.id}>
                  <summary className="row row--between" style={{ cursor: 'pointer' }}>
                    <span>
                      <strong>{INTENT_LABEL[run.intent]}</strong>
                      <span className="small muted"> · {formatDateTime(run.created_at, calendar, timezone)}</span>
                    </span>
                    <RunStateBadge state={run.status} />
                  </summary>
                  <div style={{ marginBlockStart: 12 }}>
                    <RunPanel run={run} />
                    <p className="small muted">
                      گردش‌کار <span className="ltr">{run.workflow.id}@{run.workflow.version}</span> · شناسه{' '}
                      <span className="ltr">{run.id.slice(0, 8)}</span>
                    </p>
                  </div>
                </details>
              ))}
            </div>
          )
        }
      </QueryView>
    </>
  );
}
