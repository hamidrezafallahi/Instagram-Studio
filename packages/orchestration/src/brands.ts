import {
  DEFAULT_AUTHORITY_POLICY,
  StudioError,
  type BrandDetail,
  type BrandProfile,
  type BrandRevisionSummary,
  type BrandStatus,
  type BrandSummary,
  type CreateBrandBody,
  type IndustryPack,
  type PolicyView,
  type RollbackBrandBody,
  type UpdateBrandProfileBody,
  type UpdatePolicyBody,
} from '@studio/contracts';
import { brandRepo, connectionRepo, iso, isUniqueViolation, type BrandRow, type Tx } from '@studio/data';
import { assessReadiness, buildInitialProfile, faDigits, hashBrandProfile, validateProfile } from '@studio/domain';
import {
  audit,
  notFound,
  packOf,
  type BrandCall,
  type StudioDeps,
  type WorkspaceCall,
} from './context.ts';

export interface LoadedBrandState {
  row: BrandRow;
  profile: BrandProfile;
  pack: IndustryPack;
  policy: PolicyView;
}

export function createBrandService(deps: StudioDeps) {
  /** برند، نسخهٔ جاری تنظیمات، بستهٔ صنعت و سیاست جاری در یک تراکنش. */
  async function load(tx: Tx, brandId: string): Promise<LoadedBrandState> {
    const row = await brandRepo.getBrand(tx, brandId);
    if (!row) throw notFound('برند');
    const profile = await brandRepo.getBrandProfile(tx, brandId, row.current_revision);
    const policy = await brandRepo.currentPolicy(tx, brandId);
    if (!profile || !policy) throw new StudioError('INTERNAL', { message_fa: 'دادهٔ برند ناقص است.' });
    return { row, profile, pack: packOf(deps, row.industry_pack_id), policy };
  }

  async function summarize(tx: Tx, state: LoadedBrandState): Promise<BrandSummary> {
    const capabilities = await connectionRepo.listCapabilities(tx, state.row.id);
    const readiness = assessReadiness(state.profile, state.pack, {
      has_usable_connection: capabilities.some((item) => item.status === 'verified'),
      authority_allows_external: state.policy.authority.mode !== 'draft_only',
      // تأیید پیش‌نمایش در M2 اضافه می‌شود؛ تا آن زمان صادقانه «ندارد» است.
      has_approved_preview: false,
    });
    return {
      id: state.row.id,
      workspace_id: state.row.workspace_id,
      name: state.row.name,
      status: state.row.status,
      industry_pack: { id: state.row.industry_pack_id, version: state.row.industry_pack_version },
      is_sample: state.row.is_sample,
      timezone: state.row.timezone,
      locale: state.row.locale,
      current_revision: state.row.current_revision,
      readiness,
      created_at: iso(state.row.created_at),
      updated_at: iso(state.row.updated_at),
    };
  }

  async function detail(tx: Tx, brandId: string): Promise<BrandDetail> {
    const state = await load(tx, brandId);
    return { brand: await summarize(tx, state), profile: state.profile, pack: state.pack };
  }

  /** ثبت نسخهٔ تازهٔ تنظیمات با بررسی optimistic و اعتبارسنجی در برابر بستهٔ صنعت. */
  async function saveProfile(
    tx: Tx,
    call: BrandCall,
    input: { expected_revision: number; profile: BrandProfile; note: string | null; action: string },
  ): Promise<BrandDetail> {
    const state = await load(tx, call.brand_id);
    if (state.row.status === 'archived') {
      throw new StudioError('CONFLICT', { message_fa: 'برند آرشیوشده قابل ویرایش نیست.' });
    }
    if (state.row.current_revision !== input.expected_revision) throw new StudioError('STALE_REVISION');
    validateProfile(input.profile, state.pack);
    const hash = hashBrandProfile(input.profile);
    if (hash === hashBrandProfile(state.profile)) return detail(tx, call.brand_id);

    let advanced: BrandRow | null;
    try {
      advanced = await brandRepo.advanceBrandRevision(tx, call.brand_id, input.expected_revision, {
        name: input.profile.identity.name.trim(),
        timezone: input.profile.timezone,
        locale: input.profile.locale,
      });
    } catch (error) {
      if (isUniqueViolation(error, 'brands_name_key')) {
        throw new StudioError('CONFLICT', { message_fa: 'برند دیگری با همین نام وجود دارد.', cause: error });
      }
      throw error;
    }
    if (!advanced) throw new StudioError('STALE_REVISION');
    await brandRepo.insertBrandVersion(tx, {
      workspace_id: call.workspace_id,
      brand_id: call.brand_id,
      revision: advanced.current_revision,
      profile: input.profile,
      hash,
      note: input.note,
      created_by: call.actor.id,
    });
    await audit(tx, call, {
      action: input.action,
      target_type: 'brand',
      target_id: call.brand_id,
      outcome: 'succeeded',
      metadata: { revision: advanced.current_revision, hash },
    });
    return detail(tx, call.brand_id);
  }

  return {
    load,
    summarize,

    async list(call: WorkspaceCall): Promise<BrandSummary[]> {
      return deps.db.tenant({ workspaceId: call.workspace_id }, async (tx) => {
        const rows = await brandRepo.listBrands(tx);
        const summaries: BrandSummary[] = [];
        for (const row of rows) summaries.push(await summarize(tx, await load(tx, row.id)));
        return summaries;
      });
    },

    /** ساخت برند تازه از یک بستهٔ صنعت: فقط داده، بدون تغییر کد (A01). */
    async create(call: WorkspaceCall, body: CreateBrandBody): Promise<BrandDetail> {
      const pack = packOf(deps, body.industry_pack_id);
      if (body.is_sample && !deps.settings.sampleData) {
        throw new StudioError('FORBIDDEN', { message_fa: 'دادهٔ نمونه در این نصب غیرفعال است.' });
      }
      const profile = buildInitialProfile(pack, {
        name: body.name,
        timezone: body.timezone,
        locale: body.locale,
      });
      return deps.db.tenant({ workspaceId: call.workspace_id }, async (tx) => {
        let row: BrandRow;
        try {
          row = await brandRepo.insertBrand(tx, {
            workspace_id: call.workspace_id,
            name: profile.identity.name,
            industry_pack_id: pack.id,
            industry_pack_version: pack.version,
            is_sample: body.is_sample ?? false,
            timezone: profile.timezone,
            locale: profile.locale,
          });
        } catch (error) {
          if (isUniqueViolation(error, 'brands_name_key')) {
            throw new StudioError('CONFLICT', { message_fa: 'برندی با همین نام وجود دارد.', cause: error });
          }
          throw error;
        }
        await brandRepo.insertBrandVersion(tx, {
          workspace_id: call.workspace_id,
          brand_id: row.id,
          revision: 1,
          profile,
          hash: hashBrandProfile(profile),
          note: `ساخته‌شده از بستهٔ «${pack.name_fa}»`,
          created_by: call.actor.id,
        });
        // پیش‌فرض هر برند: فقط پیش‌نویس و فقط رایگان، تا انتخاب صریح مالک.
        await brandRepo.insertPolicy(tx, {
          workspace_id: call.workspace_id,
          brand_id: row.id,
          revision: 1,
          authority: DEFAULT_AUTHORITY_POLICY,
          created_by: call.actor.id,
        });
        await audit(tx, { ...call, brand_id: row.id }, {
          action: 'brand.create',
          target_type: 'brand',
          target_id: row.id,
          outcome: 'succeeded',
          metadata: { industry_pack: pack.id, is_sample: row.is_sample },
        });
        return detail(tx, row.id);
      });
    },

    async get(call: BrandCall): Promise<BrandDetail> {
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, (tx) =>
        detail(tx, call.brand_id),
      );
    },

    async updateProfile(call: BrandCall, body: UpdateBrandProfileBody): Promise<BrandDetail> {
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, (tx) =>
        saveProfile(tx, call, {
          expected_revision: body.expected_revision,
          profile: body.profile,
          note: null,
          action: 'brand.profile.update',
        }),
      );
    },

    async revisions(call: BrandCall): Promise<BrandRevisionSummary[]> {
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, (tx) =>
        brandRepo.listBrandVersions(tx, call.brand_id),
      );
    },

    /** rollback نسخهٔ قدیمی را پاک نمی‌کند؛ همان سند را به‌صورت نسخهٔ تازه ثبت می‌کند. */
    async rollback(call: BrandCall, body: RollbackBrandBody): Promise<BrandDetail> {
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, async (tx) => {
        const target = await brandRepo.getBrandProfile(tx, call.brand_id, body.target_revision);
        if (!target) throw notFound('نسخهٔ خواسته‌شده');
        return saveProfile(tx, call, {
          expected_revision: body.expected_revision,
          profile: target,
          note: `بازگشت به نسخهٔ ${faDigits(body.target_revision)}`,
          action: 'brand.profile.rollback',
        });
      });
    },

    async setStatus(call: BrandCall, status: BrandStatus): Promise<BrandSummary> {
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, async (tx) => {
        const before = await load(tx, call.brand_id);
        if (before.row.status !== status) {
          await brandRepo.setBrandStatus(tx, call.brand_id, status);
          await audit(tx, call, {
            action: 'brand.status.change',
            target_type: 'brand',
            target_id: call.brand_id,
            outcome: 'succeeded',
            metadata: { from: before.row.status, to: status },
          });
        }
        return summarize(tx, await load(tx, call.brand_id));
      });
    },

    async getPolicy(call: BrandCall): Promise<PolicyView> {
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, async (tx) =>
        (await load(tx, call.brand_id)).policy,
      );
    },

    /** هر تغییر سیاست نسخهٔ تازه است؛ نسخه‌های قبلی برای حسابرسی می‌مانند. */
    async updatePolicy(call: BrandCall, body: UpdatePolicyBody): Promise<PolicyView> {
      if (body.mode === 'auto_scoped') {
        throw new StudioError('NOT_IMPLEMENTED', {
          message_fa: 'حالت «خودکار در محدودهٔ مشخص» همراه با قواعد، تأییدها و اجرای کنترل‌شده در مرحلهٔ M2 فعال می‌شود.',
        });
      }
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, async (tx) => {
        const current = (await load(tx, call.brand_id)).policy;
        if (current.revision !== body.expected_revision) throw new StudioError('STALE_REVISION');
        const authority = {
          ...current.authority,
          mode: body.mode ?? current.authority.mode,
          paused: body.paused ?? current.authority.paused,
        };
        const saved = await brandRepo.insertPolicy(tx, {
          workspace_id: call.workspace_id,
          brand_id: call.brand_id,
          revision: current.revision + 1,
          authority,
          created_by: call.actor.id,
        });
        await audit(tx, call, {
          action: 'policy.update',
          target_type: 'policy',
          target_id: call.brand_id,
          outcome: 'succeeded',
          metadata: { revision: saved.revision, mode: authority.mode, paused: authority.paused },
        });
        return saved;
      });
    },
  };
}

export type BrandService = ReturnType<typeof createBrandService>;
