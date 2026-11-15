# ثبت قابلیت‌ها (Capability Register)

این فایل از `config/capability-register.json` تولید می‌شود؛ دستی ویرایش نکنید (`node config/scripts/render-capability-register.ts`).
تاریخ بررسی منابع: 2026-11-11 | منبع: docs/product/CAPABILITIES.md + docs/research/README.md (S01–S21)

مدرک سند (doc) و مدرک حساب (account) جدا هستند: پشتیبانی در سند به معنی آزمون روی حساب مالک نیست. تا وقتی آزمون واقعی حساب با رسید ثبت نشده، هیچ قابلیت بیرونی `verified` نمی‌شود و در داشبورد علامت سبز نمی‌گیرد.

## خلاصهٔ وضعیت

| وضعیت | تعداد |
|---|---|
| unverified (اثبات‌نشده) | 22 |
| needs_access (نیاز به دسترسی) | 16 |
| manual_only (فقط دستی) | 10 |
| unsupported (پشتیبانی نمی‌شود) | 1 |

## instagram

| قابلیت | مسیر | وضعیت | دلیل | سند | حساب | هزینه | جایگزین | مرحله |
|---|---|---|---|---|---|---|---|---|
| انتشار پست تکی اینستاگرام (`feed_publish`) | direct | unverified | DOC_UNREADABLE_AT_RESEARCH | unknown (S02) | not_run | unknown | بستهٔ دستی: تصویر و متن آماده برای انتشار مالک و ثبت URL نتیجه | M5 |
| انتشار کاروسل اینستاگرام (`carousel_publish`) | direct | unverified | DOC_UNREADABLE_AT_RESEARCH | unknown (S02) | not_run | unknown | بستهٔ دستی: اسلایدها و متن آماده برای انتشار مالک | M5 |
| انتشار ریلز اینستاگرام (`reel_publish`) | direct | unverified | DOC_UNREADABLE_AT_RESEARCH | unknown (S02) | not_run | unknown | بستهٔ دستی: ویدئو، کاور و متن آماده برای انتشار مالک | M5 |
| انتشار استوری اینستاگرام (`story_publish`) | direct | unverified | PER_ACCOUNT_CAPABILITY | unknown (S02) | not_run | unknown | بستهٔ استوری برای انتشار دستی مالک | M5 |
| انتشار ریلز تریال (`trial_reel_publish`) | direct | manual_only | API_NOT_PROVEN | unknown (S03) | not_run | unknown | ویدئو، کاور، متن و راهنمای انتشار تریال به‌صورت کار دستی | M5 |
| پاسخ به کامنت زیر رسانهٔ خود (`own_comment_reply`) | direct | unverified | SCOPE_NOT_CONFIRMED | unknown (S02) | not_run | unknown | پیش‌نویس پاسخ برای ارسال مالک | M6 |
| کامنت زیر پست دیگران (`third_party_comment`) | direct | manual_only | NOT_GENERALLY_PERMITTED | unknown (بدون منبع) | not_run | unknown | فرصت‌یابی، پیش‌نویس اختصاصی و ارسال دستی مالک | M6 |
| خواندن دایرکت اینستاگرام (`dm_read`) | direct | unverified | SCOPE_NOT_CONFIRMED | unknown (S02) | not_run | unknown | ورود دستی پیام در صندوق و پاسخ پیشنهادی | M6 |
| پاسخ به دایرکت اینستاگرام (`dm_reply`) | direct | unverified | WINDOW_AND_SCOPE_NOT_CONFIRMED | unknown (S02) | not_run | unknown | handoff به مالک با پیش‌نویس پاسخ | M6 |
| خواندن سنجه‌های اینستاگرام (`metrics_read`) | direct | unverified | SCOPE_NOT_CONFIRMED | unknown (S02) | not_run | unknown | ورود دستی سنجه یا import فایل؛ مقدار نامعلوم N/A می‌ماند | M5 |
| انتشار پست اینستاگرام از مسیر Zernio (`feed_publish`) | zernio | needs_access | OPTIONAL_ROUTE_NOT_CONNECTED | yes (S13، S14) | not_run | free_quota | مسیر مستقیم پس از اثبات، یا بستهٔ دستی | M5 |
| انتشار استوری از مسیر Zernio (`story_publish`) | zernio | needs_access | OPTIONAL_ROUTE_NOT_CONNECTED | yes (S14) | not_run | free_quota | بستهٔ استوری دستی | M5 |
| انتشار ریلز از مسیر Zernio (`reel_publish`) | zernio | needs_access | OPTIONAL_ROUTE_NOT_CONNECTED | yes (S14) | not_run | free_quota | بستهٔ ریلز دستی | M5 |
| ریلز تریال از مسیر Zernio (`trial_reel_publish`) | zernio | manual_only | API_NOT_PROVEN | unknown (S14) | not_run | unknown | راهنمای انتشار تریال دستی | M5 |

