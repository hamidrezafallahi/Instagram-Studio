import { buildWeeklyReport, weeklyReportToCsv } from '@studio/analytics';
import { isUsable } from '@studio/connectors';
import type {
  AuditEvent,
  BrandOverview,
  ReportExportFormat,
  WeeklyReport,
  WorkspaceOverview,
} from '@studio/contracts';
import {
  brandRepo,
  connectionRepo,
  contentRepo,
  identityRepo,
  planRepo,
  recordRepo,
  runRepo,
  type Tx,
} from '@studio/data';
import { DEFAULT_TIMEZONE, addDays, todayIn, weekBoundsUtc, weekStartOf } from '@studio/domain';
import type { BrandService } from './brands.ts';
import { notFound, type BrandCall, type StudioDeps, type WorkspaceCall } from './context.ts';

export function createReportService(deps: StudioDeps, brands: BrandService) {
  async function weekly(tx: Tx, brandId: string, weekOf: string | undefined): Promise<WeeklyReport> {
    const state = await brands.load(tx, brandId);
    const now = deps.now();
    const weekStart = weekStartOf(weekOf ?? todayIn(state.profile.timezone, now), state.profile.week_start);
    const range = weekBoundsUtc(weekStart, state.profile.timezone);
    const entries = await planRepo.countEntries(tx, brandId, range, now);
    const states = await contentRepo.countContentStates(tx, brandId, range);
    const capabilities = await connectionRepo.listCapabilities(tx, brandId);
    return buildWeeklyReport({
      brand: {
        id: state.row.id,
        name: state.row.name,
        is_sample: state.row.is_sample,
        timezone: state.profile.timezone,
      },
      week_start: weekStart,
      week_end: addDays(weekStart, 6),
      generated_at: now.toISOString(),
      work: {
        planned_entries: entries.planned,
        drafts_created: states.total ?? 0,
        ready_for_review: states.ready_for_review ?? 0,
        needs_revision: states.needs_revision ?? 0,
        published: states.published ?? 0,
        overdue_entries: entries.overdue,
      },
      snapshots: await recordRepo.listSnapshots(tx, brandId, range),
      spend_mode: state.policy.authority.spend_mode,
      // دفتر هزینه در M2 اضافه می‌شود؛ تا آن زمان هیچ مصرفی ثبت نمی‌شود و عددی هم ساخته نمی‌شود.
      spend_totals: [],
      has_metrics_source: capabilities.some((item) => item.action === 'metrics_read' && isUsable(item, now)),
    });
  }

  async function brandOverview(tx: Tx, brandId: string): Promise<BrandOverview> {
    const state = await brands.load(tx, brandId);
    const now = deps.now();
    const weekStart = weekStartOf(todayIn(state.profile.timezone, now), state.profile.week_start);
    const range = weekBoundsUtc(weekStart, state.profile.timezone);
    const entries = await planRepo.countEntries(tx, brandId, range, now);
    const states = await contentRepo.countContentStates(tx, brandId);
    const connections = await connectionRepo.listConnections(tx, brandId);
    const live = connections.filter((row) => row.status !== 'revoked');
    return {
      brand: await brands.summarize(tx, state),
      counts: {
        entries_this_week: entries.planned,
        drafts_ready_for_review: states.ready_for_review ?? 0,
        drafts_needing_revision: states.needs_revision ?? 0,
        open_runs: await runRepo.countOpenRuns(tx, brandId),
        connections_total: live.length,
        connections_needing_attention: live.filter((row) => row.status !== 'active').length,
      },
      authority_mode: state.policy.authority.mode,
      paused: state.policy.authority.paused || state.row.status === 'paused',
      next_entry: await planRepo.nextEntry(tx, brandId, now),
    };
  }

  return {
    async weekly(call: BrandCall, weekOf: string | undefined): Promise<WeeklyReport> {
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, (tx) =>
        weekly(tx, call.brand_id, weekOf),
      );
    },

    /** خروجی قابل دانلود گزارش؛ CSV برای صفحه‌گسترده و JSON برای ابزارهای دیگر. */
    async export(
      call: BrandCall,
      weekOf: string | undefined,
      format: ReportExportFormat,
    ): Promise<{ filename: string; content_type: string; body: string }> {
      const report = await deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, (tx) =>
        weekly(tx, call.brand_id, weekOf),
      );
      const base = `weekly-report-${report.week_start}${report.is_sample ? '-sample' : ''}`;
      return format === 'csv'
        ? { filename: `${base}.csv`, content_type: 'text/csv; charset=utf-8', body: weeklyReportToCsv(report) }
        : {
            filename: `${base}.json`,
            content_type: 'application/json; charset=utf-8',
            body: `${JSON.stringify(report, null, 2)}\n`,
          };
    },

    /** نمای کل مالک: فقط خلاصهٔ مجاز هر برند، با نام برند واضح؛ برندهای آرشیوشده نمایش داده نمی‌شوند. */
    async workspaceOverview(call: WorkspaceCall): Promise<WorkspaceOverview> {
      const workspace = await deps.db.identity((tx) => identityRepo.getWorkspace(tx, call.workspace_id));
      if (!workspace) throw notFound('فضای کاری');
      return deps.db.tenant({ workspaceId: call.workspace_id }, async (tx) => {
        const rows = (await brandRepo.listBrands(tx)).filter((row) => row.status !== 'archived');
        const overviews: BrandOverview[] = [];
        for (const row of rows) overviews.push(await brandOverview(tx, row.id));
        return {
          workspace,
          week_start: weekStartOf(todayIn(DEFAULT_TIMEZONE, deps.now()), 'saturday'),
          brands: overviews,
          spend: {
            // تا M2 حالت هزینهٔ دیگری قابل انتخاب نیست و دفتر هزینه وجود ندارد.
            spend_mode: 'free_only',
            totals: [],
            note_fa: 'هیچ مصرف هزینه‌داری ثبت نشده است؛ همهٔ برندها در حالت «فقط رایگان» هستند.',
          },
        };
      });
    },

    async auditEvents(call: BrandCall, limit: number): Promise<AuditEvent[]> {
      return deps.db.tenant({ workspaceId: call.workspace_id, brandId: call.brand_id }, (tx) =>
        recordRepo.listAudit(tx, call.brand_id, limit),
      );
    },
  };
}

export type ReportService = ReturnType<typeof createReportService>;
