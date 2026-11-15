-- 0002_execution — اجرای کنترل‌شده (مرحلهٔ M2): ActionIntent، تأیید، انتشار، بودجه، شارژ، outbox، صف و کار دستی.
-- قواعد: هیچ side effect بیرونی بدون action_intent؛ تأیید به payload_hash بسته است؛ رویداد outbox در همان
-- تراکنش تغییر دامنه ثبت می‌شود؛ صف روی همین پایگاه داده با lease و FOR UPDATE SKIP LOCKED (ADR-015).

-- ───────────────────────────────────── ActionIntent ─────────────────────────────────────

CREATE TABLE action_intents (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  actor_id text NOT NULL,
  action_type text NOT NULL,
  category text NOT NULL CHECK (category IN ('external_publish', 'external_message', 'external_change', 'spend')),
  connection_id uuid NOT NULL,
  content_id uuid NOT NULL,
  content_revision integer NOT NULL CHECK (content_revision > 0),
  channel text NOT NULL,
  format text NOT NULL,
  target jsonb NOT NULL,
  payload_ref text NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  request_hash text NOT NULL,
  -- کلید یکتایی پایدار که به ارائه‌دهنده فرستاده می‌شود؛ در retry و reconcile ثابت می‌ماند.
  provider_key text NOT NULL,
  estimated_cost jsonb NOT NULL,
  state text NOT NULL CHECK (state IN (
    'proposed', 'authorized', 'reserved', 'executing', 'succeeded', 'awaiting_approval', 'denied',
    'awaiting_funds', 'failed', 'unknown', 'manual_required')),
  policy_revision integer NOT NULL,
  policy_reason text NOT NULL,
  scheduled_at_utc timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error jsonb,
  result jsonb,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (workspace_id, brand_id, id),
  CONSTRAINT action_intents_idempotency_key UNIQUE (workspace_id, brand_id, action_type, idempotency_key),
  CONSTRAINT action_intents_provider_key UNIQUE (connection_id, provider_key),
  CONSTRAINT action_intents_brand_scope_fkey FOREIGN KEY (workspace_id, brand_id) REFERENCES brands (workspace_id, id),
  CONSTRAINT action_intents_connection_scope_fkey FOREIGN KEY (workspace_id, brand_id, connection_id)
    REFERENCES connections (workspace_id, brand_id, id),
  CONSTRAINT action_intents_content_scope_fkey FOREIGN KEY (workspace_id, brand_id, content_id)
    REFERENCES content_items (workspace_id, brand_id, id)
);
-- یک محتوا در هر اتصال فقط یک قصد انتشار زنده دارد؛ کلیک یا کلید دوم انتشار تکراری نمی‌سازد.
CREATE UNIQUE INDEX action_intents_live_key ON action_intents (content_id, connection_id, action_type)
  WHERE state NOT IN ('denied', 'failed');
CREATE INDEX action_intents_brand_idx ON action_intents (brand_id, state, created_at DESC);
CREATE TRIGGER action_intents_touch BEFORE UPDATE ON action_intents FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- تأیید انسانی، immutable و بسته به hash همان نسخه و نسخهٔ سیاست.
CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  intent_id uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  approver_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected', 'changes_requested')),
  policy_revision integer NOT NULL,
  note text,
  approved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT approvals_intent_scope_fkey FOREIGN KEY (workspace_id, brand_id, intent_id)
    REFERENCES action_intents (workspace_id, brand_id, id)
);
CREATE INDEX approvals_intent_idx ON approvals (intent_id, approved_at DESC);
CREATE TRIGGER approvals_immutable BEFORE UPDATE OR DELETE ON approvals
  FOR EACH ROW EXECUTE FUNCTION app.reject_change();

