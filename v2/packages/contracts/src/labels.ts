import type { Channel, ContentFormat, Role, Weekday } from './primitives.ts';
import type {
  AuthorityMode,
  BrandStatus,
  CapabilityStatus,
  ContentState,
  RunState,
  SpendMode,
  StepState,
} from './states.ts';

/**
 * برچسب‌های فارسی مشترک بین سرور و داشبورد. شناسه‌ها انگلیسی می‌مانند و فقط نمایش فارسی است.
 */

export const CHANNEL_LABEL_FA: Record<Channel, string> = {
  instagram: 'اینستاگرام',
  linkedin: 'لینکدین',
  website: 'سایت',
  telegram: 'تلگرام',
  whatsapp: 'واتساپ',
  virgool: 'ویرگول',
  ads: 'تبلیغات',
};

export const FORMAT_LABEL_FA: Record<ContentFormat, string> = {
  post: 'پست',
  carousel: 'کاروسل',
  story: 'استوری',
  reel: 'ریلز',
  trial_reel: 'ریلز تریال',
  text_post: 'پست متنی',
  document: 'سند',
  article: 'مقاله',
  message: 'پیام',
  ad_creative: 'خلاقهٔ تبلیغ',
};

export const WEEKDAY_LABEL_FA: Record<Weekday, string> = {
  saturday: 'شنبه',
  sunday: 'یکشنبه',
  monday: 'دوشنبه',
  tuesday: 'سه‌شنبه',
  wednesday: 'چهارشنبه',
  thursday: 'پنجشنبه',
  friday: 'جمعه',
};

/** ترتیب نمایش روزها وقتی هفته از شنبه شروع می‌شود. */
export const WEEKDAYS_FROM_SATURDAY: readonly Weekday[] = [
  'saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
];

export const CONTENT_STATE_LABEL_FA: Record<ContentState, string> = {
  brief: 'بریف',
  researching: 'در حال گردآوری منابع',
  drafting: 'در حال نگارش',
  validating: 'در حال بازبینی خودکار',
  ready_for_review: 'آمادهٔ بازبینی',
  approved: 'تأییدشده',
  scheduled: 'زمان‌بندی‌شده',
  publishing: 'در حال انتشار',
  published: 'منتشرشده',
  needs_revision: 'نیاز به اصلاح',
  blocked: 'مسدود',
  cancelled: 'لغوشده',
  publishing_unknown: 'نتیجهٔ انتشار نامعلوم',
  failed: 'ناموفق',
};

export const RUN_STATE_LABEL_FA: Record<RunState, string> = {
  queued: 'در صف',
  running: 'در حال اجرا',
  waiting_for_input: 'منتظر پاسخ شما',
  waiting_for_approval: 'منتظر تأیید',
  waiting_for_funds: 'منتظر اعتبار',
  waiting_for_harness: 'منتظر ابزار متصل',
  paused: 'متوقف',
  succeeded: 'انجام شد',
  partially_succeeded: 'بخشی انجام شد',
  failed: 'ناموفق',
  cancelled: 'لغوشده',
};

export const STEP_STATE_LABEL_FA: Record<StepState, string> = {
  pending: 'در انتظار',
  running: 'در حال اجرا',
  succeeded: 'انجام شد',
  failed: 'ناموفق',
  skipped: 'رد شد',
};

export const CAPABILITY_STATUS_LABEL_FA: Record<CapabilityStatus, string> = {
  verified: 'آزموده',
  needs_access: 'نیاز به دسترسی',
  manual_only: 'فقط دستی',
  unsupported: 'پشتیبانی نمی‌شود',
  unverified: 'اثبات‌نشده',
  degraded: 'ناقص',
};

export const AUTHORITY_MODE_LABEL_FA: Record<AuthorityMode, string> = {
  draft_only: 'فقط پیش‌نویس',
  review_required: 'انتشار با تأیید',
  auto_scoped: 'خودکار در محدودهٔ مشخص',
};

export const SPEND_MODE_LABEL_FA: Record<SpendMode, string> = {
  free_only: 'فقط رایگان',
  permitted_paid: 'هزینهٔ مجاز با سقف',
};

export const BRAND_STATUS_LABEL_FA: Record<BrandStatus, string> = {
  active: 'فعال',
  paused: 'متوقف',
  archived: 'آرشیو',
};

export const ROLE_LABEL_FA: Record<Role, string> = {
  owner: 'مالک',
  editor: 'ویرایشگر',
  reviewer: 'بازبین',
  viewer: 'بیننده',
  service: 'سرویس',
};
