# Worker و زمان‌بند
اجراکنندهٔ jobهای برنامه‌ریزی، تولید، رندر، انتشار، جمع‌آوری سنجه و گزارش.
DB منبع schedule؛ job شامل reference و revision، نه رمز. ساعت‌ها UTC، ورودی timezone IANA.
claim کار با lease و heartbeat؛ timeout رندر/AI/provider جدا. concurrency per workspace/account و global cap.
outbox dispatcher رویداد commitشده را به job تبدیل می‌کند؛ dedupe_key پایدار. sweep دوره‌ای برای outbox جامانده.
پیش از side effect: بررسی pause، policy، revision، approval، capability، secret validity و بودجه در critical section.
خطای 429 طبق Retry-After و backoff+jitter؛ auth منتظر reconnect؛ ورودی بد terminal؛ پاسخ نامعلوم publishing_unknown و reconciliation.
کار منقضی: پیش‌فرض skip و درخواست زمان‌بندی دوباره؛ بعد از روشن‌شدن دستگاه تمام پست‌های عقب‌مانده هم‌زمان منتشر نشوند.
shutdown: توقف claim، اتمام کوتاه کار جاری، تمدید یا آزادسازی lease؛ برای تماس خارجی نامعلوم retry کور ممنوع.
پذیرش: worker بین ارسال و ثبت نتیجه crash کند؛ پس از بازیابی انتشار دوباره رخ ندهد یا در نبود امکان اثبات به بررسی دستی برود.
