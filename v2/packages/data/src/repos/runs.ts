import type {
  ErrorCode,
  Money,
  RunIntent,
  RunState,
  RunStepView,
  RunView,
  StepState,
} from '@studio/contracts';
import { iso, type Tx } from '../db.ts';

export interface RunRow {
  id: string;
  workspace_id: string;
  brand_id: string;
  intent: RunIntent;
  workflow_id: string;
  workflow_version: string;
  status: RunState;
  idempotency_key: string;
  request_hash: string;
  is_sample: boolean;
  scope_fa: string;
  cost_cap: Money | null;
  input: Record<string, unknown>;
  result: RunView['result'];
  error: RunView['error'];
  created_by: string;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

const RUN_COLUMNS =
  'id, workspace_id, brand_id, intent, workflow_id, workflow_version, status, idempotency_key, request_hash, is_sample, scope_fa, cost_cap, input, result, error, created_by, created_at, started_at, finished_at';

export const RUN_IDEMPOTENCY_CONSTRAINT = 'workflow_runs_idempotency_key';

export async function insertRun(
  tx: Tx,
  input: {
    workspace_id: string;
    brand_id: string;
    intent: RunIntent;
    workflow_id: string;
    workflow_version: string;
    idempotency_key: string;
    request_hash: string;
    is_sample: boolean;
    scope_fa: string;
    cost_cap: Money | null;
    input: Record<string, unknown>;
    created_by: string;
    steps: { name: string; title_fa: string }[];
  },
): Promise<RunRow | null> {
  // ON CONFLICT DO NOTHING: درخواست هم‌زمان دوم (دوبار کلیک) ردیف تازه نمی‌سازد و null می‌گیرد.
  const result = await tx.query<RunRow>(
    `INSERT INTO workflow_runs (workspace_id, brand_id, intent, workflow_id, workflow_version, status,
                                idempotency_key, request_hash, is_sample, scope_fa, cost_cap, input, created_by)
     VALUES ($1, $2, $3, $4, $5, 'queued', $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT ON CONSTRAINT ${RUN_IDEMPOTENCY_CONSTRAINT} DO NOTHING
     RETURNING ${RUN_COLUMNS}`,
    [
      input.workspace_id, input.brand_id, input.intent, input.workflow_id, input.workflow_version,
      input.idempotency_key, input.request_hash, input.is_sample, input.scope_fa,
      input.cost_cap ? JSON.stringify(input.cost_cap) : null, JSON.stringify(input.input), input.created_by,
    ],
  );
  const run = result.rows[0];
  if (!run) return null;
  let seq = 0;
  for (const step of input.steps) {
    seq += 1;
    await tx.query(
      `INSERT INTO workflow_steps (workspace_id, brand_id, run_id, seq, name, title_fa, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [input.workspace_id, input.brand_id, run.id, seq, step.name, step.title_fa],
    );
  }
  return run;
}

export async function findRunByKey(
  tx: Tx,
  brandId: string,
  intent: RunIntent,
  idempotencyKey: string,
): Promise<RunRow | null> {
  const result = await tx.query<RunRow>(
    `SELECT ${RUN_COLUMNS} FROM workflow_runs WHERE brand_id = $1 AND intent = $2 AND idempotency_key = $3`,
    [brandId, intent, idempotencyKey],
  );
  return result.rows[0] ?? null;
}

export async function getRun(tx: Tx, runId: string): Promise<RunRow | null> {
  const result = await tx.query<RunRow>(`SELECT ${RUN_COLUMNS} FROM workflow_runs WHERE id = $1`, [runId]);
  return result.rows[0] ?? null;
}

export async function listRuns(tx: Tx, brandId: string, limit = 30): Promise<RunRow[]> {
  const result = await tx.query<RunRow>(
    `SELECT ${RUN_COLUMNS} FROM workflow_runs WHERE brand_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [brandId, limit],
  );
  return result.rows;
}

/** انتقال وضعیت run فقط از وضعیت مورد انتظار؛ در غیر این صورت false (اجرای هم‌زمان دوم جلو نمی‌رود). */
export async function transitionRun(
  tx: Tx,
  runId: string,
  from: RunState,
  to: RunState,
  patch: { result?: RunView['result']; error?: RunView['error'] } = {},
): Promise<boolean> {
  const result = await tx.query(
    `UPDATE workflow_runs
        SET status = $3,
            started_at = CASE WHEN $3 = 'running' AND started_at IS NULL THEN now() ELSE started_at END,
            finished_at = CASE WHEN $3 IN ('succeeded', 'partially_succeeded', 'failed', 'cancelled') THEN now() ELSE finished_at END,
            result = coalesce($4, result),
            error = coalesce($5, error),
            version = version + 1
      WHERE id = $1 AND status = $2`,
    [
      runId, from, to, patch.result ? JSON.stringify(patch.result) : null,
      patch.error ? JSON.stringify(patch.error) : null,
    ],
  );
  return result.rowCount === 1;
}

export async function updateStep(
  tx: Tx,
  runId: string,
  seq: number,
  patch: {
    status: StepState;
    input_snapshot?: Record<string, unknown>;
    output_ref?: string | null;
    summary_fa?: string | null;
    error_code?: ErrorCode | null;
  },
): Promise<void> {
  await tx.query(
    `UPDATE workflow_steps
        SET status = $3,
            input_snapshot = coalesce($4, input_snapshot),
            output_ref = coalesce($5, output_ref),
            summary_fa = coalesce($6, summary_fa),
            error_code = coalesce($7, error_code),
            started_at = CASE WHEN $3 = 'running' THEN now() ELSE started_at END,
            finished_at = CASE WHEN $3 IN ('succeeded', 'failed', 'skipped') THEN now() ELSE finished_at END
      WHERE run_id = $1 AND seq = $2`,
    [
      runId, seq, patch.status, patch.input_snapshot ? JSON.stringify(patch.input_snapshot) : null,
      patch.output_ref ?? null, patch.summary_fa ?? null, patch.error_code ?? null,
    ],
  );
}

export async function listSteps(tx: Tx, runIds: string[]): Promise<Map<string, RunStepView[]>> {
  const byRun = new Map<string, RunStepView[]>();
  if (runIds.length === 0) return byRun;
  const result = await tx.query<{
    run_id: string; seq: number; name: string; title_fa: string; status: StepState;
    started_at: Date | null; finished_at: Date | null; summary_fa: string | null; error_code: ErrorCode | null;
  }>(
    `SELECT run_id, seq, name, title_fa, status, started_at, finished_at, summary_fa, error_code
       FROM workflow_steps WHERE run_id = ANY($1::uuid[]) ORDER BY run_id, seq`,
    [runIds],
  );
  for (const row of result.rows) {
    const { run_id: runId, ...step } = row;
    byRun.set(runId, [
      ...(byRun.get(runId) ?? []),
      { ...step, started_at: iso(step.started_at), finished_at: iso(step.finished_at) },
    ]);
  }
  return byRun;
}

export async function countOpenRuns(tx: Tx, brandId: string): Promise<number> {
  const result = await tx.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM workflow_runs
      WHERE brand_id = $1 AND status NOT IN ('succeeded', 'partially_succeeded', 'failed', 'cancelled')`,
    [brandId],
  );
  return result.rows[0]?.count ?? 0;
}

export function toRunView(row: RunRow, steps: RunStepView[], replayed: boolean): RunView {
  return {
    id: row.id,
    brand_id: row.brand_id,
    intent: row.intent,
    status: row.status,
    idempotency_key: row.idempotency_key,
    workflow: { id: row.workflow_id, version: row.workflow_version },
    is_sample: row.is_sample,
    scope_fa: row.scope_fa,
    cost_cap: row.cost_cap,
    result: row.result,
    error: row.error,
    steps,
    replayed,
    created_at: iso(row.created_at),
    started_at: iso(row.started_at),
    finished_at: iso(row.finished_at),
  };
}
