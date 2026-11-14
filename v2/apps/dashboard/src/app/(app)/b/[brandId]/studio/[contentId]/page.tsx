'use client';

import {
  CHANNEL_LABEL_FA,
  FORMAT_LABEL_FA,
  type ContentItemDetail,
  type ContentRevisionView,
} from '@studio/contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Banner,
  Button,
  ContentStateBadge,
  ErrorNote,
  Field,
  PageHeader,
  QueryView,
  SampleBadge,
  Tabs,
  Toast,
} from '@/components/ui.tsx';
import { api } from '@/lib/api.ts';
import { useBrand } from '@/lib/brand.ts';
import { faNumber, formatDateTime } from '@/lib/format.ts';
import { useMutation, useQuery } from '@/lib/hooks.ts';

type Panel = 'edit' | 'preview' | 'compare' | 'sources';
const EDITABLE = new Set(['ready_for_review', 'needs_revision', 'approved', 'scheduled', 'blocked']);
const GENERATOR_FA = { template: 'تولید قالبی محلی', model: 'مدل زبانی', human: 'ویرایش انسانی' } as const;
const CLAIM_FA = { supported: 'دارای مدرک', needs_verification: 'نیاز به بررسی', forbidden: 'ممنوع' } as const;

/** مقایسهٔ سادهٔ سطربه‌سطر دو نسخه (LCS)؛ برای متن‌های کوتاه محتوا کافی است. */
function diffLines(before: string, after: string): { kind: 'same' | 'add' | 'del'; text: string }[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      (table[i] as number[])[j] =
        a[i] === b[j] ? ((table[i + 1] as number[])[j + 1] as number) + 1 : Math.max((table[i + 1] as number[])[j] as number, (table[i] as number[])[j + 1] as number);
    }
  }
  const out: { kind: 'same' | 'add' | 'del'; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] as string });
      i += 1;
      j += 1;
    } else if (((table[i + 1] as number[])[j] as number) >= ((table[i] as number[])[j + 1] as number)) {
      out.push({ kind: 'del', text: a[i] as string });
      i += 1;
    } else {
      out.push({ kind: 'add', text: b[j] as string });
      j += 1;
    }
  }
  while (i < a.length) out.push({ kind: 'del', text: a[i++] as string });
  while (j < b.length) out.push({ kind: 'add', text: b[j++] as string });
  return out;
}

