# درگاه CMS
فرم: URL سایت، نوع CMS یا auto-detect، auth روش، username، application password/token یا browser-login، نقش، staging URL و allowed_paths.
تست ابتدا read-only، تشخیص capability واقعی برای draft/publish/update/media/metadata/redirect/settings.
port: inspectSite، listContent، createDraft، updateDraft، uploadAsset، preview، publish، getRevision، restoreRevision، getSeoFields.
adapter سایت اختصاصی با قرارداد API مالک؛ نبود API با task دستی یا مرورگر کنترل‌شدهٔ CMS مالک، با session امن و 2FA انسانی.
اجرای مرورگر فقط روی دامنهٔ مشخص و snapshot قبل/بعد؛ دخالت انسان در تغییر layout/صفحهٔ login و CAPTCHA.
مجوز author/editor برای محتوا کافی است اگر CMS اجازه دهد؛ admin فقط برای تغییر فنی نیازمند آن و با دامنهٔ عمل روشن.
هر تغییر مجموعهٔ ChangeSet دارد: قبل، بعد، هدف، ریسک، backup_ref و rollback plan.
پذیرش: نسخهٔ سایت بدون endpoint استاندارد «متصل و کامل» نشان داده نشود؛ تغییر هم‌زمان انسان conflict ایجاد کند.
