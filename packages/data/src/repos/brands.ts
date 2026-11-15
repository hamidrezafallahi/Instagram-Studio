import type {
  AuthorityPolicy,
  BrandProfile,
  BrandRevisionSummary,
  BrandStatus,
  PolicyView,
  Role,
} from '@studio/contracts';
import { iso, type Tx } from '../db.ts';

export interface BrandRow {
  id: string;
  workspace_id: string;
  name: string;
  status: BrandStatus;
  industry_pack_id: string;
  industry_pack_version: string;
  is_sample: boolean;
  timezone: string;
  locale: string;
  current_revision: number;
  created_at: Date;
  updated_at: Date;
}

const BRAND_COLUMNS =
  'id, workspace_id, name, status, industry_pack_id, industry_pack_version, is_sample, timezone, locale, current_revision, created_at, updated_at';

export async function insertBrand(
  tx: Tx,
  input: {
    workspace_id: string;
    name: string;
    industry_pack_id: string;
    industry_pack_version: string;
    is_sample: boolean;
    timezone: string;
    locale: string;
  },
): Promise<BrandRow> {
  const result = await tx.query<BrandRow>(
    `INSERT INTO brands (workspace_id, name, industry_pack_id, industry_pack_version, is_sample, timezone, locale)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${BRAND_COLUMNS}`,
    [
      input.workspace_id, input.name, input.industry_pack_id, input.industry_pack_version,
      input.is_sample, input.timezone, input.locale,
    ],
  );
  return result.rows[0] as BrandRow;
}

export async function listBrands(tx: Tx): Promise<BrandRow[]> {
  const result = await tx.query<BrandRow>(
    `SELECT ${BRAND_COLUMNS} FROM brands ORDER BY (status = 'archived'), created_at`,
  );
  return result.rows;
}

export async function getBrand(tx: Tx, brandId: string): Promise<BrandRow | null> {
  const result = await tx.query<BrandRow>(`SELECT ${BRAND_COLUMNS} FROM brands WHERE id = $1`, [brandId]);
  return result.rows[0] ?? null;
}

/**
 * ثبت نسخهٔ تازهٔ تنظیمات با بررسی optimistic: اگر نسخهٔ جاری همان expected نباشد null برمی‌گردد
 * تا «آخرین نویسنده» تغییر قبلی را بی‌صدا حذف نکند.
 */
export async function advanceBrandRevision(
  tx: Tx,
  brandId: string,
  expectedRevision: number,
  patch: { name: string; timezone: string; locale: string },
): Promise<BrandRow | null> {
  const result = await tx.query<BrandRow>(
    `UPDATE brands SET current_revision = current_revision + 1, name = $3, timezone = $4, locale = $5
      WHERE id = $1 AND current_revision = $2 RETURNING ${BRAND_COLUMNS}`,
    [brandId, expectedRevision, patch.name, patch.timezone, patch.locale],
  );
  return result.rows[0] ?? null;
}

export async function setBrandStatus(tx: Tx, brandId: string, status: BrandStatus): Promise<BrandRow | null> {
  const result = await tx.query<BrandRow>(
    `UPDATE brands SET status = $2, archived_at = CASE WHEN $2 = 'archived' THEN now() ELSE NULL END
      WHERE id = $1 RETURNING ${BRAND_COLUMNS}`,
    [brandId, status],
  );
  return result.rows[0] ?? null;
}

export async function insertBrandVersion(
  tx: Tx,
  input: {
    workspace_id: string;
    brand_id: string;
    revision: number;
    profile: BrandProfile;
    hash: string;
    note: string | null;
    created_by: string;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO brand_versions (workspace_id, brand_id, revision, profile, hash, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.workspace_id, input.brand_id, input.revision, JSON.stringify(input.profile), input.hash,
      input.note, input.created_by,
    ],
  );
}

export async function getBrandProfile(tx: Tx, brandId: string, revision: number): Promise<BrandProfile | null> {
  const result = await tx.query<{ profile: BrandProfile }>(
    'SELECT profile FROM brand_versions WHERE brand_id = $1 AND revision = $2',
    [brandId, revision],
  );
  return result.rows[0]?.profile ?? null;
}

export async function listBrandVersions(tx: Tx, brandId: string): Promise<BrandRevisionSummary[]> {
  const result = await tx.query<{ revision: number; hash: string; created_at: Date; created_by: string; note: string | null }>(
    `SELECT revision, hash, created_at, created_by, note FROM brand_versions
      WHERE brand_id = $1 ORDER BY revision DESC LIMIT 100`,
    [brandId],
  );
  return result.rows.map((row) => ({ ...row, created_at: iso(row.created_at) }));
}

export async function findBrandMembership(tx: Tx, brandId: string, userId: string): Promise<Role | null> {
  const result = await tx.query<{ role: Role }>(
    'SELECT role FROM brand_memberships WHERE brand_id = $1 AND user_id = $2',
    [brandId, userId],
  );
  return result.rows[0]?.role ?? null;
}

export async function insertPolicy(
  tx: Tx,
  input: { workspace_id: string; brand_id: string; revision: number; authority: AuthorityPolicy; created_by: string },
): Promise<PolicyView> {
  const result = await tx.query<{ created_at: Date }>(
    `INSERT INTO policies (workspace_id, brand_id, revision, authority, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING created_at`,
    [input.workspace_id, input.brand_id, input.revision, JSON.stringify(input.authority), input.created_by],
  );
  return {
    brand_id: input.brand_id,
    revision: input.revision,
    authority: input.authority,
    updated_at: iso((result.rows[0] as { created_at: Date }).created_at),
    updated_by: input.created_by,
  };
}

export async function currentPolicy(tx: Tx, brandId: string): Promise<PolicyView | null> {
  const result = await tx.query<{ revision: number; authority: AuthorityPolicy; created_at: Date; created_by: string }>(
    `SELECT revision, authority, created_at, created_by FROM policies
      WHERE brand_id = $1 ORDER BY revision DESC LIMIT 1`,
    [brandId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    brand_id: brandId,
    revision: row.revision,
    authority: row.authority,
    updated_at: iso(row.created_at),
    updated_by: row.created_by,
  };
}
