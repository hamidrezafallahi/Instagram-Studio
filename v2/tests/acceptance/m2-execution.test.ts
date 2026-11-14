/**
 * پذیرش M2 — دروازهٔ مرحله: «double-click و crash انتشار تکراری نسازند».
 * پوشش: A02 (fake publish با برچسب sample)، A03 برای انتشار، A04 (ویرایش پس از تأیید)، A05 (crash پس از پذیرش
 * ارائه‌دهنده → reconcile بدون retry کور)، A09 (سهمیهٔ تمام‌شده → درخواست شارژ)، A10 (سقف بودجه)،
 * A12 (قابلیت ناموجود → کار دستی)، A13 (قطع دسترسی یک اتصال)، A14 (موعد گذشته)، A15 (توقف هنگام انتشار).
 * محیط: API درون‌فرایندی + PostgreSQL واقعی + کانکتور نمونه؛ هیچ حساب واقعی استفاده نمی‌شود.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { BrandSummary, ContentItemSummary, IntentView } from '@studio/contracts';
import { executionRepo } from '@studio/data';
import pg from 'pg';
import { createHarness, newKey, type Harness, type TestClient } from '../support/harness.ts';

let harness: Harness;
let owner: TestClient;
let brand: BrandSummary;
let connectionId: string;
let items: ContentItemSummary[] = [];
const WEEK_OF = '2026-11-11';
const PUBLISHABLE = new Set(['post', 'carousel', 'story', 'reel']);

const params = (): { workspace_id: string; brand_id: string } => owner.brand(brand.id);

/** یک محتوای آمادهٔ اینستاگرام که هنوز قصد انتشاری ندارد. */
function takeItem(): ContentItemSummary {
  const item = items.shift();
  assert.ok(item, 'محتوای کافی برای آزمون ساخته نشده است');
  return item;
}

async function tick(): Promise<Awaited<ReturnType<Harness['studio']['execution']['tick']>>> {
  return harness.studio.execution.tick({ worker: 'test-worker' });
}

async function setMode(mode: 'draft_only' | 'review_required' | 'auto_scoped', paused?: boolean): Promise<void> {
  const current = await owner.ok('getPolicy', { params: params() });
  await owner.ok('updatePolicy', {
    params: params(),
    body: { expected_revision: current.revision, mode, ...(paused === undefined ? {} : { paused }) },
  });
}

async function requestPublish(item: ContentItemSummary, key = newKey(), connection = connectionId): Promise<IntentView> {
  return owner.ok('createPublishIntent', {
    params: { ...params(), content_id: item.id },
    // زمان انتشار «اکنون» ساعت آزمون است تا worker آن را سررسیده ببیند.
    body: { connection_id: connection, idempotency_key: key, scheduled_at_utc: harness.clock.now.toISOString() },
  });
}

async function approve(intent: IntentView): Promise<IntentView> {
  return owner.ok('decideApproval', {
    params: { ...params(), intent_id: intent.id },
    body: { decision: 'approved', payload_hash: intent.payload_hash },
  });
}

async function intentOf(id: string): Promise<IntentView> {
  return owner.ok('getIntent', { params: { ...params(), intent_id: id } });
}

async function content(id: string): Promise<ContentItemSummary> {
  return (await owner.ok('getContent', { params: { ...params(), content_id: id } })).item;
}

before(async () => {
  harness = await createHarness();
  owner = await harness.owner();
  const seeded = await owner.ok('seedSampleBrands', { params: { workspace_id: owner.workspaceId } });
  brand = seeded.items.find((item) => item.industry_pack.id === 'web-services') as BrandSummary;
  // چند هفته ساخته می‌شود تا محتوای اینستاگرام کافی برای همهٔ سناریوها باشد.
  for (const week of ['2026-11-11', '2026-11-18', '2026-11-25', '2026-12-02', '2026-12-09', '2026-12-16']) {
    for (const intent of ['build_weekly_plan', 'generate_drafts'] as const) {
      const run = await owner.ok('createRun', {
        params: params(),
        body: { intent, idempotency_key: newKey(), params: { week_of: week } },
      });
      assert.equal(run.status, 'succeeded', JSON.stringify(run.error));
    }
  }
  const connections = await owner.ok('listConnections', { params: params() });
  connectionId = connections.items[0]?.id as string;
  items = (await owner.ok('listContent', { params: params() })).items.filter(
    (item) => item.channel === 'instagram' && PUBLISHABLE.has(item.format) && item.state === 'ready_for_review',
  );
  assert.ok(items.length >= 8, `محتوای اینستاگرام کافی نیست: ${items.length}`);
});
after(async () => {
  await harness.close();
});

