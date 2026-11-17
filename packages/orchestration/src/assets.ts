import {
  StudioError,
  type AssetKind,
  type AssetView,
  type UploadAssetQuery,
} from '@studio/contracts';
import { assetRepo } from '@studio/data';
import { MAX_BYTES, MAX_IMAGE_SIDE, sniffMedia, type MediaFamily } from '@studio/media';
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
          width: sniffed.width,
          height: sniffed.height,
          duration_ms: null,
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
