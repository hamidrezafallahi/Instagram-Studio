# برنامه‌های قابل اجرا
سه برنامهٔ اصلی: dashboard، api و worker؛ ورودی MCP در mcp-server.
هر برنامه health/readiness، تنظیمات محیطی validateشده، shutdown کنترل‌شده و log ساخت‌یافته داشته باشد.
دامنه و اتصال provider در packages نگهداری شوند. اجرای مستقیم SQL از dashboard و نگهداری secret در مرورگر ممنوع.
پذیرش: بتوان API و worker را مستقل restart کرد بدون ازدست‌رفتن وضعیت کار.
