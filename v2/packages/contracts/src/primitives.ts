import { z } from 'zod';

// پیام‌های اعتبارسنجی فارسی‌اند؛ در پاسخ خطا کنار مسیر هر فیلد به مالک نشان داده می‌شوند.
z.config(z.locales.fa());

/**
 * نسخهٔ قراردادهای هسته. تغییر ناسازگار = افزایش major به همراه یادداشت migration
 * (packages/README.md: «قراردادها schema_version دارند»).
 */
export const SCHEMA_VERSION = '1.0.0';

/** شناسهٔ داخلی همیشه UUID است. */
export const Uuid = z.uuid();
export type Uuid = z.infer<typeof Uuid>;

/** شناسهٔ ارائه‌دهنده رشته است؛ هیچ فرض عددی دربارهٔ آن نمی‌شود. */
export const ProviderId = z.string().min(1).max(256);

/** زمان: RFC3339 در UTC با پسوند Z. منطقهٔ زمانی و locale جدا نگهداری می‌شوند. */
export const UtcTimestamp = z.iso.datetime();
export type UtcTimestamp = z.infer<typeof UtcTimestamp>;

/** تاریخ تقویمی میلادی (YYYY-MM-DD) بدون ساعت. */
export const IsoDate = z.iso.date();

/** نام منطقهٔ زمانی IANA مثل Asia/Tehran؛ اعتبار واقعی در domain با Intl بررسی می‌شود. */
export const IanaTimezone = z.string().min(3).max(64);

/** برچسب زبان مثل fa-IR یا en. */
export const Locale = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/);

/** ساعت محلی HH:MM بیست‌وچهارساعته. */
export const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** هش SHA-256 به‌صورت hex کوچک. */
export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * ارجاع به راز. دادهٔ محرمانه فقط با همین ارجاع جابه‌جا می‌شود؛
 * مقدار واقعی token هرگز در ساختارهای عمومی، log یا prompt قرار نمی‌گیرد.
 */
export const SecretRef = z.string().regex(/^secret:\/\/vault\/[0-9a-f-]{36}$/);
export type SecretRef = z.infer<typeof SecretRef>;

/**
 * ارزها. ریال (IRR) و تومان (IRT) دو واحد جدا هستند و هرگز بی‌نام نمایش داده نمی‌شوند.
 * تبدیل فقط با نرخ، زمان و واحد ثبت‌شده مجاز است؛ نرخ ثابت در کد وجود ندارد.
 */
export const Currency = z.enum(['IRR', 'IRT', 'USD', 'EUR']);
export type Currency = z.infer<typeof Currency>;

/** تعداد رقم واحد خرد هر ارز (ریال و تومان واحد خرد ندارند). */
export const CURRENCY_MINOR_DIGITS: Record<Currency, number> = { IRR: 0, IRT: 0, USD: 2, EUR: 2 };

/** پول: عدد صحیحِ واحد خرد به همراه ارز. float برای مبلغ و بودجه ممنوع است. */
export const Money = z
  .strictObject({
    amount_minor: z.int().nonnegative(),
    currency: Currency,
  })
  .meta({ id: 'Money', description: 'مبلغ به واحد خرد (عدد صحیح) و ارز صریح' });
export type Money = z.infer<typeof Money>;

/** کانال‌های انتشار و ارتباط. حذف یک کانال فقط آیتم‌های همان کانال را مسدود می‌کند. */
export const Channel = z.enum([
  'instagram',
  'linkedin',
  'website',
  'telegram',
  'whatsapp',
  'virgool',
  'ads',
]);
export type Channel = z.infer<typeof Channel>;

/** قالب محتوا. هر قالب در هر کانال capability جدا دارد. */
export const ContentFormat = z.enum([
  'post',
  'carousel',
  'story',
  'reel',
  'trial_reel',
  'text_post',
  'document',
  'article',
  'message',
  'ad_creative',
]);
export type ContentFormat = z.infer<typeof ContentFormat>;

/** روزهای هفته؛ هفتهٔ پیش‌فرض از شنبه شروع می‌شود و قابل تغییر است. */
export const Weekday = z.enum([
  'saturday',
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
]);
export type Weekday = z.infer<typeof Weekday>;

/** نقش‌های کاربری. نسخهٔ اول یک owner دارد؛ مدل مجوز برای گسترش آماده است. */
export const Role = z.enum(['owner', 'editor', 'reviewer', 'viewer', 'service']);
export type Role = z.infer<typeof Role>;

/** نوع عامل ثبت‌شده در audit و intent. مدل زبانی هرگز جایگزین تأیید انسانی نیست. */
export const ActorType = z.enum(['user', 'service', 'agent', 'system']);
export type ActorType = z.infer<typeof ActorType>;

/** شناسهٔ کوتاه ماشینی (snake_case/kebab) برای pack، pillar، action و مانند آن. */
export const Slug = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
