'use client';

import type { ConnectionView, ProviderCatalogEntry } from '@studio/contracts';
import { useState, type FormEvent } from 'react';
import {
  Badge,
  Banner,
  Button,
  CapabilityBadge,
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
import { formatDateTime } from '@/lib/format.ts';
import { useMutation, useQuery } from '@/lib/hooks.ts';

const AUTH_FA: Record<string, string> = {
  none: 'بدون ورود',
  oauth2: 'ورود با حساب (OAuth)',
  bot_token: 'نشانهٔ ربات',
  application_password: 'رمز برنامه',
  api_key: 'کلید API',
  browser_session: 'نشست مرورگر',
  manual: 'دستی',
};

const SCENARIOS = [
  ['happy', 'سالم'],
  ['auth_expired', 'دسترسی منقضی‌شده'],
  ['quota_exhausted', 'سهمیهٔ تمام‌شده'],
  ['rate_limited', 'محدودیت نرخ'],
  ['unknown_outcome', 'نتیجهٔ نامعلوم'],
  ['provider_down', 'سرویس در دسترس نیست'],
] as const;

function ConnectionCard({
  connection,
  timezone,
  onChanged,
}: {
  connection: ConnectionView;
  timezone: string;
  onChanged: () => void;
}) {
  const { params, calendar } = useBrand();
  const path = { ...params, connection_id: connection.id };
  const test = useMutation(async () => {
    await api('testConnection', { params: path });
    onChanged();
  });
  const revoke = useMutation(async () => {
    await api('revokeConnection', { params: path });
    onChanged();
  });
  const [confirm, setConfirm] = useState(false);
  const revoked = connection.status === 'revoked';

  return (
    <article className="card stack">
      <div className="card__title">
        <h2>{connection.label}</h2>
        <div className="row">
          {connection.is_sample ? <SampleBadge /> : null}
          {revoked ? (
            <Badge>قطع‌شده</Badge>
          ) : connection.status === 'active' ? (
            // اتصال نمونه هرگز علامت سبز «متصل» نمی‌گیرد.
            connection.is_sample ? <Badge tone="sample">فعال در محیط نمونه</Badge> : <Badge tone="ok">آزموده روی حساب</Badge>
          ) : connection.status === 'needs_access' ? (
            <Badge tone="warn">نیاز به دسترسی</Badge>
          ) : (
            <Badge tone="danger">خطا</Badge>
          )}
        </div>
      </div>
      <dl className="kv small">
        <dt>سرویس</dt>
        <dd>{connection.title_fa}</dd>
        <dt>روش ورود</dt>
        <dd>{AUTH_FA[connection.auth_kind] ?? connection.auth_kind}</dd>
        <dt>راز ذخیره‌شده</dt>
        <dd>{connection.has_secret ? 'دارد (رمزگذاری‌شده؛ مقدار آن نمایش داده نمی‌شود)' : 'ندارد'}</dd>
        <dt>آخرین آزمون</dt>
        <dd>
          {connection.health
            ? `${formatDateTime(connection.health.checked_at, calendar, timezone)} — ${connection.health.ok ? 'موفق' : `ناموفق (${connection.health.error_code ?? connection.health.status})`}`
            : 'انجام نشده'}
        </dd>
      </dl>
      {!revoked ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>قابلیت</th>
                  <th>وضعیت</th>
                  <th>دلیل</th>
                </tr>
              </thead>
              <tbody>
                {connection.capabilities.map((capability) => (
                  <tr key={capability.action}>
                    <td className="ltr">{capability.action}</td>
                    <td>
                      <CapabilityBadge status={capability.status} sample={connection.is_sample} />
                    </td>
                    <td className="ltr small">{capability.reason_code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ErrorNote error={test.error ?? revoke.error} />
          <div className="row">
            <Button small pending={test.pending} onClick={() => void test.run()}>
              آزمون دوباره
            </Button>
            <Button small variant="ghost" onClick={() => setConfirm(true)}>
              قطع اتصال
            </Button>
          </div>
        </>
      ) : null}
      <Dialog
        open={confirm}
        title="قطع اتصال"
        onClose={() => setConfirm(false)}
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>انصراف</Button>
            <Button
              variant="danger"
              pending={revoke.pending}
              onClick={() => void revoke.run().then(() => setConfirm(false))}
            >
              قطع و حذف راز
            </Button>
          </>
        }
      >
        <p>
          اتصال «{connection.label}» قطع و راز ذخیره‌شدهٔ آن نابود می‌شود. فقط همین اتصال متوقف می‌شود؛ برندها و
          اتصال‌های دیگر ادامه می‌دهند. این کار برگشت‌پذیر نیست و برای استفادهٔ دوباره باید اتصال تازه بسازید.
        </p>
      </Dialog>
    </article>
  );
}

const isInternal = (entry: ProviderCatalogEntry): boolean =>
  !entry.manifest.is_sample && entry.register.length > 0 && entry.register.every((row) => row.route === 'internal');

function ProviderRow({ entry, onAdd }: { entry: ProviderCatalogEntry; onAdd: () => void }) {
  const { manifest } = entry;
  const internal = isInternal(entry);
  return (
    <details className="card card--flat">
      <summary className="row row--between" style={{ cursor: 'pointer' }}>
        <span className="row">
          <strong>{manifest.title_fa}</strong>
          {manifest.is_sample ? <SampleBadge /> : null}
          {internal ? null : <span className="small muted">{AUTH_FA[manifest.auth_kind] ?? manifest.auth_kind}</span>}
        </span>
        {entry.connectable ? (
          <Badge tone="accent">قابل افزودن</Badge>
        ) : internal ? (
          <Badge>بدون نیاز به اتصال</Badge>
        ) : (
          <Badge>در این نسخه قابل اتصال نیست</Badge>
        )}
      </summary>
      <div className="stack" style={{ marginBlockStart: 12 }}>
        {entry.connectable ? (
          <div>
            <Button variant="primary" onClick={onAdd}>
              افزودن اتصال
            </Button>
          </div>
        ) : (
          <Banner tone={internal ? 'info' : 'warn'}>{entry.blocked_reason_fa}</Banner>
        )}
        {entry.register.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>قابلیت</th>
                  <th>مسیر</th>
                  <th>وضعیت</th>
                  <th>جایگزین</th>
                  <th>عدم قطعیت</th>
                </tr>
              </thead>
              <tbody>
                {entry.register.map((row) => (
                  <tr key={`${row.route}:${row.action}`}>
                    <td>{row.title_fa}</td>
                    <td className="ltr small">{row.route}</td>
                    <td>
                      <CapabilityBadge status={row.status} sample={manifest.is_sample} internal={row.route === 'internal'} />
                    </td>
                    <td className="small">{row.fallback_fa}</td>
                    <td className="small muted">{row.uncertainty_fa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </details>
  );
}

export default function ConnectionsPage() {
  const { params, brandId, summary, sampleDataEnabled } = useBrand();
  const connections = useQuery(`connections:${brandId}`, () => api('listConnections', { params }));
  const providers = useQuery('providers', () => api('listProviders'));
  const [adding, setAdding] = useState<ProviderCatalogEntry | null>(null);
  const [form, setForm] = useState({ label: '', scenario: 'happy', secret: '' });

  const create = useMutation(async () => {
    if (!adding) return;
    await api('createConnection', {
      params,
      body: {
        provider: adding.manifest.provider_id,
        ...(form.label.trim() ? { label: form.label.trim() } : {}),
        config: { scenario: form.scenario, channel: 'instagram' },
        ...(form.secret ? { secret: form.secret } : {}),
      },
    });
    // راز پس از ارسال از حافظهٔ صفحه پاک می‌شود و دیگر قابل دیدن نیست.
    setForm({ label: '', scenario: 'happy', secret: '' });
    setAdding(null);
    connections.reload();
  });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    void create.run();
  };
  const timezone = summary?.timezone ?? 'Asia/Tehran';

  return (
    <>
      <PageHeader
        title="اتصال‌ها"
        description="قابلیت هر حساب جدا و فقط پس از آزمون واقعی «آزموده» می‌شود. وجود یک اتصال به معنی امکان همهٔ عملیات آن سرویس نیست."
      />
      <section className="stack">
        <h2>اتصال‌های این برند</h2>
        <QueryView query={connections}>
          {(data) =>
            data.items.length === 0 ? (
              <div className="card">
                <EmptyState title="هیچ حسابی متصل نیست">
                  بدون اتصال هم برنامه و پیش‌نویس ساخته می‌شود و خروجی برای انتشار دستی آماده می‌ماند.
                </EmptyState>
              </div>
            ) : (
              <div className="grid grid--2">
                {data.items.map((connection) => (
                  <ConnectionCard key={connection.id} connection={connection} timezone={timezone} onChanged={connections.reload} />
                ))}
              </div>
            )
          }
        </QueryView>
      </section>

      <section className="stack">
        <h2>سرویس‌ها و وضعیت واقعی هر قابلیت</h2>
        <p className="muted">
          هیچ سرویس بیرونی هنوز روی حساب شما آزموده نشده است؛ پس هیچ‌کدام علامت «آزموده روی حساب» ندارند. برای هر
          قابلیت، مسیر جایگزین دستی و آنچه هنوز نامعلوم است نوشته شده است.
        </p>
        <QueryView query={providers}>
          {(data) => {
            const shown = data.items.filter((entry) => !entry.manifest.is_sample || sampleDataEnabled);
            const row = (entry: ProviderCatalogEntry) => (
              <ProviderRow
                key={entry.manifest.provider_id}
                entry={entry}
                onAdd={() => {
                  create.reset();
                  setAdding(entry);
                }}
              />
            );
            return (
              <div className="stack">
                <div className="stack stack--tight">{shown.filter((entry) => !isInternal(entry)).map(row)}</div>
                <h3>قابلیت‌های داخلی استودیو</h3>
                <p className="muted small">این بخش‌ها حساب بیرونی نمی‌خواهند؛ وضعیت ساخت و آزمون هر کدام نوشته شده است.</p>
                <div className="stack stack--tight">{shown.filter(isInternal).map(row)}</div>
              </div>
            );
          }}
        </QueryView>
      </section>

      <Dialog
        open={adding !== null}
        title={`افزودن ${adding?.manifest.title_fa ?? 'اتصال'}`}
        onClose={() => setAdding(null)}
        footer={
          <>
            <Button onClick={() => setAdding(null)}>انصراف</Button>
            <Button variant="primary" pending={create.pending} onClick={() => void create.run()}>
              افزودن و آزمون
            </Button>
          </>
        }
      >
        <form className="stack" onSubmit={submit}>
          {adding?.manifest.is_sample ? (
            <Banner tone="sample">
              این اتصال ساختگی است و به هیچ سرویس بیرونی وصل نمی‌شود. برای دیدن رفتار استودیو در خطاها می‌توانید
              سناریوی دیگری انتخاب کنید.
            </Banner>
          ) : null}
          <Field label="نام نمایشی" optional>
            {(props) => (
              <input {...props} className="input" value={form.label} maxLength={120}
                onChange={(event) => setForm((previous) => ({ ...previous, label: event.target.value }))} />
            )}
          </Field>
          {adding?.manifest.is_sample ? (
            <Field label="سناریو">
              {(props) => (
                <select {...props} className="select" value={form.scenario}
                  onChange={(event) => setForm((previous) => ({ ...previous, scenario: event.target.value }))}>
                  {SCENARIOS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              )}
            </Field>
          ) : null}
          <Field
            label="راز اتصال"
            optional
            hint="فقط از همین فرم گرفته می‌شود، بلافاصله رمزگذاری می‌شود و پس از ذخیره دیگر نمایش داده نمی‌شود. راز را در گفتگو یا فایل‌های پروژه ننویسید."
          >
            {(props) => (
              <input {...props} className="input input--ltr" type="password" autoComplete="off" value={form.secret}
                onChange={(event) => setForm((previous) => ({ ...previous, secret: event.target.value }))} />
            )}
          </Field>
          <ErrorNote error={create.error} />
        </form>
      </Dialog>
    </>
  );
}