CREATE TABLE publications (
  intent_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  content_id uuid NOT NULL,
  content_revision integer NOT NULL,
  external_id text,
  external_url text,
  provider_request_id text,
  evidence_ref text,
  -- provider: تأیید ارائه‌دهنده؛ reconciled: با پرس‌وجوی وضعیت؛ owner_reported: اعلام مالک برای مسیر دستی.
  verification text NOT NULL CHECK (verification IN ('provider', 'reconciled', 'owner_reported')),
  is_sample boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL,
  CONSTRAINT publications_intent_scope_fkey FOREIGN KEY (workspace_id, brand_id, intent_id)
    REFERENCES action_intents (workspace_id, brand_id, id)
);
CREATE INDEX publications_content_idx ON publications (content_id);

-- ───────────────────────────────────── بودجه و شارژ ─────────────────────────────────────

CREATE TABLE budget_accounts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  -- سقف به واحد خرد؛ float برای بودجه ممنوع است.
  cap_minor bigint NOT NULL CHECK (cap_minor >= 0),
  period text NOT NULL DEFAULT 'month' CHECK (period IN ('month', 'total')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, brand_id, id),
  UNIQUE (brand_id, currency),
  CONSTRAINT budget_accounts_brand_scope_fkey FOREIGN KEY (workspace_id, brand_id) REFERENCES brands (workspace_id, id)
);
CREATE TRIGGER budget_accounts_touch BEFORE UPDATE ON budget_accounts FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE budget_reservations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  account_id uuid NOT NULL,
  intent_id uuid NOT NULL UNIQUE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  status text NOT NULL CHECK (status IN ('reserved', 'committed', 'released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT budget_reservations_account_scope_fkey FOREIGN KEY (workspace_id, brand_id, account_id)
    REFERENCES budget_accounts (workspace_id, brand_id, id),
  CONSTRAINT budget_reservations_intent_scope_fkey FOREIGN KEY (workspace_id, brand_id, intent_id)
    REFERENCES action_intents (workspace_id, brand_id, id)
);
CREATE TRIGGER budget_reservations_touch BEFORE UPDATE ON budget_reservations FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE usage_ledger (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  account_id uuid,
  intent_id uuid,
  kind text NOT NULL CHECK (kind IN ('estimated', 'reserved', 'released', 'actual')),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  provider text NOT NULL,
  is_sample boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_ledger_brand_scope_fkey FOREIGN KEY (workspace_id, brand_id) REFERENCES brands (workspace_id, id)
);
CREATE INDEX usage_ledger_brand_idx ON usage_ledger (brand_id, occurred_at DESC);
CREATE TRIGGER usage_ledger_immutable BEFORE UPDATE OR DELETE ON usage_ledger
  FOR EACH ROW EXECUTE FUNCTION app.reject_change();

CREATE TABLE funding_requests (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  intent_id uuid,
  provider text NOT NULL,
  purpose text NOT NULL CHECK (length(purpose) BETWEEN 1 AND 500),
  amount bigint NOT NULL CHECK (amount >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  quote_expires_at timestamptz NOT NULL,
  payment_mode text NOT NULL CHECK (payment_mode IN ('prepaid', 'postpaid', 'subscription', 'manual')),
  status text NOT NULL CHECK (status IN (
    'proposed', 'owner_approved', 'awaiting_payment', 'verifying', 'funded', 'declined', 'expired', 'cancelled')),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT funding_requests_brand_scope_fkey FOREIGN KEY (workspace_id, brand_id) REFERENCES brands (workspace_id, id),
  CONSTRAINT funding_requests_intent_scope_fkey FOREIGN KEY (workspace_id, brand_id, intent_id)
    REFERENCES action_intents (workspace_id, brand_id, id)
);
CREATE UNIQUE INDEX funding_requests_open_key ON funding_requests (intent_id)
  WHERE intent_id IS NOT NULL AND status IN ('proposed', 'owner_approved', 'awaiting_payment', 'verifying');
CREATE TRIGGER funding_requests_touch BEFORE UPDATE ON funding_requests FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ───────────────────────────────────── کار دستی ─────────────────────────────────────

CREATE TABLE manual_tasks (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  intent_id uuid NOT NULL UNIQUE,
  kind text NOT NULL,
  state text NOT NULL CHECK (state IN ('prepared', 'assigned', 'completed_by_owner', 'verified', 'unverifiable')),
  reason_code text NOT NULL,
  instructions_fa text NOT NULL,
  package jsonb NOT NULL,
  completed_url text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_tasks_intent_scope_fkey FOREIGN KEY (workspace_id, brand_id, intent_id)
    REFERENCES action_intents (workspace_id, brand_id, id)
);
CREATE INDEX manual_tasks_brand_idx ON manual_tasks (brand_id, state, created_at DESC);
CREATE TRIGGER manual_tasks_touch BEFORE UPDATE ON manual_tasks FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ───────────────────────────────────── outbox و صف ─────────────────────────────────────

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  aggregate_id uuid NOT NULL,
  aggregate_version integer NOT NULL,
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  correlation_id text NOT NULL,
  -- فقط ارجاع و زمان؛ هیچ متن یا رازی در رویداد نیست.
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  CONSTRAINT outbox_events_brand_scope_fkey FOREIGN KEY (workspace_id, brand_id) REFERENCES brands (workspace_id, id)
);
CREATE INDEX outbox_events_pending_idx ON outbox_events (occurred_at) WHERE dispatched_at IS NULL;

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('publish', 'reconcile')),
  ref_id uuid NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  run_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  last_error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jobs_brand_scope_fkey FOREIGN KEY (workspace_id, brand_id) REFERENCES brands (workspace_id, id)
);
CREATE INDEX jobs_due_idx ON jobs (run_at) WHERE status = 'queued';
CREATE INDEX jobs_lease_idx ON jobs (lease_expires_at) WHERE status = 'running';
CREATE TRIGGER jobs_touch BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ───────────────────────── توابع worker (تنها مسیر عبور از مرز workspace) ─────────────────────────
-- worker باید کار همهٔ workspaceها را ببیند، اما نقش برنامه BYPASSRLS ندارد. این توابع با اختیار مالک
-- جدول‌ها فقط روی جدول‌های صف کار می‌کنند و جز شناسه و زمینهٔ کار چیزی برنمی‌گردانند؛ اجرای خود کار
-- دوباره در تراکنش محدود به همان workspace/brand و زیر RLS انجام می‌شود.

