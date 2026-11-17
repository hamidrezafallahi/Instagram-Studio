import type { AssetConsent, AssetKind, AssetProvenance, AssetView } from '@studio/contracts';
import { iso, type Tx } from '../db.ts';

interface AssetRow extends Omit<AssetView, 'created_at' | 'byte_size'> {
  byte_size: string | number;
  storage_key: string;
  created_at: Date;
}

const COLUMNS =
  'id, brand_id, kind, provenance, mime, byte_size, checksum, width, height, duration_ms, language, filename, ' +
  'title_fa, license, consent, parent_asset_id, version, is_sample, created_by, created_at, storage_key';

export interface AssetRecord {
  view: AssetView;
  storage_key: string;
}

const toRecord = ({ storage_key, ...row }: AssetRow): AssetRecord => ({
  storage_key,
  view: { ...row, byte_size: Number(row.byte_size), created_at: iso(row.created_at) },
});

export interface NewAsset {
  workspace_id: string;
  brand_id: string;
  kind: AssetKind;
  provenance: AssetProvenance;
  mime: string;
  byte_size: number;
  checksum: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  language: string | null;
  filename: string;
  title_fa: string;
  license: string;
  consent: AssetConsent;
  storage_key: string;
  parent_asset_id: string | null;
  version: number;
  metadata: Record<string, unknown>;
  is_sample: boolean;
  created_by: string;
}

/** درج؛ اگر همین فایل (checksum و نوع) قبلاً در برند ثبت شده باشد همان ردیف برمی‌گردد و created=false. */
export async function insertAsset(tx: Tx, input: NewAsset): Promise<{ record: AssetRecord; created: boolean }> {
  const inserted = await tx.query<AssetRow>(
    `INSERT INTO assets (workspace_id, brand_id, kind, provenance, mime, byte_size, checksum, width, height,
                         duration_ms, language, filename, title_fa, license, consent, storage_key, parent_asset_id,
                         version, metadata, is_sample, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
     ON CONFLICT (brand_id, checksum, kind) DO NOTHING
     RETURNING ${COLUMNS}`,
    [
      input.workspace_id, input.brand_id, input.kind, input.provenance, input.mime, input.byte_size, input.checksum,
      input.width, input.height, input.duration_ms, input.language, input.filename, input.title_fa, input.license,
      input.consent, input.storage_key, input.parent_asset_id, input.version, JSON.stringify(input.metadata),
      input.is_sample, input.created_by,
    ],
  );
  if (inserted.rows[0]) return { record: toRecord(inserted.rows[0]), created: true };
  const existing = await tx.query<AssetRow>(
    `SELECT ${COLUMNS} FROM assets WHERE brand_id = $1 AND checksum = $2 AND kind = $3`,
    [input.brand_id, input.checksum, input.kind],
  );
  return { record: toRecord(existing.rows[0] as AssetRow), created: false };
}

export async function getAsset(tx: Tx, assetId: string): Promise<AssetRecord | null> {
  const result = await tx.query<AssetRow>(`SELECT ${COLUMNS} FROM assets WHERE id = $1`, [assetId]);
  return result.rows[0] ? toRecord(result.rows[0]) : null;
}

export async function listAssets(tx: Tx, brandId: string, kind?: AssetKind): Promise<AssetView[]> {
  const result = await tx.query<AssetRow>(
    `SELECT ${COLUMNS} FROM assets WHERE brand_id = $1 AND ($2::text IS NULL OR kind = $2)
      ORDER BY created_at DESC, id DESC LIMIT 500`,
    [brandId, kind ?? null],
  );
  return result.rows.map((row) => toRecord(row).view);
}

/** بالاترین نسخهٔ زنجیرهٔ یک دارایی (ریشه + فرزندان). */
export async function latestVersion(tx: Tx, rootId: string): Promise<number> {
  const result = await tx.query<{ version: number }>(
    `SELECT coalesce(max(version), 1)::int AS version FROM assets WHERE id = $1 OR parent_asset_id = $1`,
    [rootId],
  );
  return result.rows[0]?.version ?? 1;
}

/** شناسه‌هایی از فهرست که در همین برند وجود دارند. */
export async function existingIds(tx: Tx, brandId: string, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const result = await tx.query<{ id: string }>(
    `SELECT id FROM assets WHERE brand_id = $1 AND id = ANY($2::uuid[])`,
    [brandId, ids],
  );
  return new Set(result.rows.map((row) => row.id));
}
