import type {
  ActionState,
  ApprovalDecision,
  BillingMode,
  Channel,
  ContentFormat,
  ErrorCode,
  FundingRequestState,
  ManualTaskState,
  Money,
} from '@studio/contracts';
import { iso, type Tx } from '../db.ts';

/* ─────────────────────────────────── ActionIntent ─────────────────────────────────── */

export type IntentCategory = 'external_publish' | 'external_message' | 'external_change' | 'spend';

export interface IntentRow {
  id: string;
  workspace_id: string;
  brand_id: string;
  actor_id: string;
  action_type: string;
  category: IntentCategory;
  connection_id: string;
  content_id: string;
  content_revision: number;
  channel: Channel;
  format: ContentFormat;
  target: Record<string, unknown>;
  payload_ref: string;
  payload_hash: string;
  idempotency_key: string;
  request_hash: string;
  provider_key: string;
  estimated_cost: Money;
  state: ActionState;
  policy_revision: number;
  policy_reason: string;
  scheduled_at_utc: Date;
  expires_at: Date;
  attempts: number;
  last_error: { code: ErrorCode; message_fa: string } | null;
  result: {
    external_id: string | null;
    external_url: string | null;
    evidence_ref: string | null;
    verification: 'provider' | 'reconciled' | 'owner_reported';
  } | null;
  is_sample: boolean;
  created_at: Date;
  updated_at: Date;
  version: number;
}

const INTENT_COLUMNS =
  'id, workspace_id, brand_id, actor_id, action_type, category, connection_id, content_id, content_revision, channel, format, target, payload_ref, payload_hash, idempotency_key, request_hash, provider_key, estimated_cost, state, policy_revision, policy_reason, scheduled_at_utc, expires_at, attempts, last_error, result, is_sample, created_at, updated_at, version';

export const INTENT_IDEMPOTENCY_CONSTRAINT = 'action_intents_idempotency_key';
export const INTENT_LIVE_CONSTRAINT = 'action_intents_live_key';

export async function insertIntent(
  tx: Tx,
  input: Omit<IntentRow, 'id' | 'attempts' | 'last_error' | 'result' | 'created_at' | 'updated_at' | 'version'
    | 'scheduled_at_utc' | 'expires_at'> & { scheduled_at_utc: string; expires_at: string },
): Promise<IntentRow> {
  const result = await tx.query<IntentRow>(
    `INSERT INTO action_intents (workspace_id, brand_id, actor_id, action_type, category, connection_id, content_id,
                                 content_revision, channel, format, target, payload_ref, payload_hash, idempotency_key,
                                 request_hash, provider_key, estimated_cost, state, policy_revision, policy_reason,
                                 scheduled_at_utc, expires_at, is_sample)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
     RETURNING ${INTENT_COLUMNS}`,
    [
      input.workspace_id, input.brand_id, input.actor_id, input.action_type, input.category, input.connection_id,
      input.content_id, input.content_revision, input.channel, input.format, JSON.stringify(input.target),
      input.payload_ref, input.payload_hash, input.idempotency_key, input.request_hash, input.provider_key,
      JSON.stringify(input.estimated_cost), input.state, input.policy_revision, input.policy_reason,
      input.scheduled_at_utc, input.expires_at, input.is_sample,
    ],
  );
  return result.rows[0] as IntentRow;
}

export async function findIntentByKey(
  tx: Tx,
  brandId: string,
  actionType: string,
  key: string,
): Promise<IntentRow | null> {
  const result = await tx.query<IntentRow>(
    `SELECT ${INTENT_COLUMNS} FROM action_intents WHERE brand_id = $1 AND action_type = $2 AND idempotency_key = $3`,
    [brandId, actionType, key],
  );
  return result.rows[0] ?? null;
}

export async function findLiveIntent(
  tx: Tx,
  contentId: string,
  connectionId: string,
  actionType: string,
): Promise<IntentRow | null> {
  const result = await tx.query<IntentRow>(
    `SELECT ${INTENT_COLUMNS} FROM action_intents
      WHERE content_id = $1 AND connection_id = $2 AND action_type = $3 AND state NOT IN ('denied', 'failed')`,
    [contentId, connectionId, actionType],
  );
  return result.rows[0] ?? null;
}

