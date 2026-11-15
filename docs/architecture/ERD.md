# نمودار موجودیت‌ها (ERD)
منبع: `packages/data/README.md` و migrationهای `packages/data/migrations`. ستون «مرحله» نشان می‌دهد هر جدول در کدام milestone ساخته می‌شود؛ جدول‌های M1 همین حالا در `0001_core.sql` وجود دارند.

## قواعد مشترک
- همهٔ رکوردهای کسب‌وکار `workspace_id` و `brand_id` دارند. ارجاع فرزند به والد با FK مرکب `(workspace_id, brand_id, …)` است؛ پس ارجاع به دادهٔ برند دیگر در خود پایگاه داده رد می‌شود (خطای `CROSS_BRAND_REFERENCE`).
- جدول‌های کسب‌وکار RLS دارند. نقش برنامه (`studio_app`) مالک جدول‌ها نیست و بدون `app.workspace_id` هیچ ردیفی نمی‌بیند. اگر `app.brand_id` تنظیم شود فقط همان برند دیده و نوشته می‌شود.
- نقش migration (`studio_migrator`) جداست. جدول‌های immutable (نسخهٔ برند، نسخهٔ محتوا، سیاست، audit) trigger ضدتغییر دارند و نقش برنامه روی آن‌ها UPDATE/DELETE ندارد.
- شناسه‌ها UUID نسخهٔ ۷ (`uuidv7()` در PostgreSQL 18). زمان‌ها `timestamptz` در UTC. پول عدد صحیح واحد خرد با ارز صریح.
- جدول‌های هویت (`users`، `workspaces`، `memberships`، `sessions`) دادهٔ کسب‌وکار ندارند و RLS روی آن‌ها نیست؛ دسترسی به آن‌ها فقط از سرویس احراز هویت است.

## هسته (M1 — پیاده‌شده)
```mermaid
erDiagram
  workspaces ||--o{ memberships : "عضو"
  users ||--o{ memberships : "نقش"
  users ||--o{ sessions : "نشست"
  workspaces ||--o{ brands : "دارد"
  brands ||--o{ brand_memberships : "دسترسی محدود"
  brands ||--o{ brand_versions : "نسخهٔ تنظیمات"
  brands ||--o{ policies : "نسخهٔ سیاست اختیار"
  brands ||--o{ connections : "اتصال"
  connections ||--o{ capabilities : "قابلیت به‌ازای عملیات"
  connections ||--o{ metric_snapshots : "سنجه"
  brands ||--o{ secret_vault : "راز رمزشده"
  brands ||--o{ workflow_runs : "اجرا"
  workflow_runs ||--o{ workflow_steps : "گام"
  workflow_runs ||--o{ plans : "می‌سازد"
  brands ||--o{ plans : "برنامهٔ هفته"
  plans ||--o{ schedule_entries : "آیتم تقویم"
  schedule_entries |o--o| content_items : "محتوا"
  content_items ||--|| briefs : "بریف"
  content_items ||--o{ content_revisions : "نسخهٔ immutable"
  workspaces ||--o{ audit_events : "رد حسابرسی"

  users { uuid id PK
          text email UK
          text password_hash "argon2id"
          int failed_login_count
          timestamptz locked_until }
  sessions { uuid id PK
             uuid user_id FK
             text token_hash UK "فقط هش"
             timestamptz expires_at
             timestamptz revoked_at }
  brands { uuid id PK
           uuid workspace_id FK
           text name
           text status "active/paused/archived"
           text industry_pack_id
           bool is_sample
           text timezone
           int current_revision }
  brand_versions { uuid brand_id PK
                   int revision PK
                   jsonb profile
                   text hash }
  policies { uuid brand_id PK
             int revision PK
             jsonb authority "draft_only پیش‌فرض" }
  connections { uuid id PK
                uuid brand_id FK
                text provider
                text status
                bool is_sample
                text secret_ref "فقط ارجاع" }
  capabilities { uuid connection_id PK
                 text action PK
                 text status
                 text reason_code
                 timestamptz verified_at }
  secret_vault { uuid id PK
                 bytea ciphertext
                 bytea wrapped_key
                 int key_version }
  workflow_runs { uuid id PK
                  text intent
                  text status
                  text idempotency_key "یکتا در workspace/brand/intent"
                  text request_hash }
  workflow_steps { uuid run_id PK
                   int seq PK
                   text status
                   jsonb input_snapshot }
  plans { uuid id PK
          date week_start
          int version
          text status
          int brand_revision }
  schedule_entries { uuid id PK
                     uuid plan_id FK
                     timestamptz scheduled_at_utc
                     text channel
                     text format
                     text status
                     int version }
  content_items { uuid id PK
                  text state
                  int current_revision
                  text qa_status
                  int version "optimistic" }
  content_revisions { uuid content_id PK
                      int revision PK
                      text text
                      jsonb claims
                      jsonb qa_result
                      text hash }
  metric_snapshots { uuid id PK
                     text metric
                     numeric value "NULL یعنی ناموجود"
                     text quality
                     bool is_sample }
  audit_events { uuid id PK
                 text actor_type
                 text action
                 text outcome
                 text trace_id }
```

