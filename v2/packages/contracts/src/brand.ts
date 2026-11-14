import { z } from 'zod';
import {
  Channel,
  ContentFormat,
  IanaTimezone,
  LocalTime,
  Locale,
  Slug,
  UtcTimestamp,
  Weekday,
} from './primitives.ts';
import { Offer, PackRef } from './entities.ts';

/**
 * تنظیمات برند (config/README.md): identity، industry_pack، locales، timezone، offers،
 * audience، voice، forbidden claims، channel goals، cadence و retention.
 * هر ذخیره یک نسخهٔ immutable تازه می‌سازد (brand_versions) و rollback ممکن است.
 * هیچ رمز یا کلیدی در این سند قرار نمی‌گیرد.
 */

export const EvidenceSource = z.strictObject({
  id: Slug,
  title: z.string().min(1).max(200),
  kind: z.enum(['url', 'document', 'owner_statement', 'catalog']),
  url: z.string().max(1024).optional(),
  note: z.string().max(1000).optional(),
  checked_at: UtcTimestamp.optional(),
});
export type EvidenceSource = z.infer<typeof EvidenceSource>;

export const ChannelSetting = z.strictObject({
  enabled: z.boolean(),
  goal_fa: z.string().max(300).optional(),
  formats: z.array(ContentFormat).optional(),
});
export type ChannelSetting = z.infer<typeof ChannelSetting>;

export const CadenceSlot = z.strictObject({
  weekday: Weekday,
  channel: Channel,
  format: ContentFormat,
  pillar: Slug,
  time: LocalTime,
});
export type CadenceSlot = z.infer<typeof CadenceSlot>;

export const RetentionSettings = z.strictObject({
  message_text_days: z.int().min(1).max(3650),
  raw_payload_days: z.int().min(1).max(3650),
  audit_days: z.int().min(30).max(3650),
});
export type RetentionSettings = z.infer<typeof RetentionSettings>;

/** پیش‌فرض نگهداری داده از docs/product/ASSUMPTIONS.md؛ تا تأیید مالک قابل تغییر می‌ماند. */
export const DEFAULT_RETENTION: RetentionSettings = {
  message_text_days: 90,
  raw_payload_days: 30,
  audit_days: 365,
};

export const BrandProfile = z
  .strictObject({
    identity: z.strictObject({
      name: z.string().min(1).max(120),
      tagline: z.string().max(200).optional(),
      description: z.string().max(2000).optional(),
      website_url: z.string().max(1024).optional(),
    }),
    industry_pack: PackRef,
    locale: Locale,
    content_locales: z.array(Locale).min(1),
    timezone: IanaTimezone,
    week_start: Weekday,
    offers: z.array(Offer).max(200),
    audience: z.strictObject({
      summary: z.string().max(2000),
      segments: z.array(z.string().min(1).max(300)).max(20),
    }),
    voice: z.strictObject({
      tone: z.string().max(500),
      rules: z.array(z.string().min(1).max(300)).max(30),
      sample_texts: z.array(z.string().min(1).max(3000)).max(10),
    }),
    /** ادعاهای ممنوع ویژهٔ همین برند، افزون بر claims_policy بستهٔ صنعت. */
    forbidden_claims: z.array(z.string().min(2).max(120)).max(50),
    evidence: z.array(EvidenceSource).max(200),
    channels: z.partialRecord(Channel, ChannelSetting),
    cadence: z.array(CadenceSlot).max(60),
    goals: z.strictObject({
      monthly_goal_fa: z.string().max(500).optional(),
      kpis: z.array(Slug).max(20),
    }),
    /** پاسخ مالک به required_fields و faq_fields بستهٔ صنعت. */
    pack_fields: z.record(Slug, z.string().max(4000)),
    retention: RetentionSettings,
  })
  .meta({ id: 'BrandProfile', description: 'سند نسخه‌دار تنظیمات برند؛ بدون راز' });
export type BrandProfile = z.infer<typeof BrandProfile>;

/** حداقل اطلاعات برای ساخت draft: نام برند، خدمت، مخاطب و زبان (docs/product/README.md). */
export const BrandReadiness = z.strictObject({
  draft_ready: z.boolean(),
  missing_for_draft: z.array(z.string()),
  /** فیلدهای required بستهٔ صنعت که هنوز خالی‌اند؛ مانع draft نیستند ولی در متن علامت می‌خورند. */
  missing_pack_fields: z.array(Slug),
  /** پیش‌نیازهای حالت live؛ در draft_only فقط نمایش داده می‌شوند. */
  missing_for_live: z.array(z.string()),
});
export type BrandReadiness = z.infer<typeof BrandReadiness>;
