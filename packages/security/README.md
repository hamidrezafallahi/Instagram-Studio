# امنیت و حفاظت اطلاعات
## ورود و رازها
ورود داشبورد با session امن HttpOnly/Secure/SameSite و CSRF؛ password hashing استاندارد یا identity provider؛ MFA برای owner قابل فعال‌سازی.
OAuth برای شبکه‌ها؛ CMS با application password/service token در اولویت. فرم username/password سایت برای login تعاملیِ مجاز هم ارائه شود؛ رمز فقط در vault و از دسترس مدل خارج.
Envelope encryption با کلید اصلی خارج DB، rotation و revoke؛ local کلید از OS secret store/فایل محدود خارج repo، server secret manager یا injected secret.
کلید production در build، frontend، screenshot، prompt و fixture نباشد. نمایش masked فقط metadata اتصال.

## تهدیدها و کنترل
Prompt injection در صفحهٔ وب/دایرکت: ورودی untrusted، استخراج ساخت‌یافته، هیچ ابزار مدیریتی در اختیار عامل پاسخ مشتری.
SSRF: URL سایت و asset فقط scheme مجاز، DNS/IP check، منع loopback/private/link-local و redirect مجدد؛ دامنهٔ مالک به‌طور مشخص allowlist.
وبهوک: امضا/secret header رسمی، timestamp اگر provider دارد، dedupe و anti-replay. externalId بدون امضای معتبر برای انتخاب tenant کافی نیست.
Upload: اندازه/MIME، malware scan، حذف metadata حساس تصاویر در صورت نیاز، HTML sanitization.
ابزار مرورگر برای CMS: پروفایل جدا، domain allowlist، 2FA توسط مالک، session رمزگذاری‌شده؛ CAPTCHA یا ممانعت ورود را دور نزند.
پشتیبان encrypted و کلید در محل جدا؛ مسیر حذف و export دادهٔ هر برند.
Public media URL کوتاه‌عمر فقط برای asset مورد انتشار؛ فایل خصوصی مشتری public نشود.
پذیرش: canary secret در log/LLM/output نشت نکند؛ request بین دو برند رد؛ webhook جعلی هیچ action نسازد.
