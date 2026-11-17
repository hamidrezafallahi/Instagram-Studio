import type {
  Channel,
  Claim,
  ContentBrief,
  ContentFormat,
  ContentItemSummary,
  ContentRevisionView,
  ContentState,
  GeneratorInfo,
  QaResult,
  SourceRef,
} from '@studio/contracts';
import { iso, type Tx } from '../db.ts';

interface ItemRow {
  id: string;
  brand_id: string;
  schedule_entry_id: string | null;
  channel: Channel;
  format: ContentFormat;
  pillar: string;
  title_fa: string;
  state: ContentState;
  current_revision: number;
  qa_status: QaResult['status'];
  is_sample: boolean;
  scheduled_at_utc: Date | null;
  version: number;
  updated_at: Date;
}

const ITEM_COLUMNS =
  'id, brand_id, schedule_entry_id, channel, format, pillar, title_fa, state, current_revision, qa_status, is_sample, scheduled_at_utc, version, updated_at';

const toItem = (row: ItemRow): ContentItemSummary => ({
  ...row,
  scheduled_at_utc: iso(row.scheduled_at_utc),
  updated_at: iso(row.updated_at),
});

export async function insertContentItem(
  tx: Tx,
  input: {
    workspace_id: string;
    brand_id: string;
    schedule_entry_id: string | null;
    channel: Channel;
    format: ContentFormat;
    pillar: string;
    title_fa: string;
    state: ContentState;
    is_sample: boolean;
    scheduled_at_utc: string | null;
    created_by: string;
  },
): Promise<ContentItemSummary> {
  const result = await tx.query<ItemRow>(
    `INSERT INTO content_items (workspace_id, brand_id, schedule_entry_id, channel, format, pillar, title_fa, state,
                                is_sample, scheduled_at_utc, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING ${ITEM_COLUMNS}`,
    [
      input.workspace_id, input.brand_id, input.schedule_entry_id, input.channel, input.format, input.pillar,
      input.title_fa, input.state, input.is_sample, input.scheduled_at_utc, input.created_by,
    ],
  );
  return toItem(result.rows[0] as ItemRow);
}

export async function findContentByEntry(tx: Tx, entryId: string): Promise<string | null> {
  const result = await tx.query<{ id: string }>(
    `SELECT id FROM content_items WHERE schedule_entry_id = $1 AND state <> 'cancelled'`,
    [entryId],
  );
  return result.rows[0]?.id ?? null;
}

export async function insertBrief(
  tx: Tx,
  input: { workspace_id: string; brand_id: string; content_id: string; brief: Omit<ContentBrief, 'id' | 'brand_id'> },
): Promise<void> {
  const { brief } = input;
  await tx.query(
    `INSERT INTO briefs (workspace_id, brand_id, content_id, goal, audience, pillar, channel, format, source_ids, cta, due_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      input.workspace_id, input.brand_id, input.content_id, brief.goal, brief.audience, brief.pillar,
      brief.channel, brief.format, JSON.stringify(brief.source_ids), brief.cta, brief.due_at,
    ],
  );
}

export async function getBrief(tx: Tx, contentId: string): Promise<ContentBrief | null> {
  const result = await tx.query<{
    id: string; brand_id: string; goal: string; audience: string; pillar: string; channel: Channel;
    format: ContentFormat; source_ids: string[]; cta: string; due_at: Date;
  }>(
    `SELECT id, brand_id, goal, audience, pillar, channel, format, source_ids, cta, due_at
       FROM briefs WHERE content_id = $1`,
    [contentId],
  );
  const row = result.rows[0];
  return row ? { ...row, due_at: iso(row.due_at) } : null;
}

export async function insertRevision(
  tx: Tx,
  input: {
    workspace_id: string;
    brand_id: string;
    content_id: string;
    revision: number;
    text: string;
    asset_ids?: readonly string[];
    source_refs: SourceRef[];
    claims: Claim[];
    qa_result: QaResult;
    hash: string;
    generator: GeneratorInfo;
    note: string | null;
    created_by: string;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO content_revisions (workspace_id, brand_id, content_id, revision, text, asset_ids, source_refs, claims,
                                    qa_result, hash, generator, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      input.workspace_id, input.brand_id, input.content_id, input.revision, input.text,
      JSON.stringify(input.asset_ids ?? []), JSON.stringify(input.source_refs), JSON.stringify(input.claims),
      JSON.stringify(input.qa_result), input.hash, JSON.stringify(input.generator), input.note, input.created_by,
    ],
  );
}

export async function listRevisions(tx: Tx, contentId: string): Promise<ContentRevisionView[]> {
  const result = await tx.query<{
    revision: number; text: string; hash: string; asset_ids: string[]; source_refs: SourceRef[]; claims: Claim[];
    qa_result: QaResult; generator: GeneratorInfo; note: string | null; created_by: string; created_at: Date;
  }>(
    `SELECT revision, text, hash, asset_ids, source_refs, claims, qa_result, generator, note, created_by, created_at
       FROM content_revisions WHERE content_id = $1 ORDER BY revision DESC`,
    [contentId],
  );
  return result.rows.map((row) => ({ ...row, created_at: iso(row.created_at) }));
}

export async function getContentItem(tx: Tx, contentId: string): Promise<ContentItemSummary | null> {
  const result = await tx.query<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM content_items WHERE id = $1`, [contentId]);
  return result.rows[0] ? toItem(result.rows[0]) : null;
}

export async function listContentItems(tx: Tx, brandId: string, state?: ContentState): Promise<ContentItemSummary[]> {
  const result = await tx.query<ItemRow>(
    `SELECT ${ITEM_COLUMNS} FROM content_items
      WHERE brand_id = $1 AND ($2::text IS NULL OR state = $2)
      ORDER BY coalesce(scheduled_at_utc, updated_at) DESC LIMIT 200`,
    [brandId, state ?? null],
  );
  return result.rows.map(toItem);
}

/**
 * انتقال وضعیت با بررسی optimistic: اگر version تغییر کرده باشد null برمی‌گردد (STALE_REVISION در سرویس).
 */
export async function updateContentState(
  tx: Tx,
  contentId: string,
  expectedVersion: number,
  patch: { state: ContentState; current_revision?: number; qa_status?: QaResult['status']; title_fa?: string },
): Promise<ContentItemSummary | null> {
  const result = await tx.query<ItemRow>(
    `UPDATE content_items
        SET state = $3,
            current_revision = coalesce($4, current_revision),
            qa_status = coalesce($5, qa_status),
            title_fa = coalesce($6, title_fa),
            version = version + 1
      WHERE id = $1 AND version = $2 RETURNING ${ITEM_COLUMNS}`,
    [
      contentId, expectedVersion, patch.state, patch.current_revision ?? null, patch.qa_status ?? null,
      patch.title_fa ?? null,
    ],
  );
  return result.rows[0] ? toItem(result.rows[0]) : null;
}

export async function countContentStates(
  tx: Tx,
  brandId: string,
  range?: { start: string; end: string },
): Promise<Record<ContentState | 'total', number>> {
  const result = await tx.query<{ state: ContentState; count: number }>(
    `SELECT state, count(*)::int AS count FROM content_items
      WHERE brand_id = $1
        AND ($2::timestamptz IS NULL OR (scheduled_at_utc >= $2 AND scheduled_at_utc < $3))
      GROUP BY state`,
    [brandId, range?.start ?? null, range?.end ?? null],
  );
  const counts = { total: 0 } as Record<ContentState | 'total', number>;
  for (const row of result.rows) {
    counts[row.state] = row.count;
    counts.total += row.count;
  }
  return counts;
}
