import type {
  Channel,
  ContentFormat,
  GeneratorInfo,
  Plan,
  ScheduleEntry,
  ScheduleEntryStatus,
  Weekday,
} from '@studio/contracts';
import { iso, type Tx } from '../db.ts';

interface PlanRow {
  id: string;
  brand_id: string;
  week_start: string;
  week_end: string;
  timezone: string;
  version: number;
  status: Plan['status'];
  is_sample: boolean;
  brand_revision: number;
  generator: GeneratorInfo;
  notes_fa: string[];
  created_at: Date;
}

interface EntryRow {
  id: string;
  plan_id: string;
  brand_id: string;
  weekday: Weekday;
  local_date: string;
  local_time: string;
  scheduled_at_utc: Date;
  channel: Channel;
  format: ContentFormat;
  pillar: string;
  pillar_title_fa: string;
  topic_fa: string;
  goal_fa: string;
  cta_fa: string;
  status: ScheduleEntryStatus;
  content_id: string | null;
  version: number;
}

const PLAN_COLUMNS =
  'id, brand_id, week_start, week_end, timezone, version, status, is_sample, brand_revision, generator, notes_fa, created_at';
const ENTRY_COLUMNS =
  'id, plan_id, brand_id, weekday, local_date, local_time, scheduled_at_utc, channel, format, pillar, pillar_title_fa, topic_fa, goal_fa, cta_fa, status, content_id, version';

const toEntry = (row: EntryRow): ScheduleEntry => ({ ...row, scheduled_at_utc: iso(row.scheduled_at_utc) });

function toPlan(row: PlanRow, entries: ScheduleEntry[]): Plan {
  return { ...row, created_at: iso(row.created_at), entries };
}