عدم قطعیت‌ها:
- `direct/feed_publish`: صفحهٔ Content Publishing متا در بررسی 2026-11-11 پاسخ 429 داد. نوع حساب (Professional)، روش ورود و نام دقیق scopeها باید از سند جاری خوانده و روی حساب آزمایشی آزموده شود.
- `direct/carousel_publish`: همان محدودیت سند S02؛ تعداد و مشخصات مجاز اسلاید باید از capability حساب خوانده شود.
- `direct/reel_publish`: همان محدودیت سند S02؛ مشخصات ویدئو و سهمیهٔ انتشار پویاست و باید در زمان اتصال خوانده شود.
- `direct/story_publish`: استوری قابلیت جدا به‌ازای هر حساب و روش ورود است؛ بدون آزمون حساب هیچ فرضی نمی‌شود. استیکر، موسیقی و collab هر کدام قابلیت جدا هستند.
- `direct/trial_reel_publish`: منبع S03 فقط وجود قابلیت در اپ را نشان می‌دهد و مدرک پشتیبانی API نیست. تا اثبات endpoint و حساب، خودکار نمی‌شود.
- `direct/own_comment_reply`: scope و هدف مجاز باید روی حساب مقصد تأیید شود؛ مجوز پاسخ روی رسانهٔ خود، مجوز عمومی نیست.
- `direct/third_party_comment`: مجوز عمومی برای کامنت روی پست دلخواه دیگران فرض نمی‌شود و فقط با اثبات موردی قابل تغییر است.
- `direct/dm_read`: webhook معتبر، محدودیت پیام‌رسانی جاری و رضایت کاربر باید روی حساب آزموده شود.
- `direct/dm_reply`: پنجرهٔ مجاز پاسخ، مجوز و رضایت جاری نامعلوم است. دایرکت سرد انبوه هرگز فعال نمی‌شود.
- `direct/metrics_read`: نام و تعریف سنجه‌های در دسترس به نوع حساب و نسخهٔ API بستگی دارد.
- `zernio/feed_publish`: مسیر اختیاری است و مالک اصراری به آن ندارد. سهمیهٔ رایگان دو حساب متصل برای کل مالک است، نه هر برند.
- `zernio/story_publish`: قابلیت به روش اتصال حساب در Zernio بستگی دارد و باید روی حساب آزموده شود.
- `zernio/reel_publish`: پاسخ accepted واسط به معنی انتشار نیست؛ وضعیت نهایی باید readback شود.
- `zernio/trial_reel_publish`: در سند S14 مدرک کافی برای Trial پیدا نشد.

## linkedin

