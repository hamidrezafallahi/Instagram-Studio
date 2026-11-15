# گزارش کار و وضعیت پیاده‌سازی (برای ادامهٔ کار)
تاریخ بررسی: 2026-11-14 — بررسی‌کننده: Claude (Opus 5.5) در Claude Code، بدون حضور مالک.
مرجع: [START-HERE.md](../../START-HERE.md)، [AGENTS.md](../../AGENTS.md)، [نقشهٔ مراحل](README.md)، [PROGRESS.md](PROGRESS.md).

## ۱. خلاصهٔ وضعیت هنگام شروع این نشست
| مرحله | وضعیت پیش از نشست | شواهد بررسی‌شده |
|---|---|---|
| M0 | passed | `m0-gate.test.ts` ۱۲ از ۱۲؛ DEPENDENCIES، ERD، THREAT-MODEL، CAPABILITY-REGISTER موجود |
| M1 | in_progress (همه‌چیز ساخته شده؛ اجرای دوبارهٔ آزمون و مستندات باقی) | در این نشست دوباره اجرا شد: `pnpm typecheck` بدون خطا؛ `node scripts/run-tests.ts` → **۱۵۴ از ۱۵۴ موفق، صفر skip** ([evidence/M1/full-run.txt](evidence/M1/full-run.txt)) |
| M2 | not_started | جدول‌ها فقط در ERD طراحی شده بودند؛ قراردادهای ActionIntent/Approval/FundingRequest و ماشین حالت action در کد موجود بود |
| M3 تا M8 | not_started | M4 به بعد به token تلگرام، سایت staging و حساب/مجوز پلتفرم وابسته است |

## ۲. آنچه پیش از این نشست ساخته شده بود (بررسی‌شده)
- monorepo با pnpm (ریشه = `v2`؛ از 2026-11-15 ریشهٔ خود مخزن، ADR-029)، Node 26 با type-stripping، TypeScript فقط برای typecheck، آزمون با `node:test`.
- PostgreSQL 18 توکار (`embedded-postgres`) با نقش‌های جدا، RLS روی همهٔ جدول‌های کسب‌وکار و FK مرکب ضد ارجاع بین برندها (`packages/data/migrations/0001_core.sql`).
- قراردادهای code-first با zod و تولید OpenAPI/JSON Schema (`packages/contracts`).
- ورود مالک با نشست HttpOnly و CSRF، چند برند پویا، پنج industry pack (چهار نمونه + generic)، سیاست اختیار نسخه‌دار، vault رمزها.
- کانکتور fake با سناریوهای خطا، گردش‌کارهای برنامهٔ هفته، تولید پیش‌نویس قالبی و جمع‌آوری سنجهٔ نمونه، گزارش هفتگی با N/A.
- داشبورد فارسی Next.js (RTL) با صفحه‌های برند، تقویم، استودیو، اتصال‌ها، گزارش و تنظیمات.

## ۳. کارهای این نشست
پیگیری دقیق در [PROGRESS.md](PROGRESS.md) ثبت می‌شود. برنامه:
1. بستن M1: اجرای دوبارهٔ کل آزمون‌ها، ذخیرهٔ مدرک، نوشتن [M1.md](M1.md).
2. ساخت M2: migration `0002_execution.sql` (action_intents، approvals، publications، budget_accounts، budget_reservations، usage_ledger، funding_requests، outbox_events، jobs، manual_tasks)، سرویس انتشار و تأیید، worker با lease، reconcile برای نتیجهٔ نامعلوم، pause و retry، مسیرهای API و آزمون پذیرش M2.
3. M3 تا M8: فقط بخش‌هایی که بدون دسترسی بیرونی و بدون اختراع API ممکن است؛ بقیه blocked_external با دلیل.

