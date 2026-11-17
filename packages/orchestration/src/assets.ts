import {
  CHANNEL_LABEL_FA,
  CONTENT_STATE_LABEL_FA,
  FORMAT_LABEL_FA,
  StudioError,
  type AssetKind,
  type AssetView,
  type UploadAssetQuery,
} from '@studio/contracts';
import { assetRepo, contentRepo } from '@studio/data';
import {
  MAX_BYTES,
  MAX_IMAGE_SIDE,
  buildZip,
  isVisualFormat,
  parseVisual,
  type ZipEntry,
  probeMedia,
  sniffMedia,
  videoToolsAvailable,
  type MediaFamily,
  type VideoProbe,
} from '@studio/media';
import type { BrandService } from './brands.ts';
import { audit, notFound, type BrandCall, type StudioDeps } from './context.ts';

/** خانوادهٔ فایل مجاز برای هر نوع دارایی. */
const FAMILY_OF: Record<Exclude<AssetKind, 'subtitle'>, MediaFamily> = {
  image: 'image',
  logo: 'image',
  video: 'video',
  audio: 'audio',
  font: 'font',
};

const invalid = (message_fa: string): StudioError => new StudioError('INVALID_MEDIA', { message_fa });

/** نام فایل فقط برای نمایش و دانلود؛ مسیر، کاراکتر کنترلی و نویسهٔ خطرناک حذف می‌شود. */
export function safeFilename(name: string, ext: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '')
    .replace(/\.[^.]*$/, '')
    .trim()
    .slice(0, 150);
  return `${cleaned || 'asset'}.${ext}`;
}

export interface AssetFile {
  data: Buffer;
  mime: string;
  filename: string;
}