| قابلیت | مسیر | وضعیت | دلیل | سند | حساب | هزینه | جایگزین | مرحله |
|---|---|---|---|---|---|---|---|---|
| انتشار پست لینکدین (متن، تصویر، ویدئو، سند) (`post_publish`) | direct | needs_access | NO_ACCOUNT_TEST | yes (S04) | not_run | unknown | متن و رسانهٔ آماده برای انتشار دستی | M5 |
| ارسال پیام خصوصی لینکدین (`dm_send`) | direct | manual_only | RESTRICTED_API | partial (S05) | not_run | unknown | پاسخ پیشنهادی و یادآوری پیگیری؛ ارسال توسط مالک | M6 |
| ارسال دعوت ارتباط لینکدین (`invite_send`) | direct | manual_only | NOT_DEFAULT_CAPABILITY | unknown (بدون منبع) | not_run | unknown | فهرست پیشنهادی افراد و متن معرفی برای اقدام دستی مالک | M6 |
| پاسخ به کامنت لینکدین (`comment_reply`) | direct | unverified | ROUTE_AND_ACCOUNT_DEPENDENT | unknown (S04) | not_run | unknown | پیش‌نویس پاسخ برای ارسال مالک | M6 |
| خواندن سنجه‌های لینکدین (`metrics_read`) | direct | unverified | ROUTE_AND_ACCOUNT_DEPENDENT | unknown (S04) | not_run | unknown | ورود دستی سنجه؛ مقدار نامعلوم N/A می‌ماند | M5 |
| انتشار پست لینکدین از مسیر Zernio (`post_publish`) | zernio | unverified | DOC_NOTE_INCOMPLETE | unknown (S15) | not_run | free_quota | مسیر مستقیم یا انتشار دستی | M5 |
| پیام خصوصی لینکدین از مسیر Zernio (`dm_send`) | zernio | unsupported | PROVIDER_DOC_UNSUPPORTED | no (S15) | not_run | unknown | ارسال دستی مالک با پیش‌نویس | M6 |

عدم قطعیت‌ها:
- `direct/post_publish`: حساب شخصی و صفحهٔ سازمانی مجوز و URN جدا دارند. نسخهٔ API باید در تنظیمات قفل و تاریخ انقضای آن پایش شود.
- `direct/dm_send`: سند Messages دسترسی محدود و نیاز به اقدام صریح عضو را بیان می‌کند؛ پیام خودکار عمومی تعهد نمی‌شود.
- `direct/invite_send`: ارسال خودکار دعوت و scraping انبوه پروفایل قابلیت پیش‌فرض نیست و مدرکی برای مسیر مجاز آن در دست نیست.
- `direct/comment_reply`: به route و نوع حساب بستگی دارد و هنوز آزموده نشده است.
- `direct/metrics_read`: دسترسی analytics به نوع حساب و مجوز بستگی دارد.
- `zernio/post_publish`: یادداشت پژوهش دربارهٔ S15 فقط نبود DM و محدودیت کامنت را ثبت کرده است؛ جزئیات انتشار باید دوباره خوانده شود.
- `zernio/dm_send`: Zernio پیام خصوصی لینکدین را پشتیبانی‌نشده اعلام کرده است.

## telegram

| قابلیت | مسیر | وضعیت | دلیل | سند | حساب | هزینه | جایگزین | مرحله |
|---|---|---|---|---|---|---|---|---|
| کنترل مالک با ربات تلگرام (`owner_control`) | direct | needs_access | NO_BOT_TOKEN | yes (S06) | not_run | free | داشبورد | M4 |

عدم قطعیت‌ها:
- `direct/owner_control`: به token ربات و جفت‌سازی هویت مالک نیاز دارد. دسترسی شبکه به تلگرام روی دستگاه و سرور مالک باید آزموده شود.

## whatsapp

| قابلیت | مسیر | وضعیت | دلیل | سند | حساب | هزینه | جایگزین | مرحله |
|---|---|---|---|---|---|---|---|---|
| کنترل مالک با واتساپ (`owner_control`) | direct | needs_access | NO_BUSINESS_ACCOUNT | partial (S07) | not_run | unknown | تلگرام یا داشبورد | M6 |
| پاسخ به مشتری در واتساپ (`customer_reply`) | direct | unverified | WINDOW_AND_COST_NOT_CONFIRMED | partial (S07) | not_run | unknown | handoff به مالک | M6 |

عدم قطعیت‌ها:
- `direct/owner_control`: منبع S07 صفحهٔ تعرفه است: پنجرهٔ خدمت و هزینه به دسته و بازار بستگی دارد. حساب شخصی به‌طور خودکار Cloud API ندارد و رایگان‌بودن فرض نمی‌شود.
- `direct/customer_reply`: خارج از پنجرهٔ خدمت فقط template تأییدشده مجاز است و هزینهٔ هر پیام باید پیش از ارسال بررسی شود.

## wordpress

