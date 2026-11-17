'use client';

import type { AssetConsent, AssetView, ContentItemDetail, ContentRevisionView } from '@studio/contracts';
import { useRef, useState } from 'react';
import { Badge, Banner, Button, ErrorNote, Field } from '@/components/ui.tsx';
import { RunLauncher } from '@/components/runs.tsx';
import { ApiFailure, api, assetFileUrl, contentPackageUrl, uploadAsset } from '@/lib/api.ts';
import { useBrand } from '@/lib/brand.ts';
import { faNumber } from '@/lib/format.ts';
import { useMutation, useQuery } from '@/lib/hooks.ts';

const VISUAL = new Set(['carousel', 'post', 'story', 'reel']);
const EDITABLE = new Set(['ready_for_review', 'needs_revision', 'approved', 'scheduled', 'blocked']);
const PROVENANCE_FA = { owner_upload: 'فایل شما', rendered: 'رندر قالب', canva_import: 'Canva', sample: 'نمونه' } as const;
const ACCEPT = 'image/png,image/jpeg,image/webp,video/mp4';

function seconds(ms: number | null): string {
  return ms ? `${faNumber(Math.round(ms / 100) / 10)} ثانیه` : '';
}

/** یک دارایی: ویدئو قابل پخش، تصویر بندانگشتی، زیرنویس فقط لینک دانلود. */
function AssetCard({ asset, url, index }: { asset: AssetView; url: string; index: number }) {
  return (
    <figure className="asset">
      {asset.kind === 'video' ? (
        <video className="asset__media" src={url} controls preload="metadata" playsInline />
      ) : asset.kind === 'image' || asset.kind === 'logo' ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img className="asset__media" src={url} alt={asset.title_fa} loading="lazy"
            width={asset.width ?? undefined} height={asset.height ?? undefined} />
        </a>
      ) : (
        <div className="asset__file ltr">{asset.filename}</div>
      )}
      <figcaption className="small">
        <div className="row row--between">
          <span>{faNumber(index + 1)}. {asset.title_fa.split(' — ').pop()}</span>
          <Badge>{PROVENANCE_FA[asset.provenance]}</Badge>
        </div>
        <div className="muted">
          {[
            asset.width && asset.height ? <span key="size" className="ltr">{asset.width}×{asset.height}</span> : null,
            asset.duration_ms ? <span key="time">{seconds(asset.duration_ms)}</span> : null,
            <a key="download" href={url} download={asset.filename}>دانلود</a>,
          ]
            .filter(Boolean)
            .flatMap((part, index) => (index === 0 ? [part] : [' · ', part]))}
        </div>
      </figcaption>
    </figure>
  );
}

/**
 * تصویر، ویدئو و فایل‌های نسخهٔ جاری: ساخت تصویر با قالب برند، بارگذاری فایل خودتان،
 * جابه‌جایی و حذف، و دریافت بستهٔ انتشار دستی. هر تغییر دارایی نسخهٔ تازه است و تأیید قبلی را باطل می‌کند.
 */