-- رویدادهای outbox را به job تبدیل می‌کند؛ dedupe_key پایدار تکرار را بی‌اثر می‌کند.
CREATE FUNCTION app.dispatch_outbox(p_now timestamptz, p_limit integer) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  e record;
  n integer := 0;
BEGIN
  FOR e IN
    SELECT * FROM outbox_events WHERE dispatched_at IS NULL ORDER BY occurred_at
    LIMIT p_limit FOR UPDATE SKIP LOCKED
  LOOP
    IF e.event_type IN ('action.authorized', 'action.retry_requested') THEN
      INSERT INTO jobs (workspace_id, brand_id, kind, ref_id, dedupe_key, run_at)
      VALUES (e.workspace_id, e.brand_id, 'publish', e.aggregate_id, 'job:' || e.dedupe_key,
              coalesce((e.payload ->> 'run_at')::timestamptz, p_now))
      ON CONFLICT (dedupe_key) DO NOTHING;
    ELSIF e.event_type = 'action.reconcile_requested' THEN
      INSERT INTO jobs (workspace_id, brand_id, kind, ref_id, dedupe_key, run_at)
      VALUES (e.workspace_id, e.brand_id, 'reconcile', e.aggregate_id, 'job:' || e.dedupe_key, p_now)
      ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;
    UPDATE outbox_events SET dispatched_at = p_now WHERE id = e.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- کار سررسیده یا کاری که lease آن منقضی شده (worker قبلی crash کرده) را با lease جدید برمی‌دارد.
