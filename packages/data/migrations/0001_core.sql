-- 0001_core — هویت، برند، اتصال، برنامه، محتوا، اجرا، سنجه و audit (مرحلهٔ M1)
-- قواعد: همهٔ رکوردهای کسب‌وکار workspace_id و brand_id دارند؛ ارجاع بین برندها با FK مرکب ناممکن است؛
-- جدول‌های کسب‌وکار RLS دارند و نقش برنامه (studio_app) مالک جدول‌ها نیست.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'studio_app') THEN
    RAISE EXCEPTION 'نقش studio_app وجود ندارد؛ پیش از migration آن را بسازید (infra/README.md).';
  END IF;
END $$;

CREATE SCHEMA app;

CREATE FUNCTION app.current_workspace_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.workspace_id', true), '')::uuid $$;

CREATE FUNCTION app.current_brand_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.brand_id', true), '')::uuid $$;

CREATE FUNCTION app.touch_updated_at() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE FUNCTION app.reject_change() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable record: % cannot be updated or deleted', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $$;

CREATE TABLE schema_metadata (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_metadata (key, value) VALUES ('contracts_schema_version', '1.0.0');

-- ───────────────────────────── هویت (بدون دادهٔ کسب‌وکار) ─────────────────────────────

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  workspace_id uuid NOT NULL REFERENCES workspaces (id),
  user_id uuid NOT NULL REFERENCES users (id),
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'reviewer', 'viewer', 'service')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX memberships_user_idx ON memberships (user_id);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  -- فقط هش نشانهٔ نشست ذخیره می‌شود تا نشت پایگاه داده نشست‌ها را لو ندهد.
  token_hash text NOT NULL UNIQUE,
  csrf_token text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

-- ─────────────────────────────────────── برند ───────────────────────────────────────

CREATE TABLE brands (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces (id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  industry_pack_id text NOT NULL,
  industry_pack_version text NOT NULL,
  is_sample boolean NOT NULL DEFAULT false,
  timezone text NOT NULL,
  locale text NOT NULL,
  current_revision integer NOT NULL DEFAULT 1 CHECK (current_revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (workspace_id, id)
);
CREATE UNIQUE INDEX brands_name_key ON brands (workspace_id, lower(name)) WHERE status <> 'archived';
CREATE TRIGGER brands_touch BEFORE UPDATE ON brands FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE brand_memberships (
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id),
  role text NOT NULL CHECK (role IN ('editor', 'reviewer', 'viewer', 'service')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, user_id),
  CONSTRAINT brand_memberships_brand_scope_fkey FOREIGN KEY (workspace_id, brand_id) REFERENCES brands (workspace_id, id)
);

-- نسخه‌های immutable سند تنظیمات برند؛ rollback یعنی افزودن نسخهٔ تازه از روی نسخهٔ قدیمی.
CREATE TABLE brand_versions (
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  profile jsonb NOT NULL,
  hash text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  note text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, revision),
  CONSTRAINT brand_versions_brand_scope_fkey FOREIGN KEY (workspace_id, brand_id) REFERENCES brands (workspace_id, id)
);
CREATE TRIGGER brand_versions_immutable BEFORE UPDATE OR DELETE ON brand_versions
  FOR EACH ROW EXECUTE FUNCTION app.reject_change();

-- سیاست اختیار نسخه‌دار؛ نسخهٔ جاری بزرگ‌ترین revision است.
CREATE TABLE policies (
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  authority jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, revision),
  CONSTRAINT policies_brand_scope_fkey FOREIGN KEY (workspace_id, brand_id) REFERENCES brands (workspace_id, id)
);
CREATE TRIGGER policies_immutable BEFORE UPDATE OR DELETE ON policies
  FOR EACH ROW EXECUTE FUNCTION app.reject_change();

-- ─────────────────────────────── اتصال، قابلیت و راز ───────────────────────────────