describe('سیاست پیش‌فرض و ثبت قصد', () => {
  it('در حالت پیش‌فرض draft_only هیچ قصد انتشاری ثبت نمی‌شود و رد در audit می‌ماند', async () => {
    const item = items[0] as ContentItemSummary;
    const error = await owner.fail('createPublishIntent', 'POLICY_DENIED', {
      params: { ...params(), content_id: item.id },
      body: { connection_id: connectionId, idempotency_key: newKey() },
    });
    assert.ok(error.message_fa.includes('پیش‌نویس'));
    const intents = await owner.ok('listIntents', { params: params() });
    assert.equal(intents.items.length, 0);
    const events = await owner.ok('listAuditEvents', { params: params() });
    assert.ok(events.items.some((event) => event.action === 'intent.create' && event.outcome === 'denied'));
    await setMode('review_required');
  });

  it('A03 — دوبار کلیک با همان کلید یک قصد می‌سازد؛ کلید دیگر برای همان محتوا CONFLICT است', async () => {
    const item = takeItem();
    const key = newKey();
    const [first, second] = await Promise.all([requestPublish(item, key), requestPublish(item, key)]);
    assert.equal(first.id, second.id);
    assert.equal([first.replayed, second.replayed].filter(Boolean).length, 1);
    assert.equal(first.state, 'awaiting_approval');
    assert.equal(first.is_sample, true);
    await owner.fail('createPublishIntent', 'CONFLICT', {
      params: { ...params(), content_id: item.id },
      body: { connection_id: connectionId, idempotency_key: newKey() },
    });
    await owner.fail('createPublishIntent', 'IDEMPOTENCY_KEY_REUSED', {
      params: { ...params(), content_id: item.id },
      body: { connection_id: connectionId, idempotency_key: key, scheduled_at_utc: '2026-11-30T10:00:00.000Z' },
    });
    await owner.ok('cancelIntent', { params: { ...params(), intent_id: first.id } });
  });
});

