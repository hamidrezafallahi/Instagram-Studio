# مدل داده و مهاجرت
PostgreSQL؛ schema نسخه‌دار، migration جلو/بازیابی از backup، seed نمونه بدون secrets.
## جدول‌ها
workspaces، users، memberships، brands، brand_memberships، brand_versions، knowledge_sources، knowledge_chunks، offers.
connections (provider، external_account_id، secret_ref)، capabilities، owner_channel_bindings، webhooks_inbox.
content_items، content_revisions، briefs، assets، asset_versions، publication_targets، publications.
plans، schedule_entries، workflow_runs، workflow_steps، action_intents، approvals، outbox_events، job_leases.
conversations، messages، reply_drafts، leads، lead_events، interaction_opportunities.
seo_audits، seo_findings، site_change_sets، campaigns، experiments، metric_snapshots، reports.
budget_accounts، budget_reservations، usage_ledger، funding_requests، audit_events.

## قیود
همهٔ رکوردهای کسب‌وکار workspace_id و brand_id؛ FK مرکب یا guard معادل برای جلوگیری از ارجاع بین برند.
unique برای inbound provider_event_id در connection؛ unique برای idempotency_key در workspace/brand/action.
revision immutable؛ published external_id در اتصال unique؛ metric کلید provider/object/metric/period/dimensions.
index برای due_at/status، brand/conversation/time، provider/external_id؛ حذف cascade حساب نباید audit را پاک کند.
RLS و نقش محدود DB برای برنامه؛ migration role جدا. تست isolation الزامی حتی با یک مالک.
outbox همراه تغییر وضعیت در transaction؛ شبکه داخل transaction طولانی انجام نشود. executor lease و intent durable را پیش از شبکه ثبت کند.
نسخهٔ متادیتای schema، provenance، timestamps و حذف منطقی برای دادهٔ مرجع.
رازداری: ciphertext در vault table یا secret store؛ master key جدا از DB. provider responseهای لازم redact شوند.
پذیرش: migration روی DB خالی و نسخهٔ قبلی، backup restore و آزمون FK cross-brand.