CREATE TABLE connections (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  provider text NOT NULL,
  label text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'needs_access', 'error', 'revoked')),
  is_sample boolean NOT NULL DEFAULT false,
  auth_kind text NOT NULL,
  external_account_id text,
  -- فقط ارجاع به راز؛ مقدار رمزشده در secret_vault است و کلید اصلی بیرون از پایگاه داده.
  secret_ref text CHECK (secret_ref IS NULL OR secret_ref ~ '^secret://vault/[0-9a-f-]{36}$'),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  health jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (workspace_id, brand_id, id),
  CONSTRAINT connections_brand_scope_fkey FOREIGN KEY (workspace_id, brand_id) REFERENCES brands (workspace_id, id)
);
CREATE INDEX connections_brand_idx ON connections (brand_id, status);
CREATE UNIQUE INDEX connections_account_key ON connections (brand_id, provider, external_account_id)
  WHERE status <> 'revoked' AND external_account_id IS NOT NULL;
CREATE TRIGGER connections_touch BEFORE UPDATE ON connections FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE capabilities (
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  action text NOT NULL,
  status text NOT NULL CHECK (status IN ('verified', 'needs_access', 'manual_only', 'unsupported', 'unverified', 'degraded')),
  reason_code text NOT NULL,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_url text,
  verified_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, action),
  CONSTRAINT capabilities_connection_scope_fkey FOREIGN KEY (workspace_id, brand_id, connection_id)
    REFERENCES connections (workspace_id, brand_id, id)
);

CREATE TABLE secret_vault (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  purpose text NOT NULL,
  ciphertext bytea NOT NULL,
  wrapped_key bytea NOT NULL,
  key_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  destroyed_at timestamptz,
  CONSTRAINT secret_vault_brand_scope_fkey FOREIGN KEY (workspace_id, brand_id) REFERENCES brands (workspace_id, id)
);

-- ─────────────────────────────────── برنامه و تقویم ───────────────────────────────────

CREATE TABLE workflow_runs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  intent text NOT NULL,
  workflow_id text NOT NULL,
  workflow_version text NOT NULL,
  status text NOT NULL CHECK (status IN (
    'queued', 'running', 'waiting_for_input', 'waiting_for_approval', 'waiting_for_funds',
    'waiting_for_harness', 'paused', 'succeeded', 'partially_succeeded', 'failed', 'cancelled')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  -- هش ورودی فرمان؛ همان کلید با ورودی متفاوت رد می‌شود.
  request_hash text NOT NULL,
  is_sample boolean NOT NULL DEFAULT false,
  scope_fa text NOT NULL,
  cost_cap jsonb,
  input jsonb NOT NULL,
  result jsonb,
  error jsonb,
  parent_run_id uuid,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  UNIQUE (workspace_id, brand_id, id),
  -- یک کلیک = یک run منطقی: کلید در محدودهٔ workspace/brand/action یکتاست.
  CONSTRAINT workflow_runs_idempotency_key UNIQUE (workspace_id, brand_id, intent, idempotency_key),
  CONSTRAINT workflow_runs_brand_scope_fkey FOREIGN KEY (workspace_id, brand_id) REFERENCES brands (workspace_id, id)
);
CREATE INDEX workflow_runs_brand_idx ON workflow_runs (brand_id, created_at DESC);
CREATE INDEX workflow_runs_status_idx ON workflow_runs (status, created_at);

CREATE TABLE workflow_steps (
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  run_id uuid NOT NULL,
  seq integer NOT NULL CHECK (seq > 0),
  name text NOT NULL,
  title_fa text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  input_snapshot jsonb,
  output_ref text,
  summary_fa text,
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  PRIMARY KEY (run_id, seq),
  CONSTRAINT workflow_steps_run_scope_fkey FOREIGN KEY (workspace_id, brand_id, run_id)
    REFERENCES workflow_runs (workspace_id, brand_id, id)
);

CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  week_start date NOT NULL,
  week_end date NOT NULL,
  timezone text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('proposed', 'active', 'superseded')),
  is_sample boolean NOT NULL DEFAULT false,
  brand_revision integer NOT NULL,
  generator jsonb NOT NULL,
  notes_fa jsonb NOT NULL DEFAULT '[]'::jsonb,
  run_id uuid,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, brand_id, id),
  UNIQUE (brand_id, week_start, version),
  CONSTRAINT plans_brand_scope_fkey FOREIGN KEY (workspace_id, brand_id) REFERENCES brands (workspace_id, id),
  CONSTRAINT plans_run_scope_fkey FOREIGN KEY (workspace_id, brand_id, run_id)
    REFERENCES workflow_runs (workspace_id, brand_id, id)
);
-- در هر هفته فقط یک برنامهٔ جاری برای هر برند.
CREATE UNIQUE INDEX plans_current_key ON plans (brand_id, week_start) WHERE status <> 'superseded';

