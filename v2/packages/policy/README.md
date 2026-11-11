# سیاست اختیار و تأیید
اختیار مالک برای هر brand، channel، action_type، بازهٔ زمانی و سقف قابل ثبت است.
حالت‌ها: draft_only؛ review_required؛ auto_scoped. پیش‌فرض review/draft تا انتخاب صریح مالک؛ درخواست هزینه همیشه طبق billing.
Auto-scoped می‌تواند انتشار موضوع‌های تأییدشده، پاسخ FAQ و جمع‌آوری سنجه را مجاز کند. پاسخ قراردادی، تخفیف خارج از حدود، ادعای پزشکی، حذف، تغییر ساختار سایت و افزایش بودجه خارج از محدوده به مالک ارجاع شود.
reviewer فقط در scope خود تأیید می‌کند؛ actor مدل نمی‌تواند approval انسانی ایجاد کند.
PolicyDecision: allow/needs_approval/deny/needs_funds با reason، policy_revision و scope_snapshot.
در enqueue و بلافاصله قبل از dispatch دوباره بررسی؛ approval به hash متن، فایل، مقصد، زمان و هزینهٔ حداکثر متصل است.
تغییر هر مورد تأثیرگذار approval را منقضی می‌کند. تغییر سیاست، توقف برند یا قطع اتصال بر jobهای قدیمی نیز اثر دارد.
تأیید از Telegram/WhatsApp باید button/token یک‌بارمصرف با TTL، principal pairشده و context کامل برند داشته باشد؛ متن مبهم «بله» به تنهایی برای اقدام حساس کافی نیست.
پذیرش: تغییر asset بعد از تأیید، approve از برند دیگر، callback تکراری و تلاش خودتأییدی عامل رد شوند.
