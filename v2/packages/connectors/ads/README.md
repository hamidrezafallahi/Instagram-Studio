# تپسل و یکتانت
adapterهای tapsell و yektanet در مرحلهٔ ساخت زیر همین مسیر با README مستقل ایجاد شوند.
تمایز مهم: SDK نمایش تبلیغ در اپ با API مدیریت کمپین تبلیغ‌دهنده یکسان نیست.
API مدیریت کمپین و شارژ عمومی این دو در این بررسی اثبات نشده؛ پیش‌فرض creative/export + اقدام مالک در پنل رسمی. در صورت دریافت مستندات و دسترسی، adapter واقعی افزوده شود.
CampaignDraft: هدف، audience، landing، placements، creatives، UTM، start/end، سقف روزانه/کل، ارز، conversion event و stop_conditions.
پیش از launch: landing کار کند، tracking آزموده، محتوای تبلیغ تأیید و budget authorized باشد.
اعتبار کم: FundingRequest؛ مالک پنل را شارژ کند یا پرداخت جدا تأیید کند. برداشت کارت/خرید بی‌اطلاع پیاده نشود.
اگر provider cap در دسترس نیست، سقف سخت از سمت استودیو تضمین‌پذیر نیست؛ launch unattended غیرفعال یا فقط با cap تنظیم‌شده در پنل و مدرک مالک.
پذیرش: بودجه صفر هیچ کمپین live نسازد؛ CSV گزارش دستی با تاریخ/منبع و مبلغ قابل import، duplicate رفع شود.
منابع S10 و S11؛ دسترسی به سایت یکتانت در بررسی محدود بود.
