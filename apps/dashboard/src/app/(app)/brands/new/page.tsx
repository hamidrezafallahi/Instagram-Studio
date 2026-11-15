'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Badge, Button, ErrorNote, Field, PageHeader, QueryView } from '@/components/ui.tsx';
import { api } from '@/lib/api.ts';
import { useMutation, useQuery } from '@/lib/hooks.ts';
import { useReadySession, useSession } from '@/lib/session.tsx';

export default function NewBrandPage() {
  const router = useRouter();
  const { workspaceId } = useReadySession();
  const { reloadBrands } = useSession();
  const packs = useQuery('packs', () => api('listPacks'));
  const [packId, setPackId] = useState<string | null>(null);
  const [name, setName] = useState('');

  const create = useMutation(async () => {
    const created = await api('createBrand', {
      params: { workspace_id: workspaceId },
      body: { name: name.trim(), industry_pack_id: packId as string },
    });
    await reloadBrands();
    router.push(`/b/${created.brand.id}/profile`);
  });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (packId && name.trim()) void create.run();
  };

  return (
    <>
      <PageHeader
        title="برند جدید"
        description="برای هر کسب‌وکار یک فضای مستقل ساخته می‌شود. قالب صنعت فقط نقطهٔ شروع است و بعداً همه‌چیز قابل ویرایش است."
      />
      <form className="stack stack--loose" onSubmit={submit} noValidate>
        <section className="stack">
          <h2>۱. قالب صنعت</h2>
          <QueryView query={packs}>
            {(data) => (
              <div className="grid grid--2" role="radiogroup" aria-label="قالب صنعت">
                {data.items.map((pack) => (
                  <label
                    key={pack.id}
                    className="card card--flat stack stack--tight"
                    style={{ cursor: 'pointer', borderColor: packId === pack.id ? 'var(--accent)' : undefined }}
                  >
                    <span className="row row--between">
                      <span className="check">
                        <input
                          type="radio"
                          name="pack"
                          value={pack.id}
                          checked={packId === pack.id}
                          onChange={() => setPackId(pack.id)}
                        />
                        <strong>{pack.name_fa}</strong>
                      </span>
                      {pack.is_generic ? <Badge>بدون فرض صنعتی</Badge> : null}
                    </span>
                    <span>{pack.description_fa}</span>
                    <span className="small muted">{pack.disclaimer_fa}</span>
                  </label>
                ))}
              </div>
            )}
          </QueryView>
        </section>
        <section className="stack" style={{ maxInlineSize: 520 }}>
          <h2>۲. نام برند</h2>
          <Field label="نام برند" required hint="از نام برند به‌تنهایی دانش دقیق انتظار نداشته باشید؛ در گام بعد خدمات، مخاطب و منابع را وارد می‌کنید.">
            {(props) => <input {...props} className="input" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />}
          </Field>
          <ErrorNote error={create.error} />
          <div className="row">
            <Button
              type="submit"
              variant="primary"
              pending={create.pending}
              disabledReason={!packId ? 'ابتدا یک قالب صنعت انتخاب کنید.' : !name.trim() ? 'نام برند را وارد کنید.' : undefined}
            >
              ساخت برند و ادامه
            </Button>
          </div>
        </section>
      </form>
    </>
  );
}
