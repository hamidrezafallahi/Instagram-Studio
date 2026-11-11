# تنظیمات و الگوهای برند
سازنده schema تنظیمات و نمونهٔ بدون secret بسازد؛ industry pack داده است، نه شرط if/else در منطق محصول.
Brand config: identity، industry_pack، locales، timezone، offers/catalog sources، audience، voice، visual system، forbidden claims، channel goals، cadence، policy، budget و retention.
Connection config: route، account ids، secret_ref، capabilities و health.
Runtime config: local/server، storage، database، worker concurrency، model routing و feature flags.
feature flags به تفکیک برند؛ غیرفعال‌کردن channel باید jobs مربوط را pause کند.
پیش‌فرض free_only، draft_only و sample_data=true در demo؛ production با sample-data banner واضح و تغییر آگاهانه.
onboarding پس از انتخاب pack تمام فیلدها را قابل ویرایش کند؛ برند پنجم با pack عمومی بدون تغییر کد ساخته شود.
پذیرش: تغییر تنظیمات نسخه‌دار، rollback و validation؛ راز در export تنظیمات وجود نداشته باشد.