export function createAssetService(deps: StudioDeps, brands: BrandService) {
  return {
    async list(call: BrandCall, kind?: AssetKind): Promise<AssetView[]> {
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, (tx) =>
        assetRepo.listAssets(tx, call.brand_id, kind),
      );
    },

    async get(call: BrandCall, assetId: string): Promise<AssetView> {
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, async (tx) => {
        const record = await assetRepo.getAsset(tx, assetId);
        if (!record) throw notFound('دارایی');
        return record.view;
      });
    },

    /**
     * ثبت فایل بارگذاری‌شده. نوع از محتوا تشخیص داده می‌شود؛ پسوند و سرآیند اعلام‌شده اعتبار ندارند (A17).
     * فایل پیش از ثبت در پایگاه داده ذخیره می‌شود؛ چون ذخیره محتوامحور است، شکست بعدی فایل یتیم بی‌خطر می‌گذارد.
     */
    async upload(call: BrandCall, query: UploadAssetQuery, data: Buffer): Promise<AssetView> {
      if (data.length === 0) throw invalid('فایل خالی است.');
      const sniffed = sniffMedia(data);
      if (!sniffed) {
        throw invalid('نوع فایل پشتیبانی نمی‌شود. فقط PNG، JPEG، WebP، MP4، MP3، M4A و فونت TTF/OTF/WOFF2 پذیرفته می‌شود.');
      }
      const family = FAMILY_OF[query.kind];
      if (sniffed.family !== family) {
        throw invalid(`محتوای فایل (${sniffed.mime}) با نوع اعلام‌شدهٔ «${query.kind}» نمی‌خواند.`);
      }
      if (data.length > MAX_BYTES[family]) {
        throw invalid(`حجم فایل بیش از سقف ${Math.round(MAX_BYTES[family] / 1024 / 1024)} مگابایت است.`);
      }
      if (sniffed.width !== null && sniffed.height !== null &&
          (sniffed.width > MAX_IMAGE_SIDE || sniffed.height > MAX_IMAGE_SIDE || sniffed.width === 0 || sniffed.height === 0)) {
        throw invalid(`ابعاد تصویر (${sniffed.width}×${sniffed.height}) پذیرفته نیست.`);
      }

      // ویدئو و صدا با ffprobe سنجیده می‌شوند: مدت و ابعاد واقعی ثبت و فایل خراب رد می‌شود.
      // اگر FFmpeg نصب نباشد فایل پذیرفته می‌شود ولی مدتش خالی می‌ماند (صادقانه، نه حدسی).
      let probe: VideoProbe | null = null;
      if ((family === 'video' || family === 'audio') && (await videoToolsAvailable(deps.render.video))) {
        try {
          probe = await probeMedia(deps.render.video, data, sniffed.ext);
        } catch {
          throw invalid('فایل ویدئو یا صدا خوانا نیست یا آسیب دیده است.');
        }
        if (family === 'video' && (!probe.width || !probe.height)) throw invalid('در این فایل تصویر ویدئویی پیدا نشد.');
      }

      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, async (tx) => {
        const brand = await brands.load(tx, call.brand_id);
        let parentId: string | null = null;
        let version = 1;
        if (query.parent_asset_id) {
          const parent = await assetRepo.getAsset(tx, query.parent_asset_id);
          if (!parent) throw notFound('دارایی والد');
          if (parent.view.kind !== query.kind) throw invalid('نسخهٔ تازه باید هم‌نوع دارایی والد باشد.');
          parentId = parent.view.parent_asset_id ?? parent.view.id;
          version = (await assetRepo.latestVersion(tx, parentId)) + 1;
        }
        const stored = await deps.assets.put(call.workspace_id, call.brand_id, data);
        const filename = safeFilename(query.filename, sniffed.ext);
        const { record, created } = await assetRepo.insertAsset(tx, {
          workspace_id: call.workspace_id,
          brand_id: call.brand_id,
          kind: query.kind,
          provenance: 'owner_upload',
          mime: sniffed.mime,
          byte_size: stored.byte_size,
          checksum: stored.checksum,
          width: sniffed.width ?? probe?.width ?? null,
          height: sniffed.height ?? probe?.height ?? null,
          duration_ms: probe?.duration_ms ?? null,
          language: query.language ?? null,
          filename,
          title_fa: query.title_fa ?? filename,
          license: query.license,
          consent: query.consent,
          storage_key: stored.storage_key,
          parent_asset_id: parentId,
          version: parentId ? version : 1,
          metadata: {},
          is_sample: brand.row.is_sample,
          created_by: call.actor.id,
        });
        await audit(tx, call, {
          action: created ? 'asset.upload' : 'asset.upload.duplicate',
          target_type: 'asset',
          target_id: record.view.id,
          outcome: 'succeeded',
          metadata: { kind: query.kind, mime: sniffed.mime, byte_size: stored.byte_size, version: record.view.version },
        });
        return record.view;
      });
    },

    /**
     * بستهٔ انتشار دستی نسخهٔ جاری: دارایی‌ها به ترتیب (۰۱-…)، caption.txt، draft.txt و README.txt.
     * فقط دانلود است؛ هشدار تأییدنشده یا QA ناموفق در README صریح نوشته می‌شود و دانلود را مسدود نمی‌کند.
     */
    async contentPackage(call: BrandCall, contentId: string): Promise<{ filename: string; data: Buffer }> {
      const snapshot = await deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, async (tx) => {
        const item = await contentRepo.getContentItem(tx, contentId);
        const [current] = item ? await contentRepo.listRevisions(tx, contentId) : [];
        if (!item || !current) throw notFound('محتوا');
        const records = [];
        for (const id of current.asset_ids) {
          const record = await assetRepo.getAsset(tx, id);
          if (record) records.push(record);
        }
        const brand = await brands.load(tx, call.brand_id);
        await audit(tx, call, {
          action: 'content.package.download',
          target_type: 'content',
          target_id: contentId,
          outcome: 'succeeded',
          metadata: { revision: current.revision, assets: records.length, state: item.state },
        });
        return { item, current, records, brand_name: brand.row.name };
      });
      const { item, current, records } = snapshot;

      const entries: ZipEntry[] = [];
      const listed: string[] = [];
      for (const [index, record] of records.entries()) {
        const name = `${String(index + 1).padStart(2, '0')}-${record.view.filename}`;
        entries.push({ name, data: await deps.assets.read(record.storage_key, record.view.checksum) });
        listed.push(`${name} — ${record.view.title_fa}${record.view.duration_ms ? ` (${(record.view.duration_ms / 1000).toFixed(1)} ثانیه)` : ''}`);
      }
      const caption = isVisualFormat(item.format) ? parseVisual(item.format, current.text).caption : null;
      entries.push({ name: 'caption.txt', data: Buffer.from(`${caption ?? current.text}\n`, 'utf8') });
      entries.push({ name: 'draft.txt', data: Buffer.from(`${current.text}\n`, 'utf8') });

      const warnings: string[] = [];
      if (item.state !== 'approved' && item.state !== 'scheduled') {
        warnings.push(`این نسخه در استودیو هنوز تأیید نشده است (وضعیت: ${CONTENT_STATE_LABEL_FA[item.state]}). پیش از انتشار آن را بازبینی کنید.`);
      }
      if (current.qa_result.status === 'fail') {
        warnings.push('بازبینی خودکار این نسخه ایراد «باید اصلاح شود» دارد.');
      }
      if (/〔[^〕]*〕/.test(current.text)) warnings.push('متن هنوز جای خالی 〔اطلاعات مالک لازم است〕 دارد.');
      if (item.is_sample) warnings.push('این محتوای نمونه است و نباید منتشر شود.');
      if (isVisualFormat(item.format) && records.length === 0) warnings.push('این نسخه هنوز تصویر یا ویدئو ندارد؛ ابتدا «ساخت تصویر» را اجرا کنید.');

      const readme = [
        `بستهٔ انتشار دستی — ${item.title_fa}`,
        '',
        `برند: ${snapshot.brand_name}`,
        `کانال و قالب: ${CHANNEL_LABEL_FA[item.channel]} · ${FORMAT_LABEL_FA[item.format]}`,
        `نسخه: ${current.revision} · هش: ${current.hash}`,
        `بازبینی خودکار: ${current.qa_result.status}`,
        '',
        ...(warnings.length ? ['هشدار:', ...warnings.map((line) => `- ${line}`), ''] : []),
        'فایل‌ها:',
        ...(listed.length ? listed.map((line) => `- ${line}`) : ['- (بدون تصویر یا ویدئو)']),
        '- caption.txt — متن کپشن برای کپی',
        '- draft.txt — متن کامل همین نسخه',
        '',
        'انتشار دستی:',
        '۱. فایل‌ها را به همان ترتیب شماره در اپ اینستاگرام یا پنل سرویس انتشار خودتان بارگذاری کنید.',
        '۲. متن caption.txt را کپی کنید و پیش از ارسال یک بار بخوانید.',
        '۳. برای ریلز، کاور را از فایل کاور انتخاب کنید؛ زیرنویس SRT/VTT اختیاری است.',
        '۴. اگر پس از دانلود چیزی را در استودیو تغییر دادید، بستهٔ تازه بگیرید؛ این بسته فقط همین نسخه است.',
        '',
        'استودیو این بسته را منتشر نکرده و چیزی از طرف شما ارسال نمی‌کند.',
      ].join('\n');
      entries.push({ name: 'README.txt', data: Buffer.from(`${readme}\n`, 'utf8') });

      return { filename: `content-${contentId.slice(0, 8)}-v${current.revision}.zip`, data: buildZip(entries) };
    },

    /** فایل دارایی، فقط پس از بررسی عضویت برند (RLS) و تطبیق checksum. */
    async file(call: BrandCall, assetId: string): Promise<AssetFile> {
      const record = await deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, (tx) =>
        assetRepo.getAsset(tx, assetId),
      );
      if (!record) throw notFound('دارایی');
      try {
        const data = await deps.assets.read(record.storage_key, record.view.checksum);
        return { data, mime: record.view.mime, filename: record.view.filename };
      } catch (error) {
        deps.logger.error({ err: error, asset_id: assetId, trace_id: call.trace_id }, 'asset file unreadable');
        throw new StudioError('INTERNAL', { message_fa: 'فایل این دارایی در دسترس نیست یا آسیب دیده است.' });
      }
    },
  };
}

export type AssetService = ReturnType<typeof createAssetService>;