export function AssetsPanel({ detail, onChanged }: { detail: ContentItemDetail; onChanged: (next: ContentItemDetail) => void }) {
  const { params } = useBrand();
  const current = detail.revisions[0] as ContentRevisionView;
  const ids = current.asset_ids;
  const editable = EDITABLE.has(detail.item.state);
  const visual = VISUAL.has(detail.item.format);
  const assets = useQuery(`assets:${detail.item.id}:${current.revision}`, () =>
    Promise.all(ids.map((id) => api('getAsset', { params: { ...params, asset_id: id } }))),
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const [license, setLicense] = useState('اثر خود مالک');
  const [consent, setConsent] = useState<AssetConsent>('not_applicable');

  const reload = async () => onChanged(await api('getContent', { params: { ...params, content_id: detail.item.id } }));

  const revise = useMutation(async (assetIds: string[], note: string) => {
    const next = await api('createContentRevision', {
      params: { ...params, content_id: detail.item.id },
      body: { expected_revision: detail.item.current_revision, text: current.text, asset_ids: assetIds, note },
    });
    onChanged(next);
  });

  const upload = useMutation(async (file: File) => {
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    const asset = await uploadAsset(params, {
      kind, filename: file.name, license: license.trim() || 'اثر خود مالک', consent, title_fa: file.name,
    }, file);
    if (ids.includes(asset.id)) {
      throw new ApiFailure({ code: 'CONFLICT', status: 409, message: 'این فایل همین حالا در محتوا هست.' });
    }
    await revise.run([...ids, asset.id], 'افزودن فایل مالک');
  });

  const move = (index: number, delta: number) => {
    const next = [...ids];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item as string);
    void revise.run(next, 'جابه‌جایی ترتیب تصویرها');
  };

  const list = assets.data ?? [];
  return (
    <div className="stack">
      {visual ? (
        <div className="row">
          <RunLauncher
            intent="render_visuals"
            params={params}
            contentIds={[detail.item.id]}
            label={detail.item.format === 'reel' ? 'ساخت ویدئو و کاور' : 'ساخت تصویر با قالب برند'}
            variant={ids.length === 0 ? 'primary' : 'default'}
            disabledReason={editable ? undefined : 'این محتوا در وضعیت فعلی قابل تغییر نیست.'}
            onFinished={() => void reload()}
          />
          <a className="btn" href={contentPackageUrl(params, detail.item.id)} download>
            دریافت بستهٔ انتشار دستی (ZIP)
          </a>
        </div>
      ) : (
        <div className="row">
          <a className="btn" href={contentPackageUrl(params, detail.item.id)} download>دریافت بستهٔ انتشار دستی (ZIP)</a>
        </div>
      )}
      <p className="small muted">
        بسته شامل فایل‌ها به ترتیب، متن کپشن و راهنماست و چیزی منتشر نمی‌کند. هر تغییر در تصویرها نسخهٔ تازه می‌سازد و تأیید قبلی را باطل می‌کند.
      </p>

      {ids.length === 0 ? (
        <Banner tone="info">
          {visual ? 'این نسخه هنوز تصویر یا ویدئو ندارد.' : 'این قالب محتوا تصویر قالبی ندارد؛ در صورت نیاز فایل خودتان را اضافه کنید.'}
        </Banner>
      ) : assets.error ? (
        <ErrorNote error={assets.error} onRetry={assets.reload} />
      ) : (
        <>
          <div className="asset-grid">
            {list.map((asset, index) => (
              <div key={asset.id} className="stack stack--tight">
                <AssetCard asset={asset} url={assetFileUrl(params, asset.id)} index={index} />
                {editable ? (
                  <div className="row">
                    <Button small disabledReason={index === 0 ? 'اولین فایل است.' : undefined} onClick={() => move(index, -1)}>↑ قبل</Button>
                    <Button small disabledReason={index === list.length - 1 ? 'آخرین فایل است.' : undefined} onClick={() => move(index, 1)}>بعد ↓</Button>
                    <Button small variant="ghost" onClick={() => void revise.run(ids.filter((id) => id !== asset.id), 'حذف یک فایل از محتوا')}>حذف</Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}

      {editable ? (
        <details>
          <summary>افزودن عکس یا ویدئوی خودتان</summary>
          <div className="stack stack--tight" style={{ marginBlockStart: 12 }}>
            <Field label="مجوز استفاده" hint="مثلاً «اثر خود مالک» یا «اسکرین‌شات پروژه با اجازهٔ مشتری». بدون مجوز روشن فایل را اضافه نکنید.">
              {(props) => <input {...props} className="input" value={license} maxLength={300} onChange={(event) => setLicense(event.target.value)} />}
            </Field>
            <Field label="چهره یا صدای شخص دیگر">
              {(props) => (
                <select {...props} className="select" value={consent} onChange={(event) => setConsent(event.target.value as AssetConsent)}>
                  <option value="not_applicable">ندارد</option>
                  <option value="obtained">دارد و رضایت گرفته‌ام</option>
                  <option value="missing">دارد ولی رضایت هنوز ندارم</option>
                </select>
              )}
            </Field>
            <input ref={fileInput} type="file" accept={ACCEPT} className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void upload.run(file);
              }} />
            <div className="row">
              <Button pending={upload.pending || revise.pending} onClick={() => fileInput.current?.click()}>انتخاب فایل…</Button>
              <span className="small muted">PNG، JPEG، WebP یا MP4؛ نوع واقعی فایل بررسی می‌شود.</span>
            </div>
          </div>
        </details>
      ) : null}
      <ErrorNote error={upload.error ?? revise.error} />
    </div>
  );
}
