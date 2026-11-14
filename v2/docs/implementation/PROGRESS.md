# وضعیت ساخت
وضعیت‌ها: not_started / in_progress / blocked_external / passed / failed.
آزمون‌هایی که با محیط fake اجرا شده‌اند با همین برچسب ثبت می‌شوند و گواه اتصال واقعی به هیچ سرویس بیرونی نیستند. skip هرگز pass حساب نمی‌شود.

| مرحله | وضعیت | تاریخ | commit | آزمون | محیط | شواهد و artifact | مانع / محدودیت |
|---|---|---|---|---|---|---|---|
| M0 تثبیت فرض‌ها، نسخه‌ها، قراردادها، مدل تهدید، مسیر رایگان، ثبت قابلیت‌ها | passed | 2026-11-11 | ثبت‌نشده (درخت کاری؛ commit با دستور مالک) | `node scripts/run-tests.ts --unit --only "tests/acceptance/m0-gate.test.ts"` → ۱۲ از ۱۲ موفق، صفر skip | Windows 11 x64، Node 26.4.0، بدون سرویس بیرونی | [M0.md](M0.md)، [evidence/M0/m0-gate.md](evidence/M0/m0-gate.md)، [DEPENDENCIES.md](DEPENDENCIES.md)، [ERD](../architecture/ERD.md)، [مدل تهدید](../architecture/THREAT-MODEL.md)، [ثبت قابلیت‌ها](../product/CAPABILITY-REGISTER.md) | هیچ حساب بیرونی آزموده نشده؛ همهٔ قابلیت‌های بیرونی غیر verified |
| M1 monorepo، ورود مالک، DB، چند برند پویا، چهار pack، UI فارسی، fake connector | in_progress | 2026-11-14 | ثبت‌نشده (درخت کاری) | آخرین اجراها (محیط fake، PostgreSQL واقعی توکار): unit ۸۳ از ۸۳، integration ۱۵ از ۱۵، acceptance ۵۶ از ۵۶ (شامل A01، A02 تا پیش از انتشار، A03، A07)؛ صفر skip. **پس از آن اجراها این تغییرها اعمال شد و مجموعهٔ کامل هنوز دوباره اجرا نشده است:** پیام‌های اعتبارسنجی فارسی zod، logController در API، مسیر export در OpenAPI، پروکسی زمان‌اجرای داشبورد | Windows 11 x64، Node 26.4.0 | سرور: `pnpm typecheck` بدون خطا. داشبورد: `next build` موفق (۱۶ مسیر). بازبینی دستی در مرورگر روی نمونهٔ موقت: راه‌اندازی مالک، ساخت چهار برند نمونه، ساخت برنامهٔ هفته (دوبار کلیک = یک درخواست)، تولید ۸ پیش‌نویس و فهرست استودیو دیده شد | **باقی‌مانده تا passed:** اجرای دوبارهٔ کل آزمون‌ها و ذخیرهٔ مدرک در evidence/M1؛ بازبینی مرورگری صفحه‌های ویرایش محتوا، تقویم، اتصال‌ها، گزارش، تنظیمات و راه‌اندازی برند؛ ارقام فارسی در پیام‌های سرور؛ نمایش دلیل دکمهٔ غیرفعال؛ نوشتن M1.md و به‌روزرسانی راهنمای اجرا، tests/README و READMEهای هر پوشه؛ بازبینی وضعیت‌های THREAT-MODEL |
| M2 ActionIntent، approvals، budget/funding، outbox، worker، تقویم، pause و retry | not_started | — | — | — | — | — | وابسته به M1 |
| M3 تولید متن، رندر تصویر/ویدئو، asset versioning و QA | not_started | — | — | — | — | — | وابسته به M2 |
| M4 Telegram مالک و CMS نمونه در staging | not_started | — | — | — | — | — | نیاز به token ربات و سایت staging مالک |
| M5 Instagram و LinkedIn publishing منتخب | not_started | — | — | — | — | — | نیاز به حساب و مجوز پلتفرم |
| M6 inbox، CRM، WhatsApp و MCP | not_started | — | — | — | — | — | وابسته به M4 |
| M7 سئو، گزارش، ویرگول، بستهٔ تبلیغات و Canva | not_started | — | — | — | — | — | وابسته به M5 و M6 |
| M8 سخت‌سازی، backup/restore، deployment و راهنمای کامل | not_started | — | — | — | — | — | وابسته به M7 |

## تصمیم‌های باز (منتظر مالک؛ هیچ‌کدام ساخت را متوقف نکرده‌اند)
| موضوع | پیش‌فرض فعلی | زمان نیاز |
|---|---|---|
| محل استقرار نهایی (local یا server) | local ساخته می‌شود؛ server در M8 | پیش از استقرار |
| نشانی سایت و نوع CMS | بدون اتصال | پیش از M4 |
| token ربات تلگرام و جفت‌سازی مالک | بدون اتصال | M4 |
| استفاده از Zernio و انتخاب دو حساب سهمیهٔ رایگان | استفاده نمی‌شود | M5 |
| سقف بودجه و سیاست auto_scoped | free_only و draft_only | M2 |
| تأیید مدت‌های نگهداری داده (۹۰/۳۰/۳۶۵ روز) | همین مقدارها | M8 |
| آزادکردن فضای درایو C دستگاه ساخت | دادهٔ اجرا روی D منتقل شد | هر زمان |