## اجرای کنترل‌شده و هزینه (M2)
```mermaid
erDiagram
  content_revisions ||--o{ action_intents : "payload_hash"
  action_intents ||--o{ approvals : "تأیید وابسته به hash"
  action_intents ||--o| publications : "نتیجه"
  publication_targets ||--o{ action_intents : "یک مقصد"
  action_intents ||--o{ budget_reservations : "رزرو"
  budget_accounts ||--o{ budget_reservations : "سقف"
  budget_accounts ||--o{ usage_ledger : "estimated/reserved/actual"
  brands ||--o{ funding_requests : "درخواست شارژ"
  workflow_runs ||--o{ outbox_events : "در همان تراکنش"
  outbox_events ||--o{ jobs : "dedupe_key"
  jobs ||--o| job_leases : "lease و heartbeat"
  brands ||--o{ manual_tasks : "کار دستی"
```

## دانش، دارایی، گفتگو، سئو و گزارش (M3 تا M7)
| گروه | جدول‌ها | مرحله |
|---|---|---|
| دانش برند | knowledge_sources، knowledge_chunks، offers | M3 |
| دارایی | assets، asset_versions | M3 |
| ورودی و کانال مالک | owner_channel_bindings، webhooks_inbox | M4 |
| انتشار | publication_targets، publications | M2، M5 |
| گفتگو و مشتری | conversations، messages، reply_drafts، leads، lead_events، interaction_opportunities | M6 |
| سایت و سئو | seo_audits، seo_findings، site_change_sets | M7 |
| تبلیغات و آزمایش | campaigns، experiments | M7 |
| گزارش | reports (گزارش ذخیره‌شده؛ در M1 گزارش هفتگی لحظه‌ای از metric_snapshots ساخته می‌شود) | M7 |

در M1 «offers» داخل سند نسخه‌دار برند (`brand_versions.profile`) نگهداری می‌شود. جدول مستقل offers همراه catalog و freshness در M3 اضافه می‌شود و migration انتقال داده خواهد داشت.

## قیود کلیدی پیاده‌شده
| قید | محل | هدف |
|---|---|---|
| `UNIQUE (workspace_id, brand_id, intent, idempotency_key)` | workflow_runs | دوبار کلیک یک run می‌سازد |
| `UNIQUE (brand_id, week_start) WHERE status <> 'superseded'` | plans | یک برنامهٔ جاری در هفته |
| `UNIQUE (schedule_entry_id) WHERE state <> 'cancelled'` | content_items | یک محتوا برای هر آیتم تقویم |
| `UNIQUE (brand_id, provider, external_account_id) WHERE status <> 'revoked'` | connections | یک مسیر فعال برای هر حساب |
| `UNIQUE (connection_id, object_id, metric, period_start, period_end)` | metric_snapshots | سنجهٔ تکراری ثبت نشود |
| FK مرکب با پسوند `_scope_fkey` | همهٔ جدول‌های فرزند | رد ارجاع بین برندها |
