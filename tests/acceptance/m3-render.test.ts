/**
 * پذیرش M3.3 — رندر تصویر با قالب برند و QA بصری.
 * پوشش: run «ساخت تصویر» روی پیش‌نویس‌های واقعی گردش‌کار، دارایی PNG با ابعاد قالب، چک‌های visual_*،
 * سرریز متن → needs_revision، A04 (تصویر تازه تأیید قبلی را باطل می‌کند)، A03 (تکرار کلید)، و
 * نبود مرورگر → شکست صادقانه با UNSUPPORTED_CAPABILITY.
 * محیط: API درون‌فرایندی + PostgreSQL واقعی + Chrome/Edge نصب‌شدهٔ همین دستگاه (بدون شبکه).
 * اگر مرورگری نصب نباشد این آزمون شکست می‌خورد، نه skip (skip هرگز pass نیست).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { BrandSummary, ContentItemDetail, ContentItemSummary, RunView } from '@studio/contracts';
import { findBrowser, sniffMedia } from '@studio/media';
import { createHarness, newKey, type Harness, type TestClient } from '../support/harness.ts';

let harness: Harness;
let owner: TestClient;
let brand: BrandSummary;
let items: ContentItemSummary[] = [];
const WEEK_OF = '2026-11-11';
const VISUAL = new Set(['carousel', 'post', 'story', 'reel']);

const params = () => owner.brand(brand.id);
const detail = (id: string): Promise<ContentItemDetail> => owner.ok('getContent', { params: { ...params(), content_id: id } });

async function render(contentIds?: string[], key = newKey()): Promise<RunView> {
  return owner.ok('createRun', {
    params: params(),
    body: { intent: 'render_visuals', idempotency_key: key, params: { week_of: WEEK_OF, ...(contentIds ? { content_ids: contentIds } : {}) } },
  });
}

before(async () => {
  assert.ok(findBrowser(), 'Chrome یا Edge روی این دستگاه نصب نیست؛ پذیرش رندر بدون مرورگر ممکن نیست.');
  harness = await createHarness();
  owner = await harness.owner();
  const seeded = await owner.ok('seedSampleBrands', { params: { workspace_id: owner.workspaceId } });
  brand = seeded.items.find((item) => item.industry_pack.id === 'web-services') as BrandSummary;
  for (const intent of ['build_weekly_plan', 'generate_drafts'] as const) {
    const run = await owner.ok('createRun', {
      params: params(),
      body: { intent, idempotency_key: newKey(), params: { week_of: WEEK_OF } },
    });
    assert.equal(run.status, 'succeeded', JSON.stringify(run.error));
  }
  items = (await owner.ok('listContent', { params: params() })).items;
});
after(async () => {
  await harness?.close();
});

describe('run ساخت تصویر', () => {
  let run: RunView;
  let rendered: ContentItemSummary[];

  it('برای همهٔ محتوای تصویری هفته تصویر می‌سازد و بقیه را دست نمی‌زند', async () => {
    const key = newKey();
    run = await render(undefined, key);
    assert.equal(run.status, 'succeeded', JSON.stringify({ error: run.error, result: run.result }));
    const visual = items.filter((item) => VISUAL.has(item.format));
    assert.ok(visual.length >= 2, `محتوای تصویری کافی نیست: ${visual.length}`);
    assert.equal(run.result?.content_ids.length, visual.length, JSON.stringify(run.result?.skipped));
    rendered = visual;

    const replay = await render(undefined, key);
    assert.equal(replay.id, run.id, 'A03 — همان کلید همان run');
    const audit = await owner.ok('listAuditEvents', { params: params(), query: { limit: 200 } });
    assert.equal(audit.items.filter((event) => event.action === 'content.visual.render').length, visual.length);

    for (const item of items.filter((entry) => !VISUAL.has(entry.format))) {
      const after = await detail(item.id);
      assert.equal(after.revisions[0]?.asset_ids.length, 0, `${item.format} نباید تصویر بگیرد`);
    }
  });

  it('هر اسلاید یک PNG واقعی با ابعاد قالب است و نسخهٔ تازه همان متن را دارد', async () => {
    // ریلز ویدئو و زیرنویس هم دارد و در m3-video.test.ts سنجیده می‌شود.
    for (const item of rendered.filter((entry) => entry.format !== 'reel')) {
      const content = await detail(item.id);
      const [current, previous] = content.revisions;
      assert.ok(current && previous);
      assert.equal(current.text, previous.text, 'متن دست نمی‌خورد');
      assert.equal(current.generator.provider, 'local-renderer');
      assert.ok(current.asset_ids.length >= 1);
      const expected = item.format === 'story' || item.format === 'reel' ? [1080, 1920] : [1080, 1350];
      for (const assetId of current.asset_ids) {
        const asset = await owner.ok('getAsset', { params: { ...params(), asset_id: assetId } });
        assert.equal(asset.provenance, 'rendered');
        assert.deepEqual([asset.width, asset.height], expected);
        const file = await owner.assetFile(brand.id, assetId);
        assert.equal(file.status, 200);
        const sniffed = sniffMedia(file.rawBody);
        assert.deepEqual([sniffed?.mime, sniffed?.width, sniffed?.height], ['image/png', ...expected]);
      }
      const ids = current.qa_result.checks.map((check) => check.id);
      for (const id of ['visual_slides', 'visual_overflow', 'visual_safe_area', 'visual_contrast']) {
        assert.ok(ids.includes(id), `${item.format}: چک ${id} نیست`);
      }
      assert.ok(ids.some((id) => !id.startsWith('visual_')), 'چک‌های متنی قبلی حفظ می‌شوند');
      if (item.format === 'carousel') {
        const slides = content.revisions[0]?.text.match(/^اسلاید /gm)?.length ?? 0;
        assert.equal(current.asset_ids.length, slides, 'هر اسلاید متن یک تصویر');
      }
    }
  });

  it('اجرای خودکار دوباره، محتوای دارای تصویر را با دلیل کنار می‌گذارد', async () => {
    const again = await render();
    assert.equal(again.result?.content_ids.length, 0);
    assert.ok(again.result?.skipped.some((item) => item.reason_fa.includes('قبلاً تصویر دارد')));
  });

  it('رندر دوباره با انتخاب صریح همان تصویرها را می‌سازد (قطعی) و نسخهٔ تازه نمی‌سازد', async () => {
    const item = rendered[0] as ContentItemSummary;
    const before = await detail(item.id);
    const again = await render([item.id]);
    assert.equal(again.status, 'succeeded', JSON.stringify(again.result));
    const after = await detail(item.id);
    assert.equal(after.item.current_revision, before.item.current_revision);
    assert.ok(again.result?.skipped.some((entry) => entry.reason_fa.includes('تغییری نکردند')));
  });

  it('محتوای غیرتصویری انتخابی با دلیل رد می‌شود', async () => {
    const other = items.find((item) => !VISUAL.has(item.format));
    if (!other) return;
    const result = await render([other.id]);
    assert.ok(result.result?.skipped.some((entry) => entry.ref === other.id && entry.reason_fa.includes('تصویر ندارد')));
  });
});

describe('QA بصری و تأیید', () => {
  it('متنی که در کادر جا نمی‌شود needs_revision و چک سرریز ناموفق می‌گیرد', async () => {
    const carousel = items.find((item) => item.format === 'carousel') as ContentItemSummary;
    const current = await detail(carousel.id);
    const long = Array.from({ length: 40 }, () => 'این جمله برای آزمون سرریز متن در اسلاید تکرار می‌شود.').join(' ');
    const text = `اسلاید ۱ (کاور): تیتر\n\nاسلاید ۲ — تیتر بلند:\n${long}\n\nاسلاید پایانی: پیام بدهید.`;
    const edited = await owner.ok('createContentRevision', {
      params: { ...params(), content_id: carousel.id },
      body: { expected_revision: current.item.current_revision, text, asset_ids: [] },
    });
    const run = await render([carousel.id]);
    assert.equal(run.result?.content_ids.length, 1, JSON.stringify(run.result));
    const after = await detail(carousel.id);
    assert.equal(after.item.current_revision, edited.item.current_revision + 1);
    assert.equal(after.item.state, 'needs_revision');
    const overflow = after.revisions[0]?.qa_result.checks.find((check) => check.id === 'visual_overflow');
    assert.equal(overflow?.passed, false);
    assert.ok(overflow?.excerpt?.includes('اسلاید ۲'), overflow?.excerpt ?? 'بدون excerpt');
  });

  it('A04 — ساخت تصویر تازه پس از تأیید، قصد انتشار را باطل می‌کند', async () => {
    const policy = await owner.ok('getPolicy', { params: params() });
    await owner.ok('updatePolicy', { params: params(), body: { expected_revision: policy.revision, mode: 'review_required' } });
    const connectionId = (await owner.ok('listConnections', { params: params() })).items[0]?.id as string;
    // محتوای تصویری آماده (نمونه‌ها گاهی جای خالی «اطلاعات مالک» دارند و needs_revision می‌مانند).
    // ریلز کنار می‌رود چون کاورش از «متن روی تصویر» است، نه خط اول.
    let post: ContentItemSummary | undefined;
    for (const item of items.filter((entry) => ['carousel', 'story', 'post'].includes(entry.format))) {
      if ((await detail(item.id)).item.state === 'ready_for_review') {
        post = item;
        break;
      }
    }
    assert.ok(post, 'محتوای تصویری آمادهٔ بازبینی در برنامهٔ نمونه نیست');
    const start = await detail(post.id);
    const intent = await owner.ok('createPublishIntent', {
      params: { ...params(), content_id: post.id },
      body: { connection_id: connectionId, idempotency_key: newKey(), scheduled_at_utc: harness.clock.now.toISOString() },
    });
    await owner.ok('decideApproval', {
      params: { ...params(), intent_id: intent.id },
      body: { decision: 'approved', payload_hash: intent.payload_hash },
    });
    // متن عوض می‌شود تا تصویر واقعاً تغییر کند، سپس تصویر دوباره ساخته می‌شود.
    const [current] = start.revisions;
    // خط اول (کاور/تیتر) تغییر می‌کند تا تصویر کاور واقعاً عوض شود.
    const text = (current?.text ?? '').replace(/^(.+)$/m, '$1 تازه');
    const edited = await owner.ok('createContentRevision', {
      params: { ...params(), content_id: post.id },
      body: { expected_revision: start.item.current_revision, text },
    });
    const denied = await owner.ok('getIntent', { params: { ...params(), intent_id: intent.id } });
    assert.equal(denied.state, 'denied', 'ویرایش متن خودش باطل می‌کند');
    const run = await render([post.id]);
    assert.equal(run.result?.content_ids.length, 1, JSON.stringify(run.result));
    const after = await detail(post.id);
    assert.equal(after.item.current_revision, edited.item.current_revision + 1);
    assert.notDeepEqual(after.revisions[0]?.asset_ids, start.revisions[0]?.asset_ids);
    const calls = harness.fakeState.publishCalls;
    await harness.studio.execution.tick({ worker: 'test-worker' });
    assert.equal(harness.fakeState.publishCalls, calls);
  });
});

describe('نبود مرورگر', () => {
  it('run با دلیل روشن شکست می‌خورد و هیچ نسخه یا دارایی ساختگی نمی‌سازد', async () => {
    const other = await createHarness({ browserPath: 'C:/no/such/browser.exe' });
    try {
      const client = await other.owner();
      const seeded = await client.ok('seedSampleBrands', { params: { workspace_id: client.workspaceId } });
      const target = seeded.items.find((item) => item.industry_pack.id === 'web-services') as BrandSummary;
      for (const intent of ['build_weekly_plan', 'generate_drafts'] as const) {
        await client.ok('createRun', { params: client.brand(target.id), body: { intent, idempotency_key: newKey(), params: { week_of: WEEK_OF } } });
      }
      const run = await client.ok('createRun', {
        params: client.brand(target.id),
        body: { intent: 'render_visuals', idempotency_key: newKey(), params: { week_of: WEEK_OF } },
      });
      assert.equal(run.status, 'failed', JSON.stringify(run));
      assert.ok(run.result?.skipped.every((item) => item.reason_fa.includes('مرورگر')), JSON.stringify(run.result));
      const assets = await client.ok('listAssets', { params: client.brand(target.id) });
      assert.equal(assets.items.length, 0);
    } finally {
      await other.close();
    }
  });
});