## ۴. محدودیت‌ها و موانع بیرونی (تغییرنکرده)
- هیچ حساب واقعی (Instagram، LinkedIn، Telegram، WordPress، Zernio) آزموده نشده است؛ همهٔ قابلیت‌های بیرونی غیر verified می‌مانند.
- M4: نیاز به token ربات تلگرام و جفت‌سازی مالک، و نشانی سایت staging/نوع CMS.
- M5: نیاز به حساب و مجوز پلتفرم؛ تا آن زمان export دستی مسیر رسمی است (ADR-019).
- تصمیم‌های باز مالک در جدول انتهای PROGRESS.md آمده‌اند؛ پیش‌فرض‌های امن (draft_only، free_only) حفظ شده‌اند.

## ۵. نتیجهٔ نهایی این نشست
| مرحله | وضعیت پایانی | مدرک |
|---|---|---|
| M0 | passed (بدون تغییر) | [M0.md](M0.md) |
| M1 | **passed** | [M1.md](M1.md)، ۱۵۴ از ۱۵۴ آزمون |
| M2 | **passed** (محیط fake) | [M2.md](M2.md)، ۱۶۸ از ۱۶۸ آزمون، ۱۳ آزمون پذیرش اختصاصی |
| M3 | not_started — آمادهٔ شروع | — |
| M4 تا M8 | not_started — M4 به بعد blocked_external تا دریافت دسترسی‌ها | جدول تصمیم‌های باز در PROGRESS.md |

### فایل‌های اصلی تغییرکرده در M2
- `packages/data/migrations/0002_execution.sql`، `packages/data/src/repos/execution.ts`
- `packages/orchestration/src/execution.ts`، `planning.ts`، `index.ts`
- `packages/contracts/src/api.ts`، `errors.ts` (SCHEDULE_EXPIRED)، `labels.ts`، OpenAPI و JSON Schema بازتولیدشده
- `packages/domain/src/state-machines.ts` (ماشین action، `findPath`)
- `apps/api/src/app.ts`، `apps/worker/` (تازه)، `infra/local/cli.ts`
- داشبورد: `components/publishing.tsx`، صفحهٔ `approvals`، صفحهٔ محتوا، منوی کناری
- آزمون: `tests/acceptance/m2-execution.test.ts`، `tests/support/harness.ts`، `packages/domain/src/domain.test.ts`
- اسناد: M1.md، M2.md، PROGRESS.md، DECISIONS.md (ADR-024 تا ADR-028)، apps/worker/README.md، tests/README.md

### فرض‌های گرفته‌شده بدون حضور مالک (قابل بازبینی)
- حالت اختیار پیش‌فرض همچنان `draft_only` و هزینه `free_only` است؛ چیزی به‌طور خودکار منتشر نمی‌شود.
- مهلت انتشار عقب‌مانده ۲ ساعت و اعتبار تأیید ۷ روز است (ADR-026، ADR-028).
- مسیر دستی در draft_only هم ساخته می‌شود چون انتشار را خود مالک انجام می‌دهد (ADR-027).
- migration `0002_execution` روی پایگاه دادهٔ محلی دستگاه ساخت هم اعمال شد (رو به جلو، بدون حذف داده).

### کارهای باقی‌مانده (به ترتیب پیشنهادی)
1. **M3** (بدون مانع بیرونی برای بخش محلی): رندر قالب HTML/SVG محلی، جدول‌های assets/asset_versions با checksum، اتصال درگاه مدل به provider محلی؛ نصب FFmpeg برای ویدئو تصمیم مالک است.
2. بازبینی مرورگری کامل داشبورد (به‌ویژه صفحهٔ تازهٔ «تأییدها و صف انتشار»).
3. UI بودجه و ویرایش قاعده‌های auto_scoped.
4. **M4**: نیاز به token ربات تلگرام و سایت staging مالک. **M5**: نیاز به حساب و مجوز Instagram/LinkedIn.
5. M6 تا M8 طبق نقشه پس از M4/M5.

### Git
همهٔ کار روی شاخهٔ `master` commit و به `origin/master` push شد. شاخهٔ دیگری (محلی یا remote) وجود نداشت که حذف شود.
