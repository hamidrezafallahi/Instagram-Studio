# ورودی مشترک هارنس‌ها
سرور MCP متعلق به استودیو است؛ ابزارهای Claude/Codex/Cursor به آن client هستند. از همان services و policy API استفاده کند.
ابزارهای خواندنی: studio.get_status، studio.list_capabilities، studio.get_calendar، studio.get_report.
ابزارهای تغییردهنده: studio.propose_plan، studio.create_draft، studio.request_run، studio.pause_run، studio.submit_revision.
studio.approve فقط برای principal انسانی دارای scope، با نمایش نسخه و تأیید صریح؛ عامل تولید محتوا حق self-approve ندارد.
هیچ ابزار shell آزاد، SQL عمومی، get_secret یا send_anything ایجاد نشود.
ورودی/خروجی JSON Schema، pagination، resource link برای asset و operation id برای کار طولانی.
در remote از HTTPS و auth استاندارد MCP متناسب با client استفاده شود؛ در local stdio wrapper به service متصل و با principal محدود اجرا شود.
هر نصب قابلیت client و transport را در زمان اجرا بررسی کند؛ پیکربندی یک محصول به دیگری کپی نشود.
پذیرش: همان فرمان از dashboard و MCP یک سیاست و همان audit را تولید کند؛ درخواست ابزار برای workspace دیگر رد شود.
منبع تطبیق Codex: docs/research/README.md، ردیف S01.
