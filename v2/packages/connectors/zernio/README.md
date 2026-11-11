# Zernio — گزینهٔ اختیاری
نام صحیح ابزار معرفی‌شده Zernio و نشانی zernio.com است. مالک اصراری به آن ندارد؛ وابستگی اجباری نسازید.
REST یا MCP ارائه‌دهنده می‌تواند route باشد، ولی تمام عملیات باید از Policy/Billing استودیو عبور کند. اتصال مستقیم هارنس به ابزار publish خارجی خارج این کنترل، مسیر اجرایی استودیو نیست.
هر Brand به profile جدا نگاشت شود؛ externalId داخلی و account/profile membership در webhook و request بررسی شود.
adapter عملیات publish/status/metrics/inbox را فقط برای پلتفرم و قابلیت مستند نگاشت کند؛ به شعار «همهٔ شبکه‌ها» تکیه نکند.
قیمت بررسی‌شده شروع رایگان برای دو حساب متصل است؛ پیش از افزودن حساب بیشتر quote و سهمیهٔ کل مالک بررسی شود. چهار برند لزوماً در سهمیه جا نمی‌گیرند.
active_route روی هر حساب ثبت؛ یک پست هم در scheduler داخلی و هم provider schedule نشود. پیش‌فرض ارسال توسط worker در موعد.
idempotency و webhook signature را از OpenAPI/سند جاری استخراج و contract test بسازید.
پذیرش: mapping برندها جدا، quota تمام‌شده درخواست هزینه، LinkedIn DM غیرفعال و پاسخ publish accepted با published اشتباه نشود.
منابع S12 تا S16؛ این بسته هیچ کلید یا حساب Zernio را متصل نکرده است.
