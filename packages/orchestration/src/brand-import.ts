import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '@studio/config';
import { BrandProfile, BrandSeed, StudioError, type IndustryPack } from '@studio/contracts';
import { buildInitialProfile, hashBrandProfile, validateProfile } from '@studio/domain';
import type { BrandService } from './brands.ts';
import { packOf, type StudioDeps, type WorkspaceCall } from './context.ts';

/**
 * ورود برند واقعی از فایل (config/brands/<slug>/brand.json).
 * فایل فقط دادهٔ برند دارد و هیچ راز یا کلیدی در آن نیست. بخش‌هایی که از بستهٔ صنعت می‌آیند
 * (industry_pack، locale و timezone) از سند اولیهٔ همان pack ساخته می‌شوند و بقیه روی آن می‌نشیند.
 * ورود تکرارپذیر است: اگر برندی با همین نام باشد و سند تغییری نکرده باشد، نسخهٔ تازه ساخته نمی‌شود.
 */
export const BRANDS_DIR = join(REPO_ROOT, 'config', 'brands');

export interface LoadedBrandSeed {
  file: string;
  seed: BrandSeed;
}

/** یک فایل brand.json یا پوشه‌ای که هر زیرپوشه‌اش brand.json دارد. */
export function loadBrandSeeds(path: string = BRANDS_DIR): LoadedBrandSeed[] {
  const files: string[] = [];
  if (statSync(path).isDirectory()) {
    const direct = join(path, 'brand.json');
    if (existsSync(direct)) files.push(direct);
    else {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const file = join(path, entry.name, 'brand.json');
        if (entry.isDirectory() && existsSync(file)) files.push(file);
      }
    }
  } else {
    files.push(path);
  }
  return files.map((file) => {
    const parsed = BrandSeed.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`);
      throw new Error(`${file}: ${issues.join('; ')}`);
    }
    return { file, seed: parsed.data };
  });
}

/** سند کامل برند: سند اولیهٔ pack به‌اضافهٔ دادهٔ فایل؛ با همان اعتبارسنجی ذخیرهٔ عادی. */
export function buildSeedProfile(seed: BrandSeed, pack: IndustryPack): BrandProfile {
  const initial = buildInitialProfile(pack, { name: seed.name, timezone: seed.timezone, locale: seed.locale });
  const merged = BrandProfile.parse({
    ...initial,
    ...seed.profile,
    identity: { ...initial.identity, ...seed.profile.identity, name: seed.name },
  });
  validateProfile(merged, pack);
  return merged;
}

export type BrandImportOutcome = 'created' | 'updated' | 'unchanged';

export function createBrandImportService(deps: StudioDeps, brands: BrandService) {
  return {
    async importSeed(
      call: WorkspaceCall,
      seed: BrandSeed,
    ): Promise<{ brand_id: string; revision: number; outcome: BrandImportOutcome }> {
      const pack = packOf(deps, seed.industry_pack_id);
      const profile = buildSeedProfile(seed, pack);
      const existing = (await brands.list(call)).find((brand) => brand.name === seed.name);
      if (existing?.is_sample) {
        throw new StudioError('CONFLICT', { message_fa: 'برند نمونه‌ای با همین نام وجود دارد.' });
      }
      if (existing) {
        const brandCall = { ...call, brand_id: existing.id };
        const current = await brands.get(brandCall);
        if (current.profile.industry_pack.id !== pack.id) {
          throw new StudioError('CONFLICT', { message_fa: 'بستهٔ صنعت برند موجود با فایل یکی نیست.' });
        }
        if (hashBrandProfile(current.profile) === hashBrandProfile(profile)) {
          return { brand_id: existing.id, revision: current.brand.current_revision, outcome: 'unchanged' };
        }
        const updated = await brands.updateProfile(brandCall, {
          expected_revision: current.brand.current_revision,
          profile,
        });
        return { brand_id: existing.id, revision: updated.brand.current_revision, outcome: 'updated' };
      }
      const created = await brands.create(call, {
        name: seed.name,
        industry_pack_id: pack.id,
        ...(seed.timezone ? { timezone: seed.timezone } : {}),
        ...(seed.locale ? { locale: seed.locale } : {}),
        is_sample: false,
      });
      const brandCall = { ...call, brand_id: created.brand.id };
      const updated = await brands.updateProfile(brandCall, {
        expected_revision: created.brand.current_revision,
        profile,
      });
      return { brand_id: created.brand.id, revision: updated.brand.current_revision, outcome: 'created' };
    },
  };
}

export type BrandImportService = ReturnType<typeof createBrandImportService>;
