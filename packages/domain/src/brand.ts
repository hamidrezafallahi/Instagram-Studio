import {
  DEFAULT_RETENTION,
  StudioError,
  type BrandContext,
  type BrandProfile,
  type BrandReadiness,
  type ChannelSetting,
  type IndustryPack,
} from '@studio/contracts';
import { assertTimezone } from './time.ts';

export const DEFAULT_TIMEZONE = 'Asia/Tehran';
export const DEFAULT_LOCALE = 'fa-IR';

/**
 * سند اولیهٔ برند از روی بستهٔ صنعت. برند پس از ساخت مستقل از pack است:
 * کانال‌ها و الگوی هفته کپی می‌شوند و ویرایش یک برند قالب دیگران را تغییر نمی‌دهد.
 */
export function buildInitialProfile(
  pack: IndustryPack,
  input: { name: string; timezone?: string | undefined; locale?: string | undefined },
): BrandProfile {
  const timezone = input.timezone ?? DEFAULT_TIMEZONE;
  assertTimezone(timezone);
  const locale = input.locale ?? DEFAULT_LOCALE;
  const channels: BrandProfile['channels'] = {};
  for (const channel of pack.default_channels) {
    const setting: ChannelSetting = { enabled: true };
    channels[channel] = setting;
  }
  return {
    identity: { name: input.name.trim() },
    industry_pack: { id: pack.id, version: pack.version },
    locale,
    content_locales: [locale],
    timezone,
    week_start: 'saturday',
    offers: [],
    audience: { summary: '', segments: [] },
    voice: { tone: '', rules: [], sample_texts: [] },
    forbidden_claims: [],
    evidence: [],
    channels,
    cadence: pack.default_cadence.map((slot) => ({ ...slot })),
    goals: { kpis: pack.kpi.map((item) => item.id) },
    pack_fields: {},
    retention: { ...DEFAULT_RETENTION },
  };
}

/**
 * سازگاری سند برند با بستهٔ صنعت. خطاها با مسیر دقیق برمی‌گردند تا فرم بتواند کنار فیلد نشان دهد.
 */
export function validateProfile(profile: BrandProfile, pack: IndustryPack): void {
  const details: { path: string; message: string }[] = [];
  if (profile.industry_pack.id !== pack.id) {
    details.push({ path: 'industry_pack.id', message: 'بستهٔ صنعت برند قابل تغییر نیست.' });
  }
  try {
    assertTimezone(profile.timezone);
  } catch {
    details.push({ path: 'timezone', message: 'منطقهٔ زمانی شناخته‌شده نیست.' });
  }
  if (!profile.content_locales.includes(profile.locale)) {
    details.push({ path: 'content_locales', message: 'زبان اصلی باید در فهرست زبان‌های محتوا باشد.' });
  }
  const pillars = new Map(pack.content_pillars.map((pillar) => [pillar.id, pillar]));
  profile.cadence.forEach((slot, index) => {
    const pillar = pillars.get(slot.pillar);
    if (!pillar) {
      details.push({ path: `cadence.${index}.pillar`, message: `ستون «${slot.pillar}» در بستهٔ صنعت نیست.` });
    } else if (!pillar.formats.includes(slot.format)) {
      details.push({ path: `cadence.${index}.format`, message: `قالب ${slot.format} برای این ستون مجاز نیست.` });
    }
  });
  const offerIds = profile.offers.map((offer) => offer.id);
  if (new Set(offerIds).size !== offerIds.length) {
    details.push({ path: 'offers', message: 'شناسهٔ خدمت یا کالا تکراری است.' });
  }
  const evidenceIds = new Set(profile.evidence.map((item) => item.id));
  if (evidenceIds.size !== profile.evidence.length) {
    details.push({ path: 'evidence', message: 'شناسهٔ منبع تکراری است.' });
  }
  profile.offers.forEach((offer, index) => {
    if (offer.evidence_id && !evidenceIds.has(offer.evidence_id)) {
      details.push({ path: `offers.${index}.evidence_id`, message: 'منبع این مورد در فهرست منابع نیست.' });
    }
    if (offer.price && !offer.price_checked_at) {
      details.push({ path: `offers.${index}.price_checked_at`, message: 'قیمت بدون تاریخ بررسی پذیرفته نمی‌شود.' });
    }
  });
  const knownFields = new Set([...pack.required_fields, ...pack.faq_fields].map((field) => field.key));
  for (const key of Object.keys(profile.pack_fields)) {
    if (!knownFields.has(key)) {
      details.push({ path: `pack_fields.${key}`, message: 'این فیلد در بستهٔ صنعت تعریف نشده است.' });
    }
  }
  const kpis = new Set(pack.kpi.map((item) => item.id));
  profile.goals.kpis.forEach((kpi, index) => {
    if (!kpis.has(kpi)) details.push({ path: `goals.kpis.${index}`, message: 'این شاخص در بستهٔ صنعت نیست.' });
  });
  if (details.length > 0) throw new StudioError('VALIDATION_FAILED', { details });
}

/**
 * آمادگی برند (docs/product/README.md → راه‌اندازی):
 * برای draft: نام برند، خدمت، مخاطب و زبان. برای live: حساب معتبر، سیاست اختیار، منطقهٔ زمانی
 * و دست‌کم یک پیش‌نمایش تأییدشده.
 */
export function assessReadiness(
  profile: BrandProfile,
  pack: IndustryPack,
  live: { has_usable_connection: boolean; authority_allows_external: boolean; has_approved_preview: boolean } = {
    has_usable_connection: false,
    authority_allows_external: false,
    has_approved_preview: false,
  },
): BrandReadiness {
  const missingForDraft: string[] = [];
  if (!profile.identity.name.trim()) missingForDraft.push('نام برند');
  if (profile.offers.length === 0) missingForDraft.push('دست‌کم یک خدمت یا کالا');
  if (!profile.audience.summary.trim()) missingForDraft.push('توصیف مخاطب');
  if (!profile.locale) missingForDraft.push('زبان');

  const missingPackFields = pack.required_fields
    .filter((field) => field.required && !(profile.pack_fields[field.key] ?? '').trim())
    .map((field) => field.key);

  const missingForLive: string[] = [];
  if (!live.has_usable_connection) missingForLive.push('حساب معتبر متصل و آزموده');
  if (!live.authority_allows_external) missingForLive.push('سیاست اختیار برای اقدام خارجی');
  if (!profile.timezone) missingForLive.push('منطقهٔ زمانی');
  if (!live.has_approved_preview) missingForLive.push('دست‌کم یک پیش‌نمایش تأییدشده');

  return {
    draft_ready: missingForDraft.length === 0,
    missing_for_draft: missingForDraft,
    missing_pack_fields: missingPackFields,
    missing_for_live: missingForLive,
  };
}

/** تصویر نسخه‌دار دانش برند برای عامل‌ها؛ فقط دادهٔ همان برند. */
export function toBrandContext(
  ids: { workspace_id: string; brand_id: string; revision: number },
  profile: BrandProfile,
): BrandContext {
  return {
    workspace_id: ids.workspace_id,
    brand_id: ids.brand_id,
    revision: ids.revision,
    industry_pack: profile.industry_pack,
    locale: profile.locale,
    audience: { summary: profile.audience.summary, segments: profile.audience.segments },
    offers: profile.offers,
    voice_rules: profile.voice.rules,
    evidence_ids: profile.evidence.map((item) => item.id),
  };
}