function QaList({ revision }: { revision: ContentRevisionView }) {
  const failed = revision.qa_result.checks.filter((check) => !check.passed);
  const passed = revision.qa_result.checks.filter((check) => check.passed);
  return (
    <div className="stack stack--tight">
      {failed.length === 0 ? <Banner tone="ok">بازبینی خودکار ایرادی پیدا نکرد. این نتیجه جایگزین تأیید شما نیست.</Banner> : null}
      <ul className="list">
        {failed.map((check) => (
          <li key={check.id} className="stack stack--tight">
            <div className="row">
              <Badge tone={check.severity === 'error' ? 'danger' : 'warn'}>{check.severity === 'error' ? 'باید اصلاح شود' : 'هشدار'}</Badge>
              <span>{check.message_fa}</span>
            </div>
            {check.excerpt ? <div className="small muted prewrap">«{check.excerpt}»</div> : null}
          </li>
        ))}
      </ul>
      {passed.length > 0 ? (
        <details>
          <summary className="small">بررسی‌های بدون ایراد ({faNumber(passed.length)})</summary>
          <ul className="bullets small muted">
            {passed.map((check) => (
              <li key={check.id}>{check.message_fa}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Editor({ detail, onSaved }: { detail: ContentItemDetail; onSaved: (next: ContentItemDetail) => void }) {
  const { params } = useBrand();
  const current = detail.revisions[0] as ContentRevisionView;
  const [text, setText] = useState(current.text);
  const [note, setNote] = useState('');
  const editable = EDITABLE.has(detail.item.state);
  const dirty = text.trim() !== current.text.trim();
  const markers = (text.match(/〔[^〕]*〕/g) ?? []).length;

  useEffect(() => {
    setText(current.text);
    setNote('');
  }, [current.text, current.revision]);

  const save = useMutation(async () => {
    const next = await api('createContentRevision', {
      params: { ...params, content_id: detail.item.id },
      body: { expected_revision: detail.item.current_revision, text, ...(note.trim() ? { note: note.trim() } : {}) },
    });
    onSaved(next);
  });

  return (
    <div className="stack">
      <Field
        label={`متن — نسخهٔ ${faNumber(current.revision)}`}
        hint={
          markers > 0
            ? `${faNumber(markers)} جای خالی با علامت 〔…〕 مانده است؛ آن را با اطلاعات واقعی جایگزین کنید.`
            : 'ذخیره، نسخهٔ تازه می‌سازد و بازبینی خودکار دوباره اجرا می‌شود.'
        }
      >
        {(props) => (
          <textarea {...props} className="textarea textarea--editor" dir="auto" value={text} readOnly={!editable}
            onChange={(event) => setText(event.target.value)} />
        )}
      </Field>
      {editable ? (
        <>
          <Field label="یادداشت این ویرایش" optional>
            {(props) => <input {...props} className="input" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />}
          </Field>
          <ErrorNote error={save.error} />
          <div className="row">
            <Button variant="primary" pending={save.pending} disabledReason={dirty ? undefined : 'متن تغییری نکرده است.'} onClick={() => void save.run()}>
              ذخیره به‌صورت نسخهٔ تازه
            </Button>
            {dirty ? <Button variant="ghost" onClick={() => setText(current.text)}>بازگرداندن متن</Button> : null}
            <Button disabledReason="تأیید وابسته به نسخه و زمان‌بندی انتشار در مرحلهٔ M2 ساخته می‌شود.">تأیید و زمان‌بندی</Button>
          </div>
        </>
      ) : (
        <Banner tone="warn">این محتوا در وضعیت فعلی قابل ویرایش نیست.</Banner>
      )}
    </div>
  );
}

export default function ContentDetailPage() {
  const { params, brandId, summary, calendar } = useBrand();
  const { contentId } = useParams<{ contentId: string }>();
  const content = useQuery(`content-item:${brandId}:${contentId}`, () =>
    api('getContent', { params: { ...params, content_id: contentId } }),
  );
  const [panel, setPanel] = useState<Panel>('edit');
  const [compareTo, setCompareTo] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timezone = summary?.timezone ?? 'Asia/Tehran';

  const detail = content.data;
  const current = detail?.revisions[0];
  const other = useMemo(() => {
    if (!detail || detail.revisions.length < 2) return null;
    return detail.revisions.find((revision) => revision.revision === compareTo) ?? detail.revisions[1] ?? null;
  }, [detail, compareTo]);

  return (
    <QueryView query={content} skeletonLines={8}>
      {(data) => {
        const revision = current as ContentRevisionView;
        return (
          <>
            <PageHeader
              title={data.item.title_fa}
              description={
                <>
                  <Link href={`/b/${brandId}/studio`}>استودیو</Link> · {CHANNEL_LABEL_FA[data.item.channel]} ·{' '}
                  {FORMAT_LABEL_FA[data.item.format]}
                  {data.item.scheduled_at_utc ? ` · برنامه: ${formatDateTime(data.item.scheduled_at_utc, calendar, timezone)}` : ''}
                </>
              }
              actions={
                <>
                  {data.item.is_sample ? <SampleBadge /> : null}
                  <ContentStateBadge state={data.item.state} />
                </>
              }
            />

            <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(280px, 1fr)', alignItems: 'start' }}>
              <section className="card">
                <Tabs
                  value={panel}
                  onChange={setPanel}
                  tabs={[
                    { id: 'edit', label: 'متن' },
                    { id: 'preview', label: 'پیش‌نمایش' },
                    { id: 'compare', label: 'مقایسهٔ نسخه‌ها', badge: <Badge>{faNumber(data.revisions.length)}</Badge> },
                    { id: 'sources', label: 'بریف و منابع' },
                  ]}
                />
                {panel === 'edit' ? (
                  <Editor
                    detail={data}
                    onSaved={(next) => {
                      content.setData(next);
                      setToast(
                        next.item.state === 'ready_for_review'
                          ? `نسخهٔ ${faNumber(next.item.current_revision)} ذخیره شد و آمادهٔ بازبینی است.`
                          : `نسخهٔ ${faNumber(next.item.current_revision)} ذخیره شد ولی هنوز ایراد دارد.`,
                      );
                    }}
                  />
                ) : null}
                {panel === 'preview' ? (
                  <div className="stack">
                    <p className="small muted">پیش‌نمایش سادهٔ متن؛ ظاهر نهایی در هر شبکه متفاوت است و رندر تصویر و ویدئو در مرحلهٔ M3 اضافه می‌شود.</p>
                    <div className="preview">
                      <div className="preview__screen" dir="auto">
                        {revision.text}
                      </div>
                    </div>
                  </div>
                ) : null}
                {panel === 'compare' ? (
                  other ? (
                    <div className="stack">
                      <label className="row">
                        <span className="small muted">مقایسهٔ نسخهٔ جاری ({faNumber(revision.revision)}) با</span>
                        <select className="select" style={{ inlineSize: 'auto' }} value={other.revision}
                          onChange={(event) => setCompareTo(Number(event.target.value))}>
                          {data.revisions.slice(1).map((item) => (
                            <option key={item.revision} value={item.revision}>
                              نسخهٔ {faNumber(item.revision)} — {GENERATOR_FA[item.generator.kind]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="diff" dir="auto">
                        {diffLines(other.text, revision.text).map((line, index) => (
                          <span key={index} className={`diff__${line.kind}`}>
                            {line.text || ' '}
                          </span>
                        ))}
                      </div>
                      <p className="small muted">سبز: افزوده در نسخهٔ جاری · قرمز: حذف‌شده از نسخهٔ قبلی</p>
                    </div>
                  ) : (
                    <p className="muted">این محتوا هنوز فقط یک نسخه دارد.</p>
                  )
                ) : null}
                {panel === 'sources' ? (
                  <div className="stack">
                    <dl className="kv">
                      <dt>هدف</dt>
                      <dd>{data.brief.goal}</dd>
                      <dt>مخاطب</dt>
                      <dd>{data.brief.audience || '—'}</dd>
                      <dt>دعوت به اقدام</dt>
                      <dd>{data.brief.cta || '—'}</dd>
                      <dt>ستون محتوا</dt>
                      <dd className="ltr">{data.brief.pillar}</dd>
                    </dl>
                    <h3>منابع این نسخه</h3>
                    {revision.source_refs.length === 0 ? (
                      <p className="muted">منبعی ثبت نشده است.</p>
                    ) : (
                      <ul className="bullets">
                        {revision.source_refs.map((ref) => (
                          <li key={ref.source_id}>{ref.label}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </section>

              <aside className="stack">
                <section className="card stack stack--tight">
                  <h2>بازبینی خودکار</h2>
                  <QaList revision={revision} />
                </section>
                {revision.claims.length > 0 ? (
                  <section className="card stack stack--tight">
                    <h2>ادعاهای شناسایی‌شده</h2>
                    <ul className="list">
                      {revision.claims.map((claim) => (
                        <li key={claim.id} className="stack stack--tight">
                          <Badge tone={claim.status === 'forbidden' ? 'danger' : claim.status === 'supported' ? 'ok' : 'warn'}>
                            {CLAIM_FA[claim.status]}
                          </Badge>
                          <span className="small prewrap">«{claim.text}»</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                <section className="card stack stack--tight">
                  <h2>نسخه‌ها</h2>
                  <ul className="list">
                    {data.revisions.map((item) => (
                      <li key={item.revision}>
                        <div className="row row--between">
                          <span>نسخهٔ {faNumber(item.revision)}</span>
                          <Badge>{GENERATOR_FA[item.generator.kind]}</Badge>
                        </div>
                        <div className="small muted">
                          {formatDateTime(item.created_at, calendar, timezone)}
                          {item.note ? ` · ${item.note}` : ''}
                        </div>
                        <div className="small muted">
                          هش: <span className="ltr">{item.hash.slice(0, 12)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              </aside>
            </div>
            <Toast message={toast} onDone={() => setToast(null)} />
          </>
        );
      }}
    </QueryView>
  );
}
