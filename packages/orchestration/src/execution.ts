import { randomUUID } from 'node:crypto';
import { isUsable } from '@studio/connectors';
import {
  ACTION_STATE_LABEL_FA,
  ERROR_HTTP,
  StudioError,
  isStudioError,
  type ActionState,
  type ApprovalView,
  type CompleteManualTaskBody,
  type ConnectorResult,
  type ContentFormat,
  type ContentState,
  type CreatePublishIntentBody,
  type DecideApprovalBody,
  type DecideFundingBody,
  type ErrorCode,
  type FundingRequestView,
  type IntentView,
  type ManualTaskView,
  type Money,
  type PolicyDecision,
  type RetryIntentBody,
  type WorkerTickResult,
} from '@studio/contracts';
import {
  connectionRepo,
  contentRepo,
  executionRepo,
  iso,
  isUniqueViolation,
  type ClaimedJob,
  type ConnectionRow,
  type FundingRow,
  type IntentRow,
  type ManualTaskRow,
  type Tx,
} from '@studio/data';
import {
  actionMachine,
  assertTransition,
  contentMachine,
  findPath,
  fundingRequestMachine,
  hashObject,
  utcToLocal,
  weekdayOf,
} from '@studio/domain';
import { canApprove, evaluatePolicy } from '@studio/policy';
import type { BrandService, LoadedBrandState } from './brands.ts';
import type { ConnectionService } from './connections.ts';
import { audit, notFound, type BrandCall, type StudioDeps, type WorkspaceCall } from './context.ts';

/**
 * اجرای کنترل‌شده (M2، apps/worker/README.md):
 * هر side effect بیرونی یک ActionIntent ثبت‌شده با کلید یکتایی دارد؛ تأیید به payload_hash بسته است؛
 * رویداد outbox در همان تراکنش ثبت می‌شود و worker با lease آن را اجرا می‌کند. پیش از ارسال، توقف،
 * سیاست، نسخه، تأیید، قابلیت و بودجه دوباره بررسی می‌شوند. پاسخ نامعلوم فقط با reconcile حل می‌شود.
 */

/** مهلت پس از زمان برنامه‌ریزی‌شده؛ کار عقب‌مانده‌تر از این منتشر نمی‌شود (A14). */
export const PUBLISH_GRACE_MS = 2 * 60 * 60 * 1000;
/** اعتبار تأیید انسانی. */
const APPROVAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LEASE_SECONDS = 120;
/** فاصلهٔ بررسی دوباره هنگام توقف برند. */
const PAUSE_RECHECK_MS = 5 * 60 * 1000;
const RETRYABLE: readonly ErrorCode[] = ['RATE_LIMITED', 'PROVIDER_UNAVAILABLE'];

const POLICY_REASON_FA: Record<string, string> = {
  CAPABILITY_MANUAL: 'برای این قالب روی این اتصال مسیر خودکار اثبات‌شده‌ای نیست؛ بستهٔ انتشار دستی آماده شد.',
  OWNER_APPROVED: 'مالک یا بازبین مجاز همین نسخه را تأیید کرد.',
  REVISION_CHANGED: 'متن پس از ثبت قصد تغییر کرد؛ تأیید قبلی باطل است و باید دوباره درخواست شود.',
  CANCELLED: 'قصد اجرا لغو شد.',
};

export function actionTypeFor(format: ContentFormat): string {
  return format === 'post' ? 'feed_publish' : `${format}_publish`;
}

export interface ExecutionFaults {
  /** فقط برای آزمون crash: پس از پاسخ ارائه‌دهنده و پیش از ثبت نتیجه پرتاب می‌شود. */
  afterSend?: (intentId: string) => void;
}

const SYSTEM_ACTOR = { type: 'system' as const, id: 'worker', role: 'service' as const };

/** خطای یکتایی درون تراکنش را بدون باطل‌کردن کل تراکنش مهار می‌کند. */
async function withSavepoint<T>(tx: Tx, fn: () => Promise<T>): Promise<T> {
  await tx.query('SAVEPOINT studio_sp');
  try {
    const result = await fn();
    await tx.query('RELEASE SAVEPOINT studio_sp');
    return result;
  } catch (error) {
    await tx.query('ROLLBACK TO SAVEPOINT studio_sp');
    throw error;
  }
}

