# کتابخانه‌های مشترک
contracts نوع‌ها و schema؛ domain موجودیت و state؛ data ذخیره؛ policy اختیار؛ security رازها؛ orchestration اجرای پایدار؛ ai درگاه مدل؛ media دارایی؛ analytics سنجه؛ billing هزینه؛ connectors مرز خدمات بیرونی.
وابستگی: apps → orchestration/domain → contracts؛ connectors قراردادهای port را پیاده می‌کنند. domain نباید به apps یا SDK provider وابسته شود.
برای هر package public API کوچک، آزمون مناسب و خطاهای typed بسازید. قراردادها schema_version دارند و تغییر ناسازگار migration می‌خواهد.
پذیرش: fake connector جای adapter واقعی را بدون تغییر workflow بگیرد.
