import { z } from 'zod';
import { Channel, ContentFormat, LocalTime, Slug, Weekday } from './primitives.ts';

/**
 * schema مشترک بسته‌های صنعت (config/industry-packs/README.md):
 * required_fields، content_pillars، claims_policy، FAQ_fields، CTA_types، KPI و freshness_rules.
 * pack فقط «داده» است: دانش محرمانه، credential یا شرط if/else محصول در آن نیست.
 */

export const PackField = z.strictObject({
  key: Slug,
  label_fa: z.string().min(1).max(120),
  help_fa: z.string().max(400).optional(),
  kind: z.enum(['text', 'long_text', 'list', 'url']),
  /** required: بدون آن draft شخصی‌سازی‌شده با علامت «نیاز به اطلاعات مالک» ساخته می‌شود. */
  required: z.boolean(),
});
export type PackField = z.infer<typeof PackField>;

export const PackPillar = z.strictObject({
  id: Slug,
  title_fa: z.string().min(1).max(120),
  description_fa: z.string().max(400),
  /** قالب‌های پیشنهادی این ستون؛ planner از بین کانال‌های فعال برند انتخاب می‌کند. */
  formats: z.array(ContentFormat).min(1),
  /** زاویه‌های موضوعی برای پیشنهاد عنوان؛ ادعا یا عدد در آن‌ها نیست. */
  angles_fa: z.array(z.string().min(1).max(200)).min(1),
  /**
   * کلید فیلدهایی (از required_fields یا faq_fields) که پاسخ مالک به آن‌ها مادهٔ اصلی این ستون است.
   * تولید قالبی فقط از همین پاسخ‌ها استفاده می‌کند و برای فیلد خالی علامت «اطلاعات مالک لازم است» می‌گذارد.
   */
  source_fields: z.array(Slug).default([]),
  /** این ستون فقط با مدرک واقعی (نمونه‌کار، رضایت‌نامه، کاتالوگ) قابل انتشار است. */
  requires_evidence: z.boolean().default(false),
});
export type PackPillar = z.infer<typeof PackPillar>;

export const PackClaimRule = z.strictObject({
  id: Slug,
  label_fa: z.string().min(1).max(200),
  /** عبارت‌هایی که وجودشان در متن نشانهٔ این نوع ادعاست (تطبیق سادهٔ متنی، بدون regex). */
  phrases: z.array(z.string().min(2).max(80)).min(1),
  /** forbid: متن رد می‌شود؛ needs_evidence: بدون مدرک به بازبینی مالک می‌رود. */
  action: z.enum(['forbid', 'needs_evidence', 'escalate_to_owner']),
});
export type PackClaimRule = z.infer<typeof PackClaimRule>;

export const PackCta = z.strictObject({
  id: Slug,
  label_fa: z.string().min(1).max(80),
  text_fa: z.string().min(1).max(200),
});
export type PackCta = z.infer<typeof PackCta>;

export const PackFreshnessRule = z.strictObject({
  field: z.enum(['price', 'availability', 'schedule', 'catalog']),
  max_age_days: z.int().positive(),
  /** رفتار هنگام کهنه‌بودن: استعلام از مالک، نه ادعای قطعی. */
  on_stale: z.enum(['ask_owner', 'omit', 'block']),
  note_fa: z.string().max(300).optional(),
});
export type PackFreshnessRule = z.infer<typeof PackFreshnessRule>;

export const PackCadenceItem = z.strictObject({
  weekday: Weekday,
  channel: Channel,
  format: ContentFormat,
  pillar: Slug,
  time: LocalTime,
});
export type PackCadenceItem = z.infer<typeof PackCadenceItem>;

export const IndustryPack = z
  .strictObject({
    id: Slug,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    name_fa: z.string().min(1).max(120),
    description_fa: z.string().max(600),
    /** pack عمومی برای «برند پنجم»: هیچ فرض صنعتی ندارد و همهٔ فیلدها را مالک پر می‌کند. */
    is_generic: z.boolean().default(false),
    disclaimer_fa: z.string().max(600),
    required_fields: z.array(PackField),
    content_pillars: z.array(PackPillar).min(1),
    claims_policy: z.strictObject({
      summary_fa: z.string().max(600),
      rules: z.array(PackClaimRule),
    }),
    faq_fields: z.array(PackField),
    cta_types: z.array(PackCta).min(1),
    kpi: z.array(z.strictObject({ id: Slug, label_fa: z.string().min(1).max(120) })).min(1),
    freshness_rules: z.array(PackFreshnessRule),
    default_channels: z.array(Channel).min(1),
    /** الگوی پیشنهادی هفته؛ الزام تعداد انتشار نیست و با ظرفیت برند کم و زیاد می‌شود. */
    default_cadence: z.array(PackCadenceItem).min(1),
  })
  .meta({ id: 'IndustryPack', description: 'بستهٔ دادهٔ صنعت؛ افزودن صنعت تازه فقط با دادهٔ pack' });
export type IndustryPack = z.infer<typeof IndustryPack>;

/** خلاصهٔ pack برای فهرست انتخاب در داشبورد. */
export const IndustryPackSummary = z.strictObject({
  id: Slug,
  version: z.string(),
  name_fa: z.string(),
  description_fa: z.string(),
  is_generic: z.boolean(),
  disclaimer_fa: z.string(),
});
export type IndustryPackSummary = z.infer<typeof IndustryPackSummary>;
