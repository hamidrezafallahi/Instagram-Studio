# بهره‌برداری، خرابی و بازیابی
## پایش
run_id/trace_id/brand_id در log بدون متن محرمانه؛ queue lag، error rate، auth expiry، outbox backlog، cost، storage و webhook lag.
alert فقط خرابی معنادار، نیاز به اقدام، سقف هزینه و completion منتخب؛ پیام تکراری در هر tick ارسال نشود.
daily: health اتصال و queue؛ weekly: quota/بودجه و نسخهٔ docs؛ monthly: restore drill و بررسی scope.
capability expiry: قبل از هر action حساس و دوره‌ای revalidate؛ تغییر API/version به incident تبدیل شود.

## runbook
Token expired: pause account → notify owner → reconnect → capability test → resume انتخاب‌شده.
Unknown publish: pause action → جست‌وجوی provider operation → readback → reconcile؛ بدون اثبات، manual review.
Rate limit: respect retry_after و کاهش concurrency؛ حساب دیگر برای دورزدن سقف استفاده نشود.
Payment needed: funding_request با dedupe؛ سایر کارهای رایگان ادامه؛ بعد از پرداخت policy/quote دوباره بررسی.
Secret leak: revoke/rotate، توقف connection، بررسی audit و پاک‌سازی log؛ صرف حذف log کافی نیست.
Bad SEO change: توقف تغییرها، restore snapshot، verify URL/status/canonical و گزارش اثر.
Provider outage: circuit breaker؛ draft ادامه؛ failover فقط اگر side effect نامعلوم نیست.

## پشتیبان
هدف پیشنهادی: backup روزانهٔ DB و asset، RPO حداکثر ۲۴ ساعت و RTO چهار ساعت برای استقرار کوچک؛ تعهد واقعی پس از restore drill.
کلید رمزگذاری جدا؛ نگهداری حداقل چند نسل؛ تست checksum و شمارش.
restore ابتدا در حالت paused/dry-run؛ jobs کامل دوباره اجرا نشوند؛ reconcile درحال‌اجراها پیش از live.
سازنده دستورهای دقیق اجرا/بازیابی را پس از ساخت در این مسیر اضافه کند.
