# برند حمیدرضا فلاحی (منتقل‌شده از v1)
منبع: استودیوی قبلی (`v1/`، بازبینی ۲۰۲۶-۱۱-۰۹). این پوشه جای دانش برند v1 در استودیوی فعلی (v2، اکنون در ریشهٔ مخزن) است. v1 در 2026-11-15 حذف شد و نسخهٔ کاملش با tag ‏`v1-final` در git می‌ماند.

## چه چیزی کجا رفت
| در v1 | در v2 |
|---|---|
| `brand/brand-identity.md` (جایگاه، شعار، خدمات) | `brand.json` ← `identity`، `offers`، `pack_fields.services` |
| `strategy/audience-personas.md` (۴ پرسونا) | `brand.json` ← `audience.segments` (خلاصه) |
| `brand/voice-and-tone.md` | `brand.json` ← `voice.tone`، `voice.rules`، `voice.sample_texts` |
| `tools/voice-lint.config.json` (عبارت‌های ممنوع، شدت error) | `brand.json` ← `forbidden_claims` (۴۹ عبارت؛ «تضمین…» را بستهٔ web-services پوشش می‌دهد) |
| `tools/voice-lint.config.json` (عبارت‌های warning و قاعدهٔ کپشن) | `brand.json` ← `voice.rules` |
| `tools/voice-lint.mjs` (کشیده، رقم عربی، گیومه، نیم‌فاصله در هشتگ، واژهٔ اداری) | `packages/domain/src/persian.ts` ← `findTypographyIssues` (برای همهٔ برندها) |
| `tools/dates.mjs` (تاریخ جلالی) | پیش‌تر در v2 بود: `faDate` در `packages/domain/src/persian.ts` |
| `tools/content-hash.mjs` و `ops/approval-log.md` | پیش‌تر در v2 بود: تأیید وابسته به hash نسخه (ActionIntent/Approval، M2) |
| `strategy/content-strategy.md` (ترکیب ۳۰/۲۵/۲۰/۱۵/۱۰، شنبه/دوشنبه/چهارشنبه ۲۰:۳۰) | `brand.json` ← `cadence` و `goals.monthly_goal_fa` |
| `strategy/kpi-framework.md` | `brand.json` ← `goals.kpis` (شاخص‌های بستهٔ web-services) |

## نگاشت ستون‌ها
v1 پنج ستون داشت و بستهٔ web-services شش ستون دارد. الگوی هفته به این شکل نگاشت شد:

| روز | v1 | v2 |
|---|---|---|
| شنبه | کاروسل نمونه‌کار | `case_study` / carousel |
| یکشنبه | استوری | `service_intro` / story |
| دوشنبه | ریلز آموزشی | `common_mistakes` / reel |
| سه‌شنبه | استوری | `process` / story |
| چهارشنبه | کاروسل آموزشی | `customer_problem` / carousel |

«برند شخصی» (۱۰٪) در بستهٔ web-services ستون ندارد؛ تا تصمیم مالک فقط در `goals.monthly_goal_fa` ثبت است.

## عمداً منتقل نشد
- **دادهٔ شخصی:** `leads/pipeline.csv` و `inbox/triage/` در git نبودند (gitignore) و به مخزن v2 نمی‌آیند. اگر لازم‌اند، پیش از حذف v1 جداگانه بایگانی شوند.
- **شناسه‌های حساب Zernio و Canva** (`ops/mcp-inventory.md`): جای آن‌ها در اتصال‌های برند (M5) با secret_ref است، نه فایل برند.
- **پیش‌نویس‌ها** (`content/01-drafts`، `02-in-review`: IG-001 تا IG-004، IG-S01، IG-S02): v2 هنوز مسیر ورود محتوای دستی ندارد (M3). تا آن زمان در تاریخچهٔ git می‌مانند.
- **بانک موضوع، کتابخانهٔ CTA، بانک هشتگ، پلی‌بوک پاسخ، هویت بصری و Canva:** schema آن‌ها در v2 هنوز ساخته نشده (M3، M6 و M7). نسخهٔ کامل در تاریخچهٔ git می‌ماند.
- **فیلدهای تأییدنشده:** `stacks`، `process`، `meeting` و `portfolio` خالی‌اند، چون در v1 هم «[confirm]» بودند.

## پیش از حذف v1
یک tag بزنید تا همهٔ موارد بالا در تاریخچه قابل بازیابی بمانند، مثلاً `git tag v1-final`.
