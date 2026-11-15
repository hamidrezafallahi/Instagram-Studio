'use client';

import { AUTHORITY_MODE_LABEL_FA, type BrandOverview } from '@studio/contracts';
import Link from 'next/link';
import { Badge, Banner, Button, EmptyState, ErrorNote, PageHeader, QueryView, SampleBadge } from '@/components/ui.tsx';
import { api } from '@/lib/api.ts';
import { faNumber, formatDateTime } from '@/lib/format.ts';
import { useMutation, useQuery } from '@/lib/hooks.ts';
import { useReadySession, useSession } from '@/lib/session.tsx';

function BrandCard({ item, calendar }: { item: BrandOverview; calendar: 'persian' | 'gregory' }) {
  const { brand, counts } = item;
  return (
    <article className="card stack">
      <div className="card__title">
        <h2>
          <Link href={`/b/${brand.id}`}>{brand.name}</Link>
        </h2>
        <div className="row">
          {brand.is_sample ? <SampleBadge /> : null}
          {item.paused ? <Badge tone="warn">متوقف</Badge> : null}
          <Badge>{AUTHORITY_MODE_LABEL_FA[item.authority_mode]}</Badge>
        </div>
      </div>
      {!brand.readiness.draft_ready ? (
        <Banner tone="warn">
          برای ساخت برنامه و پیش‌نویس هنوز لازم است: {brand.readiness.missing_for_draft.join('، ')}.{' '}
          <Link href={`/b/${brand.id}/profile`}>تکمیل اطلاعات</Link>
        </Banner>
      ) : null}
      <div className="grid grid--tiles">
        <div className="tile">
          <div className="tile__value">{faNumber(counts.entries_this_week)}</div>
          <div className="tile__label">آیتم این هفته</div>
        </div>
        <div className="tile">
          <div className="tile__value">{faNumber(counts.drafts_ready_for_review)}</div>
          <div className="tile__label">آمادهٔ بازبینی</div>
        </div>
        <div className="tile">
          <div className="tile__value">{faNumber(counts.drafts_needing_revision)}</div>
          <div className="tile__label">نیاز به اصلاح</div>
        </div>
        <div className="tile">
          <div className="tile__value">{faNumber(counts.connections_needing_attention)}</div>
          <div className="tile__label">اتصال نیازمند رسیدگی</div>
        </div>
      </div>
      <p className="small muted">
        {item.next_entry
          ? `کار بعدی: ${item.next_entry.topic_fa} — ${formatDateTime(item.next_entry.scheduled_at_utc, calendar, brand.timezone)}`
          : 'کار زمان‌بندی‌شده‌ای در پیش نیست.'}
      </p>
    </article>
  );
}

export default function OverviewPage() {
  const { workspaceId, setup } = useReadySession();
  const { calendar, reloadBrands } = useSession();
  const overview = useQuery(`overview:${workspaceId}`, () =>
    api('workspaceOverview', { params: { workspace_id: workspaceId } }),
  );
  const seed = useMutation(async () => {
    await api('seedSampleBrands', { params: { workspace_id: workspaceId } });
    await reloadBrands();
    overview.reload();
  });

  return (
    <>
      <PageHeader
        title="نمای کل برندها"
        description="خلاصهٔ هر برند جدا نشان داده می‌شود؛ داده، اتصال، تقویم و اختیار هر برند مستقل است."
        actions={
          <Link className="btn btn--primary" href="/brands/new">
            برند جدید
          </Link>
        }
      />
      <ErrorNote error={seed.error} />
      <QueryView query={overview}>
        {(data) =>
          data.brands.length === 0 ? (
            <div className="card">
              <EmptyState
                title="هنوز برندی ساخته نشده است"
                action={
                  <div className="row">
                    <Link className="btn btn--primary" href="/brands/new">
                      ساخت اولین برند
                    </Link>
                    {setup.sample_data ? (
                      <Button pending={seed.pending} onClick={() => void seed.run()}>
                        ساخت چهار برند نمونه
                      </Button>
                    ) : null}
                  </div>
                }
              >
                برای هر کسب‌وکار یک برند مستقل بسازید. برای دیدن روند کار بدون واردکردن اطلاعات، می‌توانید برندهای
                نمونه (با برچسب «نمونه») بسازید.
              </EmptyState>
            </div>
          ) : (
            <div className="stack">
              <div className="grid grid--2">
                {data.brands.map((item) => (
                  <BrandCard key={item.brand.id} item={item} calendar={calendar} />
                ))}
              </div>
              <div className="card card--muted stack stack--tight">
                <h2>هزینه</h2>
                <p>{data.spend.note_fa}</p>
                {setup.sample_data && !data.brands.some((item) => item.brand.is_sample) ? (
                  <div>
                    <Button small pending={seed.pending} onClick={() => void seed.run()}>
                      افزودن چهار برند نمونه
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          )
        }
      </QueryView>
    </>
  );
}