CREATE TABLE schedule_entries (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  weekday text NOT NULL CHECK (weekday IN ('saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday')),
  local_date date NOT NULL,
  local_time text NOT NULL CHECK (local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- مرجع زمان همیشه UTC است؛ local_date/local_time فقط برای نمایش و ویرایش به وقت برند.
  scheduled_at_utc timestamptz NOT NULL,
  channel text NOT NULL,
  format text NOT NULL,
  pillar text NOT NULL,
  pillar_title_fa text NOT NULL,
  topic_fa text NOT NULL,
  goal_fa text NOT NULL,
  cta_fa text NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'drafted', 'skipped', 'cancelled')),
  content_id uuid,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, brand_id, id),
  CONSTRAINT schedule_entries_plan_scope_fkey FOREIGN KEY (workspace_id, brand_id, plan_id)
    REFERENCES plans (workspace_id, brand_id, id)
);
CREATE INDEX schedule_entries_due_idx ON schedule_entries (brand_id, scheduled_at_utc, status);
CREATE INDEX schedule_entries_plan_idx ON schedule_entries (plan_id);
CREATE TRIGGER schedule_entries_touch BEFORE UPDATE ON schedule_entries FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ─────────────────────────────────────── محتوا ───────────────────────────────────────

CREATE TABLE content_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  schedule_entry_id uuid,
  channel text NOT NULL,
  format text NOT NULL,
  pillar text NOT NULL,
  title_fa text NOT NULL,
  state text NOT NULL CHECK (state IN (
    'brief', 'researching', 'drafting', 'validating', 'ready_for_review', 'approved', 'scheduled',
    'publishing', 'published', 'needs_revision', 'blocked', 'cancelled', 'publishing_unknown', 'failed')),
  current_revision integer NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
  qa_status text NOT NULL DEFAULT 'not_run' CHECK (qa_status IN ('pass', 'pass_with_warnings', 'fail', 'not_run')),
  is_sample boolean NOT NULL DEFAULT false,
  scheduled_at_utc timestamptz,
  -- شمارندهٔ optimistic: هر انتقال وضعیت نسخهٔ مورد انتظار را بررسی می‌کند.
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, brand_id, id),
  CONSTRAINT content_items_brand_scope_fkey FOREIGN KEY (workspace_id, brand_id) REFERENCES brands (workspace_id, id),
  CONSTRAINT content_items_entry_scope_fkey FOREIGN KEY (workspace_id, brand_id, schedule_entry_id)
    REFERENCES schedule_entries (workspace_id, brand_id, id)
);
CREATE INDEX content_items_state_idx ON content_items (brand_id, state, updated_at DESC);
CREATE UNIQUE INDEX content_items_entry_key ON content_items (schedule_entry_id)
  WHERE schedule_entry_id IS NOT NULL AND state <> 'cancelled';
CREATE TRIGGER content_items_touch BEFORE UPDATE ON content_items FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE schedule_entries
  ADD CONSTRAINT schedule_entries_content_scope_fkey FOREIGN KEY (workspace_id, brand_id, content_id)
  REFERENCES content_items (workspace_id, brand_id, id);

CREATE TABLE briefs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  content_id uuid NOT NULL UNIQUE,
  goal text NOT NULL,
  audience text NOT NULL,
  pillar text NOT NULL,
  channel text NOT NULL,
  format text NOT NULL,
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  cta text NOT NULL,
  due_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT briefs_content_scope_fkey FOREIGN KEY (workspace_id, brand_id, content_id)
    REFERENCES content_items (workspace_id, brand_id, id)
);

