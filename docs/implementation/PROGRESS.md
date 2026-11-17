# وضعیت ساخت
وضعیت‌ها: not_started / in_progress / blocked_external / passed / failed.
آزمون‌هایی که با محیط fake اجرا شده‌اند با همین برچسب ثبت می‌شوند و گواه اتصال واقعی به هیچ سرویس بیرونی نیستند. skip هرگز pass حساب نمی‌شود.

| مرحله | وضعیت | تاریخ | commit | آزمون | محیط | شواهد و artifact | مانع / محدودیت |
|---|---|---|---|---|---|---|---|
| M0 تثبیت فرض‌ها، نسخه‌ها، قراردادها، مدل تهدید، مسیر رایگان، ثبت قابلیت‌ها | passed | 2026-11-11 | ثبت‌نشده (درخت کاری؛ commit با دستور مالک) | `node scripts/run-tests.ts --unit --only "tests/acceptance/m0-gate.test.ts"` → ۱۲ از ۱۲ موفق، صفر skip | Windows 11 x64، Node 26.4.0، بدون سرویس بیرونی | [M0.md](M0.md)، [evidence/M0/m0-gate.md](evidence/M0/m0-gate.md)، [DEPENDENCIES.md](DEPENDENCIES.md)، [ERD](../architecture/ERD.md)، [مدل تهدید](../architecture/THREAT-MODEL.md)، [ثبت قابلیت‌ها](../product/CAPABILITY-REGISTER.md) | هیچ حساب بیرونی آزموده نشده؛ همهٔ قابلیت‌های بیرونی غیر verified |
| M1 monorepo، ورود مالک، DB، چند برند پویا، چهار pack، UI فارسی، fake connector | passed | 2026-11-14 | fb34af8 | `node scripts/run-tests.ts` → ۱۵۴ از ۱۵۴ موفق، صفر skip؛ `pnpm typecheck` بدون خطا | Windows 11 x64، Node 26.4.0، PostgreSQL توکار، fake | [M1.md](M1.md)، [evidence/M1/full-run.txt](evidence/M1/full-run.txt) | بازبینی مرورگری کامل همهٔ صفحه‌ها و چند بهبود UI به M8 منتقل شد (M1.md) |
| M2 ActionIntent، approvals، budget/funding، outbox، worker، تقویم، pause و retry | passed | 2026-11-14 | (همین commit) | `node scripts/run-tests.ts` → ۱۶۸ از ۱۶۸ موفق (۱۳ آزمون پذیرش M2)، صفر skip؛ `pnpm build` موفق | همان؛ کانکتور fake | [M2.md](M2.md)، [evidence/M2/full-run.txt](evidence/M2/full-run.txt) | adapter واقعی وجود ندارد؛ UI بودجه و قواعد auto_scoped به بعد |
| M3 تولید متن، رندر تصویر/ویدئو، asset versioning و QA | in_progress | 2026-11-17 | M3.1: 054d3e2؛ M3.2: c25465d؛ M3.3: ثبت‌نشده (درخت کاری) | M3.1: `pnpm typecheck` بدون خطا؛ `pnpm test` → ۱۸۶ از ۱۸۶ موفق؛ `pnpm eval:text` روی برند واقعی → کاروسل فارسی با مدل رایگان، QA pass، هزینه ۰. M3.2: `pnpm typecheck` و `pnpm contracts:check` بدون خطا؛ `pnpm test` → ۲۰۹ از ۲۰۹ موفق، صفر skip ([evidence/M3/m3.2-full-run.txt](evidence/M3/m3.2-full-run.txt)). M3.3: `pnpm typecheck` بدون خطا؛ `pnpm test` → ۲۲۳ از ۲۲۳ موفق، صفر skip ([evidence/M3/m3.3-full-run.txt](evidence/M3/m3.3-full-run.txt))؛ رندر نمونهٔ برند واقعی بازبینی چشمی شد | Windows 11، Node 26.4.0، OpenRouter (مدل رایگان واقعی) + آزمون‌های خودکار با fetch ساختگی | ADR-030، `packages/ai/src/openrouter.ts`، ثبت قابلیت `ai/direct/free_api` | M3.1 تولید متن ✔. M3.2 دارایی و نسخه‌بندی ✔ (ADR-031، [M3.md](M3.md)؛ migration 0003 هنوز روی پایگاه دادهٔ محلی مالک اجرا نشده: `pnpm db:migrate`). M3.3 رندر تصویر ✔ (ADR-032؛ Chrome نصب‌شده؛ برای هویت بصری برند واقعی `pnpm brand:import` لازم است). باقی: M3.4 ویدئو (FFmpeg 9.0 نصب است)، M3.5 داشبورد، M3.6 پذیرش. اجرای تولید هنوز درون درخواست HTTP است و با مدل واقعی چند دقیقه طول می‌کشد |
| M4 Telegram مالک و CMS نمونه در staging | not_started | — | — | — | — | — | نیاز به token ربات و سایت staging مالک |
| M5 Instagram و LinkedIn publishing منتخب | not_started | — | — | — | — | — | نیاز به حساب و مجوز پلتفرم |
| M6 inbox، CRM، WhatsApp و MCP | not_started | — | — | — | — | — | وابسته به M4 |
| M7 سئو، گزارش، ویرگول، بستهٔ تبلیغات و Canva | not_started | — | — | — | — | — | وابسته به M5 و M6 |
| M8 سخت‌سازی، backup/restore، deployment و راهنمای کامل | not_started | — | — | — | — | — | وابسته به M7 |