CREATE FUNCTION app.claim_jobs(p_worker text, p_now timestamptz, p_lease_seconds integer, p_limit integer,
                               p_workspace uuid DEFAULT NULL)
  RETURNS TABLE (id uuid, workspace_id uuid, brand_id uuid, kind text, ref_id uuid, attempts integer,
                 max_attempts integer, recovered boolean)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT j.id, (j.status = 'running') AS recovered FROM jobs j
     WHERE (p_workspace IS NULL OR j.workspace_id = p_workspace)
       AND ((j.status = 'queued' AND j.run_at <= p_now)
         OR (j.status = 'running' AND j.lease_expires_at < p_now))
     ORDER BY j.run_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE jobs j
     SET status = 'running', lease_owner = p_worker,
         lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
         heartbeat_at = p_now, attempts = j.attempts + 1
    FROM due
   WHERE j.id = due.id
  RETURNING j.id, j.workspace_id, j.brand_id, j.kind, j.ref_id, j.attempts, j.max_attempts, due.recovered;
END $$;

-- پایان کار فقط توسط صاحب lease؛ worker دیگری که lease را گرفته باشد بازنویسی نمی‌شود.
CREATE FUNCTION app.finish_job(p_id uuid, p_worker text, p_status text, p_run_at timestamptz, p_error jsonb)
  RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  found_row boolean;
BEGIN
  IF p_status NOT IN ('queued', 'succeeded', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid job status %', p_status;
  END IF;
  UPDATE jobs
     SET status = p_status,
         run_at = coalesce(p_run_at, run_at),
         -- بازگرداندن به صف به دلیل توقف یا زمان‌بندی تلاش حساب نمی‌شود.
         attempts = CASE WHEN p_status = 'queued' AND p_error IS NULL THEN greatest(attempts - 1, 0) ELSE attempts END,
         last_error = p_error, lease_owner = NULL, lease_expires_at = NULL
   WHERE id = p_id AND lease_owner = p_worker AND status = 'running';
  GET DIAGNOSTICS found_row = ROW_COUNT;
  RETURN found_row;
END $$;

CREATE FUNCTION app.heartbeat_job(p_id uuid, p_worker text, p_now timestamptz, p_lease_seconds integer)
  RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  found_row boolean;
BEGIN
  UPDATE jobs SET heartbeat_at = p_now, lease_expires_at = p_now + make_interval(secs => p_lease_seconds)
   WHERE id = p_id AND lease_owner = p_worker AND status = 'running';
  GET DIAGNOSTICS found_row = ROW_COUNT;
  RETURN found_row;
END $$;

REVOKE ALL ON FUNCTION app.dispatch_outbox(timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.claim_jobs(text, timestamptz, integer, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.finish_job(uuid, text, text, timestamptz, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.heartbeat_job(uuid, text, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.dispatch_outbox(timestamptz, integer) TO studio_app;
GRANT EXECUTE ON FUNCTION app.claim_jobs(text, timestamptz, integer, integer, uuid) TO studio_app;
GRANT EXECUTE ON FUNCTION app.finish_job(uuid, text, text, timestamptz, jsonb) TO studio_app;
GRANT EXECUTE ON FUNCTION app.heartbeat_job(uuid, text, timestamptz, integer) TO studio_app;

-- ───────────────────────────────── جداسازی سطری (RLS) ─────────────────────────────────

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'action_intents', 'approvals', 'publications', 'budget_accounts', 'budget_reservations', 'usage_ledger',
    'funding_requests', 'manual_tasks', 'outbox_events', 'jobs'
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

GRANT SELECT, INSERT, UPDATE ON
  action_intents, publications, budget_accounts, budget_reservations, funding_requests, manual_tasks,
  outbox_events
  TO studio_app;
-- صف فقط از مسیر توابع بالا تغییر می‌کند؛ نقش برنامه آن را می‌خواند.
GRANT SELECT ON jobs TO studio_app;
GRANT SELECT, INSERT ON approvals, usage_ledger TO studio_app;
