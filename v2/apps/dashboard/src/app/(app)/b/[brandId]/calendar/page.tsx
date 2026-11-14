'use client';

import {
  CHANNEL_LABEL_FA,
  FORMAT_LABEL_FA,
  WEEKDAY_LABEL_FA,
  type Channel,
  type Plan,
  type ScheduleEntry,
} from '@studio/contracts';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { RunLauncher } from '@/components/runs.tsx';
import {
  Badge,
  Banner,
  Button,
  Dialog,
  EmptyState,
  ErrorNote,
  Field,
  PageHeader,
  QueryView,
  SampleBadge,
} from '@/components/ui.tsx';
import { api } from '@/lib/api.ts';
import { useBrand } from '@/lib/brand.ts';
import { faDigits, faNumber, formatDay, formatWeekRange, shiftDay, todayIn, weekStartOf, weekdayOf } from '@/lib/format.ts';
import { useMutation, useQuery } from '@/lib/hooks.ts';

const STATUS_FA: Record<ScheduleEntry['status'], string> = {
  planned: 'برنامه‌ریزی‌شده',
  drafted: 'پیش‌نویس دارد',
  skipped: 'کنار گذاشته‌شده',
  cancelled: 'لغوشده',
};

function EditEntryDialog({
  entry,
  plan,
  onClose,
  onSaved,
}: {
  entry: ScheduleEntry;
  plan: Plan;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { params, calendar } = useBrand();
  const [topic, setTopic] = useState(entry.topic_fa);
  const [date, setDate] = useState(entry.local_date);
  const [time, setTime] = useState(entry.local_time);
  const [status, setStatus] = useState(entry.status);
  const days = Array.from({ length: 7 }, (_, index) => shiftDay(plan.week_start, index));
  const hasContent = entry.content_id !== null;

  const save = useMutation(async () => {
    await api('updateScheduleEntry', {
      params: { ...params, entry_id: entry.id },
      body: {
        expected_version: entry.version,
        ...(topic.trim() !== entry.topic_fa ? { topic_fa: topic.trim() } : {}),
        ...(date !== entry.local_date ? { local_date: date } : {}),
        ...(time !== entry.local_time ? { local_time: time } : {}),
        ...(status !== entry.status && status !== 'drafted' ? { status } : {}),
      },
    });
    onSaved();
  });

  return (
    <Dialog
      open
      title="ویرایش آیتم تقویم"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>انصراف</Button>
          <Button variant="primary" pending={save.pending} disabledReason={topic.trim() ? undefined : 'موضوع نباید خالی باشد.'} onClick={() => void save.run()}>
            ذخیره
          </Button>
        </>
      }
    >
      <Field label="موضوع" required>
        {(props) => <textarea {...props} className="textarea" value={topic} maxLength={300} onChange={(event) => setTopic(event.target.value)} />}
      </Field>
      <div className="grid grid--3">
        <Field label="روز" hint="فقط درون همین هفته">
          {(props) => (
            <select {...props} className="select" value={date} onChange={(event) => setDate(event.target.value)}>
              {days.map((day) => (
                <option key={day} value={day}>
                  {WEEKDAY_LABEL_FA[weekdayOf(day)]} {formatDay(day, calendar)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="ساعت" hint={`به وقت ${plan.timezone}`}>
          {(props) => <input {...props} className="input input--ltr" type="time" value={time} onChange={(event) => setTime(event.target.value)} />}
        </Field>
        <Field label="وضعیت" hint={hasContent ? 'این آیتم پیش‌نویس دارد و کنار گذاشته نمی‌شود.' : undefined}>
          {(props) => (
            <select {...props} className="select" value={status} disabled={hasContent}
              onChange={(event) => setStatus(event.target.value as ScheduleEntry['status'])}>
              {hasContent ? <option value="drafted">{STATUS_FA.drafted}</option> : null}
              <option value="planned">{STATUS_FA.planned}</option>
              <option value="skipped">{STATUS_FA.skipped}</option>
              <option value="cancelled">{STATUS_FA.cancelled}</option>
            </select>
          )}
        </Field>
      </div>
      <p className="small muted">
        {CHANNEL_LABEL_FA[entry.channel]} · {FORMAT_LABEL_FA[entry.format]} · ستون «{entry.pillar_title_fa}»
      </p>
      <ErrorNote error={save.error} />
    </Dialog>
  );
}

export default function CalendarPage() {
  const { params, brandId, summary, calendar } = useBrand();
  const timezone = summary?.timezone ?? 'Asia/Tehran';
  const today = todayIn(timezone);
  const [weekOf, setWeekOf] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel | 'all'>('all');
  const [editing, setEditing] = useState<ScheduleEntry | null>(null);
  const brand = useQuery(`brand:${brandId}`, () => api('getBrand', { params }));
  const target = weekOf ?? today;
  const plans = useQuery(`plans:${brandId}:${target}`, () => api('listPlans', { params, query: { week_of: target } }));

  const weekStart = brand.data ? weekStartOf(target, brand.data.profile.week_start) : null;
  const plan = plans.data?.items[0] ?? null;
  const days = useMemo(
    () => (weekStart ? Array.from({ length: 7 }, (_, index) => shiftDay(weekStart, index)) : []),
    [weekStart],
  );
  const channels = [...new Set((plan?.entries ?? []).map((entry) => entry.channel))];
  const visible = (plan?.entries ?? []).filter((entry) => channel === 'all' || entry.channel === channel);
  const blocked = brand.data && !brand.data.brand.readiness.draft_ready ? 'ابتدا اطلاعات ضروری برند را کامل کنید.' : undefined;
  const hasPlanned = (plan?.entries ?? []).some((entry) => entry.status === 'planned');

  return (
    <>
      <PageHeader
        title="تقویم"
        description={`زمان‌ها به وقت ${timezone} نمایش داده می‌شوند و در سرور به UTC ذخیره می‌شوند.`}
        actions={
          <>
            <Button small onClick={() => setWeekOf(shiftDay(target, -7))}>
              هفتهٔ قبل
            </Button>
            <Button small onClick={() => setWeekOf(null)} disabled={weekOf === null}>
              این هفته
            </Button>
            <Button small onClick={() => setWeekOf(shiftDay(target, 7))}>
              هفتهٔ بعد
            </Button>
          </>
        }
      />

      <div className="row row--between">
        <div className="row">
          <strong>{weekStart ? formatWeekRange(weekStart, shiftDay(weekStart, 6), calendar) : '…'}</strong>
          {plan ? <Badge>نسخهٔ {faNumber(plan.version)}</Badge> : null}
          {plan?.is_sample ? <SampleBadge /> : null}
        </div>
        <div className="row">
          {channels.length > 1 ? (
            <label className="row" style={{ gap: 6 }}>
              <span className="small muted">کانال</span>
              <select className="select" style={{ inlineSize: 'auto' }} value={channel}
                onChange={(event) => setChannel(event.target.value as Channel | 'all')}>
                <option value="all">همه</option>
                {channels.map((item) => (
                  <option key={item} value={item}>{CHANNEL_LABEL_FA[item]}</option>
                ))}
              </select>
            </label>
          ) : null}
          {plan && hasPlanned ? (
            <RunLauncher intent="generate_drafts" params={params} weekOf={target} disabledReason={blocked} onFinished={plans.reload} />
          ) : null}
          {!plan || !plan.entries.some((entry) => entry.content_id) ? (
            <RunLauncher
              intent="build_weekly_plan"
              params={params}
              weekOf={target}
              variant={plan ? 'default' : 'primary'}
              label={plan ? 'بازسازی برنامهٔ هفته' : 'ساخت برنامهٔ هفته'}
              disabledReason={blocked}
              onFinished={plans.reload}
            />
          ) : null}
        </div>
      </div>

      <QueryView query={plans} skeletonLines={6}>
        {() =>
          !plan ? (
            <div className="card">
              <EmptyState title="برای این هفته برنامه‌ای ساخته نشده است">
                «ساخت برنامهٔ هفته» از روی الگوی هفتگی و کانال‌های فعال برند، موضوع و زمان پیشنهاد می‌دهد. بعد از
                ساخت می‌توانید هر آیتم را ویرایش کنید.
              </EmptyState>
            </div>
          ) : (
            <div className="stack">
              {plan.notes_fa.length > 0 ? (
                <Banner>
                  <ul className="bullets">
                    {plan.notes_fa.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </Banner>
              ) : null}
              <div className="week" role="list" aria-label="روزهای هفته">
                {days.map((day) => {
                  const entries = visible
                    .filter((entry) => entry.local_date === day)
                    .sort((a, b) => a.local_time.localeCompare(b.local_time));
                  return (
                    <section key={day} role="listitem" className={day === today ? 'week__day week__day--today' : 'week__day'}>
                      <header className="week__head">
                        <strong>{WEEKDAY_LABEL_FA[weekdayOf(day)]}</strong>
                        <span className="small muted">{formatDay(day, calendar)}</span>
                      </header>
                      <div className="week__body">
                        {entries.length === 0 ? <span className="small muted">—</span> : null}
                        {entries.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            className={`entry entry--${entry.status}`}
                            onClick={() => setEditing(entry)}
                            aria-label={`ویرایش: ${entry.topic_fa}`}
                          >
                            <span className="row row--between">
                              <span className="small muted">{faDigits(entry.local_time)}</span>
                              <span className="small muted">
                                {CHANNEL_LABEL_FA[entry.channel]} · {FORMAT_LABEL_FA[entry.format]}
                              </span>
                            </span>
                            <span className="entry__topic">{entry.topic_fa}</span>
                            <span className="row">
                              <Badge tone={entry.status === 'drafted' ? 'info' : 'neutral'}>{STATUS_FA[entry.status]}</Badge>
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
              {visible.some((entry) => entry.content_id) ? (
                <div className="card card--muted">
                  <h3>پیش‌نویس‌های این هفته</h3>
                  <ul className="list">
                    {visible
                      .filter((entry) => entry.content_id)
                      .map((entry) => (
                        <li key={entry.id}>
                          <Link href={`/b/${brandId}/studio/${entry.content_id}`}>{entry.topic_fa}</Link>
                          <span className="small muted">
                            {' '}
                            · {WEEKDAY_LABEL_FA[entry.weekday]} {faDigits(entry.local_time)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )
        }
      </QueryView>

      {editing && plan ? (
        <EditEntryDialog
          key={`${editing.id}:${editing.version}`}
          entry={editing}
          plan={plan}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            plans.reload();
          }}
        />
      ) : null}
    </>
  );
}