| قابلیت | مسیر | وضعیت | دلیل | سند | حساب | هزینه | جایگزین | مرحله |
|---|---|---|---|---|---|---|---|---|
| کشف سایت وردپرس (فقط خواندن) (`site_inspect`) | direct | needs_access | NO_SITE_CONNECTED | yes (S08) | not_run | free | ورود دستی مشخصات سایت | M4 |
| ساخت و ویرایش پیش‌نویس مقاله (`draft_write`) | direct | needs_access | NO_SITE_CONNECTED | yes (S08) | not_run | free | فایل مقاله و کار دستی برای مالک | M4 |
| بارگذاری رسانه در وردپرس (`media_upload`) | direct | needs_access | NO_SITE_CONNECTED | yes (S08) | not_run | free | فایل رسانه برای بارگذاری دستی | M4 |
| انتشار مقاله در وردپرس (`publish`) | direct | needs_access | NO_SITE_CONNECTED | yes (S08) | not_run | free | انتشار دستی مالک از پیش‌نویس | M4 |
| بازگردانی نسخهٔ مقاله (`revision_restore`) | direct | unverified | PLUGIN_BEHAVIOR_UNTESTED | unknown (S08) | not_run | free | بازگردانی دستی از پنل وردپرس | M4 |
| نوشتن فیلدهای سئو (عنوان، canonical، schema) (`seo_fields_write`) | direct | unverified | PLUGIN_API_UNKNOWN | unknown (S08) | not_run | free | فهرست تغییر پیشنهادی برای اعمال دستی | M7 |
| تغییر فنی سایت (robots، redirect، قالب، افزونه) (`site_config_change`) | direct | manual_only | OUT_OF_PUBLISH_SCOPE | unknown (بدون منبع) | not_run | free | developer task با ChangeSet و برنامهٔ بازگشت | M7 |

عدم قطعیت‌ها:
- `direct/site_inspect`: نشانی سایت و نوع CMS مالک هنوز معلوم نیست؛ آزمون ابتدا read-only انجام می‌شود.
- `direct/draft_write`: با Application Password روی HTTPS؛ نقش کاربر باید اجازهٔ نوشتن بدهد و روی staging آزموده شود.
- `direct/media_upload`: محدودیت اندازه و نوع فایل سایت مقصد نامعلوم است.
- `direct/publish`: انتشار فقط از executor و با تأیید همان نسخه انجام می‌شود.
- `direct/revision_restore`: رفتار rollback با افزونه‌های سایت باید آزموده شود.
- `direct/seo_fields_write`: افزونه‌هایی مثل Yoast یا RankMath ممکن است write API لازم را ارائه ندهند؛ نگاشت فیلد با کشف و آزمون انجام می‌شود.
- `direct/site_config_change`: این تغییرها در scope انتشار مقاله نیستند و به اختیار جدا، پیش‌نمایش و پشتیبان نیاز دارند.

## cms

| قابلیت | مسیر | وضعیت | دلیل | سند | حساب | هزینه | جایگزین | مرحله |
|---|---|---|---|---|---|---|---|---|
| خروجی مقاله برای CMS ناشناخته (`article_export`) | manual | manual_only | NO_STANDARD_ENDPOINT | unknown (بدون منبع) | not_run | free | فایل HTML/Markdown و دارایی‌ها برای انتشار مالک | M4 |

عدم قطعیت‌ها:
- `manual/article_export`: سایت بدون endpoint استاندارد «متصل و کامل» نمایش داده نمی‌شود.

## canva

| قابلیت | مسیر | وضعیت | دلیل | سند | حساب | هزینه | جایگزین | مرحله |
|---|---|---|---|---|---|---|---|---|
| پرکردن خودکار قالب Canva (`autofill`) | direct | needs_access | PAID_PLAN_REQUIRED | partial (S09) | not_run | paid | رندر قالب محلی یا بستهٔ متن و دارایی برای ویرایش دستی | M7 |
| خروجی‌گرفتن از طرح Canva (`design_export`) | direct | unverified | PLAN_AND_SCOPE_NOT_CONFIRMED | unknown (S09) | not_run | unknown | خروجی دستی مالک و import با QA تازه | M7 |

عدم قطعیت‌ها:
- `direct/autofill`: در اسناد بررسی‌شده Autofill در طرح رایگان نیست؛ در حالت free_only فقط در صورت خواست و تأیید هزینهٔ مالک فعال می‌شود.
- `direct/design_export`: plan و scope حساب مالک نامعلوم است.

## zernio

