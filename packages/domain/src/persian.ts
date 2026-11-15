/**
 * ابزار متن فارسی برای QA (tests/README.md: «eval مدل: فارسی/RTL»؛ A22: نیم‌فاصله و خوانایی).
 * این بررسی‌ها پیشنهاد اصلاح می‌دهند و متن مالک را خودکار عوض نمی‌کنند.
 */

export interface TypographyIssue {
  id: string;
  message_fa: string;
  excerpt: string;
}

const ZWNJ = '‌';

/** یکسان‌سازی بی‌خطر: حروف عربی «ي» و «ك» به فارسی، حذف نیم‌فاصلهٔ تکراری و فاصلهٔ انتهای سطر. */
export function normalizePersian(text: string): string {
  return text
    .replaceAll('ي', 'ی')
    .replaceAll('ك', 'ک')
    .replace(new RegExp(`${ZWNJ}{2,}`, 'g'), ZWNJ)
    .replace(/[ \t]+$/gm, '')
    .replace(/\r\n/g, '\n');
}

function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 12);
  return text.slice(start, Math.min(text.length, index + length + 12)).replace(/\s+/g, ' ').trim();
}

const RULES: readonly { id: string; pattern: RegExp; message_fa: string }[] = [
  {
    id: 'arabic_letters',
    pattern: /[يك]/g,
    message_fa: 'حرف عربی «ي» یا «ك» به‌جای «ی» و «ک» فارسی آمده است.',
  },
  {
    id: 'mi_prefix_space',
    pattern: /(^|[\s«(])ن?می [آ-ی]/gm,
    message_fa: 'پیشوند «می» باید با نیم‌فاصله به فعل بچسبد (مثل «می‌شود»).',
  },
  {
    id: 'ha_suffix_space',
    pattern: /[آ-ی] ها(ی|یی)?(?=$|[\s.،؛:!؟»)])/gm,
    message_fa: 'نشانهٔ جمع «ها» باید با نیم‌فاصله بیاید (مثل «کتاب‌ها»).',
  },
  {
    id: 'latin_punctuation',
    pattern: /[آ-ی][,;?]/g,
    message_fa: 'نشانه‌گذاری لاتین (, ; ?) در متن فارسی؛ از «،»، «؛» و «؟» استفاده کنید.',
  },
  {
    id: 'space_before_punctuation',
    pattern: / [،؛:.!؟](?=\s|$)/gm,
    message_fa: 'پیش از نشانه‌گذاری فاصله آمده است.',
  },
  {
    id: 'double_space',
    pattern: /[^\s] {2,}[^\s]/g,
    message_fa: 'دو فاصلهٔ پیاپی.',
  },
  // قاعده‌های زیر از linter نسخهٔ قبلی استودیو (voice-lint) منتقل شده‌اند.
  {
    id: 'kashida',
    pattern: /ـ/g,
    message_fa: 'کشیده (ـ) برای کش‌دادن کلمه به کار رفته است؛ آن را حذف کنید.',
  },
  {
    id: 'arabic_digits',
    pattern: /[٠-٩]/g,
    message_fa: 'رقم عربی (٠–٩) آمده است؛ از رقم فارسی (۰–۹) استفاده کنید.',
  },
  {
    id: 'straight_quotes',
    pattern: /[آ-ی]"|"[آ-ی]/g,
    message_fa: 'گیومهٔ لاتین (") در متن فارسی؛ از «گیومهٔ فارسی» استفاده کنید.',
  },
  {
    id: 'hashtag_zwnj',
    pattern: /#[^\s#]*‌/g,
    message_fa: 'نیم‌فاصله داخل هشتگ آن را می‌شکند؛ به‌جای آن از «_» استفاده کنید (مثل #کسب_و_کار).',
  },
  {
    id: 'bureaucratic_words',
    pattern: /(^|[\s«(])(می‌?\s?باشد|اینجانب|نمودن|نمایید|گردید)(?=$|[\s.،؛:!؟»)])/gm,
    message_fa: 'واژهٔ اداری؛ به‌جای «می‌باشد/نمودن/نمایید/گردید/اینجانب» بنویسید «است/کردن/کنید/شد/من».',
  },
];

/** فهرست ایرادهای نگارشی؛ از هر نوع فقط اولین نمونه گزارش می‌شود تا گزارش QA کوتاه بماند. */
export function findTypographyIssues(text: string): TypographyIssue[] {
  const issues: TypographyIssue[] = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    const match = rule.pattern.exec(text);
    if (match) {
      issues.push({
        id: rule.id,
        message_fa: rule.message_fa,
        excerpt: excerptAround(text, match.index, match[0].length),
      });
    }
  }
  return issues;
}

/** طول متن به نویسهٔ دیداری (grapheme)، نه واحد UTF-16. */
export function countGraphemes(text: string): number {
  let count = 0;
  for (const _ of new Intl.Segmenter('fa', { granularity: 'grapheme' }).segment(text)) count += 1;
  return count;
}

/** ارقام لاتین را فارسی می‌کند؛ برای عددهایی که در پیام‌های فارسی سرور می‌آیند. */
export function faDigits(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)] as string);
}

const jalaliDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** تاریخ تقویمی (YYYY-MM-DD) به شمسی خوانا، مثل «۲۳ آبان ۱۴۰۵»؛ برای متن‌هایی که سرور می‌سازد. */
export function faDate(isoDate: string): string {
  return jalaliDate.format(new Date(`${isoDate}T12:00:00Z`));
}

/** نشانهٔ «جای خالی اطلاعات مالک» در پیش‌نویس قالبی؛ QA وجود آن را خطا می‌گیرد. */
export const OWNER_INPUT_OPEN = '〔';
export const OWNER_INPUT_CLOSE = '〕';

export function ownerInputMarker(label: string): string {
  return `${OWNER_INPUT_OPEN}اطلاعات مالک لازم است: ${label}${OWNER_INPUT_CLOSE}`;
}

export function findOwnerInputMarkers(text: string): string[] {
  return [...text.matchAll(/〔([^〕]*)〕/g)].map((match) => match[1] as string);
}
