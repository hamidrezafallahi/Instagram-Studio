'use client';

import {
  BrandProfile,
  CHANNEL_LABEL_FA,
  Channel,
  FORMAT_LABEL_FA,
  WEEKDAYS_FROM_SATURDAY,
  WEEKDAY_LABEL_FA,
  type BrandDetail,
  type ContentFormat,
  type IndustryPack,
  type PackField,
} from '@studio/contracts';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Badge, Banner, Button, ErrorNote, Field, PageHeader, Skeleton, Tabs } from '@/components/ui.tsx';
import { ApiFailure, api } from '@/lib/api.ts';
import { useBrand } from '@/lib/brand.ts';
import { faNumber, formatDateTime } from '@/lib/format.ts';
import { useMutation, useQuery } from '@/lib/hooks.ts';

type Section = 'identity' | 'offers' | 'audience' | 'voice' | 'industry' | 'evidence' | 'cadence' | 'history';
type SaveState = 'saved' | 'dirty' | 'saving' | 'invalid' | 'error' | 'stale';

const OFFER_KIND_FA = { service: 'خدمت', product: 'کالا', course: 'دوره', other: 'سایر' } as const;
const EVIDENCE_KIND_FA = { url: 'نشانی اینترنتی', document: 'سند', owner_statement: 'اظهار مالک', catalog: 'کاتالوگ' } as const;
const TIMEZONES = ['Asia/Tehran', 'Asia/Dubai', 'Europe/Istanbul', 'Europe/Berlin', 'Europe/London', 'America/New_York', 'UTC'];
const newId = (prefix: string): string => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** ویرایشگر فهرست رشته‌ها؛ ردیف خالی هنگام ذخیره حذف می‌شود. */
function StringList({
  label,
  hint,
  values,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <div className="field">
      <span className="field__label">
        {label} <span className="field__opt">اختیاری</span>
      </span>
      {values.map((value, index) => (
        <div className="row" key={index} style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          {multiline ? (
            <textarea
              className="textarea grow"
              aria-label={`${label} ${faNumber(index + 1)}`}
              value={value}
              placeholder={placeholder}
              onChange={(event) => onChange(values.map((item, at) => (at === index ? event.target.value : item)))}
            />
          ) : (
            <input
              className="input grow"
              aria-label={`${label} ${faNumber(index + 1)}`}
              value={value}
              placeholder={placeholder}
              onChange={(event) => onChange(values.map((item, at) => (at === index ? event.target.value : item)))}
            />
          )}
          <Button small variant="ghost" aria-label="حذف این ردیف" onClick={() => onChange(values.filter((_, at) => at !== index))}>
            حذف
          </Button>
        </div>
      ))}
      <div>
        <Button small onClick={() => onChange([...values, ''])}>
          افزودن
        </Button>
      </div>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}

/**
 * متن JSON مستقل از ترتیب کلیدها. سرور سند را در jsonb نگه می‌دارد که ترتیب کلیدها را حفظ نمی‌کند؛
 * پس مقایسهٔ «ذخیره‌شده با فرم» باید به ترتیب کلیدها وابسته نباشد.
 */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

/** پیش از ذخیره: ردیف‌های خالی حذف و فاصله‌های اضافه پاک می‌شوند. */
function clean(profile: BrandProfile): BrandProfile {
  const strings = (list: string[]): string[] => list.map((item) => item.trim()).filter(Boolean);
  const optional = (value: string | undefined): string | undefined => (value?.trim() ? value.trim() : undefined);
  const packFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(profile.pack_fields)) {
    if (value.trim()) packFields[key] = value.trim();
  }
  const identity: BrandProfile['identity'] = { name: profile.identity.name.trim() };
  for (const key of ['tagline', 'description', 'website_url'] as const) {
    const value = optional(profile.identity[key]);
    if (value) identity[key] = value;
  }
  return {
    ...profile,
    identity,
    offers: profile.offers
      .filter((offer) => offer.title.trim())
      .map((offer) => {
        const { description, sku, ...rest } = offer;
        return {
          ...rest,
          title: offer.title.trim(),
          ...(optional(description) ? { description: optional(description) as string } : {}),
          ...(optional(sku) ? { sku: optional(sku) as string } : {}),
        };
      }),
    audience: { summary: profile.audience.summary.trim(), segments: strings(profile.audience.segments) },
    voice: {
      tone: profile.voice.tone.trim(),
      rules: strings(profile.voice.rules),
      sample_texts: strings(profile.voice.sample_texts),
    },
    forbidden_claims: strings(profile.forbidden_claims).filter((item) => item.length >= 2),
    evidence: profile.evidence
      .filter((item) => item.title.trim())
      .map((item) => {
        const { url, note, ...rest } = item;
        return {
          ...rest,
          title: item.title.trim(),
          ...(optional(url) ? { url: optional(url) as string } : {}),
          ...(optional(note) ? { note: optional(note) as string } : {}),
        };
      }),
    pack_fields: packFields,
  };
}