## انتقال برند از v1 (2026-11-15)
- برند واقعی «حمیدرضا فلاحی | طراحی سایت» از `v1/` به `config/brands/hamidreza-falahi/brand.json` منتقل شد. ورود با `pnpm brand:import` انجام می‌شود (`packages/orchestration/src/brand-import.ts`، قرارداد `BrandSeed`).
- قاعده‌های نگارشی linter قبلی به `findTypographyIssues` اضافه شد: کشیده، رقم عربی، گیومهٔ لاتین، نیم‌فاصله در هشتگ و واژهٔ اداری.
- آزمون‌های تازه: `packages/orchestration/src/brand-import.test.ts`، `tests/integration/brand-import.test.ts` و یک مورد در `packages/domain/src/domain.test.ts`. نتیجه (اجرا توسط مالک در ترمینال، 2026-11-15): `pnpm typecheck` بدون خطا؛ `pnpm test` → **۱۷۲ از ۱۷۲ موفق**، صفر skip و صفر fail (۱۶۸ قبلی + ۴ تازه). محیط: Windows 11، Node 26.4.0، PostgreSQL توکار، کانکتور fake.
- آنچه منتقل نشد و دلیلش: [config/brands/hamidreza-falahi/README.md](../../config/brands/hamidreza-falahi/README.md).

## انتقال workspace به ریشهٔ مخزن (2026-11-15)
- v1 حذف شد (tag ‏`v1-final`) و محتوای پوشهٔ `v2` به ریشهٔ مخزن منتقل شد (ADR-029). `CLAUDE.md` و `.gitignore` با نسخهٔ ریشه ادغام شدند.

## تصمیم‌های باز (منتظر مالک؛ هیچ‌کدام ساخت را متوقف نکرده‌اند)
| موضوع | پیش‌فرض فعلی | زمان نیاز |
|---|---|---|
| محل استقرار نهایی (local یا server) | local ساخته می‌شود؛ server در M8 | پیش از استقرار |
| نشانی سایت و نوع CMS | بدون اتصال | پیش از M4 |
| token ربات تلگرام و جفت‌سازی مالک | بدون اتصال | M4 |
| استفاده از Zernio و انتخاب دو حساب سهمیهٔ رایگان | استفاده نمی‌شود | M5 |
| سقف بودجه و سیاست auto_scoped | free_only و draft_only (M2 ساخته شد؛ مقدار سقف و قاعده‌ها منتظر مالک) | پیش از M5 |
| تأیید مدت‌های نگهداری داده (۹۰/۳۰/۳۶۵ روز) | همین مقدارها | M8 |
| آزادکردن فضای درایو C دستگاه ساخت | دادهٔ اجرا روی D منتقل شد | هر زمان |
