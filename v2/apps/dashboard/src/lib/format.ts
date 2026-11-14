/**
 * نمایش فارسی: ارقام، تاریخ شمسی یا میلادی (به انتخاب مالک) و ساعت به وقت برند.
 * ذخیره همیشه UTC است؛ این‌جا فقط نمایش است.
 */

export type CalendarMode = 'persian' | 'gregory';

const numberFormat = new Intl.NumberFormat('fa-IR');

export function faNumber(value: number): string {
  return numberFormat.format(value);
}

/** ارقام لاتین یک رشته را فارسی می‌کند (برای ساعت و شمارهٔ نسخه). */
export function faDigits(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)] as string);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(calendar: CalendarMode, timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${calendar}|${timeZone}|${JSON.stringify(options)}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(`fa-IR-u-ca-${calendar}`, { timeZone, ...options });
    formatters.set(key, cached);
  }
  return cached;
}

/** تاریخ تقویمی (YYYY-MM-DD) بدون جابه‌جایی منطقهٔ زمانی. */
export function formatDay(
  isoDate: string,
  calendar: CalendarMode,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' },
): string {
  return formatter(calendar, 'UTC', options).format(new Date(`${isoDate}T12:00:00Z`));
}

export function formatDateTime(isoUtc: string, calendar: CalendarMode, timeZone: string): string {
  return formatter(calendar, timeZone, {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoUtc));
}

export function formatWeekRange(start: string, end: string, calendar: CalendarMode): string {
  return `${formatDay(start, calendar)} تا ${formatDay(end, calendar, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

/** تاریخ امروز (YYYY-MM-DD) به وقت یک منطقهٔ زمانی؛ «امروز» برند با ساعت دستگاه مالک یکی فرض نمی‌شود. */
export function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** جابه‌جایی تاریخ تقویمی به اندازهٔ چند روز. */
export function shiftDay(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const WEEKDAY_INDEX = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export type WeekdayName = (typeof WEEKDAY_INDEX)[number];

export function weekdayOf(isoDate: string): WeekdayName {
  return WEEKDAY_INDEX[new Date(`${isoDate}T12:00:00Z`).getUTCDay()] as WeekdayName;
}

/** تاریخ شروع هفته‌ای که این تاریخ در آن است (شروع هفته از تنظیمات برند). */
export function weekStartOf(isoDate: string, weekStart: WeekdayName): string {
  const current = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  const back = (current - WEEKDAY_INDEX.indexOf(weekStart) + 7) % 7;
  return shiftDay(isoDate, -back);
}

/** مقدار سنجه؛ null یعنی «در دسترس نیست» و هرگز صفر نمایش داده نمی‌شود. */
export function metricValue(value: number | null, unit: string): string {
  if (value === null) return 'در دسترس نیست';
  if (unit === 'percent') return `${faNumber(Math.round(value * 10) / 10)}٪`;
  return faNumber(Math.round(value));
}
