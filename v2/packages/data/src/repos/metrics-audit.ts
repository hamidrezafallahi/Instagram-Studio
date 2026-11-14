import type { ActorType, AuditEvent, MetricPoint } from '@studio/contracts';
import { iso, type Tx } from '../db.ts';

export interface SnapshotRecord {
  provider: string;
  channel: string | null;
  metric: string;
  value: number | null;
  unit: string;
  quality: MetricPoint['quality'];
  is_sample: boolean;
  fetched_at: string;
}

/** سنجهٔ تکراری همان دوره به‌روز می‌شود و ردیف دوم نمی‌سازد. مقدار ناموجود NULL ذخیره می‌شود. */
export async function upsertMetricSnapshots(
  tx: Tx,
  input: {
    workspace_id: string;
    brand_id: string;
    connection_id: string;
    provider: string;
    channel: string | null;
    is_sample: boolean;
    fetched_at: string;
    points: readonly MetricPoint[];
  },
): Promise<number> {
  let stored = 0;
  for (const point of input.points) {
    await tx.query(
      `INSERT INTO metric_snapshots (workspace_id, brand_id, connection_id, provider, channel, object_id, metric,
                                     period_start, period_end, value, unit, quality, is_sample, fetched_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT ON CONSTRAINT metric_snapshots_key
       DO UPDATE SET value = EXCLUDED.value, unit = EXCLUDED.unit, quality = EXCLUDED.quality,
                     is_sample = EXCLUDED.is_sample, fetched_at = EXCLUDED.fetched_at`,
      [
        input.workspace_id, input.brand_id, input.connection_id, input.provider, input.channel,
        point.object_id ?? '', point.metric, point.period_start, point.period_end, point.value, point.unit,
        point.quality, input.is_sample, input.fetched_at,
      ],
    );
    stored += 1;
  }
  return stored;
}

export async function listSnapshots(
  tx: Tx,
  brandId: string,
  range: { start: string; end: string },
): Promise<SnapshotRecord[]> {
  const result = await tx.query<{
    provider: string; channel: string | null; metric: string; value: string | null; unit: string;
    quality: MetricPoint['quality']; is_sample: boolean; fetched_at: Date;
  }>(
    `SELECT provider, channel, metric, value, unit, quality, is_sample, fetched_at
       FROM metric_snapshots
      WHERE brand_id = $1 AND period_start >= $2 AND period_end <= $3`,
    [brandId, range.start, range.end],
  );
  return result.rows.map((row) => ({
    ...row,
    value: row.value === null ? null : Number(row.value),
    fetched_at: iso(row.fetched_at),
  }));
}

export interface AuditInput {
  workspace_id: string;
  brand_id: string | null;
  actor_type: ActorType;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  outcome: AuditEvent['outcome'];
  trace_id: string;
  /** فقط شناسه و فرادادهٔ غیرحساس؛ متن محتوا، پیام مشتری یا راز این‌جا ثبت نمی‌شود. */
  metadata?: Record<string, unknown>;
}

export async function insertAudit(tx: Tx, event: AuditInput): Promise<void> {
  await tx.query(
    `INSERT INTO audit_events (workspace_id, brand_id, actor_type, actor_id, action, target_type, target_id,
                               outcome, trace_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      event.workspace_id, event.brand_id, event.actor_type, event.actor_id, event.action, event.target_type,
      event.target_id, event.outcome, event.trace_id, JSON.stringify(event.metadata ?? {}),
    ],
  );
}

export async function listAudit(tx: Tx, brandId: string, limit: number): Promise<AuditEvent[]> {
  const result = await tx.query<Omit<AuditEvent, 'occurred_at'> & { occurred_at: Date }>(
    `SELECT id, workspace_id, brand_id, actor_type, actor_id, action, target_type, target_id, outcome,
            trace_id, metadata, occurred_at
       FROM audit_events WHERE brand_id = $1 ORDER BY occurred_at DESC, id DESC LIMIT $2`,
    [brandId, limit],
  );
  return result.rows.map((row) => ({ ...row, occurred_at: iso(row.occurred_at) }));
}
