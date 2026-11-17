import { isUsable } from '@studio/connectors';
import {
  StudioError,
  isStudioError,
  type CreateRunBody,
  type ErrorCode,
  type RunState,
  type RunView,
} from '@studio/contracts';
import {
  connectionRepo,
  contentRepo,
  isUniqueViolation,
  planRepo,
  recordRepo,
  runRepo,
  type RunRow,
} from '@studio/data';
import {
  addDays,
  assertTransition,
  contentMachine,
  dateOfWeekday,
  hashContentRevision,
  hashObject,
  localToUtc,
  runMachine,
  todayIn,
  weekStartOf,
} from '@studio/domain';
import { evaluatePolicy } from '@studio/policy';
import {
  WORKFLOWS,
  type LoadedBrand,
  type MetricsSource,
  type RunContext,
  type RunParams,
  type WorkflowDefinition,
  type WorkflowTools,
} from '@studio/workflows';
import type { BrandService } from './brands.ts';
import type { ConnectionService } from './connections.ts';
import type { VisualService } from './visuals.ts';
import { audit, notFound, type BrandCall, type StudioDeps } from './context.ts';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new StudioError('PROVIDER_UNAVAILABLE', { message_fa: 'مهلت اجرای این گام تمام شد.' })),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function createRunService(
  deps: StudioDeps,
  brands: BrandService,
  connections: ConnectionService,
  visuals: VisualService,
) {
  const scopeOf = (call: BrandCall) => ({ workspaceId: call.workspace_id, brandId: call.brand_id });

  async function view(call: BrandCall, row: RunRow, replayed: boolean): Promise<RunView> {
    const steps = await deps.db.tenant(scopeOf(call), (tx) => runRepo.listSteps(tx, [row.id]));
    return runRepo.toRunView(row, steps.get(row.id) ?? [], replayed);
  }

  /** ابزارهای گردش‌کار برای یک run؛ همهٔ دسترسی‌ها در محدودهٔ همان برند و با RLS انجام می‌شود. */
  function toolsFor(call: BrandCall, run: RunRow): WorkflowTools {
    const scope = scopeOf(call);
    const loadBrand = async (): Promise<LoadedBrand> => {
      const state = await deps.db.tenant(scope, (tx) => brands.load(tx, call.brand_id));
      return {
        id: state.row.id,
        workspace_id: state.row.workspace_id,
        name: state.row.name,
        is_sample: state.row.is_sample,
        revision: state.row.current_revision,
        profile: state.profile,
        pack: state.pack,
      };
    };

    return {
      now: deps.now,
      model: deps.models.session(),
      loadBrand,

      async savePlan({ week_start: weekStart, proposal, generator, brand }) {
        const pillars = new Map(brand.pack.content_pillars.map((pillar) => [pillar.id, pillar.title_fa]));
        const timezone = brand.profile.timezone;
        return deps.db.tenant(scope, async (tx) => {
          const existing = await planRepo.getCurrentPlan(tx, call.brand_id, weekStart);
          if (existing?.entries.some((entry) => entry.content_id !== null)) {
            // بازسازی برنامه محتواهای موجود را بی‌صاحب می‌کند؛ به‌جای حذف بی‌صدا، صریح رد می‌شود.
            throw new StudioError('CONFLICT', {
              message_fa:
                'برنامهٔ این هفته پیش‌نویس دارد و بازسازی آن محتواها را از تقویم جدا می‌کند. آیتم‌ها را در تقویم ویرایش کنید.',
            });
          }
          const previousVersion = await planRepo.supersedePlans(tx, call.brand_id, weekStart);
          return planRepo.insertPlan(tx, {
            workspace_id: call.workspace_id,
            brand_id: call.brand_id,
            week_start: weekStart,
            week_end: addDays(weekStart, 6),
            timezone,
            version: previousVersion + 1,
            is_sample: brand.is_sample,
            brand_revision: brand.revision,
            generator,
            notes_fa: proposal.notes_fa,
            run_id: run.id,
            created_by: call.actor.id,
            entries: proposal.entries.map((entry) => {
              const localDate = dateOfWeekday(weekStart, entry.weekday);
              return {
                weekday: entry.weekday,
                local_date: localDate,
                local_time: entry.local_time,
                scheduled_at_utc: localToUtc(localDate, entry.local_time, timezone),
                channel: entry.channel,
                format: entry.format,
                pillar: entry.pillar,
                pillar_title_fa: pillars.get(entry.pillar) ?? entry.pillar,
                topic_fa: entry.topic_fa,
                goal_fa: entry.goal_fa,
                cta_fa: entry.cta_fa,
              };
            }),
          });
        });
      },

      currentPlan: (weekStart) => deps.db.tenant(scope, (tx) => planRepo.getCurrentPlan(tx, call.brand_id, weekStart)),

      // انتخاب مقصد انتشار (PublicationTarget) در M2 اضافه می‌شود؛ تا آن زمان سقف مقصد اعمال نمی‌شود.
      textLimits: async () => undefined,

      async saveDraft(draft) {
        try {
          return await deps.db.tenant(scope, async (tx) => {
            if (await contentRepo.findContentByEntry(tx, draft.entry.id)) return null;
            // مسیر کامل ماشین حالت اعتبارسنجی می‌شود حتی اگر گام‌ها در یک تراکنش ثبت شوند.
            const path = ['brief', 'researching', 'drafting', 'validating', draft.final_state] as const;
            for (let index = 1; index < path.length; index += 1) {
              assertTransition(contentMachine, path[index - 1] as (typeof path)[number], path[index] as (typeof path)[number]);
            }
            const item = await contentRepo.insertContentItem(tx, {
              workspace_id: call.workspace_id,
              brand_id: call.brand_id,
              schedule_entry_id: draft.entry.id,
              channel: draft.entry.channel,
              format: draft.entry.format,
              pillar: draft.entry.pillar,
              title_fa: draft.title_fa,
              state: 'brief',
              is_sample: run.is_sample,
              scheduled_at_utc: draft.entry.scheduled_at_utc,
              created_by: call.actor.id,
            });
            await contentRepo.insertBrief(tx, {
              workspace_id: call.workspace_id,
              brand_id: call.brand_id,
              content_id: item.id,
              brief: draft.brief,
            });
            await contentRepo.insertRevision(tx, {
              workspace_id: call.workspace_id,
              brand_id: call.brand_id,
              content_id: item.id,
              revision: 1,
              text: draft.text,
              source_refs: draft.source_refs,
              claims: draft.claims,
              qa_result: draft.qa_result,
              hash: hashContentRevision({
                text: draft.text,
                asset_ids: [],
                source_refs: draft.source_refs,
                claims: draft.claims,
              }),
              generator: draft.generator,
              note: null,
              created_by: `run:${run.id}`,
            });
            await contentRepo.updateContentState(tx, item.id, item.version, {
              state: draft.final_state,
              current_revision: 1,
              qa_status: draft.qa_result.status,
            });
            await planRepo.linkEntryContent(tx, draft.entry.id, item.id);
            return { content_id: item.id };
          });
        } catch (error) {
          // اجرای هم‌زمان دیگری همین آیتم را زودتر ساخته است؛ محتوای دوم ساخته نمی‌شود.
          if (isUniqueViolation(error, 'content_items_entry_key')) return null;
          throw error;
        }
      },

      listRenderable: (weekStart, contentIds) => visuals.listRenderable(call, weekStart, contentIds),
      renderContent: (contentId) => visuals.renderContent(call, contentId, `run:${run.id}`),

      async listMetricsSources() {
        const { rows, capabilities } = await connections.listRows(call);
        const sources: MetricsSource[] = [];
        for (const row of rows) {
          if (row.status !== 'active') continue;
          const capability = capabilities.find(
            (item) => item.connection_id === row.id && item.action === 'metrics_read',
          );
          if (!isUsable(capability, deps.now())) continue;
          sources.push({ connection_id: row.id, provider: row.provider, label: row.label, is_sample: row.is_sample });
        }
        return sources;
      },

      async fetchMetrics(source, period) {
        const row = await deps.db.tenant(scope, (tx) => connectionRepo.getConnection(tx, source.connection_id));
        if (!row) throw notFound('اتصال');
        return connections.guardedPort(row).fetchMetrics(connections.connectorContext(row, call.trace_id), {
          action: 'metrics_read',
          object_ids: [],
          period_start: period.start,
          period_end: period.end,
        });
      },

      async saveMetrics(source, batch) {
        return deps.db.tenant(scope, async (tx) => {
          const row = await connectionRepo.getConnection(tx, source.connection_id);
          if (!row) throw notFound('اتصال');
          const channel = typeof row.config['channel'] === 'string' ? row.config['channel'] : null;
          return recordRepo.upsertMetricSnapshots(tx, {
            workspace_id: call.workspace_id,
            brand_id: call.brand_id,
            connection_id: row.id,
            provider: row.provider,
            channel,
            is_sample: batch.is_sample || row.is_sample,
            fetched_at: batch.fetched_at,
            points: batch.points,
          });
        });
      },
    };
  }

  /**
   * اجرای یک run. وضعیت هر گام در پایگاه داده ثبت می‌شود. فقط اجرایی که بتواند run را از queued به
   * running ببرد جلو می‌رود؛ پس دو اجرای هم‌زمان یک run هرگز دو بار کار نمی‌کنند.
   * در M1 این تابع در همان فرایند API صدا زده می‌شود؛ از M2 worker آن را از صف برمی‌دارد (ADR-022).
   */
  async function execute(call: BrandCall, runId: string): Promise<void> {
    const scope = scopeOf(call);
    const run = await deps.db.tenant(scope, async (tx) => {
      const row = await runRepo.getRun(tx, runId);
      if (!row) throw notFound('اجرا');
      assertTransition(runMachine, 'queued', 'running');
      return (await runRepo.transitionRun(tx, runId, 'queued', 'running')) ? row : null;
    });
    if (!run) return;

    const workflow: WorkflowDefinition = WORKFLOWS[run.intent];
    const input = run.input as { week_start: string; params: RunParams };
    const context: RunContext = {
      params: input.params,
      week_start: input.week_start,
      outcome: { plan_id: null, content_ids: [], skipped: [], summary_fa: '' },
      failures: [],
      produced: 0,
    };
    const tools = toolsFor(call, run);
    const finish = async (
      status: Extract<RunState, 'succeeded' | 'partially_succeeded' | 'failed'>,
      error: { code: ErrorCode; message_fa: string } | null,
    ): Promise<void> => {
      await deps.db.tenant(scope, async (tx) => {
        await runRepo.transitionRun(tx, runId, 'running', status, {
          result: context.outcome,
          ...(error ? { error } : {}),
        });
        await audit(tx, call, {
          action: 'run.finish',
          target_type: 'run',
          target_id: runId,
          outcome: status === 'failed' ? 'failed' : 'succeeded',
          metadata: {
            intent: run.intent,
            status,
            content_count: context.outcome.content_ids.length,
            skipped_count: context.outcome.skipped.length,
            error_code: error?.code ?? null,
          },
        });
      });
    };

    for (const [index, step] of workflow.steps.entries()) {
      const seq = index + 1;
      await deps.db.tenant(scope, (tx) =>
        runRepo.updateStep(tx, runId, seq, {
          status: 'running',
          input_snapshot: {
            workflow: `${workflow.id}@${workflow.version}`,
            week_start: context.week_start,
            params: context.params,
            brand_revision: context.brand?.revision ?? null,
          },
        }),
      );
      try {
        const result = await withTimeout(step.run(context, tools), step.timeout_ms);
        await deps.db.tenant(scope, (tx) =>
          runRepo.updateStep(tx, runId, seq, {
            status: 'succeeded',
            summary_fa: result.summary_fa,
            output_ref: result.output_ref ?? null,
          }),
        );
      } catch (error) {
        const known = isStudioError(error);
        if (!known) deps.logger.error({ err: error, run_id: runId, step: step.name, trace_id: call.trace_id }, 'run step failed');
        const failure = {
          code: known ? error.code : ('INTERNAL' as const),
          message_fa: known ? error.message_fa : 'خطای داخلی در اجرای این گام رخ داد.',
        };
        await deps.db.tenant(scope, async (tx) => {
          await runRepo.updateStep(tx, runId, seq, {
            status: 'failed',
            summary_fa: failure.message_fa,
            error_code: failure.code,
          });
          for (let rest = seq + 1; rest <= workflow.steps.length; rest += 1) {
            await runRepo.updateStep(tx, runId, rest, { status: 'skipped' });
          }
        });
        context.outcome.summary_fa ||= failure.message_fa;
        await finish('failed', failure);
        return;
      }
    }

    // اتمام run از نتیجهٔ اجزا محاسبه می‌شود؛ شکست یک جزء باعث تکرار اجزای موفق نمی‌شود.
    if (context.failures.length === 0) await finish('succeeded', null);
    else if (context.produced > 0) await finish('partially_succeeded', null);
    else await finish('failed', context.failures[0] ?? null);
  }

  return {
    execute,

    /**
     * ثبت فرمان اجرا. یک کلیک = یک command با idempotency_key:
     * تکرار همان کلید همان run را برمی‌گرداند (replayed) و run دوم نمی‌سازد؛
     * همان کلید با ورودی متفاوت رد می‌شود.
     */
    async create(call: BrandCall, body: CreateRunBody): Promise<RunView> {
      const workflow = WORKFLOWS[body.intent];
      const scope = scopeOf(call);
      const requestHash = hashObject({ intent: body.intent, params: body.params });

      const outcome = await deps.db.tenant(scope, async (tx) => {
        const existing = await runRepo.findRunByKey(tx, call.brand_id, body.intent, body.idempotency_key);
        if (existing) return { kind: 'run' as const, row: existing, created: false };

        const brand = await brands.load(tx, call.brand_id);
        const decision = evaluatePolicy({
          action_type: body.intent,
          category: 'internal',
          actor: call.actor,
          brand: { status: brand.row.status },
          policy: { revision: brand.policy.revision, authority: brand.policy.authority },
        });
        if (decision.decision !== 'allow') return { kind: 'denied' as const, decision };
        const weekStart = weekStartOf(
          body.params.week_of ?? todayIn(brand.profile.timezone, deps.now()),
          brand.profile.week_start,
        );
        const row = await runRepo.insertRun(tx, {
          workspace_id: call.workspace_id,
          brand_id: call.brand_id,
          intent: body.intent,
          workflow_id: workflow.id,
          workflow_version: workflow.version,
          idempotency_key: body.idempotency_key,
          request_hash: requestHash,
          is_sample: brand.row.is_sample,
          scope_fa: workflow.describeScope({ brand_name: brand.row.name, week_start: weekStart, params: body.params }),
          cost_cap: { amount_minor: 0, currency: 'IRR' },
          input: { week_start: weekStart, params: body.params, policy_revision: decision.policy_revision },
          created_by: call.actor.id,
          steps: workflow.steps.map((step) => ({ name: step.name, title_fa: step.title_fa })),
        });
        if (!row) {
          // درخواست هم‌زمان دیگری با همین کلید زودتر ثبت شد.
          const raced = await runRepo.findRunByKey(tx, call.brand_id, body.intent, body.idempotency_key);
          if (!raced) throw new StudioError('CONFLICT');
          return { kind: 'run' as const, row: raced, created: false };
        }
        await audit(tx, call, {
          action: 'run.create',
          target_type: 'run',
          target_id: row.id,
          outcome: 'succeeded',
          metadata: { intent: body.intent, workflow: `${workflow.id}@${workflow.version}`, policy: decision.reason },
        });
        return { kind: 'run' as const, row, created: true };
      });

      if (outcome.kind === 'denied') {
        // رد سیاست در تراکنش جدا ثبت می‌شود تا با خطا rollback نشود.
        await deps.db.tenant(scope, (tx) =>
          audit(tx, call, {
            action: 'run.create',
            target_type: 'run',
            target_id: null,
            outcome: 'denied',
            metadata: {
              intent: body.intent,
              reason: outcome.decision.reason,
              policy_revision: outcome.decision.policy_revision,
            },
          }),
        );
        throw new StudioError('POLICY_DENIED', { message_fa: outcome.decision.reason_fa });
      }
      if (outcome.row.request_hash !== requestHash) throw new StudioError('IDEMPOTENCY_KEY_REUSED');
      if (outcome.created) await execute(call, outcome.row.id);

      const fresh = await deps.db.tenant(scope, (tx) => runRepo.getRun(tx, outcome.row.id));
      return view(call, fresh ?? outcome.row, !outcome.created);
    },

    async get(call: BrandCall, runId: string): Promise<RunView> {
      const row = await deps.db.tenant(scopeOf(call), (tx) => runRepo.getRun(tx, runId));
      if (!row) throw notFound('اجرا');
      return view(call, row, false);
    },

    async list(call: BrandCall): Promise<RunView[]> {
      return deps.db.tenant(scopeOf(call), async (tx) => {
        const rows = await runRepo.listRuns(tx, call.brand_id);
        const steps = await runRepo.listSteps(tx, rows.map((row) => row.id));
        return rows.map((row) => runRepo.toRunView(row, steps.get(row.id) ?? [], false));
      });
    },
  };
}

export type RunService = ReturnType<typeof createRunService>;