/** با forUpdate ردیف تا پایان تراکنش قفل می‌شود؛ دو worker هم‌زمان یک قصد را پردازش نمی‌کنند. */
export async function getIntent(tx: Tx, intentId: string, forUpdate = false): Promise<IntentRow | null> {
  const result = await tx.query<IntentRow>(
    `SELECT ${INTENT_COLUMNS} FROM action_intents WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [intentId],
  );
  return result.rows[0] ?? null;
}

export async function listIntents(
  tx: Tx,
  brandId: string,
  filter: { state?: ActionState; content_id?: string } = {},
): Promise<IntentRow[]> {
  const result = await tx.query<IntentRow>(
    `SELECT ${INTENT_COLUMNS} FROM action_intents
      WHERE brand_id = $1 AND ($2::text IS NULL OR state = $2) AND ($3::uuid IS NULL OR content_id = $3)
      ORDER BY created_at DESC LIMIT 200`,
    [brandId, filter.state ?? null, filter.content_id ?? null],
  );
  return result.rows;
}

/** قصدهای زندهٔ یک محتوا که هنوز چیزی ارسال نکرده‌اند (برای باطل‌کردن با ویرایش). */
export async function listPendingIntentsForContent(tx: Tx, contentId: string): Promise<IntentRow[]> {
  const result = await tx.query<IntentRow>(
    `SELECT ${INTENT_COLUMNS} FROM action_intents
      WHERE content_id = $1 AND state IN ('proposed', 'awaiting_approval', 'awaiting_funds', 'authorized', 'reserved', 'manual_required')
      FOR UPDATE`,
    [contentId],
  );
  return result.rows;
}

/**
 * انتقال وضعیت با شرط وضعیت فعلی؛ اگر وضعیت در این فاصله عوض شده باشد null برمی‌گردد.
 * این شرط همان قفل منطقی است که مانع اجرای دوبارهٔ یک قصد می‌شود.
 */
export async function transitionIntent(
  tx: Tx,
  intentId: string,
  from: ActionState,
  to: ActionState,
  patch: {
    attempts_increment?: boolean;
    last_error?: { code: ErrorCode; message_fa: string } | null;
    result?: IntentRow['result'];
    policy_revision?: number;
    policy_reason?: string;
  } = {},
): Promise<IntentRow | null> {
  const result = await tx.query<IntentRow>(
    `UPDATE action_intents
        SET state = $3,
            attempts = attempts + CASE WHEN $4 THEN 1 ELSE 0 END,
            last_error = CASE WHEN $5 THEN $6::jsonb ELSE last_error END,
            result = coalesce($7::jsonb, result),
            policy_revision = coalesce($8, policy_revision),
            policy_reason = coalesce($9, policy_reason),
            version = version + 1
      WHERE id = $1 AND state = $2
      RETURNING ${INTENT_COLUMNS}`,
    [
      intentId, from, to, patch.attempts_increment ?? false, patch.last_error !== undefined,
      patch.last_error ? JSON.stringify(patch.last_error) : null,
      patch.result ? JSON.stringify(patch.result) : null, patch.policy_revision ?? null, patch.policy_reason ?? null,
    ],
  );
  return result.rows[0] ?? null;
}

/* ───────────────────────────────────── تأیید ───────────────────────────────────── */

export interface ApprovalRow {
  id: string;
  intent_id: string;
  payload_hash: string;
  approver_id: string;
  decision: ApprovalDecision;
  policy_revision: number;
  note: string | null;
  approved_at: Date;
  expires_at: Date;
}

export async function insertApproval(
  tx: Tx,
  input: Omit<ApprovalRow, 'id' | 'approved_at' | 'expires_at'> & {
    workspace_id: string;
    brand_id: string;
    approved_at: string;
    expires_at: string;
  },
): Promise<ApprovalRow> {
  const result = await tx.query<ApprovalRow>(
    `INSERT INTO approvals (workspace_id, brand_id, intent_id, payload_hash, approver_id, decision, policy_revision,
                            note, approved_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, intent_id, payload_hash, approver_id, decision, policy_revision, note, approved_at, expires_at`,
    [
      input.workspace_id, input.brand_id, input.intent_id, input.payload_hash, input.approver_id, input.decision,
      input.policy_revision, input.note, input.approved_at, input.expires_at,
    ],
  );
  return result.rows[0] as ApprovalRow;
}

export async function listApprovals(tx: Tx, intentIds: string[]): Promise<Map<string, ApprovalRow[]>> {
  const map = new Map<string, ApprovalRow[]>();
  if (intentIds.length === 0) return map;
  const result = await tx.query<ApprovalRow>(
    `SELECT id, intent_id, payload_hash, approver_id, decision, policy_revision, note, approved_at, expires_at
       FROM approvals WHERE intent_id = ANY($1::uuid[]) ORDER BY approved_at DESC`,
    [intentIds],
  );
  for (const row of result.rows) map.set(row.intent_id, [...(map.get(row.intent_id) ?? []), row]);
  return map;
}

/* ───────────────────────────────────── outbox ───────────────────────────────────── */

export async function insertOutbox(
  tx: Tx,
  input: {
    workspace_id: string;
    brand_id: string;
    aggregate_id: string;
    aggregate_version: number;
    event_type: string;
    correlation_id: string;
    payload: Record<string, unknown>;
    dedupe_key: string;
  },
): Promise<boolean> {
  const result = await tx.query(
    `INSERT INTO outbox_events (workspace_id, brand_id, aggregate_id, aggregate_version, event_type, correlation_id,
                                payload, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (dedupe_key) DO NOTHING`,
    [
      input.workspace_id, input.brand_id, input.aggregate_id, input.aggregate_version, input.event_type,
      input.correlation_id, JSON.stringify(input.payload), input.dedupe_key,
    ],
  );
  return (result.rowCount ?? 0) > 0;
}

/* ──────────────────────────────────── انتشار ──────────────────────────────────── */

export async function insertPublication(
  tx: Tx,
  input: {
    workspace_id: string;
    brand_id: string;
    intent_id: string;
    connection_id: string;
    content_id: string;
    content_revision: number;
    external_id: string | null;
    external_url: string | null;
    provider_request_id: string | null;
    evidence_ref: string | null;
    verification: 'provider' | 'reconciled' | 'owner_reported';
    is_sample: boolean;
    published_at: string;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO publications (workspace_id, brand_id, intent_id, connection_id, content_id, content_revision,
                               external_id, external_url, provider_request_id, evidence_ref, verification, is_sample,
                               published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (intent_id) DO NOTHING`,
    [
      input.workspace_id, input.brand_id, input.intent_id, input.connection_id, input.content_id,
      input.content_revision, input.external_id, input.external_url, input.provider_request_id, input.evidence_ref,
      input.verification, input.is_sample, input.published_at,
    ],
  );
}

export async function countPublications(tx: Tx, contentId: string): Promise<number> {
  const result = await tx.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM publications WHERE content_id = $1',
    [contentId],
  );
  return result.rows[0]?.count ?? 0;
}

/* ──────────────────────────────────── کار دستی ──────────────────────────────────── */

export interface ManualTaskRow {
  id: string;
  brand_id: string;
  intent_id: string;
  kind: string;
  state: ManualTaskState;
  reason_code: string;
  instructions_fa: string;
  package: {
    channel: Channel;
    format: ContentFormat;
    text: string;
    content_hash: string;
    scheduled_at_utc: string;
    is_sample: boolean;
  };
  completed_url: string | null;
  completed_at: Date | null;
  created_at: Date;
}

const TASK_COLUMNS =
  'id, brand_id, intent_id, kind, state, reason_code, instructions_fa, package, completed_url, completed_at, created_at';

export async function insertManualTask(
  tx: Tx,
  input: Omit<ManualTaskRow, 'id' | 'completed_url' | 'completed_at' | 'created_at' | 'brand_id'> & {
    workspace_id: string;
    brand_id: string;
  },
): Promise<ManualTaskRow> {
  const result = await tx.query<ManualTaskRow>(
    `INSERT INTO manual_tasks (workspace_id, brand_id, intent_id, kind, state, reason_code, instructions_fa, package)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (intent_id) DO UPDATE SET updated_at = now()
     RETURNING ${TASK_COLUMNS}`,
    [
      input.workspace_id, input.brand_id, input.intent_id, input.kind, input.state, input.reason_code,
      input.instructions_fa, JSON.stringify(input.package),
    ],
  );
  return result.rows[0] as ManualTaskRow;
}

export async function listManualTasks(tx: Tx, brandId: string): Promise<ManualTaskRow[]> {
  const result = await tx.query<ManualTaskRow>(
    `SELECT ${TASK_COLUMNS} FROM manual_tasks WHERE brand_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [brandId],
  );
  return result.rows;
}

export async function getManualTask(tx: Tx, taskId: string): Promise<ManualTaskRow | null> {
  const result = await tx.query<ManualTaskRow>(`SELECT ${TASK_COLUMNS} FROM manual_tasks WHERE id = $1 FOR UPDATE`, [taskId]);
  return result.rows[0] ?? null;
}

export async function taskIdsByIntent(tx: Tx, intentIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (intentIds.length === 0) return map;
  const result = await tx.query<{ id: string; intent_id: string }>(
    'SELECT id, intent_id FROM manual_tasks WHERE intent_id = ANY($1::uuid[])',
    [intentIds],
  );
  for (const row of result.rows) map.set(row.intent_id, row.id);
  return map;
}

export async function completeManualTask(
  tx: Tx,
  taskId: string,
  from: ManualTaskState,
  url: string,
  at: string,
): Promise<ManualTaskRow | null> {
  const result = await tx.query<ManualTaskRow>(
    `UPDATE manual_tasks SET state = 'completed_by_owner', completed_url = $3, completed_at = $4
      WHERE id = $1 AND state = $2 RETURNING ${TASK_COLUMNS}`,
    [taskId, from, url, at],
  );
  return result.rows[0] ?? null;
}

/* ───────────────────────────────────── بودجه ───────────────────────────────────── */

export interface BudgetAccountRow {
  id: string;
  brand_id: string;
  currency: string;
  cap_minor: string;
  period: 'month' | 'total';
}

export async function upsertBudgetAccount(
  tx: Tx,
  input: { workspace_id: string; brand_id: string; currency: string; cap_minor: number; period?: 'month' | 'total' },
): Promise<BudgetAccountRow> {
  const result = await tx.query<BudgetAccountRow>(
    `INSERT INTO budget_accounts (workspace_id, brand_id, currency, cap_minor, period)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (brand_id, currency) DO UPDATE SET cap_minor = EXCLUDED.cap_minor, period = EXCLUDED.period
     RETURNING id, brand_id, currency, cap_minor, period`,
    [input.workspace_id, input.brand_id, input.currency, input.cap_minor, input.period ?? 'month'],
  );
  return result.rows[0] as BudgetAccountRow;
}

/**
 * رزرو بودجه در بخش بحرانی: ردیف حساب قفل می‌شود، پس دو رزرو هم‌زمان مجموع را از سقف عبور نمی‌دهند (A10).
 * نتیجه: reserved یا no_account (حساب بودجه برای این ارز تعریف نشده) یا over_cap.
 */
export async function reserveBudget(
  tx: Tx,
  input: {
    workspace_id: string;
    brand_id: string;
    intent_id: string;
    amount: Money;
    provider: string;
    is_sample: boolean;
    period_start: string;
  },
): Promise<'reserved' | 'no_account' | 'over_cap'> {
  const account = await tx.query<BudgetAccountRow>(
    `SELECT id, brand_id, currency, cap_minor, period FROM budget_accounts
      WHERE brand_id = $1 AND currency = $2 FOR UPDATE`,
    [input.brand_id, input.amount.currency],
  );
  const row = account.rows[0];
  if (!row) return 'no_account';
  const used = await tx.query<{ total: string }>(
    `SELECT coalesce(sum(r.amount_minor), 0)::text AS total FROM budget_reservations r
      WHERE r.account_id = $1 AND r.status IN ('reserved', 'committed')
        AND ($2::text = 'total' OR r.created_at >= $3::timestamptz)`,
    [row.id, row.period, input.period_start],
  );
  const total = BigInt(used.rows[0]?.total ?? '0') + BigInt(input.amount.amount_minor);
  if (total > BigInt(row.cap_minor)) return 'over_cap';
  await tx.query(
    `INSERT INTO budget_reservations (workspace_id, brand_id, account_id, intent_id, amount_minor, status)
     VALUES ($1, $2, $3, $4, $5, 'reserved')
     ON CONFLICT (intent_id) DO UPDATE SET status = 'reserved', amount_minor = EXCLUDED.amount_minor`,
    [input.workspace_id, input.brand_id, row.id, input.intent_id, input.amount.amount_minor],
  );
  await insertLedger(tx, {
    workspace_id: input.workspace_id,
    brand_id: input.brand_id,
    account_id: row.id,
    intent_id: input.intent_id,
    kind: 'reserved',
    amount: input.amount,
    provider: input.provider,
    is_sample: input.is_sample,
  });
  return 'reserved';
}

export async function settleReservation(
  tx: Tx,
  intentId: string,
  status: 'committed' | 'released',
): Promise<void> {
  await tx.query(
    `UPDATE budget_reservations SET status = $2 WHERE intent_id = $1 AND status = 'reserved'`,
    [intentId, status],
  );
}

export async function insertLedger(
  tx: Tx,
  input: {
    workspace_id: string;
    brand_id: string;
    account_id: string | null;
    intent_id: string | null;
    kind: 'estimated' | 'reserved' | 'released' | 'actual';
    amount: Money;
    provider: string;
    is_sample: boolean;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO usage_ledger (workspace_id, brand_id, account_id, intent_id, kind, amount_minor, currency, provider, is_sample)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.workspace_id, input.brand_id, input.account_id, input.intent_id, input.kind, input.amount.amount_minor,
      input.amount.currency, input.provider, input.is_sample,
    ],
  );
}

/** مجموع هزینهٔ واقعی به تفکیک ارز؛ ارزها هرگز با هم جمع نمی‌شوند. */
export async function actualSpend(tx: Tx, brandId: string | null, since: string): Promise<Money[]> {
  const result = await tx.query<{ currency: string; total: string }>(
    `SELECT currency, sum(amount_minor)::text AS total FROM usage_ledger
      WHERE kind = 'actual' AND ($1::uuid IS NULL OR brand_id = $1) AND occurred_at >= $2
      GROUP BY currency ORDER BY currency`,
    [brandId, since],
  );
  return result.rows
    .map((row) => ({ amount_minor: Number(row.total), currency: row.currency as Money['currency'] }))
    .filter((money) => money.amount_minor > 0);
}

/* ──────────────────────────────────── شارژ ──────────────────────────────────── */

export interface FundingRow {
  id: string;
  brand_id: string;
  intent_id: string | null;
  provider: string;
  purpose: string;
  amount: string;
  currency: string;
  quote_expires_at: Date;
  payment_mode: BillingMode;
  status: FundingRequestState;
  decided_by: string | null;
  decided_at: Date | null;
  version: number;
  created_at: Date;
}

const FUNDING_COLUMNS =
  'id, brand_id, intent_id, provider, purpose, amount, currency, quote_expires_at, payment_mode, status, decided_by, decided_at, version, created_at';

export async function insertFunding(
  tx: Tx,
  input: {
    workspace_id: string;
    brand_id: string;
    intent_id: string | null;
    provider: string;
    purpose: string;
    amount: Money;
    quote_expires_at: string;
    payment_mode: BillingMode;
  },
): Promise<FundingRow> {
  const result = await tx.query<FundingRow>(
    `INSERT INTO funding_requests (workspace_id, brand_id, intent_id, provider, purpose, amount, currency,
                                   quote_expires_at, payment_mode, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'proposed') RETURNING ${FUNDING_COLUMNS}`,
    [
      input.workspace_id, input.brand_id, input.intent_id, input.provider, input.purpose, input.amount.amount_minor,
      input.amount.currency, input.quote_expires_at, input.payment_mode,
    ],
  );
  return result.rows[0] as FundingRow;
}

export async function listFunding(tx: Tx, brandId: string): Promise<FundingRow[]> {
  const result = await tx.query<FundingRow>(
    `SELECT ${FUNDING_COLUMNS} FROM funding_requests WHERE brand_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [brandId],
  );
  return result.rows;
}

export async function getFunding(tx: Tx, id: string): Promise<FundingRow | null> {
  const result = await tx.query<FundingRow>(`SELECT ${FUNDING_COLUMNS} FROM funding_requests WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function fundingIdsByIntent(tx: Tx, intentIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (intentIds.length === 0) return map;
  const result = await tx.query<{ id: string; intent_id: string }>(
    `SELECT DISTINCT ON (intent_id) id, intent_id FROM funding_requests
      WHERE intent_id = ANY($1::uuid[]) ORDER BY intent_id, created_at DESC`,
    [intentIds],
  );
  for (const row of result.rows) map.set(row.intent_id, row.id);
  return map;
}

export async function updateFunding(
  tx: Tx,
  id: string,
  expectedVersion: number,
  status: FundingRequestState,
  decidedBy: string,
  at: string,
): Promise<FundingRow | null> {
  const result = await tx.query<FundingRow>(
    `UPDATE funding_requests SET status = $3, decided_by = $4, decided_at = $5, version = version + 1
      WHERE id = $1 AND version = $2 RETURNING ${FUNDING_COLUMNS}`,
    [id, expectedVersion, status, decidedBy, at],
  );
  return result.rows[0] ?? null;
}

/* ──────────────────────────────────── صف (worker) ──────────────────────────────────── */

export interface ClaimedJob {
  id: string;
  workspace_id: string;
  brand_id: string;
  kind: 'publish' | 'reconcile';
  ref_id: string;
  attempts: number;
  max_attempts: number;
  /** true یعنی lease worker قبلی منقضی شده است (احتمال crash میان ارسال و ثبت نتیجه). */
  recovered: boolean;
}

export async function dispatchOutbox(tx: Tx, now: Date, limit = 100): Promise<number> {
  const result = await tx.query<{ n: number }>('SELECT app.dispatch_outbox($1, $2) AS n', [now.toISOString(), limit]);
  return result.rows[0]?.n ?? 0;
}

export async function claimJobs(
  tx: Tx,
  worker: string,
  now: Date,
  leaseSeconds: number,
  limit: number,
  workspaceId: string | null = null,
): Promise<ClaimedJob[]> {
  const result = await tx.query<ClaimedJob>(
    'SELECT * FROM app.claim_jobs($1, $2, $3, $4, $5)',
    [worker, now.toISOString(), leaseSeconds, limit, workspaceId],
  );
  return result.rows;
}

export async function finishJob(
  tx: Tx,
  input: {
    id: string;
    worker: string;
    status: 'queued' | 'succeeded' | 'failed' | 'cancelled';
    run_at?: Date | null;
    error?: { code: string; message_fa: string } | null;
  },
): Promise<boolean> {
  const result = await tx.query<{ ok: boolean }>(
    'SELECT app.finish_job($1, $2, $3, $4, $5) AS ok',
    [
      input.id, input.worker, input.status, input.run_at ? input.run_at.toISOString() : null,
      input.error ? JSON.stringify(input.error) : null,
    ],
  );
  return result.rows[0]?.ok ?? false;
}

export async function heartbeatJob(tx: Tx, id: string, worker: string, now: Date, leaseSeconds: number): Promise<boolean> {
  const result = await tx.query<{ ok: boolean }>('SELECT app.heartbeat_job($1, $2, $3, $4) AS ok', [
    id, worker, now.toISOString(), leaseSeconds,
  ]);
  return result.rows[0]?.ok ?? false;
}

export const toIso = iso;
