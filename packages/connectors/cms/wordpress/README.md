# WordPress adapter
مسیر پیشنهادی REST API با username و Application Password روی HTTPS؛ رمز ورود اصلی wp-admin مسیر پیش‌فرض API نیست.
کشف wp-json، کاربر و capability، post typeها و media. draft با status=draft، preview معتبر و انتشار فقط از executor.
متادیتای SEO افزونه‌ها را حدس نزنید؛ Yoast/RankMath یا افزونهٔ دیگر ممکن است write API لازم را expose نکند. field mapping با کشف و آزمون.
title، slug، content، excerpt، featured_media، alt، category/tag؛ canonical/schema/SEO title فقط در capability مجاز.
موجودی/قیمت WooCommerce جدا از مقاله و read scope؛ LMS دانشجویان خارج نیاز محتوا و با دسترسی محدود.
قبل و بعد از update revision و rendered output بررسی؛ conflict با modified time/نسخه. rollback محتوا با رفتار افزونه سازگار آزموده شود.
نصب افزونه، theme، تغییر robots و redirect عمومی خودکار در scope انتشار مقاله قرار نگیرد.
پذیرش: draft مقاله با تصویر و لینک داخلی در staging، پیش‌نمایش فارسی، publish مجاز، بازگردانی و عدم تغییر نوشتهٔ انسان.
منبع S08.
