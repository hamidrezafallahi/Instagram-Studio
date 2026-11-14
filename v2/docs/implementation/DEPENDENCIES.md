# فهرست وابستگی‌ها و نسخه‌های قفل‌شده
تاریخ بررسی: 2026-11-11 | منبع نسخه‌ها: registry.npmjs.org و nodejs.org/dist/index.json (در همان روز خوانده شد، نه از حافظه).
نسخهٔ دقیق هر بسته در `pnpm-workspace.yaml` (بخش catalog) و `pnpm-lock.yaml` قفل است.

## قاعدهٔ انتخاب نسخه
- فقط نسخه‌ای نصب می‌شود که دست‌کم ۷ روز از انتشارش گذشته باشد (`minimumReleaseAge: 10080`). به همین دلیل Next.js روی 16.4.5 قفل شد، نه 16.4.6 که دو روز پیش منتشر شده بود.
- اسکریپت نصب بسته‌ها به‌طور پیش‌فرض اجرا نمی‌شود. تنها استثنا بسته‌های باینری `@embedded-postgres/*` است که اسکریپت آن‌ها (`hydrate-symlinks.js`) خوانده و بی‌خطر تشخیص داده شد.
- `sharp` (وابستگی اختیاری Next برای بهینه‌سازی تصویر) نصب نمی‌شود چون داشبورد از آن استفاده نمی‌کند.

## ابزار اجرا
| ابزار | نسخه | وضعیت | مجوز | یادداشت |
|---|---|---|---|---|
| Node.js | خط 26 (LTS «Lithium»)؛ روی دستگاه ساخت 26.4.0 | آزموده | MIT | آخرین نسخهٔ خط در روز بررسی 26.13.0 بود؛ ارتقا توصیه می‌شود. `engines: >=26.4.0 <27` |
| pnpm | 11.9.0 | آزموده | MIT | workspace، catalog و سیاست زنجیرهٔ تأمین |
| PostgreSQL | 18.6 | آزموده (local) | PostgreSQL License | در local از باینری بستهٔ `embedded-postgres`؛ در server هر PostgreSQL 18 |
| FFmpeg | 9.0 (build کامل gyan.dev روی دستگاه ساخت) | فقط کشف شد | GPLv3 (build با `--enable-gpl --enable-version3`) | در M3 به‌صورت برنامهٔ بیرونی صدا زده می‌شود و در بسته توزیع نمی‌شود؛ پیش از توزیع، مجوز build بررسی شود |
| مرورگر | Edge 157 و Chrome 157 روی دستگاه ساخت | فقط کشف شد | — | برای رندر HTML به تصویر در M3 و آزمون UI |

## بسته‌های مستقیم
| بسته | نسخه | مجوز | کاربرد | محل استفاده |
|---|---|---|---|---|
| zod | 4.6.7 | MIT | منبع واحد قرارداد؛ تولید JSON Schema و OpenAPI | contracts، config |
| fastify | 5.12.8 | MIT | سرور API | apps/api |
| @fastify/cookie | 11.1.5 | MIT | کوکی نشست | apps/api |
| pg | 8.23.1 | MIT | اتصال PostgreSQL | data، infra |
| embedded-postgres | 18.6.0-beta.19 | MIT | باینری PostgreSQL 18.6 برای پروفایل local و آزمون‌ها | ریشه |
| next | 16.4.5 | MIT | داشبورد | apps/dashboard |
| react، react-dom | 19.3.1 | MIT | داشبورد | apps/dashboard |
| typescript | 7.0.2 | Apache-2.0 | فقط type-check (`tsc --noEmit`) | توسعه |
| @types/node | 26.6.6 | MIT | نوع‌ها | توسعه |
| @types/pg | 8.23.1 | MIT | نوع‌ها | توسعه |
| @types/react، @types/react-dom | 19.3.0 | MIT | نوع‌ها | توسعه |

## وابستگی‌های غیرمستقیم
۹۰ بسته روی win32-x64 نصب می‌شود (lockfile برای همهٔ سکوها ۱۲۴ بسته دارد). توزیع مجوز با `pnpm licenses list`:
MIT ۷۵ | ISC ۵ | Apache-2.0 ۴ | BSD-3-Clause ۴ | CC-BY-4.0 ۱ (دادهٔ caniuse-lite) | 0BSD ۱. هیچ مجوز copyleft در وابستگی‌های npm نیست.

## آنچه عمداً اضافه نشد
| گزینه | نسخهٔ بررسی‌شده | تصمیم | دلیل |
|---|---|---|---|
| pg-boss | 12.38.2 (MIT، Node ≥ 22.12) | فعلاً نه | صف M2 روی جدول خود استودیو با `FOR UPDATE SKIP LOCKED` ساخته می‌شود تا lease، dedupe و «بدون retry کور» دقیقاً مطابق سند worker باشد. pg-boss پشت همان port قابل جایگزینی است (ADR-015). |
| vitest / tsx | 5.1.0 / 4.23.15 | نه | Node 26 فایل TypeScript را مستقیم اجرا می‌کند و `node:test` کافی است. |
| Tailwind CSS | 4.3.5 | نه | CSS دست‌نویس با logical properties برای RTL ساده‌تر و بدون وابستگی است. |
| @electric-sql/pglite | 0.5.16 | نه | تک‌اتصالی است و آزمون هم‌زمانی و جداسازی API/worker را پوشش نمی‌دهد. |
| Docker | — | روی دستگاه ساخت نصب نیست | پروفایل local بدون آن کار می‌کند؛ compose پروفایل server در M8. |

## محدودیت‌های شناخته‌شده
- برچسب نسخهٔ `embedded-postgres` همیشه پسوند beta دارد؛ خود باینری PostgreSQL 18.6 پایدار است. برنامه فقط به یک `DATABASE_URL` استاندارد وابسته است و در server از PostgreSQL مستقل استفاده می‌کند.
- بستهٔ باینری توکار فقط `postgres`، `initdb` و `pg_ctl` دارد و `pg_dump`/`psql` ندارد. روش پشتیبان‌گیری پروفایل local در M8 تعیین می‌شود (کپی سرد پوشهٔ داده یا نصب ابزار کلاینت PostgreSQL).
- TypeScript 7 (کامپایلر بومی) API جاوااسکریپتی نسخه‌های قبل را ندارد؛ بررسی نوع داشبورد با `tsc` جدا انجام می‌شود، نه داخل `next build`.

## بازبینی
هر ارتقا: خواندن changelog، اجرای `pnpm test`، به‌روزرسانی این جدول و ثبت تاریخ. بازبینی دوره‌ای بعدی: 2026-12-11.
