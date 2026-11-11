#!/usr/bin/env node
// Print a run of days with Gregorian date, Jalali (Solar Hijri) date and Persian weekday,
// in Asia/Tehran. Used by the content-calendar skill so dates are computed, never guessed.
// Usage: node tools/dates.mjs <start YYYY-MM-DD> [days=28]
//        node tools/dates.mjs 2026-11-21 28
const [start = new Date().toISOString().slice(0, 10), daysArg = '28'] = process.argv.slice(2);
const days = Number(daysArg);
const base = Date.parse(`${start}T12:00:00Z`);
if (Number.isNaN(base) || !Number.isInteger(days) || days < 1 || days > 400) {
  console.error('Usage: node tools/dates.mjs <YYYY-MM-DD> [days 1-400]');
  process.exit(1);
}
const tz = 'Asia/Tehran';
const jalaliNum = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
const jalaliLong = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const greg = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: '2-digit', month: 'short' });

console.log('Gregorian  | Day          | Jalali     | تاریخ شمسی');
console.log('-----------|--------------|------------|-------------------------');
for (let i = 0; i < days; i += 1) {
  const t = base + i * 86_400_000;
  const iso = new Date(t).toISOString().slice(0, 10);
  console.log(`${iso} | ${greg.format(t).padEnd(12)} | ${jalaliNum.format(t)} | ${jalaliLong.format(t)}`);
}