| قابلیت | مسیر | وضعیت | دلیل | سند | حساب | هزینه | جایگزین | مرحله |
|---|---|---|---|---|---|---|---|---|
| Zernio به‌عنوان مسیر تحویل یک حساب (`account_route`) | zernio | needs_access | OPTIONAL_ROUTE_NOT_CONNECTED | yes (S12، S16) | not_run | free_quota | مسیر مستقیم یا دستی | M5 |

عدم قطعیت‌ها:
- `zernio/account_route`: شروع رایگان برای دو حساب متصل؛ چهار برند لزوماً در سهمیه جا نمی‌گیرند و خدمات متری جدا کنترل می‌شوند. همهٔ عملیات باید از Policy و Billing استودیو بگذرد.

## postiz

| قابلیت | مسیر | وضعیت | دلیل | سند | حساب | هزینه | جایگزین | مرحله |
|---|---|---|---|---|---|---|---|---|
| Postiz خودمیزبان به‌عنوان مسیر تحویل (`delivery_route`) | postiz | unverified | NOT_INSTALLED | unknown (S17) | not_run | unknown | مسیر مستقیم یا دستی | M5 |

عدم قطعیت‌ها:
- `postiz/delivery_route`: نصب واقعی انجام نشده است. مجوز AGPL-3.0، هزینهٔ سرور و نیاز developer app هر شبکه باید پیش از فعال‌سازی بررسی شود.

## tapsell

| قابلیت | مسیر | وضعیت | دلیل | سند | حساب | هزینه | جایگزین | مرحله |
|---|---|---|---|---|---|---|---|---|
| مدیریت کمپین تپسل (`campaign_manage`) | manual | manual_only | API_NOT_PROVEN | unknown (S10) | not_run | paid | بستهٔ خلاقه و export؛ اجرا توسط مالک در پنل رسمی | M7 |

عدم قطعیت‌ها:
- `manual/campaign_manage`: API مدیریت کمپین و شارژ در این بررسی اثبات نشده است. بدون cap قابل اثبات، اجرای هزینه‌زای بدون نظارت غیرفعال می‌ماند.

## yektanet

| قابلیت | مسیر | وضعیت | دلیل | سند | حساب | هزینه | جایگزین | مرحله |
|---|---|---|---|---|---|---|---|---|
| مدیریت کمپین یکتانت (`campaign_manage`) | manual | manual_only | API_NOT_PROVEN | unknown (S11) | not_run | paid | بستهٔ خلاقه و export؛ اجرا توسط مالک در پنل رسمی | M7 |

عدم قطعیت‌ها:
- `manual/campaign_manage`: دسترسی به سایت در بررسی محدود بود و endpoint یا امکان شارژ با API فرض نشده است.

## virgool

| قابلیت | مسیر | وضعیت | دلیل | سند | حساب | هزینه | جایگزین | مرحله |
|---|---|---|---|---|---|---|---|---|
| انتشار مقاله در ویرگول (`article_publish`) | manual | manual_only | API_NOT_PROVEN | unknown (S18) | not_run | free | بستهٔ HTML/Markdown پاک برای انتشار مالک و ثبت URL | M7 |

عدم قطعیت‌ها:
- `manual/article_publish`: صفحه در بررسی 502 داد و API عمومی انتشار اثبات نشده است. نتیجهٔ دستی تا تأیید مالکیت owner_reported می‌ماند.

## google_search_console

| قابلیت | مسیر | وضعیت | دلیل | سند | حساب | هزینه | جایگزین | مرحله |
|---|---|---|---|---|---|---|---|---|
| خواندن analytics از Search Console (`analytics_read`) | direct | needs_access | NO_PROPERTY_ACCESS | yes (S20) | not_run | free | import دستی گزارش | M7 |
| بازرسی URL در Search Console (`url_inspection`) | direct | needs_access | NO_PROPERTY_ACCESS | partial (S20) | not_run | free | بررسی دستی در پنل | M7 |

عدم قطعیت‌ها:
- `direct/analytics_read`: به مالکیت تأییدشدهٔ property و مجوز مالک نیاز دارد.
- `direct/url_inspection`: ایندکس تضمینی فرض نمی‌شود و endpoint عمومی برای ایندکس همهٔ مقاله‌ها وجود ندارد.

