import { StudioError, type Weekday } from '@studio/contracts';

/**
 * زمان و تقویم. ذخیره همیشه UTC است؛ منطقهٔ زمانی IANA فقط برای تبدیل ورودی و نمایش به کار می‌رود.
 * از Temporal داخلی Node استفاده می‌شود تا تغییر قواعد منطقهٔ زمانی درست اعمال شود.
 */

// ترتیب ISO: دوشنبه=۱ … یکشنبه=۷.
const ISO_WEEKDAYS: readonly Weekday[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
];

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function assertTimezone(timezone: string): void {
  if (!isValidTimezone(timezone)) {
    throw new StudioError('VALIDATION_FAILED', { message_fa: `منطقهٔ زمانی «${timezone}» شناخته‌شده نیست.` });
  }
}

function plainDate(date: string): Temporal.PlainDate {
  try {
    return Temporal.PlainDate.from(date);
  } catch {
    throw new StudioError('VALIDATION_FAILED', { message_fa: `تاریخ «${date}» نامعتبر است.` });
  }
}

export function weekdayOf(date: string): Weekday {
  return ISO_WEEKDAYS[plainDate(date).dayOfWeek - 1] as Weekday;
}

export function addDays(date: string, days: number): string {
  return plainDate(date).add({ days }).toString();
}

/** تاریخ امروز به وقت یک منطقهٔ زمانی. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  assertTimezone(timezone);
  return Temporal.Instant.fromEpochMilliseconds(now.getTime())
    .toZonedDateTimeISO(timezone)
    .toPlainDate()
    .toString();
}

/** تاریخ شروع هفته‌ای که date در آن است (پیش‌فرض برند: شنبه). */
export function weekStartOf(date: string, weekStart: Weekday): string {
  const current = plainDate(date);
  const startIndex = ISO_WEEKDAYS.indexOf(weekStart) + 1;
  const back = (current.dayOfWeek - startIndex + 7) % 7;
  return current.subtract({ days: back }).toString();
}

/** تاریخ یک روز هفته درون هفته‌ای که از weekStartDate شروع می‌شود. */
export function dateOfWeekday(weekStartDate: string, weekday: Weekday): string {
  const start = plainDate(weekStartDate);
  const offset = (ISO_WEEKDAYS.indexOf(weekday) + 1 - start.dayOfWeek + 7) % 7;
  return start.add({ days: offset }).toString();
}

/** تاریخ و ساعت محلی برند → لحظهٔ UTC در قالب RFC3339. */
export function localToUtc(localDate: string, localTime: string, timezone: string): string {
  assertTimezone(timezone);
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(localTime);
  if (!match) throw new StudioError('VALIDATION_FAILED', { message_fa: `ساعت «${localTime}» نامعتبر است.` });
  const zoned = plainDate(localDate).toZonedDateTime({
    timeZone: timezone,
    plainTime: new Temporal.PlainTime(Number(match[1]), Number(match[2])),
  });
  return new Date(zoned.epochMilliseconds).toISOString();
}

/** لحظهٔ UTC → تاریخ و ساعت محلی یک منطقهٔ زمانی. */
export function utcToLocal(utc: string, timezone: string): { date: string; time: string } {
  assertTimezone(timezone);
  const zoned = Temporal.Instant.from(utc).toZonedDateTimeISO(timezone);
  return {
    date: zoned.toPlainDate().toString(),
    time: `${String(zoned.hour).padStart(2, '0')}:${String(zoned.minute).padStart(2, '0')}`,
  };
}

/** بازهٔ UTC یک هفتهٔ محلی: از ابتدای روز شروع تا ابتدای روز هشتم. */
export function weekBoundsUtc(weekStartDate: string, timezone: string): { start: string; end: string } {
  return {
    start: localToUtc(weekStartDate, '00:00', timezone),
    end: localToUtc(addDays(weekStartDate, 7), '00:00', timezone),
  };
}
