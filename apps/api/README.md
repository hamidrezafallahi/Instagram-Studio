# API و ورودی‌ها
Fastify به‌عنوان پیشنهاد؛ business service از transport جدا.
مسیرهای کسب‌وکار نسخه‌دار /v1/workspaces/{workspace_id}/brands/{brand_id}/...؛ عضویت و scope هر دو در سرور اعتبارسنجی شود. عملیات کل مالک مسیر مجزا دارد.
منابع: brands، connections، capabilities، plans، content، assets، approvals، runs، conversations، leads، seo-audits، campaigns، reports، policies، budgets و funding-requests.
فرمان‌ها: POST runs با intent و idempotency key؛ POST runs/{id}/pause؛ POST approvals/{id}/decide با expected_revision.
webhooks هر provider مسیر مستقل، raw-body برای امضا، dedupe و ack سریع پس از ثبت پایدار؛ پردازش سنگین در worker.
OAuth callback: state، PKCE در صورت پشتیبانی، redirect allowlist، عدم log کد/توکن.
دریافت رسانه: محدودیت اندازه، MIME واقعی، quarantine و scan؛ URL fetch با محافظ SSRF.
SSE برای پیشرفت run با reconnect/cursor و endpoint snapshot؛ قطع SSE کار را لغو نکند.
خطا: code، message_fa، retryable، trace_id، action_required؛ stack و secret در پاسخ عمومی نباشد.
پذیرش: درخواست غیرعضو رد، تکرار فرمان همان نتیجه، ورودی نامعتبر 4xx، webhook جعلی رد؛ هیچ publish مستقیم خارج از executor.