-- نسخهٔ immutable؛ هر ویرایش نسخهٔ تازه است و تأیید به hash همین نسخه بسته می‌شود.
CREATE TABLE content_revisions (
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  content_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  text text NOT NULL,
  asset_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  claims jsonb NOT NULL DEFAULT '[]'::jsonb,
  qa_result jsonb NOT NULL,
  hash text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  generator jsonb NOT NULL,
  note text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_id, revision),
  CONSTRAINT content_revisions_content_scope_fkey FOREIGN KEY (workspace_id, brand_id, content_id)
    REFERENCES content_items (workspace_id, brand_id, id)
);
CREATE TRIGGER content_revisions_immutable BEFORE UPDATE OR DELETE ON content_revisions
  FOR EACH ROW EXECUTE FUNCTION app.reject_change();

-- ──────────────────────────────────── سنجه و audit ────────────────────────────────────

CREATE TABLE metric_snapshots (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  provider text NOT NULL,
  channel text,
  object_id text NOT NULL DEFAULT '',
  metric text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  -- مقدار ناموجود NULL است، نه صفر.
  value numeric,
  unit text NOT NULL,
  quality text NOT NULL CHECK (quality IN ('actual', 'estimated', 'sample', 'unavailable')),
  is_sample boolean NOT NULL DEFAULT false,
  fetched_at timestamptz NOT NULL,
  CONSTRAINT metric_snapshots_key UNIQUE (connection_id, object_id, metric, period_start, period_end),
  CONSTRAINT metric_snapshots_connection_scope_fkey FOREIGN KEY (workspace_id, brand_id, connection_id)
    REFERENCES connections (workspace_id, brand_id, id)
);
CREATE INDEX metric_snapshots_period_idx ON metric_snapshots (brand_id, period_start, period_end);

-- بدون FK به brands تا حذف/آرشیو برند رد حسابرسی را پاک نکند. متن حساس در metadata ذخیره نمی‌شود.
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  brand_id uuid,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'service', 'agent', 'system')),
  actor_id text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  outcome text NOT NULL CHECK (outcome IN ('succeeded', 'denied', 'failed')),
  trace_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_brand_idx ON audit_events (workspace_id, brand_id, occurred_at DESC);
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION app.reject_change();

-- ───────────────────────────────── جداسازی سطری (RLS) ─────────────────────────────────
-- app.workspace_id همیشه لازم است؛ اگر app.brand_id تنظیم شده باشد فقط همان برند دیده و نوشته می‌شود.
-- بدون تنظیم app.workspace_id هیچ ردیف کسب‌وکاری دیده نمی‌شود (fail closed).

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY brands_isolation ON brands
  USING (workspace_id = app.current_workspace_id()
         AND (app.current_brand_id() IS NULL OR id = app.current_brand_id()))
  WITH CHECK (workspace_id = app.current_workspace_id()
              AND (app.current_brand_id() IS NULL OR id = app.current_brand_id()));

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'brand_memberships', 'brand_versions', 'policies', 'connections', 'capabilities', 'secret_vault',
    'workflow_runs', 'workflow_steps', 'plans', 'schedule_entries', 'content_items', 'briefs',
    'content_revisions', 'metric_snapshots', 'audit_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I
         USING (workspace_id = app.current_workspace_id()
                AND (app.current_brand_id() IS NULL OR brand_id = app.current_brand_id()))
         WITH CHECK (workspace_id = app.current_workspace_id()
                     AND (app.current_brand_id() IS NULL OR brand_id = app.current_brand_id()))',
      t || '_isolation', t);
  END LOOP;
END $$;

-- ───────────────────────────────── مجوزهای نقش برنامه ─────────────────────────────────

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO studio_app;
GRANT USAGE ON SCHEMA app TO studio_app;

GRANT SELECT ON schema_metadata TO studio_app;
GRANT SELECT, INSERT, UPDATE ON
  users, workspaces, memberships, sessions, brands, brand_memberships, connections, capabilities,
  secret_vault, workflow_runs, workflow_steps, plans, schedule_entries, content_items, briefs,
  metric_snapshots
  TO studio_app;
-- جدول‌های append-only: بدون UPDATE و DELETE.
GRANT SELECT, INSERT ON brand_versions, policies, content_revisions, audit_events TO studio_app;
GRANT DELETE ON sessions, capabilities, brand_memberships TO studio_app;
