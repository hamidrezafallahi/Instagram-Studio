# تصمیم‌های معماری
| شناسه | تصمیم | دلیل و پیامد |
|---|---|---|
| ADR-001 | Modular monolith با worker جدا | نگهداری ساده؛ تفکیک سرویس فقط با گلوگاه واقعی |
| ADR-002 | PostgreSQL برای state، outbox و صف | کاهش زیرساخت؛ ایجاد outbox همراه تغییر دامنه در یک transaction |
| ADR-003 | Policy مستقل از LLM | مدل تصمیم اجرایی نهایی دربارهٔ دسترسی ندارد |
| ADR-004 | قرارداد capability per account | مجوزها میان حساب‌ها و زمان‌ها یکسان نیست |
| ADR-005 | تأیید وابسته به hash و نسخه | محتوای ویرایش‌شده با تأیید قبلی ارسال نشود |
| ADR-006 | WordPress-first؛ CMS port | نوع سایت مالک هنوز معلوم نیست |
| ADR-007 | manual handoff معتبر | نبود API به معنی ساخت API خیالی یا پنهان‌کردن محدودیت نیست |
| ADR-008 | MCP façade روی همان service layer | جلوگیری از دو هسته و اختلاف مجوز |
| ADR-009 | دارایی‌ها خارج از DB | نسخه و checksum در DB، فایل در storage |
| ADR-010 | رسانهٔ محلی به‌عنوان fallback | وابستگی به Canva یا سرویس پولی مانع تولید اولیه نباشد |

ADR-011: چندبرندی پویا از نسخهٔ اول، بنا بر توضیح مالک؛ چهار industry pack داده‌ای و برند پنجم بدون کدنویسی.
ADR-012: free_only پیش‌فرض، Zernio اختیاری و درخواست پرداخت/شارژ برای هزینهٔ لازم؛ برنامه به واسط پولی وابسته نیست.

هر تغییر: وضعیت proposed/accepted/superseded، تاریخ، گزینه‌های ردشده، اثر migration و شواهد ثبت شود.

## تصمیم‌های مرحلهٔ ساخت (M0 — 2026-11-11)
ADR-001 تا ADR-012 بالا وضعیت accepted دارند و بدون تغییر اجرا می‌شوند. تصمیم‌های زیر در زمان ساخت و با بررسی واقعی دستگاه و registry گرفته شده‌اند.

