# Instagram
## ساخت
آداپتور رسمی Meta و route اختیاری Zernio؛ اطلاعات auth هر روش جدا و قابل شناسایی. حساب Professional و مجوزهای متناظر با login path در onboarding بررسی شوند.
عملیات مستقل: feed_publish، carousel_publish، reel_publish، story_publish، trial_reel_publish، own_comment_reply، dm_read، dm_reply، metrics_read، third_party_comment.
دو روش ورود Instagram Login و Facebook Login را مخلوط نکنید؛ اسامی scope دقیق از سند جاری استخراج شود.
پایپ‌لاین انتشار: اعتبارسنجی مدیا → upload/container → polling محدود وضعیت → publish → ذخیرهٔ external id → readback/metrics.
در نبود API خاص تریال: ویدئو، کاور، متن و راهنمای انتشار تریال آماده و manual task. وجود Trial در اپ به معنی پشتیبانی API نیست.
کامنت زیر پست‌های دیگر: به‌طور پیش‌فرض فرصت‌یابی + پیش‌نویس + ارسال دستی؛ مجوز پاسخ به کامنت روی رسانهٔ خود، مجوز عمومی برای همهٔ پست‌ها نیست.
DM: webhook معتبر، محدودیت پیام‌رسانی جاری، context گفتگو و handoff. cold DM انبوه فعال نشود.
Quota و مشخصات فرمت dynamic؛ sticker/music/collab هرکدام capability جدا، نه checkbox نمایشی.
## پذیرش
انتشار یک مدیای مجاز روی حساب آزمایشی با رسید؛ Story یا Trial نامجاز manual؛ توکن منقضی needs_access؛ timeout بدون repost.
منابع: S02، S03، S13، S14 در docs/research/README.md. صفحات اصلی Meta در بررسی این بسته 429 دادند؛ پیش از live دوباره بررسی شوند.