describe('A02 — تأیید و انتشار نمونه', () => {
  it('بدون تأیید چیزی ارسال نمی‌شود؛ پس از تأیید worker یک بار منتشر می‌کند و نتیجه sample است', async () => {
    const item = takeItem();
    const intent = await requestPublish(item);
    const before = harness.fakeState.publishCalls;
    await tick();
    assert.equal(harness.fakeState.publishCalls, before, 'قصد منتظر تأیید نباید ارسال شود');

    const approved = await approve(intent);
    assert.equal(approved.state, 'authorized');
    assert.equal(approved.approvals[0]?.valid, true);
    assert.equal((await content(item.id)).state, 'scheduled');

    // دو worker هم‌زمان: فقط یکی کار را برمی‌دارد.
    const [a, b] = await Promise.all([
      harness.studio.execution.tick({ worker: 'w1' }),
      harness.studio.execution.tick({ worker: 'w2' }),
    ]);
    assert.equal(a.claimed + b.claimed, 1);
    assert.equal(harness.fakeState.publishCalls, before + 1);

    const done = await intentOf(intent.id);
    assert.equal(done.state, 'succeeded');
    assert.equal(done.result?.verification, 'provider');
    assert.match(done.result?.external_url ?? '', /^https:\/\/sample\.invalid\//);
    assert.equal((await content(item.id)).state, 'published');

    // اجرای دوباره هیچ کاری نمی‌کند.
    await tick();
    assert.equal(harness.fakeState.publishCalls, before + 1);
    const report = await owner.ok('weeklyReport', { params: params(), query: { week_of: WEEK_OF } });
    assert.ok(report.work.published >= 0);
  });

  it('کاربر غیرانسانی یا نقش ناکافی نمی‌تواند تأیید کند و hash نادرست STALE_REVISION است', async () => {
    const item = takeItem();
    const intent = await requestPublish(item);
    await owner.fail('decideApproval', 'STALE_REVISION', {
      params: { ...params(), intent_id: intent.id },
      body: { decision: 'approved', payload_hash: 'a'.repeat(64) },
    });
    const rejected = await owner.ok('decideApproval', {
      params: { ...params(), intent_id: intent.id },
      body: { decision: 'changes_requested', payload_hash: intent.payload_hash, note: 'لحن اصلاح شود' },
    });
    assert.equal(rejected.state, 'denied');
    assert.equal((await content(item.id)).state, 'needs_revision');
  });
});

describe('A04 — ویرایش پس از تأیید', () => {
  it('ویرایش متن، تأیید و قصد ارسال‌نشده را باطل می‌کند و چیزی منتشر نمی‌شود', async () => {
    const item = takeItem();
    const intent = await approve(await requestPublish(item));
    assert.equal(intent.state, 'authorized');
    const detail = await owner.ok('getContent', { params: { ...params(), content_id: item.id } });
    await owner.ok('createContentRevision', {
      params: { ...params(), content_id: item.id },
      body: {
        expected_revision: detail.item.current_revision,
        text: `${detail.revisions[0]?.text ?? ''}\nیک جملهٔ تازه برای آزمون ویرایش.`,
      },
    });
    const invalidated = await intentOf(intent.id);
    assert.equal(invalidated.state, 'denied');
    assert.equal(invalidated.policy_reason, 'REVISION_CHANGED');
    assert.equal(invalidated.approvals[0]?.valid, true, 'خود تأیید immutable است ولی قصد باطل شده');
    const before = harness.fakeState.publishCalls;
    await tick();
    assert.equal(harness.fakeState.publishCalls, before);
    const after = await content(item.id);
    assert.notEqual(after.state, 'published');
  });
});

describe('A05 — crash میان ارسال و ثبت نتیجه', () => {
  it('پس از بازیابی lease، reconcile نتیجه را از ارائه‌دهنده می‌خواند و انتشار دوم رخ نمی‌دهد', async () => {
    const item = takeItem();
    const intent = await approve(await requestPublish(item));
    const before = harness.fakeState.publishCalls;
    harness.faults.afterSend = () => {
      throw new Error('شبیه‌سازی crash پس از پاسخ ارائه‌دهنده');
    };
    try {
      const crashed = await tick();
      assert.deepEqual(crashed.outcomes.map((o) => o.outcome), ['crashed']);
    } finally {
      delete harness.faults.afterSend;
    }
    assert.equal(harness.fakeState.publishCalls, before + 1);
    assert.equal((await intentOf(intent.id)).state, 'executing');

    // پیش از انقضای lease هیچ worker دیگری کار را برنمی‌دارد.
    assert.equal((await tick()).claimed, 0);
    harness.clock.now = new Date(harness.clock.now.getTime() + 5 * 60_000);
    const recovered = await tick();
    assert.ok(recovered.outcomes.some((o) => o.outcome === 'reconciled_succeeded'), JSON.stringify(recovered));
    assert.equal(harness.fakeState.publishCalls, before + 1, 'بازیابی نباید دوباره منتشر کند');
    const done = await intentOf(intent.id);
    assert.equal(done.state, 'succeeded');
    assert.equal(done.result?.verification, 'reconciled');
    const db = new pg.Client({ connectionString: harness.database.ownerUrl });
    await db.connect();
    try {
      const count = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM publications WHERE content_id = $1', [item.id]);
      assert.equal(count.rows[0]?.n, 1);
    } finally {
      await db.end();
    }
  });

  it('پاسخ نامعلوم ارائه‌دهنده unknown می‌شود، retry دستی رد می‌شود و reconcile آن را حل می‌کند', async () => {
    const created = await owner.ok('createConnection', {
      params: params(),
      body: { provider: 'fake', config: { scenario: 'unknown_outcome', channel: 'instagram' } },
    });
    const item = takeItem();
    const intent = await approve(await requestPublish(item, newKey(), created.id));
    const first = await tick();
    assert.ok(first.outcomes.some((o) => o.outcome === 'unknown'), JSON.stringify(first));
    const unknown = await intentOf(intent.id);
    assert.equal(unknown.state, 'unknown');
    assert.equal((await content(item.id)).state, 'publishing_unknown');
    await owner.fail('retryIntent', 'INVALID_TRANSITION', {
      params: { ...params(), intent_id: intent.id },
      body: { idempotency_key: newKey() },
    });
    const calls = harness.fakeState.publishCalls;
    const second = await tick();
    assert.ok(second.outcomes.some((o) => o.outcome === 'reconciled_succeeded'), JSON.stringify(second));
    assert.equal(harness.fakeState.publishCalls, calls);
    assert.equal((await intentOf(intent.id)).state, 'succeeded');
  });
});

describe('A15 و A14 — توقف و موعد گذشته', () => {
  it('توقف برند شروع تازه را صفر می‌کند و پس از ادامه، کار انجام می‌شود', async () => {
    const item = takeItem();
    const intent = await approve(await requestPublish(item));
    await setMode('review_required', true);
    const before = harness.fakeState.publishCalls;
    const paused = await tick();
    assert.ok(paused.outcomes.some((o) => o.outcome === 'paused'));
    assert.equal(harness.fakeState.publishCalls, before);
    assert.equal((await intentOf(intent.id)).state, 'authorized');
    await owner.fail('createPublishIntent', 'POLICY_DENIED', {
      params: { ...params(), content_id: (items[0] as ContentItemSummary).id },
      body: { connection_id: connectionId, idempotency_key: newKey() },
    });
    await setMode('review_required', false);
    harness.clock.now = new Date(harness.clock.now.getTime() + 6 * 60_000);
    await tick();
    assert.equal(harness.fakeState.publishCalls, before + 1);
    assert.equal((await intentOf(intent.id)).state, 'succeeded');
  });

  it('کار عقب‌مانده پس از مهلت منتشر نمی‌شود و زمان تازه خواسته می‌شود', async () => {
    const item = takeItem();
    const intent = await approve(await requestPublish(item));
    harness.clock.now = new Date(harness.clock.now.getTime() + 3 * 60 * 60_000);
    const before = harness.fakeState.publishCalls;
    const result = await tick();
    assert.ok(result.outcomes.some((o) => o.outcome === 'expired'), JSON.stringify(result));
    assert.equal(harness.fakeState.publishCalls, before);
    const expired = await intentOf(intent.id);
    assert.equal(expired.state, 'failed');
    assert.equal(expired.last_error?.code, 'SCHEDULE_EXPIRED');
    assert.equal((await content(item.id)).state, 'approved');

    // تلاش دوباره با فرمان صریح، از اکنون؛ زمان تازه تغییر تقویم است و تأیید دوباره لازم دارد.
    const retried = await owner.ok('retryIntent', {
      params: { ...params(), intent_id: intent.id },
      body: { idempotency_key: newKey() },
    });
    assert.equal(retried.state, 'awaiting_approval');
    await tick();
    assert.equal(harness.fakeState.publishCalls, before);
    assert.equal((await approve(retried)).state, 'authorized');
    await tick();
    assert.equal(harness.fakeState.publishCalls, before + 1);
    assert.equal((await intentOf(intent.id)).state, 'succeeded');
  });
});

describe('A12، A13 و A09 — مسیر دستی، قطع دسترسی و سهمیه', () => {
  it('اتصالی که قابلیت قابل استفاده ندارد بستهٔ دستی می‌سازد، نه موفقیت ساختگی', async () => {
    const created = await owner.ok('createConnection', {
      params: params(),
      body: { provider: 'fake', config: { scenario: 'auth_expired', channel: 'instagram' } },
    });
    const item = takeItem();
    const intent = await requestPublish(item, newKey(), created.id);
    assert.equal(intent.state, 'manual_required');
    assert.ok(intent.manual_task_id);
    const before = harness.fakeState.publishCalls;
    await tick();
    assert.equal(harness.fakeState.publishCalls, before);

    const tasks = await owner.ok('listManualTasks', { params: params() });
    const task = tasks.items.find((entry) => entry.id === intent.manual_task_id);
    assert.ok(task);
    assert.ok(task.package.text.length > 0);
    assert.equal(task.package.is_sample, true);
    await owner.fail('completeManualTask', 'VALIDATION_FAILED', {
      params: { ...params(), task_id: task.id },
      body: { external_url: 'javascript:alert(1)' },
    });
    const completed = await owner.ok('completeManualTask', {
      params: { ...params(), task_id: task.id },
      body: { external_url: 'https://example.com/p/manual-1' },
    });
    assert.equal(completed.state, 'completed_by_owner');
    const done = await intentOf(intent.id);
    assert.equal(done.state, 'succeeded');
    assert.equal(done.result?.verification, 'owner_reported');
    assert.equal((await content(item.id)).state, 'published');
  });

  it('سهمیهٔ تمام‌شده شکست قطعی است و به درخواست شارژ مالک تبدیل می‌شود؛ مصرف پولی صفر', async () => {
    const created = await owner.ok('createConnection', {
      params: params(),
      body: { provider: 'fake', config: { scenario: 'quota_exhausted', channel: 'instagram' } },
    });
    const item = takeItem();
    const intent = await approve(await requestPublish(item, newKey(), created.id));
    await tick();
    const failed = await intentOf(intent.id);
    assert.equal(failed.state, 'failed');
    assert.equal(failed.last_error?.code, 'QUOTA_EXHAUSTED');
    assert.ok(failed.funding_request_id);
    const funding = await owner.ok('listFundingRequests', { params: params() });
    const request = funding.items.find((entry) => entry.id === failed.funding_request_id);
    assert.equal(request?.status, 'proposed');
    const declined = await owner.ok('decideFundingRequest', {
      params: { ...params(), request_id: request?.id as string },
      body: { expected_version: request?.version as number, decision: 'decline' },
    });
    assert.equal(declined.status, 'declined');
  });

  it('خطای موقت ارائه‌دهنده با backoff تکرار می‌شود و قصد شکست نمی‌خورد', async () => {
    const created = await owner.ok('createConnection', {
      params: params(),
      body: { provider: 'fake', config: { scenario: 'rate_limited', channel: 'instagram' } },
    });
    const item = takeItem();
    const intent = await approve(await requestPublish(item, newKey(), created.id));
    const result = await tick();
    assert.ok(result.outcomes.some((o) => o.outcome === 'retry_scheduled'), JSON.stringify(result));
    const waiting = await intentOf(intent.id);
    assert.equal(waiting.state, 'reserved');
    assert.equal(waiting.last_error?.code, 'RATE_LIMITED');
    // تا پیش از Retry-After دوباره تلاش نمی‌شود.
    assert.equal((await tick()).claimed, 0);
    await owner.ok('cancelIntent', { params: { ...params(), intent_id: intent.id } });
  });
});

describe('A10 — سقف بودجه', () => {
  it('رزروهای هم‌زمان مجموع را از سقف عبور نمی‌دهند', async () => {
    const intents = (await owner.ok('listIntents', { params: params() })).items.slice(0, 3);
    assert.equal(intents.length, 3);
    const db = harness.studio.deps.db;
    const scope = { workspaceId: owner.workspaceId, brandId: brand.id };
    await db.tenant(scope, (tx) =>
      executionRepo.upsertBudgetAccount(tx, { workspace_id: owner.workspaceId, brand_id: brand.id, currency: 'IRR', cap_minor: 100_000, period: 'total' }),
    );
    const results = await Promise.all(
      intents.map((intent) =>
        db.tenant(scope, (tx) =>
          executionRepo.reserveBudget(tx, {
            workspace_id: owner.workspaceId,
            brand_id: brand.id,
            intent_id: intent.id,
            amount: { amount_minor: 40_000, currency: 'IRR' },
            provider: 'fake',
            is_sample: true,
            period_start: '2026-11-01T00:00:00.000Z',
          }),
        ),
      ),
    );
    assert.equal(results.filter((r) => r === 'reserved').length, 2);
    assert.equal(results.filter((r) => r === 'over_cap').length, 1);
  });
});