export function createExecutionService(
  deps: StudioDeps,
  brands: BrandService,
  connections: ConnectionService,
  faults: ExecutionFaults = {},
) {
  const scopeOf = (call: { workspace_id: string; brand_id: string }) => ({
    workspaceId: call.workspace_id,
    brandId: call.brand_id,
  });
  const nowIso = (): string => deps.now().toISOString();

  /* ─────────────────────────────── کمکی‌ها ─────────────────────────────── */

  /** محتوا را از مسیر مجاز ماشین حالت به وضعیت هدف می‌برد؛ مسیر نامجاز INVALID_TRANSITION است. */
  async function moveContent(tx: Tx, contentId: string, to: ContentState): Promise<void> {
    const item = await contentRepo.getContentItem(tx, contentId);
    if (!item) throw notFound('محتوا');
    if (item.state === to) return;
    const path = findPath(contentMachine, item.state, to);
    if (!path) assertTransition(contentMachine, item.state, to);
    const updated = await contentRepo.updateContentState(tx, contentId, item.version, { state: to });
    if (!updated) throw new StudioError('STALE_REVISION');
  }

  /** محتوای زمان‌بندی‌شده‌ای که منتشر نمی‌شود به «تأییدشده» برمی‌گردد تا مالک زمان تازه تعیین کند. */
  async function releaseContent(tx: Tx, contentId: string): Promise<void> {
    const item = await contentRepo.getContentItem(tx, contentId);
    if (item && (item.state === 'scheduled' || item.state === 'publishing')) await moveContent(tx, contentId, 'approved');
  }

  async function transition(
    tx: Tx,
    intent: IntentRow,
    to: ActionState,
    patch: Parameters<typeof executionRepo.transitionIntent>[4] = {},
  ): Promise<IntentRow> {
    assertTransition(actionMachine, intent.state, to);
    const updated = await executionRepo.transitionIntent(tx, intent.id, intent.state, to, patch);
    if (!updated) throw new StudioError('STALE_REVISION');
    return updated;
  }

  async function enqueue(tx: Tx, intent: IntentRow, eventType: string, dedupe: string, correlation: string, runAt?: string) {
    await executionRepo.insertOutbox(tx, {
      workspace_id: intent.workspace_id,
      brand_id: intent.brand_id,
      aggregate_id: intent.id,
      aggregate_version: intent.version,
      event_type: eventType,
      correlation_id: correlation,
      payload: runAt ? { run_at: runAt } : {},
      dedupe_key: dedupe,
    });
  }

  function costOf(row: ConnectionRow): Money {
    const manifest = deps.connectors.has(row.provider) ? deps.connectors.get(row.provider).manifest : null;
    // هزینهٔ قطعی فقط برای مسیر رایگان صفر است؛ مدل‌های دیگر تا دریافت quote واقعی ثبت نمی‌شوند.
    if (!manifest || manifest.cost_model === 'free') return { amount_minor: 0, currency: 'IRR' };
    const quoted = row.config['quoted_cost_minor'];
    return { amount_minor: typeof quoted === 'number' && quoted > 0 ? Math.trunc(quoted) : 0, currency: 'IRR' };
  }

  async function currentHash(tx: Tx, contentId: string): Promise<{ revision: number; hash: string; text: string }> {
    const revisions = await contentRepo.listRevisions(tx, contentId);
    const latest = revisions[0];
    if (!latest) throw new StudioError('CONFLICT', { message_fa: 'این محتوا هنوز متنی ندارد.' });
    return { revision: latest.revision, hash: latest.hash, text: latest.text };
  }

  async function capabilityUsable(tx: Tx, row: ConnectionRow, action: string): Promise<{ usable: boolean; reason: string }> {
    const capabilities = await connectionRepo.listCapabilities(tx, row.brand_id);
    const capability = capabilities.find((item) => item.connection_id === row.id && item.action === action);
    return {
      usable: row.status === 'active' && isUsable(capability, deps.now()),
      reason: capability ? `${capability.status}:${capability.reason_code}` : 'NOT_DISCOVERED',
    };
  }

  function policyFor(
    brand: LoadedBrandState,
    intent: Pick<IntentRow, 'action_type' | 'channel' | 'scheduled_at_utc'> & { estimated_cost: Money },
    actor: BrandCall['actor'],
  ): PolicyDecision {
    const local = utcToLocal(new Date(intent.scheduled_at_utc).toISOString(), brand.profile.timezone);
    return evaluatePolicy({
      action_type: intent.action_type,
      category: 'external_publish',
      channel: intent.channel,
      actor,
      brand: { status: brand.row.status },
      policy: { revision: brand.policy.revision, authority: brand.policy.authority },
      estimated_cost: intent.estimated_cost,
      local: { weekday: weekdayOf(local.date), time: local.time },
    });
  }

  async function createManualTask(tx: Tx, intent: IntentRow, reason: string, instructions: string): Promise<ManualTaskRow> {
    const { text, hash } = await currentHash(tx, intent.content_id);
    return executionRepo.insertManualTask(tx, {
      workspace_id: intent.workspace_id,
      brand_id: intent.brand_id,
      intent_id: intent.id,
      kind: intent.action_type,
      state: 'assigned',
      reason_code: reason,
      instructions_fa: instructions,
      package: {
        channel: intent.channel,
        format: intent.format,
        text,
        content_hash: hash,
        scheduled_at_utc: iso(intent.scheduled_at_utc),
        is_sample: intent.is_sample,
      },
    });
  }

  async function createFunding(tx: Tx, intent: IntentRow, provider: string, purpose: string, amount: Money): Promise<void> {
    try {
      await withSavepoint(tx, () => executionRepo.insertFunding(tx, {
        workspace_id: intent.workspace_id,
        brand_id: intent.brand_id,
        intent_id: intent.id,
        provider,
        purpose,
        amount,
        quote_expires_at: new Date(deps.now().getTime() + 24 * 60 * 60 * 1000).toISOString(),
        payment_mode: 'manual',
      }));
    } catch (error) {
      // درخواست باز برای همین قصد از قبل هست.
      if (!isUniqueViolation(error, 'funding_requests_open_key')) throw error;
    }
  }

  async function intentView(tx: Tx, rows: IntentRow[], replayed = false): Promise<IntentView[]> {
    const ids = rows.map((row) => row.id);
    const approvals = await executionRepo.listApprovals(tx, ids);
    const tasks = await executionRepo.taskIdsByIntent(tx, ids);
    const funding = await executionRepo.fundingIdsByIntent(tx, ids);
    const now = deps.now();
    return rows.map((row) => ({
      id: row.id,
      brand_id: row.brand_id,
      action_type: row.action_type,
      category: row.category,
      connection_id: row.connection_id,
      content_id: row.content_id,
      content_revision: row.content_revision,
      channel: row.channel,
      format: row.format,
      payload_hash: row.payload_hash,
      idempotency_key: row.idempotency_key,
      state: row.state,
      state_fa: ACTION_STATE_LABEL_FA[row.state],
      policy_revision: row.policy_revision,
      policy_reason: row.policy_reason,
      policy_reason_fa: POLICY_REASON_FA[row.policy_reason] ?? policyReasonFa(row.policy_reason),
      estimated_cost: row.estimated_cost,
      scheduled_at_utc: iso(row.scheduled_at_utc),
      expires_at: iso(row.expires_at),
      attempts: row.attempts,
      last_error: row.last_error,
      result: row.result,
      approvals: (approvals.get(row.id) ?? []).map(
        (approval): ApprovalView => ({
          id: approval.id,
          payload_hash: approval.payload_hash,
          approver_id: approval.approver_id,
          decision: approval.decision,
          policy_revision: approval.policy_revision,
          note: approval.note,
          approved_at: iso(approval.approved_at),
          expires_at: iso(approval.expires_at),
          valid:
            approval.decision === 'approved' && approval.payload_hash === row.payload_hash && approval.expires_at > now,
        }),
      ),
      manual_task_id: tasks.get(row.id) ?? null,
      funding_request_id: funding.get(row.id) ?? null,
      is_sample: row.is_sample,
      replayed,
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
    }));
  }

  function policyReasonFa(reason: string): string {
    // متن دلیل از همان موتور سیاست گرفته می‌شود تا پیام‌ها یکسان بمانند.
    const decision = evaluatePolicyReasonText(reason);
    return decision ?? reason;
  }

  const one = async (tx: Tx, row: IntentRow, replayed = false): Promise<IntentView> =>
    (await intentView(tx, [row], replayed))[0] as IntentView;

  function hasValidApproval(approvals: executionRepo.ApprovalRow[] | undefined, intent: IntentRow): boolean {
    const latest = approvals?.[0];
    return (
      latest !== undefined &&
      latest.decision === 'approved' &&
      latest.payload_hash === intent.payload_hash &&
      latest.expires_at > deps.now()
    );
  }

  /* ─────────────────────────────── فرمان‌های مالک ─────────────────────────────── */

  async function createPublishIntent(call: BrandCall, contentId: string, body: CreatePublishIntentBody): Promise<IntentView> {
    const scope = scopeOf(call);
    const requestHash = hashObject({
      content_id: contentId,
      connection_id: body.connection_id,
      scheduled_at_utc: body.scheduled_at_utc ?? null,
    });

    const outcome = await deps.db.tenant(scope, async (tx) => {
      const item = await contentRepo.getContentItem(tx, contentId);
      if (!item) throw notFound('محتوا');
      const actionType = actionTypeFor(item.format);
      const existing = await executionRepo.findIntentByKey(tx, call.brand_id, actionType, body.idempotency_key);
      if (existing) {
        if (existing.request_hash !== requestHash) throw new StudioError('IDEMPOTENCY_KEY_REUSED');
        return { kind: 'intent' as const, view: await one(tx, existing, true) };
      }
      if (!['ready_for_review', 'approved', 'scheduled', 'failed'].includes(item.state) || item.qa_status === 'fail') {
        throw new StudioError('INVALID_TRANSITION', {
          message_fa: 'فقط محتوای آمادهٔ بازبینی با QA قابل قبول را می‌توان برای انتشار فرستاد.',
        });
      }
      const connection = await connectionRepo.getConnection(tx, body.connection_id);
      if (!connection) throw notFound('اتصال');
      const configuredChannel = connection.config['channel'];
      if (typeof configuredChannel === 'string' && configuredChannel !== item.channel) {
        throw new StudioError('VALIDATION_FAILED', {
          message_fa: 'کانال این اتصال با کانال محتوا یکی نیست.',
          details: [{ path: 'connection_id', message: `کانال اتصال: ${configuredChannel}` }],
        });
      }
      const live = await executionRepo.findLiveIntent(tx, contentId, connection.id, actionType);
      if (live) {
        throw new StudioError('CONFLICT', {
          message_fa: 'برای همین محتوا روی همین اتصال قصد انتشار فعالی وجود دارد؛ انتشار دوم ساخته نمی‌شود.',
        });
      }

      const brand = await brands.load(tx, call.brand_id);
      const current = await currentHash(tx, contentId);
      const now = deps.now();
      const requested = body.scheduled_at_utc ?? (item.scheduled_at_utc ?? now.toISOString());
      const scheduled = new Date(requested) < now ? now : new Date(requested);
      const estimated = costOf(connection);
      const draft = {
        action_type: actionType,
        channel: item.channel,
        scheduled_at_utc: scheduled,
        estimated_cost: estimated,
      };
      const capability = await capabilityUsable(tx, connection, actionType);

      let state: ActionState;
      let reason: string;
      let decision: PolicyDecision | null = null;
      if (brand.row.status !== 'active' || brand.policy.authority.paused) {
        decision = policyFor(brand, draft, call.actor);
        return { kind: 'denied' as const, decision };
      }
      if (!capability.usable) {
        // مسیر دستی معتبر است (ADR-007)؛ مالک خودش منتشر می‌کند، پس draft_only مانع آن نیست.
        state = 'manual_required';
        reason = 'CAPABILITY_MANUAL';
      } else {
        decision = policyFor(brand, draft, call.actor);
        if (decision.decision === 'deny') return { kind: 'denied' as const, decision };
        reason = decision.reason;
        state =
          decision.decision === 'allow'
            ? 'authorized'
            : decision.decision === 'needs_funds'
              ? 'awaiting_funds'
              : 'awaiting_approval';
      }
      assertTransition(actionMachine, 'proposed', state);

      let intent: IntentRow;
      try {
        intent = await withSavepoint(tx, () => executionRepo.insertIntent(tx, {
          workspace_id: call.workspace_id,
          brand_id: call.brand_id,
          actor_id: call.actor.id,
          action_type: actionType,
          category: 'external_publish',
          connection_id: connection.id,
          content_id: contentId,
          content_revision: current.revision,
          channel: item.channel,
          format: item.format,
          target: {
            connection_id: connection.id,
            channel: item.channel,
            format: item.format,
            destination_id: connection.external_account_id ?? connection.id,
            timezone: brand.profile.timezone,
          },
          payload_ref: `content://${contentId}/revisions/${current.revision}`,
          payload_hash: current.hash,
          idempotency_key: body.idempotency_key,
          request_hash: requestHash,
          provider_key: `intent-${randomUUID()}`,
          estimated_cost: estimated,
          state,
          policy_revision: brand.policy.revision,
          policy_reason: reason,
          scheduled_at_utc: scheduled.toISOString(),
          expires_at: new Date(scheduled.getTime() + PUBLISH_GRACE_MS).toISOString(),
          is_sample: item.is_sample || connection.is_sample,
        }));
      } catch (error) {
        if (isUniqueViolation(error, executionRepo.INTENT_IDEMPOTENCY_CONSTRAINT)) {
          const raced = await executionRepo.findIntentByKey(tx, call.brand_id, actionType, body.idempotency_key);
          if (raced) return { kind: 'intent' as const, view: await one(tx, raced, true) };
        }
        if (isUniqueViolation(error, executionRepo.INTENT_LIVE_CONSTRAINT)) {
          throw new StudioError('CONFLICT', { message_fa: 'برای همین محتوا قصد انتشار فعالی وجود دارد.' });
        }
        throw error;
      }

      if (state === 'authorized') {
        await moveContent(tx, contentId, 'scheduled');
        await enqueue(tx, intent, 'action.authorized', `intent:${intent.id}:authorized:${intent.version}`, call.trace_id, intent.scheduled_at_utc.toISOString());
      } else if (state === 'manual_required') {
        await createManualTask(
          tx,
          intent,
          capability.reason,
          'این قالب روی این حساب مسیر خودکار اثبات‌شده ندارد. متن و رسانهٔ بسته را در زمان تعیین‌شده خودتان منتشر کنید و نشانی پست را این‌جا ثبت کنید.',
        );
      } else if (state === 'awaiting_funds') {
        await createFunding(tx, intent, connection.provider, 'هزینهٔ انتشار با حالت «فقط رایگان» سازگار نیست.', estimated);
      }
      await audit(tx, call, {
        action: 'intent.create',
        target_type: 'action_intent',
        target_id: intent.id,
        outcome: 'succeeded',
        metadata: { action_type: actionType, state, policy: reason, content_revision: current.revision },
      });
      return { kind: 'intent' as const, view: await one(tx, intent) };
    });

    if (outcome.kind === 'denied') {
      await deps.db.tenant(scope, (tx) =>
        audit(tx, call, {
          action: 'intent.create',
          target_type: 'action_intent',
          target_id: null,
          outcome: 'denied',
          metadata: { reason: outcome.decision.reason, policy_revision: outcome.decision.policy_revision },
        }),
      );
      throw new StudioError('POLICY_DENIED', { message_fa: outcome.decision.reason_fa });
    }
    return outcome.view;
  }

  async function decideApproval(call: BrandCall, intentId: string, body: DecideApprovalBody): Promise<IntentView> {
    if (!canApprove(call.actor)) {
      throw new StudioError('FORBIDDEN', { message_fa: 'فقط مالک یا بازبین انسانی می‌تواند تأیید ثبت کند.' });
    }
    return deps.db.tenant(scopeOf(call), async (tx) => {
      let intent = await executionRepo.getIntent(tx, intentId, true);
      if (!intent) throw notFound('قصد اجرا');
      if (intent.state !== 'awaiting_approval') {
        throw new StudioError('INVALID_TRANSITION', { message_fa: 'این قصد منتظر تأیید نیست.' });
      }
      const current = await currentHash(tx, intent.content_id);
      if (body.payload_hash !== intent.payload_hash || current.hash !== intent.payload_hash) {
        throw new StudioError('STALE_REVISION', {
          message_fa: 'نسخه‌ای که تأیید می‌کنید با نسخهٔ ثبت‌شده برای انتشار یکی نیست؛ صفحه را تازه کنید.',
        });
      }
      const brand = await brands.load(tx, call.brand_id);
      const now = deps.now();
      const expires = new Date(Math.min(now.getTime() + APPROVAL_TTL_MS, intent.expires_at.getTime()));
      await executionRepo.insertApproval(tx, {
        workspace_id: call.workspace_id,
        brand_id: call.brand_id,
        intent_id: intent.id,
        payload_hash: intent.payload_hash,
        approver_id: call.actor.id,
        decision: body.decision,
        policy_revision: brand.policy.revision,
        note: body.note?.trim() || null,
        approved_at: now.toISOString(),
        expires_at: expires.toISOString(),
      });
      if (body.decision === 'approved') {
        intent = await transition(tx, intent, 'authorized', { policy_reason: 'OWNER_APPROVED' });
        await moveContent(tx, intent.content_id, 'scheduled');
        await enqueue(tx, intent, 'action.authorized', `intent:${intent.id}:authorized:${intent.version}`, call.trace_id, intent.scheduled_at_utc.toISOString());
      } else {
        intent = await transition(tx, intent, 'denied', {
          last_error: { code: 'POLICY_DENIED', message_fa: 'مالک یا بازبین این انتشار را تأیید نکرد.' },
        });
        await moveContent(tx, intent.content_id, 'needs_revision');
      }
      await audit(tx, call, {
        action: 'intent.approval',
        target_type: 'action_intent',
        target_id: intent.id,
        outcome: 'succeeded',
        metadata: { decision: body.decision, payload_hash: intent.payload_hash },
      });
      return one(tx, intent);
    });
  }

  /** ویرایش محتوا تأییدهای قبلی و قصدهای ارسال‌نشده را باطل می‌کند (A04). در همان تراکنش ویرایش صدا زده می‌شود. */
  async function invalidateForRevision(tx: Tx, call: BrandCall, contentId: string): Promise<number> {
    const pending = await executionRepo.listPendingIntentsForContent(tx, contentId);
    for (const intent of pending) {
      await transition(tx, intent, 'denied', {
        policy_reason: 'REVISION_CHANGED',
        last_error: { code: 'STALE_REVISION', message_fa: POLICY_REASON_FA['REVISION_CHANGED'] as string },
      });
      await executionRepo.settleReservation(tx, intent.id, 'released');
      await releaseContent(tx, intent.content_id);
      await audit(tx, call, {
        action: 'intent.invalidate',
        target_type: 'action_intent',
        target_id: intent.id,
        outcome: 'succeeded',
        metadata: { reason: 'REVISION_CHANGED', previous_state: intent.state },
      });
    }
    return pending.length;
  }

  async function retryIntent(call: BrandCall, intentId: string, body: RetryIntentBody): Promise<IntentView> {
    return deps.db.tenant(scopeOf(call), async (tx) => {
      let intent = await executionRepo.getIntent(tx, intentId, true);
      if (!intent) throw notFound('قصد اجرا');
      if (intent.state !== 'failed') {
        throw new StudioError('INVALID_TRANSITION', {
          message_fa:
            intent.state === 'unknown'
              ? 'نتیجهٔ این ارسال نامعلوم است؛ تا روشن‌شدن وضعیت، ارسال دوباره انجام نمی‌شود.'
              : 'فقط قصد ناموفق را می‌توان دوباره اجرا کرد.',
        });
      }
      const current = await currentHash(tx, intent.content_id);
      if (current.hash !== intent.payload_hash) {
        throw new StudioError('STALE_REVISION', { message_fa: 'متن تغییر کرده است؛ قصد انتشار تازه ثبت کنید.' });
      }
      const brand = await brands.load(tx, call.brand_id);
      const decision = policyFor(brand, intent, call.actor);
      if (decision.decision === 'deny' || decision.decision === 'needs_funds') {
        throw new StudioError('POLICY_DENIED', { message_fa: decision.reason_fa });
      }
      const now = deps.now();
      // زمان تازه یعنی تغییر تقویم؛ تأیید قبلی دوباره استفاده نمی‌شود مگر سیاست اجازهٔ خودکار بدهد.
      const target: ActionState = decision.decision === 'allow' ? 'authorized' : 'awaiting_approval';
      try {
        intent = await transition(tx, intent, target, { last_error: null, policy_reason: decision.reason });
      } catch (error) {
        if (isUniqueViolation(error, executionRepo.INTENT_LIVE_CONSTRAINT)) {
          throw new StudioError('CONFLICT', { message_fa: 'قصد انتشار فعال دیگری برای همین محتوا وجود دارد.' });
        }
        throw error;
      }
      // زمان تازه: از اکنون، با همان مهلت.
      await tx.query(
        'UPDATE action_intents SET scheduled_at_utc = $2, expires_at = $3 WHERE id = $1',
        [intent.id, now.toISOString(), new Date(now.getTime() + PUBLISH_GRACE_MS).toISOString()],
      );
      intent = (await executionRepo.getIntent(tx, intent.id)) as IntentRow;
      if (target === 'authorized') {
        await moveContent(tx, intent.content_id, 'scheduled');
        await enqueue(tx, intent, 'action.retry_requested', `intent:${intent.id}:retry:${body.idempotency_key}`, call.trace_id);
      }
      await audit(tx, call, {
        action: 'intent.retry',
        target_type: 'action_intent',
        target_id: intent.id,
        outcome: 'succeeded',
        metadata: { state: target },
      });
      return one(tx, intent);
    });
  }

  async function cancelIntent(call: BrandCall, intentId: string): Promise<IntentView> {
    return deps.db.tenant(scopeOf(call), async (tx) => {
      let intent = await executionRepo.getIntent(tx, intentId, true);
      if (!intent) throw notFound('قصد اجرا');
      if (!['proposed', 'awaiting_approval', 'awaiting_funds', 'authorized', 'reserved', 'manual_required'].includes(intent.state)) {
        throw new StudioError('INVALID_TRANSITION', {
          message_fa: 'این قصد در حال ارسال یا تمام‌شده است و لغو آن ممکن نیست؛ وضعیت آن صادقانه گزارش می‌شود.',
        });
      }
      intent = await transition(tx, intent, 'denied', { policy_reason: 'CANCELLED' });
      await executionRepo.settleReservation(tx, intent.id, 'released');
      await releaseContent(tx, intent.content_id);
      await audit(tx, call, {
        action: 'intent.cancel',
        target_type: 'action_intent',
        target_id: intent.id,
        outcome: 'succeeded',
      });
      return one(tx, intent);
    });
  }

  function taskView(row: ManualTaskRow): ManualTaskView {
    return {
      id: row.id,
      brand_id: row.brand_id,
      intent_id: row.intent_id,
      kind: row.kind,
      state: row.state,
      reason_code: row.reason_code,
      instructions_fa: row.instructions_fa,
      package: row.package,
      completed_url: row.completed_url,
      completed_at: row.completed_at ? iso(row.completed_at) : null,
      created_at: iso(row.created_at),
    };
  }

  async function completeManualTask(call: BrandCall, taskId: string, body: CompleteManualTaskBody): Promise<ManualTaskView> {
    return deps.db.tenant(scopeOf(call), async (tx) => {
      const task = await executionRepo.getManualTask(tx, taskId);
      if (!task) throw notFound('کار دستی');
      if (task.state !== 'assigned' && task.state !== 'prepared') {
        throw new StudioError('INVALID_TRANSITION', { message_fa: 'این کار دستی قبلاً ثبت شده است.' });
      }
      const intent = await executionRepo.getIntent(tx, task.intent_id, true);
      if (!intent) throw notFound('قصد اجرا');
      if (intent.state !== 'manual_required') {
        throw new StudioError('INVALID_TRANSITION', { message_fa: 'قصد این کار دستی دیگر منتظر انتشار دستی نیست.' });
      }
      const current = await currentHash(tx, intent.content_id);
      if (current.hash !== task.package.content_hash) {
        throw new StudioError('STALE_REVISION', { message_fa: 'متن پس از آماده‌شدن بستهٔ دستی تغییر کرده است.' });
      }
      const at = nowIso();
      const updated = await executionRepo.completeManualTask(tx, task.id, task.state, body.external_url, at);
      if (!updated) throw new StudioError('STALE_REVISION');
      await transition(tx, intent, 'succeeded', {
        result: { external_id: null, external_url: body.external_url, evidence_ref: null, verification: 'owner_reported' },
      });
      await executionRepo.insertPublication(tx, {
        workspace_id: intent.workspace_id,
        brand_id: intent.brand_id,
        intent_id: intent.id,
        connection_id: intent.connection_id,
        content_id: intent.content_id,
        content_revision: intent.content_revision,
        external_id: null,
        external_url: body.external_url,
        provider_request_id: null,
        evidence_ref: null,
        verification: 'owner_reported',
        is_sample: intent.is_sample,
        published_at: at,
      });
      await moveContent(tx, intent.content_id, 'published');
      await audit(tx, call, {
        action: 'manual_task.complete',
        target_type: 'manual_task',
        target_id: task.id,
        outcome: 'succeeded',
        metadata: { verification: 'owner_reported' },
      });
      return taskView(updated);
    });
  }

  function fundingView(row: FundingRow): FundingRequestView {
    return {
      id: row.id,
      brand_id: row.brand_id,
      intent_id: row.intent_id,
      provider: row.provider,
      purpose: row.purpose,
      amount: { amount_minor: Number(row.amount), currency: row.currency as Money['currency'] },
      quote_expires_at: iso(row.quote_expires_at),
      payment_mode: row.payment_mode,
      status: row.status,
      decided_by: row.decided_by,
      decided_at: row.decided_at ? iso(row.decided_at) : null,
      version: row.version,
      created_at: iso(row.created_at),
    };
  }

  async function decideFunding(call: BrandCall, requestId: string, body: DecideFundingBody): Promise<FundingRequestView> {
    return deps.db.tenant(scopeOf(call), async (tx) => {
      const row = await executionRepo.getFunding(tx, requestId);
      if (!row) throw notFound('درخواست شارژ');
      if (row.version !== body.expected_version) throw new StudioError('STALE_REVISION');
      // تأیید مالک فقط به «منتظر پرداخت» می‌رسد؛ پرداخت را مالک خودش در سامانهٔ ارائه‌دهنده انجام می‌دهد.
      const to = body.decision === 'approve' ? 'owner_approved' : body.decision === 'decline' ? 'declined' : 'cancelled';
      assertTransition(fundingRequestMachine, row.status, to);
      let updated = await executionRepo.updateFunding(tx, row.id, row.version, to, call.actor.id, nowIso());
      if (!updated) throw new StudioError('STALE_REVISION');
      if (to === 'owner_approved') {
        assertTransition(fundingRequestMachine, 'owner_approved', 'awaiting_payment');
        updated = await executionRepo.updateFunding(tx, row.id, updated.version, 'awaiting_payment', call.actor.id, nowIso());
        if (!updated) throw new StudioError('STALE_REVISION');
      }
      if (to !== 'owner_approved' && row.intent_id) {
        const intent = await executionRepo.getIntent(tx, row.intent_id, true);
        if (intent?.state === 'awaiting_funds') {
          await transition(tx, intent, 'denied', {
            last_error: { code: 'PAYMENT_REQUIRED', message_fa: 'مالک هزینهٔ این اقدام را تأیید نکرد.' },
          });
        }
      }
      await audit(tx, call, {
        action: 'funding.decide',
        target_type: 'funding_request',
        target_id: row.id,
        outcome: 'succeeded',
        metadata: { decision: body.decision },
      });
      return fundingView(updated as FundingRow);
    });
  }

  /* ─────────────────────────────── worker ─────────────────────────────── */

  type JobOutcome =
    | { status: 'succeeded' | 'failed' | 'cancelled'; outcome: string }
    | { status: 'queued'; outcome: string; run_at: Date; error?: { code: string; message_fa: string } | null };

  const workerCall = (job: Pick<ClaimedJob, 'workspace_id' | 'brand_id' | 'id'>): BrandCall => ({
    trace_id: `job:${job.id}`,
    workspace_id: job.workspace_id,
    brand_id: job.brand_id,
    actor: SYSTEM_ACTOR,
  });

  function backoff(attempts: number, retryAfter: number | null): Date {
    const base = retryAfter !== null ? retryAfter * 1000 : Math.min(2 ** attempts * 30_000, 30 * 60_000);
    // jitter قطعی کوچک برای جلوگیری از هجوم هم‌زمان؛ بدون Math.random تا آزمون تکرارپذیر بماند.
    return new Date(deps.now().getTime() + base + (attempts % 5) * 1000);
  }

  /** ثبت نتیجهٔ قطعی ارائه‌دهنده؛ در یک تراکنش با قصد، انتشار، محتوا، بودجه و audit. */
  async function recordSuccess(tx: Tx, call: BrandCall, intent: IntentRow, result: ConnectorResult, verification: 'provider' | 'reconciled') {
    const at = nowIso();
    const updated = await transition(tx, intent, 'succeeded', {
      last_error: null,
      result: {
        external_id: result.external_id,
        external_url: result.external_url,
        evidence_ref: result.evidence_ref,
        verification,
      },
    });
    await executionRepo.insertPublication(tx, {
      workspace_id: intent.workspace_id,
      brand_id: intent.brand_id,
      intent_id: intent.id,
      connection_id: intent.connection_id,
      content_id: intent.content_id,
      content_revision: intent.content_revision,
      external_id: result.external_id,
      external_url: result.external_url,
      provider_request_id: result.provider_request_id,
      evidence_ref: result.evidence_ref,
      verification,
      is_sample: intent.is_sample,
      published_at: at,
    });
    await executionRepo.settleReservation(tx, intent.id, 'committed');
    if (result.cost_actual && result.cost_actual.amount_minor > 0) {
      const connection = await connectionRepo.getConnection(tx, intent.connection_id);
      await executionRepo.insertLedger(tx, {
        workspace_id: intent.workspace_id,
        brand_id: intent.brand_id,
        account_id: null,
        intent_id: intent.id,
        kind: 'actual',
        amount: result.cost_actual,
        provider: connection?.provider ?? 'unknown',
        is_sample: intent.is_sample,
      });
    }
    await moveContent(tx, intent.content_id, 'published');
    await audit(tx, call, {
      action: 'intent.execute',
      target_type: 'action_intent',
      target_id: intent.id,
      outcome: 'succeeded',
      metadata: { verification, is_sample: intent.is_sample, attempts: updated.attempts },
    });
  }

  async function markUnknown(tx: Tx, call: BrandCall, intent: IntentRow, code: ErrorCode, message: string) {
    const updated = intent.state === 'unknown'
      ? intent
      : await transition(tx, intent, 'unknown', { last_error: { code, message_fa: message } });
    await moveContent(tx, intent.content_id, 'publishing_unknown');
    await enqueue(
      tx,
      updated,
      'action.reconcile_requested',
      `intent:${intent.id}:reconcile:${updated.version}`,
      call.trace_id,
    );
    await audit(tx, call, {
      action: 'intent.execute',
      target_type: 'action_intent',
      target_id: intent.id,
      outcome: 'failed',
      metadata: { result: 'unknown', error_code: code },
    });
  }

  /**
   * بررسی وضعیت نزد ارائه‌دهنده با همان کلید پایدار. هرگز ارسال کور انجام نمی‌دهد:
   * موفق → ثبت؛ «یافت نشد» (اثبات عدم ثبت) → بازگشت به reserved برای ارسال دوباره با همان کلید؛
   * غیر از این → unknown می‌ماند و پس از سقف تلاش به بررسی دستی می‌رود.
   */
  async function reconcile(job: ClaimedJob, call: BrandCall, intentId: string): Promise<JobOutcome> {
    const scope = scopeOf(call);
    const loaded = await deps.db.tenant(scope, async (tx) => {
      const intent = await executionRepo.getIntent(tx, intentId);
      const connection = intent ? await connectionRepo.getConnection(tx, intent.connection_id) : null;
      return { intent, connection };
    });
    const { intent, connection } = loaded;
    if (!intent || !connection) return { status: 'cancelled', outcome: 'missing' };
    if (intent.state !== 'executing' && intent.state !== 'unknown') return { status: 'succeeded', outcome: `noop:${intent.state}` };

    let status: ConnectorResult;
    try {
      status = await connections.guardedPort(connection).getOperationStatus(connections.connectorContext(connection, call.trace_id), {
        action: intent.action_type,
        idempotency_key: intent.provider_key,
      });
    } catch (error) {
      status = {
        status: 'failed',
        error_code: isStudioError(error) ? error.code : 'PROVIDER_UNAVAILABLE',
        external_id: null,
        external_url: null,
        provider_request_id: null,
        retry_after: null,
        cost_actual: null,
        evidence_ref: null,
      };
    }

    return deps.db.tenant(scope, async (tx) => {
      const fresh = await executionRepo.getIntent(tx, intentId, true);
      if (!fresh || (fresh.state !== 'executing' && fresh.state !== 'unknown')) {
        return { status: 'succeeded' as const, outcome: 'noop' };
      }
      if (status.status === 'succeeded') {
        await recordSuccess(tx, call, fresh, status, 'reconciled');
        return { status: 'succeeded' as const, outcome: 'reconciled_succeeded' };
      }
      if (status.status === 'failed' && status.error_code === 'NOT_FOUND') {
        // ارائه‌دهنده هیچ ردی ندارد: اثبات عدم انتشار؛ ارسال دوباره با همان کلید پایدار امن است.
        const back = await transition(tx, fresh, 'reserved', {
          last_error: { code: 'UNKNOWN_OUTCOME', message_fa: 'ارائه‌دهنده ثبت این عملیات را تأیید نکرد؛ با همان کلید دوباره ارسال می‌شود.' },
        });
        await enqueue(tx, back, 'action.retry_requested', `intent:${fresh.id}:resend:${back.version}`, call.trace_id);
        return { status: 'succeeded' as const, outcome: 'reconciled_not_found' };
      }
      if (fresh.state === 'executing') {
        await markUnknown(tx, call, fresh, 'UNKNOWN_OUTCOME', 'نتیجهٔ ارسال قبلی روشن نیست؛ تا روشن‌شدن وضعیت ارسال دوباره انجام نمی‌شود.');
        return { status: 'succeeded' as const, outcome: 'unknown' };
      }
      if (job.attempts >= job.max_attempts) {
        await transition(tx, fresh, 'manual_required', {
          last_error: { code: 'UNKNOWN_OUTCOME', message_fa: 'وضعیت انتشار از ارائه‌دهنده قابل اثبات نیست؛ بررسی دستی لازم است.' },
        });
        await createManualTask(
          tx,
          fresh,
          'UNKNOWN_OUTCOME',
          'وضعیت این انتشار نزد ارائه‌دهنده قابل اثبات نبود. حساب را دستی بررسی کنید: اگر پست منتشر شده، نشانی آن را ثبت کنید؛ وگرنه این قصد را لغو و دوباره درخواست کنید.',
        );
        return { status: 'succeeded' as const, outcome: 'manual_required' };
      }
      return {
        status: 'queued' as const,
        outcome: 'reconcile_retry',
        run_at: backoff(job.attempts, status.retry_after),
        error: { code: status.error_code ?? 'UNKNOWN_OUTCOME', message_fa: 'بررسی وضعیت ممکن نشد؛ بعداً دوباره بررسی می‌شود.' },
      };
    });
  }

  async function publish(job: ClaimedJob, call: BrandCall): Promise<JobOutcome> {
    const scope = scopeOf(call);

    // ۱) بخش بحرانی پیش از side effect: همهٔ شرط‌ها دوباره بررسی و قصد به executing برده می‌شود.
    type Prepared =
      | { kind: 'done'; outcome: JobOutcome }
      | { kind: 'reconcile' }
      | { kind: 'send'; intent: IntentRow; connection: ConnectionRow; text: string };
    const prepared: Prepared = await deps.db.tenant(scope, async (tx): Promise<Prepared> => {
      let intent = await executionRepo.getIntent(tx, job.ref_id, true);
      if (!intent) return { kind: 'done', outcome: { status: 'cancelled', outcome: 'missing' } };
      if (intent.state === 'executing' || intent.state === 'unknown') return { kind: 'reconcile' };
      if (intent.state !== 'authorized' && intent.state !== 'reserved') {
        return { kind: 'done', outcome: { status: 'cancelled', outcome: `skipped:${intent.state}` } };
      }
      const brand = await brands.load(tx, call.brand_id);
      if (brand.row.status === 'paused' || brand.policy.authority.paused) {
        // توقف: کار تازه شروع نمی‌شود؛ قصد سر جایش می‌ماند و پس از ادامه اجرا می‌شود (A15).
        return {
          kind: 'done',
          outcome: { status: 'queued', outcome: 'paused', run_at: new Date(deps.now().getTime() + PAUSE_RECHECK_MS) },
        };
      }
      const now = deps.now();
      if (now > intent.expires_at) {
        // دستگاه خاموش بوده یا صف عقب افتاده: منتشر نمی‌شود و زمان تازه از مالک خواسته می‌شود (A14).
        intent = await transition(tx, intent.state === 'reserved' ? await transition(tx, intent, 'authorized') : intent, 'failed', {
          last_error: { code: 'SCHEDULE_EXPIRED', message_fa: new StudioError('SCHEDULE_EXPIRED').message_fa },
        });
        await executionRepo.settleReservation(tx, intent.id, 'released');
        await releaseContent(tx, intent.content_id);
        await audit(tx, call, {
          action: 'intent.execute',
          target_type: 'action_intent',
          target_id: intent.id,
          outcome: 'failed',
          metadata: { error_code: 'SCHEDULE_EXPIRED' },
        });
        return { kind: 'done', outcome: { status: 'succeeded', outcome: 'expired' } };
      }
      const current = await currentHash(tx, intent.content_id);
      if (current.hash !== intent.payload_hash) {
        await transition(tx, intent, 'denied', {
          policy_reason: 'REVISION_CHANGED',
          last_error: { code: 'STALE_REVISION', message_fa: POLICY_REASON_FA['REVISION_CHANGED'] as string },
        });
        return { kind: 'done', outcome: { status: 'cancelled', outcome: 'stale_revision' } };
      }
      const decision = policyFor(brand, intent, SYSTEM_ACTOR);
      if (decision.decision === 'deny') {
        await transition(tx, intent.state === 'reserved' ? await transition(tx, intent, 'authorized') : intent, 'denied', {
          policy_revision: decision.policy_revision,
          policy_reason: decision.reason,
          last_error: { code: 'POLICY_DENIED', message_fa: decision.reason_fa },
        });
        await releaseContent(tx, intent.content_id);
        return { kind: 'done', outcome: { status: 'cancelled', outcome: 'policy_denied' } };
      }
      if (decision.decision === 'needs_approval') {
        const approvals = await executionRepo.listApprovals(tx, [intent.id]);
        if (!hasValidApproval(approvals.get(intent.id), intent)) {
          await transition(tx, intent.state === 'reserved' ? await transition(tx, intent, 'authorized') : intent, 'awaiting_approval', {
            policy_revision: decision.policy_revision,
            policy_reason: decision.reason,
          });
          return { kind: 'done', outcome: { status: 'cancelled', outcome: 'needs_approval' } };
        }
      }
      const connection = await connectionRepo.getConnection(tx, intent.connection_id);
      if (!connection) return { kind: 'done', outcome: { status: 'cancelled', outcome: 'missing_connection' } };
      const capability = await capabilityUsable(tx, connection, intent.action_type);
      if (!capability.usable) {
        const base = intent.state === 'reserved' ? await transition(tx, intent, 'authorized') : intent;
        if (connection.status === 'needs_access' || connection.status === 'error') {
          // قطع دسترسی فقط همین اتصال را متوقف می‌کند؛ بقیهٔ برندها و کانال‌ها ادامه می‌دهند (A13).
          await transition(tx, base, 'failed', {
            last_error: { code: 'AUTH_EXPIRED', message_fa: 'اتصال نیاز به دسترسی دوباره دارد؛ پس از اتصال دوباره، تلاش دوباره را بزنید.' },
          });
          await moveContent(tx, intent.content_id, 'failed');
          return { kind: 'done', outcome: { status: 'succeeded', outcome: 'needs_access' } };
        }
        const manual = await transition(tx, base, 'manual_required', { policy_reason: 'CAPABILITY_MANUAL' });
        await createManualTask(tx, manual, capability.reason, 'قابلیت خودکار این اتصال دیگر معتبر نیست؛ بستهٔ انتشار دستی آماده شد.');
        return { kind: 'done', outcome: { status: 'succeeded', outcome: 'manual_required' } };
      }
      if (intent.state === 'authorized') {
        if (intent.estimated_cost.amount_minor > 0) {
          const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
          const reserved = await executionRepo.reserveBudget(tx, {
            workspace_id: intent.workspace_id,
            brand_id: intent.brand_id,
            intent_id: intent.id,
            amount: intent.estimated_cost,
            provider: connection.provider,
            is_sample: intent.is_sample,
            period_start: monthStart,
          });
          if (reserved !== 'reserved') {
            const waiting = await transition(tx, intent, 'awaiting_funds', {
              last_error: { code: 'PAYMENT_REQUIRED', message_fa: 'بودجهٔ این برند برای این اقدام کافی نیست.' },
            });
            await createFunding(tx, waiting, connection.provider, 'بودجهٔ ماهانهٔ برند برای این انتشار کافی نیست.', intent.estimated_cost);
            return { kind: 'done', outcome: { status: 'succeeded', outcome: 'awaiting_funds' } };
          }
        }
        intent = await transition(tx, intent, 'reserved');
      }
      // commit «executing» پیش از تماس بیرونی: اگر پس از این crash شود، بازیابی reconcile می‌کند نه ارسال کور.
      intent = await transition(tx, intent, 'executing', { attempts_increment: true });
      await moveContent(tx, intent.content_id, 'publishing');
      return { kind: 'send', intent, connection, text: current.text };
    });

    if (prepared.kind === 'done') return prepared.outcome;
    if (prepared.kind === 'reconcile') return reconcile(job, call, job.ref_id);

    // ۲) side effect بیرونی، بیرون از تراکنش، با کلید پایدار.
    const { intent, connection, text } = prepared;
    let result: ConnectorResult;
    try {
      result = await connections.guardedPort(connection).publish(connections.connectorContext(connection, call.trace_id), {
        action: intent.action_type,
        intent_id: intent.id,
        idempotency_key: intent.provider_key,
        target: {
          connection_id: connection.id,
          channel: intent.channel,
          format: intent.format,
          destination_id: String(intent.target['destination_id'] ?? connection.id),
          scheduled_at_utc: iso(intent.scheduled_at_utc),
          timezone: String(intent.target['timezone'] ?? 'UTC'),
        },
        content: {
          content_id: intent.content_id,
          revision: intent.content_revision,
          text,
          hash: intent.payload_hash,
          media: [],
        },
      });
    } catch (error) {
      // خطای پیش از ارسال (نبود قابلیت) قطعی است؛ هر خطای دیگر ممکن است پس از ارسال رخ داده باشد → نامعلوم.
      const code: ErrorCode = isStudioError(error) ? error.code : 'UNKNOWN_OUTCOME';
      result = {
        status: code === 'UNSUPPORTED_CAPABILITY' ? 'manual_required' : 'unknown',
        error_code: code,
        external_id: null,
        external_url: null,
        provider_request_id: null,
        retry_after: null,
        cost_actual: null,
        evidence_ref: null,
      };
    }
    faults.afterSend?.(intent.id);

    // ۳) ثبت نتیجه.
    return deps.db.tenant(scope, async (tx): Promise<JobOutcome> => {
      const fresh = await executionRepo.getIntent(tx, intent.id, true);
      if (!fresh || fresh.state !== 'executing') return { status: 'succeeded', outcome: 'noop' };
      if (result.status === 'succeeded') {
        await recordSuccess(tx, call, fresh, result, 'provider');
        return { status: 'succeeded', outcome: 'published' };
      }
      if (result.status === 'unknown' || result.status === 'accepted') {
        await markUnknown(
          tx,
          call,
          fresh,
          result.error_code ?? 'UNKNOWN_OUTCOME',
          result.status === 'accepted'
            ? 'ارائه‌دهنده درخواست را پذیرفته ولی انتشار هنوز تأیید نشده است.'
            : new StudioError('UNKNOWN_OUTCOME').message_fa,
        );
        return { status: 'succeeded', outcome: 'unknown' };
      }
      if (result.status === 'manual_required') {
        const failed = await transition(tx, fresh, 'failed', {
          last_error: { code: 'UNSUPPORTED_CAPABILITY', message_fa: 'این قابلیت برای اتصال در دسترس نیست.' },
        });
        await moveContent(tx, fresh.content_id, 'failed');
        await executionRepo.settleReservation(tx, failed.id, 'released');
        return { status: 'succeeded', outcome: 'unsupported' };
      }
      const code = result.error_code ?? 'PROVIDER_UNAVAILABLE';
      const message = new StudioError(code).message_fa;
      if (RETRYABLE.includes(code) && job.attempts < job.max_attempts) {
        // شکست قطعی ارائه‌دهنده (چیزی ثبت نشده)؛ تکرار با همان کلید و backoff امن است.
        const back = await transition(tx, fresh, 'reserved', { last_error: { code, message_fa: message } });
        await audit(tx, call, {
          action: 'intent.execute',
          target_type: 'action_intent',
          target_id: back.id,
          outcome: 'failed',
          metadata: { error_code: code, will_retry: true },
        });
        return { status: 'queued', outcome: 'retry_scheduled', run_at: backoff(job.attempts, result.retry_after), error: { code, message_fa: message } };
      }
      const failed = await transition(tx, fresh, 'failed', { last_error: { code, message_fa: message } });
      await executionRepo.settleReservation(tx, failed.id, 'released');
      await moveContent(tx, fresh.content_id, 'failed');
      if (code === 'QUOTA_EXHAUSTED' || code === 'PAYMENT_REQUIRED') {
        // سهمیهٔ رایگان تمام شده: تصمیم هزینه با مالک است؛ مصرف پولی بدون اختیار صفر می‌ماند (A09).
        await createFunding(tx, failed, connection.provider, 'سهمیهٔ رایگان این سرویس تمام شده است؛ ادامه به شارژ یا پرداخت مالک نیاز دارد.', {
          amount_minor: 0,
          currency: 'IRR',
        });
      }
      await audit(tx, call, {
        action: 'intent.execute',
        target_type: 'action_intent',
        target_id: failed.id,
        outcome: 'failed',
        metadata: { error_code: code, retryable: ERROR_HTTP[code].retryable },
      });
      return { status: 'failed', outcome: `failed:${code}` };
    });
  }

  /**
   * یک دور worker: تبدیل outbox به job، برداشتن کارهای سررسیده با lease و اجرای هر کار.
   * workspaceId فقط برای اجرای درون‌فرایندی محلی است؛ worker مستقل همهٔ workspaceها را پردازش می‌کند.
   */
  async function tick(options: { worker?: string; limit?: number; workspaceId?: string | null } = {}): Promise<WorkerTickResult> {
    const worker = options.worker ?? `worker-${process.pid}`;
    const now = deps.now();
    const dispatched = await deps.db.identity((tx) => executionRepo.dispatchOutbox(tx, now));
    const jobs = await deps.db.identity((tx) =>
      executionRepo.claimJobs(tx, worker, now, LEASE_SECONDS, options.limit ?? 20, options.workspaceId ?? null),
    );
    const outcomes: WorkerTickResult['outcomes'] = [];
    for (const job of jobs) {
      const call = workerCall(job);
      let outcome: JobOutcome;
      try {
        outcome = job.kind === 'reconcile' ? await reconcile(job, call, job.ref_id) : await publish(job, call);
      } catch (error) {
        deps.logger.error({ err: error, job_id: job.id, trace_id: call.trace_id }, 'job failed');
        // بدون ثبت نتیجه: lease منقضی می‌شود و اجرای بعدی از روی وضعیت پایدار قصد تصمیم می‌گیرد.
        outcomes.push({ job_id: job.id, kind: job.kind, outcome: 'crashed' });
        continue;
      }
      await deps.db.identity((tx) =>
        executionRepo.finishJob(tx, {
          id: job.id,
          worker,
          status: outcome.status,
          run_at: outcome.status === 'queued' ? outcome.run_at : null,
          error: outcome.status === 'queued' ? (outcome.error ?? null) : null,
        }),
      );
      outcomes.push({ job_id: job.id, kind: job.kind, outcome: outcome.outcome });
    }
    return { dispatched, claimed: jobs.length, outcomes };
  }

  return {
    createPublishIntent,
    decideApproval,
    invalidateForRevision,
    retryIntent,
    cancelIntent,
    completeManualTask,
    decideFunding,
    tick,

    async listIntents(call: BrandCall, filter: { state?: ActionState; content_id?: string }): Promise<IntentView[]> {
      return deps.db.tenant(scopeOf(call), async (tx) => intentView(tx, await executionRepo.listIntents(tx, call.brand_id, filter)));
    },
    async getIntent(call: BrandCall, intentId: string): Promise<IntentView> {
      return deps.db.tenant(scopeOf(call), async (tx) => {
        const row = await executionRepo.getIntent(tx, intentId);
        if (!row) throw notFound('قصد اجرا');
        return one(tx, row);
      });
    },
    async listManualTasks(call: BrandCall): Promise<ManualTaskView[]> {
      return deps.db.tenant(scopeOf(call), async (tx) => (await executionRepo.listManualTasks(tx, call.brand_id)).map(taskView));
    },
    async listFunding(call: BrandCall): Promise<FundingRequestView[]> {
      return deps.db.tenant(scopeOf(call), async (tx) => (await executionRepo.listFunding(tx, call.brand_id)).map(fundingView));
    },
    /** اجرای درون‌فرایندی محدود به workspace مالک (پروفایل local). */
    async tickWorkspace(call: WorkspaceCall): Promise<WorkerTickResult> {
      return tick({ worker: `inline-${call.workspace_id}`, workspaceId: call.workspace_id });
    },
  };
}