| شناسه | وضعیت | تصمیم | گزینه‌های ردشده | اثر migration | شواهد |
|---|---|---|---|---|---|
| ADR-013 | accepted | پوشهٔ `v2` ریشهٔ pnpm workspace است. Node 26 LTS، TypeScript 7 فقط برای type-check، اجرای مستقیم فایل‌های `.ts` با type-stripping بومی Node، آزمون با `node:test`. بسته‌های داخلی مستقیماً `src/index.ts` را export می‌کنند و مرحلهٔ build ندارند. | tsx/ts-node، vitest، build جدا برای هر بسته | ندارد | `pnpm typecheck`، `pnpm test`، DEPENDENCIES.md |
| ADR-014 | accepted | قرارداد code-first: schemaهای zod در `packages/contracts` منبع واحدند؛ JSON Schema و OpenAPI 3.1 از همان‌ها تولید می‌شود و API همان جدول مسیر را ثبت می‌کند. آزمون M0 ناهم‌خوانی فایل تولیدی با منبع را رد می‌کند. | OpenAPI دست‌نویس؛ تولید از decorator | ندارد | `pnpm contracts:check` |
| ADR-015 | accepted (اجرا در M2) | صف پایدار روی جدول‌های خود استودیو (`outbox_events`، `jobs`، lease با `FOR UPDATE SKIP LOCKED`) ساخته می‌شود. | pg-boss 12.38.2: بررسی شد و سالم است، اما retry خودکار و schema جدای آن با قاعدهٔ «بدون retry کور برای side effect نامعلوم» و جدول‌های سند داده هم‌راستا نیست. پشت port صف قابل جایگزینی می‌ماند. | جدول‌های صف در migration مرحلهٔ M2 | — |
| ADR-016 | accepted | پروفایل local بدون Docker: PostgreSQL 18.6 از باینری `embedded-postgres` با `pg_ctl` مستقل از API و worker اجرا می‌شود. پروفایل server به هر PostgreSQL 18 با `STUDIO_DATABASE_URL` وصل می‌شود. | نصب PostgreSQL با installer (نیاز به دسترسی مدیر و فضای زیاد)، PGlite (تک‌اتصالی)، Docker Desktop (نصب نیست و مجوز آن برای هر استفاده رایگان نیست) | ندارد | `pnpm db:start`، infra/README.md |
| ADR-017 | accepted | جداسازی در خود پایگاه داده: نقش برنامه `studio_app` (غیرمالک، بدون BYPASSRLS) و نقش migration `studio_migrator`. هر تراکنش `app.workspace_id` و در مسیرهای برند `app.brand_id` را تنظیم می‌کند و RLS بر پایهٔ آن‌ها فیلتر می‌کند؛ FK مرکب جلوی ارجاع بین برندها را می‌گیرد. جدول‌های هویت RLS ندارند. | فقط فیلتر در کد برنامه | `0001_core.sql` | tests/integration/isolation.test.ts |
| ADR-018 | accepted | دادهٔ اجرا خارج از مخزن در `STUDIO_HOME` است: کلید اصلی vault، رمزهای محلی پایگاه داده، دادهٔ PostgreSQL و دارایی‌ها. پیش‌فرض ویندوز `%LOCALAPPDATA%\ContentStudio`؛ با `STUDIO_HOME` در `.env.local` قابل تغییر است. | نگهداری داخل پوشهٔ پروژه (خطر commit یا zip شدن کلید همراه پروژه) | ندارد | packages/security/src/vault.ts |
| ADR-019 | accepted | مسیر رایگان پیش‌فرض: انتشار با API رسمی مستقیم فقط پس از اثبات روی حساب؛ تا آن زمان export دستی مسیر دائمی است. Zernio مسیر اختیاری به‌ازای هر حساب (سهمیهٔ رایگان دو حساب برای کل مالک). Postiz تا زمانی که مسیر مستقیم مسدود نشده ارزیابی نصب نمی‌شود. Canva اختیاری. رسانه با قالب محلی. | وابستگی هسته به واسط پولی | ندارد | config/capability-register.json |
| ADR-020 | accepted | تولید بدون هزینه در M1 با provider «قالبی» محلی و deterministic انجام می‌شود که فقط از دادهٔ ثبت‌شدهٔ برند استفاده می‌کند و جای خالی اطلاعات را علامت می‌زند. همان رابط درگاه مدل در M3 مدل محلی و در M6 هارنس را می‌پذیرد. fallback پولی خودکار وجود ندارد. | فراخوانی API پولی؛ ساخت متن با اطلاعات حدسی | ندارد | packages/ai، agents |
| ADR-021 | accepted | سرویس‌های کاربردی (use case) در `packages/orchestration` هستند و `packages/domain` خالص می‌ماند (ماشین حالت، هش، زمان، آمادگی برند). داشبورد، و بعداً MCP و پیام‌رسان، همه از همین سرویس‌ها و همین PolicyEngine عبور می‌کنند. | منطق در route handler | ندارد | — |
| ADR-022 | accepted (موقت تا M2) | در M1 اجرای run در همان فرایند API و بلافاصله پس از ثبت پایدار انجام می‌شود (تولید قالبی چند میلی‌ثانیه طول می‌کشد). وضعیت هر گام در پایگاه داده ثبت می‌شود. در M2 همان executor از طریق outbox و worker جدا صدا زده می‌شود. | ساخت کامل worker در M1 (خارج از دامنهٔ M1 در نقشهٔ اجرا) | ندارد | docs/implementation/M1.md |
| ADR-023 | accepted | داشبورد فقط با مبدأ خودش حرف می‌زند: Next مسیر `/api/*` را به API پروکسی می‌کند. مرورگر هیچ رازی نگه نمی‌دارد و کوکی نشست HttpOnly است. | CORS مستقیم مرورگر به API | ندارد | apps/dashboard/next.config.ts |