async function entriesOf(tx: Tx, planIds: string[]): Promise<Map<string, ScheduleEntry[]>> {
  const byPlan = new Map<string, ScheduleEntry[]>();
  if (planIds.length === 0) return byPlan;
  const result = await tx.query<EntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM schedule_entries WHERE plan_id = ANY($1::uuid[]) ORDER BY scheduled_at_utc, id`,
    [planIds],
  );
  for (const row of result.rows) {
    byPlan.set(row.plan_id, [...(byPlan.get(row.plan_id) ?? []), toEntry(row)]);
  }
  return byPlan;
}

/** برنامهٔ جاری هفته را superseded می‌کند و بزرگ‌ترین شمارهٔ نسخهٔ قبلی را برمی‌گرداند. */
export async function supersedePlans(tx: Tx, brandId: string, weekStart: string): Promise<number> {
  await tx.query(
    `UPDATE plans SET status = 'superseded' WHERE brand_id = $1 AND week_start = $2 AND status <> 'superseded'`,
    [brandId, weekStart],
  );
  const result = await tx.query<{ max: number | null }>(
    'SELECT max(version) AS max FROM plans WHERE brand_id = $1 AND week_start = $2',
    [brandId, weekStart],
  );
  return result.rows[0]?.max ?? 0;
}

export async function insertPlan(
  tx: Tx,
  input: {
    workspace_id: string;
    brand_id: string;
    week_start: string;
    week_end: string;
    timezone: string;
    version: number;
    is_sample: boolean;
    brand_revision: number;
    generator: GeneratorInfo;
    notes_fa: string[];
    run_id: string | null;
    created_by: string;
    entries: Omit<ScheduleEntry, 'id' | 'plan_id' | 'brand_id' | 'status' | 'content_id' | 'version'>[];
  },
): Promise<Plan> {
  const result = await tx.query<PlanRow>(
    `INSERT INTO plans (workspace_id, brand_id, week_start, week_end, timezone, version, status, is_sample,
                        brand_revision, generator, notes_fa, run_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10, $11, $12) RETURNING ${PLAN_COLUMNS}`,
    [
      input.workspace_id, input.brand_id, input.week_start, input.week_end, input.timezone, input.version,
      input.is_sample, input.brand_revision, JSON.stringify(input.generator), JSON.stringify(input.notes_fa),
      input.run_id, input.created_by,
    ],
  );
  const plan = result.rows[0] as PlanRow;
  const entries: ScheduleEntry[] = [];
  for (const entry of input.entries) {
    const inserted = await tx.query<EntryRow>(
      `INSERT INTO schedule_entries (workspace_id, brand_id, plan_id, weekday, local_date, local_time,
                                     scheduled_at_utc, channel, format, pillar, pillar_title_fa, topic_fa, goal_fa, cta_fa)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING ${ENTRY_COLUMNS}`,
      [
        input.workspace_id, input.brand_id, plan.id, entry.weekday, entry.local_date, entry.local_time,
        entry.scheduled_at_utc, entry.channel, entry.format, entry.pillar, entry.pillar_title_fa,
        entry.topic_fa, entry.goal_fa, entry.cta_fa,
      ],
    );
    entries.push(toEntry(inserted.rows[0] as EntryRow));
  }
  entries.sort((a, b) => a.scheduled_at_utc.localeCompare(b.scheduled_at_utc));
  return toPlan(plan, entries);
}

export async function listPlans(tx: Tx, brandId: string, weekStart?: string): Promise<Plan[]> {
  const result = await tx.query<PlanRow>(
    `SELECT ${PLAN_COLUMNS} FROM plans
      WHERE brand_id = $1 AND status <> 'superseded' AND ($2::date IS NULL OR week_start = $2::date)
      ORDER BY week_start DESC LIMIT 12`,
    [brandId, weekStart ?? null],
  );
  const entries = await entriesOf(tx, result.rows.map((row) => row.id));
  return result.rows.map((row) => toPlan(row, entries.get(row.id) ?? []));
}

export async function getCurrentPlan(tx: Tx, brandId: string, weekStart: string): Promise<Plan | null> {
  return (await listPlans(tx, brandId, weekStart))[0] ?? null;
}

export async function getEntry(tx: Tx, entryId: string): Promise<ScheduleEntry | null> {
  const result = await tx.query<EntryRow>(`SELECT ${ENTRY_COLUMNS} FROM schedule_entries WHERE id = $1`, [entryId]);
  return result.rows[0] ? toEntry(result.rows[0]) : null;
}

export interface EntryContext {
  entry: ScheduleEntry;
  plan_status: Plan['status'];
  timezone: string;
  week_start: string;
  week_end: string;
}

export async function getEntryContext(tx: Tx, entryId: string): Promise<EntryContext | null> {
  const entry = await getEntry(tx, entryId);
  if (!entry) return null;
  const plan = await tx.query<{ status: Plan['status']; timezone: string; week_start: string; week_end: string }>(
    'SELECT status, timezone, week_start, week_end FROM plans WHERE id = $1',
    [entry.plan_id],
  );
  const row = plan.rows[0];
  if (!row) return null;
  return { entry, plan_status: row.status, timezone: row.timezone, week_start: row.week_start, week_end: row.week_end };
}

/** ویرایش آیتم با بررسی optimistic نسخه؛ ناهم‌خوانی نسخه null برمی‌گرداند. */
export async function updateEntry(
  tx: Tx,
  entryId: string,
  expectedVersion: number,
  patch: {
    topic_fa: string;
    weekday: Weekday;
    local_date: string;
    local_time: string;
    scheduled_at_utc: string;
    status: ScheduleEntryStatus;
  },
): Promise<ScheduleEntry | null> {
  const result = await tx.query<EntryRow>(
    `UPDATE schedule_entries
        SET topic_fa = $3, weekday = $4, local_date = $5, local_time = $6, scheduled_at_utc = $7, status = $8,
            version = version + 1
      WHERE id = $1 AND version = $2 RETURNING ${ENTRY_COLUMNS}`,
    [
      entryId, expectedVersion, patch.topic_fa, patch.weekday, patch.local_date, patch.local_time,
      patch.scheduled_at_utc, patch.status,
    ],
  );
  return result.rows[0] ? toEntry(result.rows[0]) : null;
}

export async function linkEntryContent(tx: Tx, entryId: string, contentId: string): Promise<void> {
  await tx.query(
    `UPDATE schedule_entries SET content_id = $2, status = 'drafted', version = version + 1 WHERE id = $1`,
    [entryId, contentId],
  );
}

export async function countEntries(
  tx: Tx,
  brandId: string,
  range: { start: string; end: string },
  now: Date,
): Promise<{ planned: number; overdue: number }> {
  const result = await tx.query<{ planned: number; overdue: number }>(
    `SELECT count(*) FILTER (WHERE e.status IN ('planned', 'drafted'))::int AS planned,
            count(*) FILTER (WHERE e.status = 'planned' AND e.scheduled_at_utc < $4)::int AS overdue
       FROM schedule_entries e JOIN plans p ON p.id = e.plan_id
      WHERE e.brand_id = $1 AND p.status <> 'superseded'
        AND e.scheduled_at_utc >= $2 AND e.scheduled_at_utc < $3`,
    [brandId, range.start, range.end, now],
  );
  return result.rows[0] ?? { planned: 0, overdue: 0 };
}

export async function nextEntry(tx: Tx, brandId: string, now: Date): Promise<ScheduleEntry | null> {
  const result = await tx.query<EntryRow>(
    `SELECT ${ENTRY_COLUMNS.split(', ').map((column) => `e.${column}`).join(', ')}
       FROM schedule_entries e JOIN plans p ON p.id = e.plan_id
      WHERE e.brand_id = $1 AND p.status <> 'superseded' AND e.status IN ('planned', 'drafted')
        AND e.scheduled_at_utc >= $2
      ORDER BY e.scheduled_at_utc LIMIT 1`,
    [brandId, now],
  );
  return result.rows[0] ? toEntry(result.rows[0]) : null;
}