export type ExecutionService = ReturnType<typeof createExecutionService>;

/** متن فارسی دلیل سیاست از همان جدول موتور سیاست. */
function evaluatePolicyReasonText(reason: string): string | null {
  const texts: Record<string, string> = {
    BRAND_ARCHIVED: 'برند آرشیو شده است.',
    BRAND_PAUSED: 'برند متوقف است.',
    FREE_ONLY: 'حالت «فقط رایگان» فعال است؛ این هزینه به درخواست شارژ مالک تبدیل شد.',
    DRAFT_ONLY: 'حالت «فقط پیش‌نویس» فعال است.',
    REVIEW_REQUIRED: 'این اقدام به تأیید مالک یا بازبین مجاز نیاز دارد.',
    SENSITIVE_ESCALATION: 'این مورد حساس است و به مالک ارجاع شد.',
    NO_MATCHING_RULE: 'هیچ قاعدهٔ اختیار خودکاری این اقدام را پوشش نمی‌دهد؛ تأیید لازم است.',
    OUTSIDE_WINDOW: 'خارج از بازهٔ زمانی مجاز اجرای خودکار است؛ تأیید لازم است.',
    TOPIC_NOT_APPROVED: 'موضوع در فهرست موضوع‌های تأییدشده نیست؛ تأیید لازم است.',
    AUTO_SCOPED_RULE: 'قاعدهٔ اختیار خودکار مالک این اقدام را مجاز می‌داند.',
  };
  return texts[reason] ?? null;
}
