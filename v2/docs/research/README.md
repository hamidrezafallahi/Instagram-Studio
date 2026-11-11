# منابع و حدود اطمینان
بررسی وب: 2026-11-11. این‌ها شواهد معماری‌اند؛ اتصال واقعی به حساب مالک آزموده نشده. نسخه‌ها، تعرفه‌ها و مجوزها پیش از پیاده‌سازی و live دوباره بررسی شوند.
| شناسه | منبع رسمی/اولیه | نکتهٔ استفاده و وضعیت |
|---|---|---|
| S01 | [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp) | صفحه خوانده شد؛ مبنای اتصال MCP. سازگاری سایر clientها جدا بررسی شود. |
| S02 | [Meta Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/) | دریافت مستقیم 429؛ محدودیت‌ها برای حساب مقصد دوباره بررسی شوند. |
| S03 | [Meta Trial Reels](https://about.fb.com/news/2024/12/trial-reels-try-content-non-followers-first-see-what-perfoms-best/) | وجود قابلیت اپ؛ مدرک تضمین API نیست. |
| S04 | [LinkedIn Posts](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) | نوع پست/مجوز و header نسخه؛ خوانده شد. |
| S05 | [LinkedIn Messages](https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages) | دسترسی محدود و نیاز به اقدام صریح عضو؛ خوانده شد. |
| S06 | [Telegram Bot API](https://core.telegram.org/bots/api) | قرارداد bot و دریافت رویداد؛ خوانده شد. |
| S07 | [WhatsApp Platform](https://whatsappbusiness.com/products/platform-pricing/) | پنجرهٔ خدمت و هزینه وابسته به دسته/بازار؛ تعرفه ثابت در طرح نیست. |
| S08 | [WordPress Authentication](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/) | Application Password روی HTTPS؛ خوانده شد. |
| S09 | [Canva Autofill](https://www.canva.dev/docs/apps/rest-apis/reference/autofills/) و [راهنمای Canva](https://www.canva.com/en_gb/help/autofill/) | Autofill رایگان همگانی نیست؛ وضعیت plan دوباره بررسی شود. |
| S10 | [تپسل](https://tapsell.com/) | سرویس تبلیغات تأیید؛ API مدیریت/شارژ در این بررسی اثبات نشده. |
| S11 | [یکتانت](https://www.yektanet.com/) | دسترسی ابزار به مقصد redirect محدود؛ endpoint یا امکان شارژ API فرض نشده. |
| S12 | [Zernio معرفی](https://zernio.com/) | API/MCP معرفی‌شده؛ استفاده اختیاری. |
| S13 | [Zernio Instagram](https://docs.zernio.com/platforms/instagram) | کانال حرفه‌ای و قابلیت‌های وابسته به روش اتصال؛ خوانده شد. |
| S14 | [Zernio Instagram Posts](https://docs.zernio.com/platforms/instagram/posts) | feed/story/reel؛ مدرک کافی برای Trial در این بررسی یافت نشد. |
| S15 | [Zernio LinkedIn](https://docs.zernio.com/platforms/linkedin) | DM ندارد؛ comments بر حسب نوع حساب محدود است. |
| S16 | [Zernio Pricing](https://zernio.com/pricing) و [Multi-tenant](https://docs.zernio.com/multi-tenant) | شروع با دو حساب رایگان و profile جدا؛ هزینه‌های جانبی/سهمیه را مستقل کنترل کنید. |
| S17 | [Postiz](https://docs.postiz.com/general/introduction) و [مخزن](https://github.com/gitroomhq/postiz-app) | self-host/API قابل ارزیابی؛ AGPL-3.0 در مخزن، نصب واقعی انجام نشده. |
| S18 | [ویرگول](https://virgool.io/) | دریافت صفحه 502؛ API انتشار اثبات نشده. |
| S19 | [Google Spam Policies](https://developers.google.com/search/docs/essentials/spam-policies) | راهبرد لینک و تولید ارزشمند؛ از ساخت انبوه لینک برای دست‌کاری رتبه پرهیز شود. |
| S20 | [Search Console API](https://developers.google.com/webmaster-tools/v1/api_reference_index) | analytics/sitemap/inspection؛ ایندکس تضمینی فرض نشده. |
| S21 | [Ollama](https://docs.ollama.com/) | امکان مدل محلی؛ کیفیت/مجوز مدل/سخت‌افزار باید ارزیابی شود. |

## انتخاب رایگان — تصمیم طراحی، نه ادعای بهترین ابزار برای همه
| مسیر | مزیت | محدودیت | تصمیم |
|---|---|---|---|
| API رسمی مستقیم + worker داخلی | کنترل کامل و حذف هزینهٔ واسط | نیاز به مجوز و نگهداری adapter | پیش‌فرض در صورت دسترسی |
| Postiz self-host | استفادهٔ مجدد از انتشار/تقویم | زیرساخت و بررسی license/provider | اختیاری، پس از آزمون M0 |
| Zernio | واسط مشترک و شروع رایگان محدود | تعداد حساب و خدمات متری | اختیاری، بدون وابستگی هسته |
| export دستی | بدون هزینهٔ واسط و بدون API | کار انسانی و سنجهٔ محدود | fallback دائمی |
| قالب محلی + رندر | کنترل گرافیک و هزینهٔ API صفر | طراحی قالب/پردازش محلی | پیش‌فرض رسانه |
| Canva | ویرایش بصری آماده | بعضی خودکارسازی‌ها پولی | اختیاری |

ثبت evidence برای هر capability: doc_url، checked_at، API version، account_type، scope، test_result و next_review.
محدودیت کشور، دسترسی شبکه، پرداخت و eligibility حساب از locale کاربر نتیجه‌گیری نشود؛ در onboarding آزموده شود.
