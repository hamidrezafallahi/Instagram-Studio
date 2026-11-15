/**
 * پذیرش M1 — دروازهٔ مرحله: «onboarding تا draft و گزارش sample بدون کلید اجرا شود».
 * پوشش: A02 (تا پیش از انتشار؛ fake publish در M2 از مسیر ActionIntent اضافه می‌شود)، A03 (دوبار کلیک)،
 * نسخهٔ immutable محتوا، ویرایش تقویم و گزارش نمونه با N/A.
 * محیط: API درون‌فرایندی + PostgreSQL واقعی + کانکتور نمونه؛ هیچ کلید یا حساب واقعی استفاده نمی‌شود.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  WeeklyReport,
  reportExportRoute,
  type BrandSummary,
  type ContentItemSummary,
  type Plan,
} from '@studio/contracts';
import pg from 'pg';
import { createHarness, newKey, type Harness, type TestClient } from '../support/harness.ts';

let harness: Harness;
let owner: TestClient;
let brand: BrandSummary;
let plan: Plan;
const WEEK_OF = '2026-11-11';

const params = (): { workspace_id: string; brand_id: string } => owner.brand(brand.id);

before(async () => {
  harness = await createHarness();
  owner = await harness.owner();
});
after(async () => {
  await harness.close();
});

describe('A02 — دمو بدون هیچ کلید: برندهای نمونه', () => {
  it('چهار برند نمونه با برچسب sample و بدون هیچ راز ساخته می‌شود و تکرار آن برند تازه نمی‌سازد', async () => {
    const first = await owner.ok('seedSampleBrands', { params: { workspace_id: owner.workspaceId } });
    assert.equal(first.items.length, 4);
    assert.ok(first.items.every((item) => item.is_sample && item.readiness.draft_ready));
    assert.deepEqual(
      first.items.map((item) => item.industry_pack.id).sort(),
      ['crystal-decor', 'dental-loupes', 'language-school', 'web-services'],
    );
    const again = await owner.ok('seedSampleBrands', { params: { workspace_id: owner.workspaceId } });
    assert.equal(again.items.length, 4);
    assert.equal((await owner.ok('listBrands', { params: { workspace_id: owner.workspaceId } })).items.length, 4);

    brand = first.items.find((item) => item.industry_pack.id === 'web-services') as BrandSummary;
    for (const item of first.items) {
      const connections = await owner.ok('listConnections', { params: owner.brand(item.id) });
      assert.equal(connections.items.length, 1);
      assert.equal(connections.items[0]?.is_sample, true);
      assert.equal(connections.items[0]?.has_secret, false, 'دمو نباید هیچ رازی لازم داشته باشد');
      assert.equal(connections.items[0]?.status, 'active');
    }
  });
});

describe('ساخت برنامهٔ هفته', () => {
  it('یک فرمان اجرا برنامهٔ نسخه‌دار هفته را به وقت برند می‌سازد', async () => {
    const run = await owner.ok('createRun', {
      params: params(),
      body: { intent: 'build_weekly_plan', idempotency_key: newKey(), params: { week_of: WEEK_OF } },
    });
    assert.equal(run.status, 'succeeded', JSON.stringify(run.error));
    assert.equal(run.replayed, false);
    assert.equal(run.is_sample, true);
    assert.equal(run.workflow.id, 'weekly_plan');
    assert.deepEqual(run.cost_cap, { amount_minor: 0, currency: 'IRR' });
    assert.ok(run.scope_fa.includes('چیزی منتشر'));
    assert.deepEqual(run.steps.map((step) => step.status), ['succeeded', 'succeeded', 'succeeded']);

    const plans = await owner.ok('listPlans', { params: params(), query: { week_of: WEEK_OF } });
    assert.equal(plans.items.length, 1);
    plan = plans.items[0] as Plan;
    assert.equal(plan.id, run.result?.plan_id);
    assert.equal(plan.week_start, '2026-11-07', 'هفته از شنبه شروع می‌شود');
    assert.equal(plan.week_end, '2026-11-13');
    assert.equal(plan.timezone, 'Asia/Tehran');
    assert.equal(plan.is_sample, true);
    assert.equal(plan.generator.kind, 'template');
    assert.ok(plan.entries.length >= 5);
    // ستون‌های نیازمند مدرک بدون منبع کنار گذاشته شده‌اند و دلیلش گفته شده است.
    assert.equal(plan.entries.some((entry) => ['case_study', 'before_after'].includes(entry.pillar)), false);
    for (const entry of plan.entries) {
      const [hours, minutes] = entry.local_time.split(':').map(Number) as [number, number];
      const expected = new Date(`${entry.local_date}T00:00:00.000Z`).getTime() + (hours * 60 + minutes - 210) * 60_000;
      assert.equal(new Date(entry.scheduled_at_utc).getTime(), expected, 'تهران = UTC+3:30');
      assert.ok(entry.local_date >= plan.week_start && entry.local_date <= plan.week_end);
      assert.equal(entry.status, 'planned');
    }
  });

  it('A03 — دوبار کلیک هم‌زمان فقط یک run و یک برنامه می‌سازد', async () => {
    const sibling = (await owner.ok('listBrands', { params: { workspace_id: owner.workspaceId } })).items.find(
      (item) => item.industry_pack.id === 'crystal-decor',
    ) as BrandSummary;
    const key = newKey();
    const body = { intent: 'build_weekly_plan' as const, idempotency_key: key, params: { week_of: WEEK_OF } };
    const target = owner.brand(sibling.id);
    const results = await Promise.all([
      owner.ok('createRun', { params: target, body }),
      owner.ok('createRun', { params: target, body }),
      owner.ok('createRun', { params: target, body }),
    ]);
    assert.equal(new Set(results.map((run) => run.id)).size, 1, 'همان run برگردانده شود');
    assert.equal(results.filter((run) => !run.replayed).length, 1, 'فقط یک درخواست run ساخته است');

    const db = new pg.Client({ connectionString: harness.database.ownerUrl });
    await db.connect();
    try {
      const runs = await db.query('SELECT 1 FROM workflow_runs WHERE idempotency_key = $1', [key]);
      assert.equal(runs.rowCount, 1);
      const plans = await db.query('SELECT 1 FROM plans WHERE brand_id = $1', [sibling.id]);
      assert.equal(plans.rowCount, 1, 'برنامهٔ دوم ساخته نشود');
    } finally {
      await db.end();
    }
    const later = await owner.ok('createRun', { params: target, body });
    assert.equal(later.replayed, true);
    assert.equal(later.id, results[0]?.id);
    assert.equal(later.status, 'succeeded');
    // همان کلید با ورودی متفاوت فرمان دیگری است و رد می‌شود.
    await owner.fail('createRun', 'IDEMPOTENCY_KEY_REUSED', {
      params: target,
      body: { ...body, params: { week_of: '2026-11-18' } },
    });
  });
});

describe('تولید پیش‌نویس و بازبینی خودکار', () => {
  let items: ContentItemSummary[];

  it('پیش‌نویس‌ها با نسخهٔ immutable، هش، منبع و نتیجهٔ QA ساخته می‌شوند', async () => {
    const run = await owner.ok('createRun', {
      params: params(),
      body: { intent: 'generate_drafts', idempotency_key: newKey(), params: { week_of: WEEK_OF } },
    });
    assert.equal(run.status, 'succeeded', JSON.stringify(run.error));
    assert.equal(run.result?.content_ids.length, plan.entries.length);
    assert.ok(run.scope_fa.includes('هزینه: صفر'));

    items = (await owner.ok('listContent', { params: params() })).items;
    assert.equal(items.length, plan.entries.length);
    const ready = items.filter((item) => item.state === 'ready_for_review');
    const revise = items.filter((item) => item.state === 'needs_revision');
    assert.ok(ready.length > 0, 'با اطلاعات کامل باید پیش‌نویس آمادهٔ بازبینی ساخته شود');
    assert.ok(revise.length > 0, 'بدون دانش تخصصی، پیش‌نویس باید صادقانه «نیاز به اصلاح» بماند');
    assert.equal(ready.length + revise.length, items.length);
    assert.ok(items.every((item) => item.is_sample && item.current_revision === 1));

    const detail = await owner.ok('getContent', { params: { ...params(), content_id: (ready[0] as ContentItemSummary).id } });
    const revision = detail.revisions[0];
    assert.match(revision?.hash ?? '', /^[0-9a-f]{64}$/);
    assert.equal(revision?.generator.kind, 'template');
    assert.equal(revision?.generator.role, 'copywriter');
    assert.ok((revision?.source_refs.length ?? 0) >= 2);
    assert.notEqual(revision?.qa_result.status, 'fail');
    assert.equal(revision?.text.includes('〔'), false);
    assert.ok(revision?.qa_result.checks.some((check) => check.id === 'sample_brand'));
    assert.equal(detail.brief.channel, detail.item.channel);
    assert.ok(detail.brief.source_ids.includes('brand_profile'));

    const blocked = await owner.ok('getContent', { params: { ...params(), content_id: (revise[0] as ContentItemSummary).id } });
    assert.equal(blocked.revisions[0]?.qa_result.status, 'fail');
    assert.ok(blocked.revisions[0]?.text.includes('〔'), 'جای خالی اطلاعات مالک باید علامت بخورد');

    const refreshed = (await owner.ok('listPlans', { params: params(), query: { week_of: WEEK_OF } })).items[0] as Plan;
    assert.ok(refreshed.entries.every((entry) => entry.status === 'drafted' && entry.content_id !== null));
  });

  it('اجرای دوباره پیش‌نویس تکراری نمی‌سازد', async () => {
    const run = await owner.ok('createRun', {
      params: params(),
      body: { intent: 'generate_drafts', idempotency_key: newKey(), params: { week_of: WEEK_OF } },
    });
    assert.equal(run.status, 'succeeded');
    assert.deepEqual(run.result?.content_ids, []);
    const explicit = await owner.ok('createRun', {
      params: params(),
      body: {
        intent: 'generate_drafts',
        idempotency_key: newKey(),
        params: { week_of: WEEK_OF, schedule_entry_ids: [plan.entries[0]?.id as string] },
      },
    });
    assert.deepEqual(explicit.result?.content_ids, []);
    assert.ok(explicit.result?.skipped[0]?.reason_fa.includes('قبلاً'));
    assert.equal((await owner.ok('listContent', { params: params() })).items.length, items.length);
  });

  it('بازسازی برنامه‌ای که پیش‌نویس دارد صریح رد می‌شود و برنامه دست‌نخورده می‌ماند', async () => {
    const run = await owner.ok('createRun', {
      params: params(),
      body: { intent: 'build_weekly_plan', idempotency_key: newKey(), params: { week_of: WEEK_OF } },
    });
    assert.equal(run.status, 'failed');
    assert.equal(run.error?.code, 'CONFLICT');
    assert.deepEqual(run.steps.map((step) => step.status), ['succeeded', 'succeeded', 'failed']);
    const plans = await owner.ok('listPlans', { params: params(), query: { week_of: WEEK_OF } });
    assert.equal(plans.items[0]?.id, plan.id);
  });

  it('ویرایش = نسخهٔ تازه با هش تازه، QA دوباره و بازگشت به بازبینی؛ نسخهٔ قبلی دست‌نخورده', async () => {
    const target = items.find((item) => item.state === 'needs_revision') as ContentItemSummary;
    const path = { ...params(), content_id: target.id };
    const before = await owner.ok('getContent', { params: path });
    const firstHash = before.revisions[0]?.hash;

    const fixed = await owner.ok('createContentRevision', {
      params: path,
      body: { expected_revision: 1, text: 'پیش از سفارش سایت، هدف و مخاطب خود را روشن کنید.', note: 'تکمیل توسط مالک' },
    });
    assert.equal(fixed.item.state, 'ready_for_review');
    assert.equal(fixed.item.current_revision, 2);
    assert.equal(fixed.revisions.length, 2);
    assert.equal(fixed.revisions[0]?.generator.kind, 'human');
    assert.notEqual(fixed.revisions[0]?.hash, firstHash, 'هش نسخهٔ تازه باید عوض شود (پایهٔ ابطال تأیید در M2)');
    assert.equal(fixed.revisions[1]?.hash, firstHash);
    assert.equal(fixed.revisions[1]?.text, before.revisions[0]?.text, 'نسخهٔ قبلی immutable است');

    // نویسندهٔ دوم با نسخهٔ قدیمی نمی‌تواند روی ویرایش اول بنویسد.
    await owner.fail('createContentRevision', 'STALE_REVISION', {
      params: path,
      body: { expected_revision: 1, text: 'متن دیگر' },
    });
    await owner.fail('createContentRevision', 'CONFLICT', {
      params: path,
      body: { expected_revision: 2, text: 'پیش از سفارش سایت، هدف و مخاطب خود را روشن کنید.' },
    });
    const forbidden = await owner.ok('createContentRevision', {
      params: path,
      body: { expected_revision: 2, text: 'ما تضمین می‌کنیم فروش شما بیشتر شود.' },
    });
    assert.equal(forbidden.item.state, 'needs_revision');
    assert.equal(forbidden.item.qa_status, 'fail');
    assert.ok(forbidden.revisions[0]?.claims.some((claim) => claim.status === 'forbidden'));
    assert.equal(forbidden.revisions.length, 3);
  });
});

describe('تقویم', () => {
  it('ویرایش زمان به وقت برند ذخیره و به UTC تبدیل می‌شود و محتوا آن را دنبال می‌کند', async () => {
    const current = (await owner.ok('listPlans', { params: params(), query: { week_of: WEEK_OF } })).items[0] as Plan;
    const entry = current.entries[0] as Plan['entries'][number];
    const path = { ...params(), entry_id: entry.id };
    const updated = await owner.ok('updateScheduleEntry', {
      params: path,
      body: { expected_version: entry.version, local_date: '2026-11-12', local_time: '21:15', topic_fa: 'موضوع ویرایش‌شده' },
    });
    assert.equal(updated.scheduled_at_utc, '2026-11-12T17:45:00.000Z');
    assert.equal(updated.weekday, 'thursday');
    assert.equal(updated.topic_fa, 'موضوع ویرایش‌شده');
    assert.equal(updated.version, entry.version + 1);
    const content = await owner.ok('getContent', { params: { ...params(), content_id: entry.content_id as string } });
    assert.equal(content.item.scheduled_at_utc, '2026-11-12T17:45:00.000Z');

    await owner.fail('updateScheduleEntry', 'STALE_REVISION', {
      params: path,
      body: { expected_version: entry.version, local_time: '10:00' },
    });
    const outside = await owner.fail('updateScheduleEntry', 'VALIDATION_FAILED', {
      params: path,
      body: { expected_version: updated.version, local_date: '2026-11-20' },
    });
    assert.ok(outside.details?.[0]?.message.includes('آبان'), 'بازهٔ مجاز باید به تاریخ خوانا گفته شود');
    await owner.fail('updateScheduleEntry', 'CONFLICT', {
      params: path,
      body: { expected_version: updated.version, status: 'cancelled' },
    });
  });
});

describe('گزارش هفتگی نمونه', () => {
  it('پیش از جمع‌آوری، گزارش کمبود داده را می‌گوید و عددی نمی‌سازد', async () => {
    const report = await owner.ok('weeklyReport', { params: params(), query: { week_of: WEEK_OF } });
    assert.deepEqual(report.metrics, []);
    assert.ok(report.data_gaps_fa.some((gap) => gap.includes('جمع‌آوری')));
    assert.equal(report.is_sample, true);
  });

  it('سنجهٔ نمونه با برچسب sample، مقدار ناموجود با N/A و هزینهٔ صفر گزارش می‌شود', async () => {
    const run = await owner.ok('createRun', {
      params: params(),
      body: { intent: 'collect_metrics', idempotency_key: newKey(), params: { week_of: WEEK_OF } },
    });
    assert.equal(run.status, 'succeeded', JSON.stringify(run.error));
    assert.ok(run.result?.summary_fa.includes('نمونه'));

    const report = await owner.ok('weeklyReport', { params: params(), query: { week_of: WEEK_OF } });
    assert.equal(WeeklyReport.safeParse(report).success, true);
    assert.equal(report.is_sample, true);
    assert.equal(report.week_start, '2026-11-07');
    assert.ok(report.metrics.length >= 7);
    const retention = report.metrics.find((row) => row.metric === 'retention_rate');
    assert.equal(retention?.value, null, 'مقدار ناموجود null است نه صفر');
    assert.equal(retention?.quality, 'unavailable');
    assert.ok(report.metrics.filter((row) => row.value !== null).every((row) => row.quality === 'sample'));
    assert.ok(report.metrics.every((row) => row.channel === 'instagram'));
    assert.ok(report.business.every((row) => row.value === null));
    assert.equal(report.cost.spend_mode, 'free_only');
    assert.deepEqual(report.cost.totals, []);
    assert.equal(report.work.planned_entries, plan.entries.length);
    assert.equal(report.work.drafts_created, plan.entries.length);
    assert.equal(report.work.published, 0);
    assert.ok(report.fresh_at);

    // اجرای دوباره سنجهٔ تکراری نمی‌سازد.
    await owner.ok('createRun', {
      params: params(),
      body: { intent: 'collect_metrics', idempotency_key: newKey(), params: { week_of: WEEK_OF } },
    });
    const again = await owner.ok('weeklyReport', { params: params(), query: { week_of: WEEK_OF } });
    assert.deepEqual(
      again.metrics.map((row) => [row.metric, row.value]),
      report.metrics.map((row) => [row.metric, row.value]),
    );
  });

  it('گزارش به CSV و JSON قابل دانلود است', async () => {
    const csv = await owner.exportReport(brand.id, { week_of: WEEK_OF, format: 'csv' });
    assert.equal(csv.status, 200);
    assert.match(String(csv.headers['content-type']), /text\/csv/);
    assert.match(String(csv.headers['content-disposition']), /weekly-report-2026-11-07-sample\.csv/);
    assert.ok(csv.raw.startsWith('﻿'));
    assert.ok(csv.raw.includes('metric,retention_rate'));
    assert.ok(csv.raw.includes(',N/A,percent,unavailable'));
    const json = await owner.exportReport(brand.id, { week_of: WEEK_OF, format: 'json' });
    assert.equal(WeeklyReport.safeParse(JSON.parse(json.raw)).success, true);
    const bad = await owner.exportReport(brand.id, { format: 'xml' as 'csv' });
    assert.equal(bad.status, 400);
    const anonymous = await harness
      .client()
      .request(reportExportRoute.method, reportExportRoute.path, { params: params() });
    assert.equal(anonymous.status, 401);
  });
});

describe('اجراها و رد حسابرسی', () => {
  it('فهرست اجراها وضعیت هر گام را دارد و اجرای ناشناخته پیدا نمی‌شود', async () => {
    const runs = await owner.ok('listRuns', { params: params() });
    assert.ok(runs.items.length >= 6);
    assert.ok(runs.items.every((run) => run.steps.length === 3 && run.finished_at !== null));
    const one = await owner.ok('getRun', { params: { ...params(), run_id: runs.items[0]?.id as string } });
    assert.equal(one.id, runs.items[0]?.id);
    await owner.fail('getRun', 'NOT_FOUND', {
      params: { ...params(), run_id: '00000000-0000-7000-8000-00000000dead' },
    });
  });

  it('هر فرمان رد حسابرسی دارد و متن محتوا در آن ذخیره نمی‌شود', async () => {
    const audit = await owner.ok('listAuditEvents', { params: params(), query: { limit: 200 } });
    const actions = new Set(audit.items.map((event) => event.action));
    for (const action of ['brand.create', 'connection.create', 'run.create', 'run.finish', 'content.revision.create', 'schedule_entry.update']) {
      assert.ok(actions.has(action), `رد ${action} ثبت نشده است`);
    }
    const raw = JSON.stringify(audit.items);
    assert.equal(raw.includes('تضمین می‌کنیم'), false, 'متن محتوا نباید در audit باشد');
    assert.ok(audit.items.every((event) => event.brand_id === brand.id && event.trace_id.length > 0));
    assert.ok(audit.items.some((event) => event.outcome === 'failed' && event.action === 'run.finish'));
  });
});
