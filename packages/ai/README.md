# درگاه مدل و دانش برند
Provider interface برای generateStructured، embed اختیاری، transcribe اختیاری و health.
حالت‌های local_model، paid_api، harness_assisted؛ قابلیت و هزینهٔ واقعی در تنظیمات.
مدل محلی از طریق runner مانند Ollama گزینهٔ بدون هزینهٔ API است، اما کیفیت فارسی/سخت‌افزار با benchmark سنجیده شود؛ cloud رایگان فرض نشود.
انتخاب مدل بر اساس task و بودجه؛ fallback پولی خودکار ممنوع. در سقف هزینه waiting_for_funds یا کاهش دامنه با اطلاع مالک.
RAG فقط از brand_id فعال و منابع مجاز. chunk دارای source، تاریخ، اعتبار و سطح محرمانگی؛ ابتدا جست‌وجوی متنی، embedding بعداً.
ادعاها با evidence_id یا needs_verification؛ قیمت و موجودی از catalog با freshness، نه حافظهٔ مدل.
خروجی schema validate شود؛ یک repair محدود سپس human review. max_tokens، timeout، حداکثر فراخوانی/هزینهٔ run تعیین شود.
مکالمهٔ مالک به Intent تبدیل شود؛ tool output خارجی هم untrusted است. context برند A به B وارد نشود.
پیاده‌سازی M3.1: حالت `free_api` با OpenRouter (`src/openrouter.ts`) فقط با شناسه‌های «:free»؛ مدل محدود یا قطع → مدل بعدی → تولید قالبی. هزینهٔ گزارش‌شدهٔ غیرصفر کل تولید را متوقف می‌کند (A23). کلید فقط از `STUDIO_HOME/.env` و در scrubber log. خروجی مدل یک بار اصلاح می‌شود. ارزیابی دستی کیفیت فارسی: `pnpm eval:text [brand] [format] [pillar]`.
پذیرش: سؤال بدون مدرک جواب قطعی نسازد؛ prompt تزریقی دسترسی tool را تغییر ندهد؛ توقف بودجه واقعی.
