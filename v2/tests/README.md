# راهبرد اعتبارسنجی
unit برای قواعد state/policy/budget؛ contract برای هر adapter؛ integration با DB/storage واقعی محلی؛ end-to-end برای مسیرهای مالک.
fixtureها ساختگی، بدون PII/credential. record/replay ارائه‌دهنده فقط پس از redaction.
live tests به حساب staging و اختیار صریح محدود؛ اجرای CI هرگز روی حساب تولید پست نسازد.
eval مدل: فارسی/RTL، grounding، نشت cross-brand، prompt injection، قیمت نامعلوم، ادعای حساس و اصلاح schema.
گزارش pass همراه محیط و مدرک؛ skip را pass حساب نکنید. تست تصویری رسانه با بازبینی human/vision مناسب و snapshot فارسی.
پذیرش نهایی در acceptance؛ سازنده نام و دستور اجرای suite را در همین فایل اضافه کند.
