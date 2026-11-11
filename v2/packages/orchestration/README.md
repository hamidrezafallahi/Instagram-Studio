# اجرای گردش‌کار
WorkflowDefinition version، steps، input/output schema، timeout، retry policy و compensation دارد.
هر step ورودی snapshot و خروجی artifact_ref ذخیره کند؛ resume با همان نسخه. prompt جدید job جاری را بی‌صدا تغییر ندهد.
Coordinator فقط task انتخاب و شواهد جمع می‌کند؛ executor غیرزبانی side effect را اجرا می‌کند.
پیش‌نیازها می‌توانند به سؤال مالک تبدیل شوند؛ پاسخ به inquiry_id و brand_id متصل و نسخهٔ plan را اصلاح کند.
ساخت سؤال باعث توقف همهٔ برندها نشود. TTL و reminder با فاصلهٔ قابل تنظیم، بدون پیام تکراری.
Publishing: intent persist → policy → cost reserve → lease → provider call → ثبت نتیجه/unknown → reconcile → metric sync.
Exactly-once عمومی ادعا نشود. اگر provider idempotency دارد همان key را استفاده؛ اگر ندارد شناسهٔ عملیات و reconcile؛ نبود امکان اثبات یعنی human review، نه retry کور.
زمان‌بندی پیش‌فرض داخلی است و هنگام موعد publishNow؛ provider scheduling فقط حالت مجزا با remote_schedule_id، sync/cancel و یک مرجع زمان‌بندی.
تغییر provider هنگام unknown ممنوع؛ در غیر این صورت ممکن است یک پست دو بار ارسال شود.
پذیرش: توقف/ادامه، قطع AI، انقضای approval و شکست یک child رفتار قابل بازسازی داشته باشند.