## ai

| قابلیت | مسیر | وضعیت | دلیل | سند | حساب | هزینه | جایگزین | مرحله |
|---|---|---|---|---|---|---|---|---|
| تولید متن قالبی محلی (بدون هزینه) (`template_generation`) | internal | unverified | PLANNED_M1 | unknown (بدون منبع) | not_run | free | نوشتن و ویرایش انسانی | M1 |
| مدل محلی از طریق Ollama (`local_model`) | internal | unverified | BENCHMARK_REQUIRED | partial (S21) | not_run | free | تولید قالبی و ویرایش انسانی | M3 |
| تولید با مدل داخل ابزار متصل (MCP) (`harness_assisted`) | internal | needs_access | MCP_NOT_BUILT | yes (S01) | not_run | free | تولید قالبی؛ run در حالت waiting_for_harness می‌ماند | M6 |
| مدل پولی از طریق API (`paid_api`) | direct | needs_access | BLOCKED_BY_FREE_ONLY | unknown (بدون منبع) | not_run | paid | تولید قالبی، مدل محلی یا هارنس | M3 |

عدم قطعیت‌ها:
- `internal/template_generation`: خروجی قالبی است و فقط از دادهٔ برند استفاده می‌کند؛ جایگزین نویسندهٔ انسانی یا مدل نیست. پس از آزمون M1 وضعیت به‌روز می‌شود.
- `internal/local_model`: کیفیت فارسی، مجوز مدل و سخت‌افزار باید با benchmark سنجیده شود.
- `internal/harness_assisted`: اشتراک چت معادل مجوز API یا پردازش شبانه نیست. سازگاری هر client جدا بررسی می‌شود.
- `direct/paid_api`: در حالت free_only هرگز خودکار فعال نمی‌شود؛ هر مصرف به درخواست شارژ/پرداخت مالک تبدیل می‌شود.

## media

| قابلیت | مسیر | وضعیت | دلیل | سند | حساب | هزینه | جایگزین | مرحله |
|---|---|---|---|---|---|---|---|---|
| رندر محلی تصویر از قالب HTML/SVG (`local_image_render`) | internal | unverified | PLANNED_M3 | unknown (بدون منبع) | not_run | free | بستهٔ متن و دارایی برای طراحی دستی | M3 |
| مونتاژ محلی ویدئو با FFmpeg (`local_video_render`) | internal | unverified | PLANNED_M3 | unknown (بدون منبع) | not_run | free | storyboard و فایل‌های خام برای تدوین دستی | M3 |

عدم قطعیت‌ها:
- `internal/local_image_render`: رندر فارسی (فونت، نیم‌فاصله، جهت اعداد) باید با QA تصویری آزموده شود.
- `internal/local_video_render`: FFmpeg 9.0 روی دستگاه ساخت یافت شد ولی مجوز build و کارایی باید در M3 بررسی شود.

## mcp

| قابلیت | مسیر | وضعیت | دلیل | سند | حساب | هزینه | جایگزین | مرحله |
|---|---|---|---|---|---|---|---|---|
| درگاه MCP استودیو برای Claude/Codex/Cursor (`studio_gateway`) | internal | unverified | PLANNED_M6 | partial (S01) | not_run | free | داشبورد | M6 |

عدم قطعیت‌ها:
- `internal/studio_gateway`: فقط سند Codex خوانده شده است؛ سازگاری سایر clientها جدا بررسی می‌شود.

## fake

| قابلیت | مسیر | وضعیت | دلیل | سند | حساب | هزینه | جایگزین | مرحله |
|---|---|---|---|---|---|---|---|---|
| کانکتور نمونه برای دمو و آزمون قرارداد (`sample_connector`) | internal | unverified | PLANNED_M1 | unknown (بدون منبع) | not_run | free | ندارد (فقط محیط نمونه) | M1 |

عدم قطعیت‌ها:
- `internal/sample_connector`: خروجی آن همیشه برچسب sample دارد و هرگز گواه اتصال واقعی نیست. پس از آزمون قرارداد M1 به‌روز می‌شود.

بازبینی بعدی همهٔ ردیف‌های بیرونی: 2026-12-11. شناسه‌های S01 تا S21 به جدول docs/research/README.md ارجاع می‌دهند.
