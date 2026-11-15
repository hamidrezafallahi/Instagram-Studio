# استقرار محلی و سروری
سازنده دو پروفایل local و server با راهنمای واقعی و فایل‌های تنظیمات نمونهٔ بدون راز بسازد.
local: Docker Compose یا روش معادل روی Windows؛ dashboard/API/worker/PostgreSQL و storage محلی سازگار. هزینه/مجوز runtime میزبان بررسی شود؛ Docker Desktop را برای هر نوع استفاده همیشه رایگان فرض نکنید.
server: Linux و همان اجزا، HTTPS reverse proxy، healthchecks، persistent volumes، restart policy و backup خارج همان ماشین.
MVP sizing صرفاً نقطهٔ آزمایش: ۲–۴ CPU و ۴–۸GB RAM بدون مدل/رندر سنگین؛ FFmpeg و مدل محلی worker جدا و benchmark لازم دارند.
network: DB/storage admin خصوصی؛ فقط dashboard احرازشده و webhook مشخص اینترنتی. هیچ public database یا port مدل محلی.
deploy: migration backup → سازگاری نسخه → deploy API/worker → smoke test → rollback در صورت شکست.
local به server: توقف scheduler، backup، انتقال encrypted، restore و validation، تغییر callbackهای OAuth/webhook، فقط یک scheduler فعال، سپس resume.
پذیرش: restart و upgrade داده را نگه دارد؛ local offline صادقانه نشان داده شود؛ setup script کلید را چاپ نکند.
