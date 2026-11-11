# کانکتورها و انتخاب مسیر
هر adapter قرارداد packages/contracts را پیاده کند و manifest شامل provider_id، auth_kind، capabilities، cost_model، docs_url و checked_at داشته باشد.
انتخاب پیش‌فرض: اتصال رسمی مستقیمِ قابل استفاده و کم‌هزینه؛ واسط فقط با ارزیابی قابلیت/هزینه. Zernio و Postiz اختیاری‌اند.
هر account/action دقیقاً یک active route دارد. failover فقط وقتی عدم وقوع side effect اثبات شده؛ unknown را به provider دیگر ارسال نکنید.
Capability فقط بعد از بررسی سند و تست حساب verified شود. doc_supported به معنی account_verified نیست؛ این دو evidence جدا ذخیره شوند.
مشترک: محدودیت سرعت، cursor pagination، webhook dedupe، refresh token lock، health، timeout، حذف دسترسی و redacted logging.
fallback مجاز: draft/export و task دستی با راهنما و ثبت رسید. محدودیت API را با login غیررسمی شبکه‌های اجتماعی پنهان نکنید.
پذیرش: هر adapter happy path، expired auth، quota، unknown outcome و unsupported action را با fake و سپس آزمایش مجاز منتخب پوشش دهد.