function PackFieldInput({ field, value, onChange }: { field: PackField; value: string; onChange: (value: string) => void }) {
  return (
    <Field
      label={field.label_fa}
      hint={field.help_fa}
      {...(field.required ? { required: true } : { optional: true })}
    >
      {(props) =>
        field.kind === 'text' || field.kind === 'url' ? (
          <input
            {...props}
            className={field.kind === 'url' ? 'input input--ltr' : 'input'}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <textarea {...props} className="textarea" value={value} onChange={(event) => onChange(event.target.value)} />
        )
      }
    </Field>
  );
}

export default function BrandProfilePage() {
  const { params, brandId, calendar, reloadBrands } = useBrand();
  const [detail, setDetail] = useState<BrandDetail | null>(null);
  const [draft, setDraft] = useState<BrandProfile | null>(null);
  const [loadError, setLoadError] = useState<ApiFailure | null>(null);
  const [section, setSection] = useState<Section>('identity');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<ApiFailure | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const revision = useRef(0);
  const savedJson = useRef('');
  const saving = useRef(false);
  const latest = useRef<BrandProfile | null>(null);
  const history = useQuery(section === 'history' ? `revisions:${brandId}:${detail?.brand.current_revision}` : null, () =>
    api('listBrandRevisions', { params }),
  );

  const adopt = useCallback((next: BrandDetail) => {
    revision.current = next.brand.current_revision;
    savedJson.current = stableJson(clean(next.profile));
    latest.current = next.profile;
    setDetail(next);
    setDraft(next.profile);
    setSaveState('saved');
    setSaveError(null);
    setInvalid(null);
  }, []);

  const load = useCallback(() => {
    setLoadError(null);
    api('getBrand', { params })
      .then(adopt)
      .catch((error: unknown) => setLoadError(error instanceof ApiFailure ? error : null));
    // params از شناسه‌های نشانی ساخته می‌شود و با تغییر برند عوض می‌شود.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, adopt]);

  useEffect(() => {
    setDetail(null);
    setDraft(null);
    load();
  }, [load]);

  /** ذخیرهٔ خودکار: هر ذخیره نسخهٔ تازه می‌سازد و با expected_revision از بازنویسی بی‌صدا جلوگیری می‌شود. */
  const save = useCallback(async () => {
    if (saving.current || !latest.current) return;
    const cleaned = clean(latest.current);
    const json = stableJson(cleaned);
    if (json === savedJson.current) {
      setSaveState('saved');
      return;
    }
    const checked = BrandProfile.safeParse(cleaned);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      setInvalid(issue ? `${issue.path.join(' › ')}: ${issue.message}` : 'ورودی نامعتبر است.');
      setSaveState('invalid');
      return;
    }
    saving.current = true;
    setSaveState('saving');
    setInvalid(null);
    try {
      const result = await api('updateBrandProfile', {
        params,
        body: { expected_revision: revision.current, profile: cleaned },
      });
      revision.current = result.brand.current_revision;
      savedJson.current = stableJson(clean(result.profile));
      setDetail(result);
      setSaveError(null);
      void reloadBrands();
      // اگر در فاصلهٔ ذخیره چیزی تایپ شده باشد، دوباره ذخیره می‌شود.
      const pending = latest.current ? stableJson(clean(latest.current)) : savedJson.current;
      setSaveState(pending === savedJson.current ? 'saved' : 'dirty');
    } catch (error) {
      const failure = error instanceof ApiFailure ? error : null;
      setSaveError(failure);
      setSaveState(failure?.code === 'STALE_REVISION' ? 'stale' : 'error');
    } finally {
      saving.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, reloadBrands]);

  useEffect(() => {
    if (saveState !== 'dirty') return;
    const timer = window.setTimeout(() => void save(), 1200);
    return () => window.clearTimeout(timer);
  }, [saveState, draft, save]);

  const update = useCallback((mutate: (profile: BrandProfile) => void) => {
    setDraft((previous) => {
      if (!previous) return previous;
      const next = structuredClone(previous);
      mutate(next);
      latest.current = next;
      return next;
    });
    setSaveState((state) => (state === 'stale' ? state : 'dirty'));
  }, []);

  const rollback = useMutation(async (target: number) => {
    adopt(await api('rollbackBrand', { params, body: { expected_revision: revision.current, target_revision: target } }));
    void reloadBrands();
    history.reload();
  });

  if (loadError) return <ErrorNote error={loadError} onRetry={load} />;
  if (!detail || !draft) return <Skeleton lines={8} />;

  const pack: IndustryPack = detail.pack;
  const readiness = detail.brand.readiness;
  const archived = detail.brand.status === 'archived';
  const pillarFormats = new Map(pack.content_pillars.map((pillar) => [pillar.id, pillar]));
  const missing = (label: string): boolean => readiness.missing_for_draft.includes(label);
  const tabs: { id: Section; label: string; badge?: ReactNode }[] = [
    { id: 'identity', label: 'هویت' },
    { id: 'offers', label: 'خدمات و کالاها', badge: missing('دست‌کم یک خدمت یا کالا') ? <Badge tone="warn">ضروری</Badge> : null },
    { id: 'audience', label: 'مخاطب', badge: missing('توصیف مخاطب') ? <Badge tone="warn">ضروری</Badge> : null },
    { id: 'voice', label: 'لحن' },
    {
      id: 'industry',
      label: 'اطلاعات صنعت',
      badge: readiness.missing_pack_fields.length > 0 ? <Badge>{faNumber(readiness.missing_pack_fields.length)} خالی</Badge> : null,
    },
    { id: 'evidence', label: 'منابع و ادعاها' },
    { id: 'cadence', label: 'کانال‌ها و الگوی هفته' },
    { id: 'history', label: 'نسخه‌ها' },
  ];

  const statusText: Record<SaveState, string> = {
    saved: `ذخیره شد · نسخهٔ ${faNumber(detail.brand.current_revision)}`,
    dirty: 'تغییر ذخیره‌نشده…',
    saving: 'در حال ذخیره…',
    invalid: 'ذخیره نشد: ورودی کامل نیست',
    error: 'ذخیره نشد',
    stale: 'نسخهٔ تازه‌تری وجود دارد',
  };

  return (
    <>
      <PageHeader
        title="راه‌اندازی برند"
        description="اطلاعات ضروری برای ساخت پیش‌نویس: نام برند، دست‌کم یک خدمت یا کالا، توصیف مخاطب و زبان. بقیه اختیاری است ولی پیش‌نویس‌ها را کامل‌تر می‌کند."
        actions={
          <span className="row" aria-live="polite">
            <Badge tone={saveState === 'saved' ? 'ok' : saveState === 'error' || saveState === 'stale' || saveState === 'invalid' ? 'danger' : 'info'}>
              {statusText[saveState]}
            </Badge>
          </span>
        }
      />

      {archived ? <Banner tone="warn">برند آرشیو شده است و تنظیمات آن ذخیره نمی‌شود.</Banner> : null}
      {saveState === 'stale' ? (
        <Banner tone="danger">
          <div className="stack stack--tight">
            <span>تنظیمات این برند در جای دیگری تغییر کرده است. برای جلوگیری از پاک‌شدن آن تغییر، ذخیره متوقف شد.</span>
            <div>
              <Button small onClick={load}>
                بارگذاری نسخهٔ تازه (تغییرهای ذخیره‌نشدهٔ این صفحه کنار گذاشته می‌شود)
              </Button>
            </div>
          </div>
        </Banner>
      ) : null}
      {saveState === 'invalid' && invalid ? <Banner tone="warn">هنوز ذخیره نشده است — {invalid}</Banner> : null}
      {saveState === 'error' ? <ErrorNote error={saveError} onRetry={() => void save()} /> : null}
      {!readiness.draft_ready ? (
        <Banner tone="warn">هنوز لازم است: {readiness.missing_for_draft.join('، ')}.</Banner>
      ) : (
        <Banner tone="ok">اطلاعات ضروری کامل است؛ می‌توانید از «خانهٔ برند» برنامهٔ هفته را بسازید.</Banner>
      )}

      <Tabs tabs={tabs} value={section} onChange={setSection} />

      {section === 'identity' ? (
        <div className="card stack" style={{ maxInlineSize: 720 }}>
          <Field label="نام برند" required>
            {(props) => (
              <input {...props} className="input" value={draft.identity.name} maxLength={120}
                onChange={(event) => update((profile) => { profile.identity.name = event.target.value; })} />
            )}
          </Field>
          <Field label="شعار کوتاه" optional>
            {(props) => (
              <input {...props} className="input" value={draft.identity.tagline ?? ''}
                onChange={(event) => update((profile) => { profile.identity.tagline = event.target.value; })} />
            )}
          </Field>
          <Field label="معرفی برند" optional hint="فقط واقعیت‌هایی که می‌توانید نشان دهید؛ ادعای ثابت‌نشده ننویسید.">
            {(props) => (
              <textarea {...props} className="textarea" value={draft.identity.description ?? ''}
                onChange={(event) => update((profile) => { profile.identity.description = event.target.value; })} />
            )}
          </Field>
          <Field label="نشانی سایت" optional hint="اتصال به سایت در مرحلهٔ بعدی ساخته می‌شود؛ این‌جا فقط ثبت می‌شود.">
            {(props) => (
              <input {...props} className="input input--ltr" inputMode="url" value={draft.identity.website_url ?? ''}
                onChange={(event) => update((profile) => { profile.identity.website_url = event.target.value; })} />
            )}
          </Field>
          <div className="grid grid--3">
            <Field label="منطقهٔ زمانی" required hint="زمان‌های تقویم به وقت همین منطقه نمایش داده می‌شود.">
              {(props) => (
                <>
                  <input {...props} className="input input--ltr" list="timezones" value={draft.timezone}
                    onChange={(event) => update((profile) => { profile.timezone = event.target.value; })} />
                  <datalist id="timezones">
                    {TIMEZONES.map((zone) => <option key={zone} value={zone} />)}
                  </datalist>
                </>
              )}
            </Field>
            <Field label="شروع هفته">
              {(props) => (
                <select {...props} className="select" value={draft.week_start}
                  onChange={(event) => update((profile) => { profile.week_start = event.target.value as BrandProfile['week_start']; })}>
                  {WEEKDAYS_FROM_SATURDAY.map((day) => <option key={day} value={day}>{WEEKDAY_LABEL_FA[day]}</option>)}
                </select>
              )}
            </Field>
            <Field label="زبان اصلی محتوا">
              {(props) => (
                <select {...props} className="select" value={draft.locale}
                  onChange={(event) => update((profile) => {
                    profile.locale = event.target.value;
                    if (!profile.content_locales.includes(event.target.value)) profile.content_locales = [event.target.value];
                  })}>
                  <option value="fa-IR">فارسی</option>
                  <option value="en">انگلیسی</option>
                  <option value="de">آلمانی</option>
                  <option value="fr">فرانسوی</option>
                  <option value="it">ایتالیایی</option>
                </select>
              )}
            </Field>
          </div>
        </div>
      ) : null}

      {section === 'offers' ? (
        <div className="stack">
          <p className="muted">دست‌کم یک خدمت، کالا یا دوره لازم است. قیمت و موجودی فقط با منبع و تاریخ بررسی ثبت می‌شود؛ بدون آن، پیش‌نویس به استعلام ارجاع می‌دهد.</p>
          {draft.offers.map((offer, index) => (
            <div className="card card--flat stack" key={offer.id}>
              <div className="grid grid--3">
                <Field label="عنوان" required>
                  {(props) => (
                    <input {...props} className="input" value={offer.title}
                      onChange={(event) => update((profile) => { (profile.offers[index] as typeof offer).title = event.target.value; })} />
                  )}
                </Field>
                <Field label="نوع">
                  {(props) => (
                    <select {...props} className="select" value={offer.kind}
                      onChange={(event) => update((profile) => { (profile.offers[index] as typeof offer).kind = event.target.value as typeof offer.kind; })}>
                      {Object.entries(OFFER_KIND_FA).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  )}
                </Field>
                <Field label="کد کالا (SKU)" optional>
                  {(props) => (
                    <input {...props} className="input input--ltr" value={offer.sku ?? ''}
                      onChange={(event) => update((profile) => { (profile.offers[index] as typeof offer).sku = event.target.value; })} />
                  )}
                </Field>
              </div>
              <Field label="توضیح" optional hint="همین متن در پیش‌نویس‌ها استفاده می‌شود.">
                {(props) => (
                  <textarea {...props} className="textarea" value={offer.description ?? ''}
                    onChange={(event) => update((profile) => { (profile.offers[index] as typeof offer).description = event.target.value; })} />
                )}
              </Field>
              <div className="row row--between">
                {offer.is_sample ? <Badge tone="sample">دادهٔ نمونه</Badge> : <span />}
                <Button small variant="ghost" onClick={() => update((profile) => { profile.offers.splice(index, 1); })}>
                  حذف این مورد
                </Button>
              </div>
            </div>
          ))}
          <div>
            <Button onClick={() => update((profile) => { profile.offers.push({ id: newId('o'), title: '', kind: 'service' }); })}>
              افزودن خدمت یا کالا
            </Button>
          </div>
        </div>
      ) : null}

      {section === 'audience' ? (
        <div className="card stack" style={{ maxInlineSize: 720 }}>
          <Field label="مخاطب شما کیست؟" required hint="یک یا دو جمله: چه کسانی، با چه نیازی.">
            {(props) => (
              <textarea {...props} className="textarea" value={draft.audience.summary}
                onChange={(event) => update((profile) => { profile.audience.summary = event.target.value; })} />
            )}
          </Field>
          <StringList label="گروه‌های مخاطب" values={draft.audience.segments} placeholder="مثلاً فروشگاه‌های تازه‌کار"
            onChange={(next) => update((profile) => { profile.audience.segments = next; })} />
        </div>
      ) : null}

      {section === 'voice' ? (
        <div className="card stack" style={{ maxInlineSize: 720 }}>
          <Field label="لحن" optional hint="مثلاً «ساده، محترمانه و بدون اغراق».">
            {(props) => (
              <input {...props} className="input" value={draft.voice.tone}
                onChange={(event) => update((profile) => { profile.voice.tone = event.target.value; })} />
            )}
          </Field>
          <StringList label="قواعد لحن" values={draft.voice.rules} placeholder="مثلاً جمله‌ها کوتاه باشند"
            onChange={(next) => update((profile) => { profile.voice.rules = next; })} />
          <StringList label="نمونه‌متن‌های خودتان" multiline values={draft.voice.sample_texts}
            hint="یک یا دو متن که خودتان نوشته‌اید و لحن برند را نشان می‌دهد."
            onChange={(next) => update((profile) => { profile.voice.sample_texts = next; })} />
        </div>
      ) : null}

      {section === 'industry' ? (
        <div className="stack">
          <Banner>
            <strong>{pack.name_fa}.</strong> {pack.disclaimer_fa}
          </Banner>
          <div className="card stack" style={{ maxInlineSize: 760 }}>
            <h2>اطلاعات لازم</h2>
            {pack.required_fields.map((field) => (
              <PackFieldInput key={field.key} field={field} value={draft.pack_fields[field.key] ?? ''}
                onChange={(value) => update((profile) => { profile.pack_fields[field.key] = value; })} />
            ))}
          </div>
          <div className="card stack" style={{ maxInlineSize: 760 }}>
            <h2>پرسش‌های پرتکرار</h2>
            {pack.faq_fields.map((field) => (
              <PackFieldInput key={field.key} field={field} value={draft.pack_fields[field.key] ?? ''}
                onChange={(value) => update((profile) => { profile.pack_fields[field.key] = value; })} />
            ))}
          </div>
        </div>
      ) : null}

      {section === 'evidence' ? (
        <div className="stack">
          <div className="card card--muted stack stack--tight">
            <h2>سیاست ادعا در این صنعت</h2>
            <p>{pack.claims_policy.summary_fa}</p>
            <ul className="bullets small">
              {pack.claims_policy.rules.map((rule) => (
                <li key={rule.id}>
                  {rule.label_fa} —{' '}
                  {rule.action === 'forbid' ? 'ممنوع' : rule.action === 'needs_evidence' ? 'فقط با مدرک' : 'ارجاع به مالک'}
                </li>
              ))}
            </ul>
          </div>
          <div className="card stack">
            <h2>منابع معتبر</h2>
            <p className="muted small">نمونه‌کار، کاتالوگ، رضایت‌نامه یا سندی که ادعاها را پشتیبانی می‌کند. ستون‌هایی مثل «نمونه‌کار» فقط وقتی در برنامه می‌آیند که منبعی ثبت شده باشد.</p>
            {draft.evidence.map((item, index) => (
              <div className="grid grid--3" key={item.id}>
                <Field label="عنوان منبع" required>
                  {(props) => (
                    <input {...props} className="input" value={item.title}
                      onChange={(event) => update((profile) => { (profile.evidence[index] as typeof item).title = event.target.value; })} />
                  )}
                </Field>
                <Field label="نوع">
                  {(props) => (
                    <select {...props} className="select" value={item.kind}
                      onChange={(event) => update((profile) => { (profile.evidence[index] as typeof item).kind = event.target.value as typeof item.kind; })}>
                      {Object.entries(EVIDENCE_KIND_FA).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  )}
                </Field>
                <Field label="نشانی" optional>
                  {(props) => (
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <input {...props} className="input input--ltr grow" value={item.url ?? ''}
                        onChange={(event) => update((profile) => { (profile.evidence[index] as typeof item).url = event.target.value; })} />
                      <Button small variant="ghost" onClick={() => update((profile) => { profile.evidence.splice(index, 1); })}>حذف</Button>
                    </div>
                  )}
                </Field>
              </div>
            ))}
            <div>
              <Button onClick={() => update((profile) => { profile.evidence.push({ id: newId('e'), title: '', kind: 'document' }); })}>
                افزودن منبع
              </Button>
            </div>
          </div>
          <div className="card stack" style={{ maxInlineSize: 720 }}>
            <StringList label="ادعاهای ممنوع این برند" values={draft.forbidden_claims} placeholder="مثلاً ارزان‌ترین"
              hint="هر متنی که این عبارت‌ها را داشته باشد در بازبینی خودکار رد می‌شود."
              onChange={(next) => update((profile) => { profile.forbidden_claims = next; })} />
          </div>
        </div>
      ) : null}

      {section === 'cadence' ? (
        <div className="stack">
          <div className="card stack">
            <h2>کانال‌ها</h2>
            <p className="muted small">خاموش‌کردن یک کانال فقط آیتم‌های همان کانال را از برنامه کنار می‌گذارد.</p>
            <div className="grid grid--3">
              {Channel.options.map((channel) => (
                <label className="check" key={channel}>
                  <input type="checkbox" checked={draft.channels[channel]?.enabled ?? false}
                    onChange={(event) => update((profile) => {
                      profile.channels[channel] = { ...(profile.channels[channel] ?? {}), enabled: event.target.checked };
                    })} />
                  {CHANNEL_LABEL_FA[channel]}
                </label>
              ))}
            </div>
          </div>
          <div className="card stack">
            <h2>الگوی هفته</h2>
            <p className="muted small">این الگو پیشنهادی است، نه الزام تعداد انتشار؛ متناسب با ظرفیت واقعی خودتان کم و زیاد کنید.</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>روز</th><th>ساعت</th><th>کانال</th><th>ستون محتوا</th><th>قالب</th><th /></tr>
                </thead>
                <tbody>
                  {draft.cadence.map((slot, index) => {
                    const formats = pillarFormats.get(slot.pillar)?.formats ?? [slot.format];
                    return (
                      <tr key={index}>
                        <td>
                          <select className="select" aria-label="روز" value={slot.weekday}
                            onChange={(event) => update((profile) => { (profile.cadence[index] as typeof slot).weekday = event.target.value as typeof slot.weekday; })}>
                            {WEEKDAYS_FROM_SATURDAY.map((day) => <option key={day} value={day}>{WEEKDAY_LABEL_FA[day]}</option>)}
                          </select>
                        </td>
                        <td>
                          <input className="input input--ltr" type="time" aria-label="ساعت" value={slot.time}
                            onChange={(event) => update((profile) => { (profile.cadence[index] as typeof slot).time = event.target.value; })} />
                        </td>
                        <td>
                          <select className="select" aria-label="کانال" value={slot.channel}
                            onChange={(event) => update((profile) => { (profile.cadence[index] as typeof slot).channel = event.target.value as typeof slot.channel; })}>
                            {Channel.options.map((channel) => <option key={channel} value={channel}>{CHANNEL_LABEL_FA[channel]}</option>)}
                          </select>
                        </td>
                        <td>
                          <select className="select" aria-label="ستون محتوا" value={slot.pillar}
                            onChange={(event) => update((profile) => {
                              const target = profile.cadence[index] as typeof slot;
                              target.pillar = event.target.value;
                              const allowed = pillarFormats.get(event.target.value)?.formats ?? [];
                              if (!allowed.includes(target.format)) target.format = allowed[0] as ContentFormat;
                            })}>
                            {pack.content_pillars.map((pillar) => (
                              <option key={pillar.id} value={pillar.id}>
                                {pillar.title_fa}{pillar.requires_evidence ? ' (نیازمند مدرک)' : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select className="select" aria-label="قالب" value={slot.format}
                            onChange={(event) => update((profile) => { (profile.cadence[index] as typeof slot).format = event.target.value as ContentFormat; })}>
                            {formats.map((format) => <option key={format} value={format}>{FORMAT_LABEL_FA[format]}</option>)}
                          </select>
                        </td>
                        <td>
                          <Button small variant="ghost" onClick={() => update((profile) => { profile.cadence.splice(index, 1); })}>حذف</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div>
              <Button onClick={() => update((profile) => {
                const pillar = pack.content_pillars[0];
                if (!pillar) return;
                profile.cadence.push({
                  weekday: 'saturday',
                  channel: pack.default_channels[0] ?? 'instagram',
                  format: pillar.formats[0] as ContentFormat,
                  pillar: pillar.id,
                  time: '19:00',
                });
              })}>
                افزودن ردیف
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {section === 'history' ? (
        <div className="card stack">
          <h2>نسخه‌های تنظیمات</h2>
          <p className="muted small">هر ذخیره یک نسخهٔ تازه می‌سازد. بازگشت، نسخهٔ قدیمی را پاک نمی‌کند؛ همان را به‌صورت نسخهٔ تازه ثبت می‌کند.</p>
          <ErrorNote error={rollback.error} />
          {history.error ? <ErrorNote error={history.error} onRetry={history.reload} /> : null}
          {history.data ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>نسخه</th><th>زمان</th><th>یادداشت</th><th /></tr></thead>
                <tbody>
                  {history.data.items.map((item) => (
                    <tr key={item.revision}>
                      <td className="num">{faNumber(item.revision)}</td>
                      <td>{formatDateTime(item.created_at, calendar, detail.brand.timezone)}</td>
                      <td>{item.note ?? '—'}</td>
                      <td>
                        {item.revision === detail.brand.current_revision ? (
                          <Badge tone="ok">جاری</Badge>
                        ) : (
                          <Button small pending={rollback.pending}
                            disabledReason={saveState !== 'saved' ? 'ابتدا صبر کنید تغییرهای جاری ذخیره شود.' : undefined}
                            onClick={() => void rollback.run(item.revision)}>
                            بازگشت به این نسخه
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : history.error ? null : <Skeleton />}
        </div>
      ) : null}
    </>
  );
}
