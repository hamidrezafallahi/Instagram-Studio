/**
 * پذیرش M3.2 — دارایی‌ها و نسخه‌بندی.
 * پوشش: A04 (تغییر تصویر پس از تأیید → تأیید باطل)، A07 (نشت‌نکردن دارایی بین برندها)،
 * A17 (upload بد پیش از ذخیره رد شود)، و نسخه‌بندی immutable دارایی.
 * محیط: API درون‌فرایندی + PostgreSQL واقعی + کانکتور نمونه؛ فایل‌ها در پوشهٔ موقت همین آزمون.
 */
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';
import type { AssetView, BrandSummary, ContentItemSummary, IntentView } from '@studio/contracts';
import { AssetStore } from '@studio/media';
import { tinyJpeg, tinyPng } from '@studio/media/fixtures';
import pg from 'pg';
import { createHarness, newKey, type Harness, type TestClient } from '../support/harness.ts';

let harness: Harness;
let owner: TestClient;
let brandA: BrandSummary;
let brandB: BrandSummary;
let items: ContentItemSummary[] = [];
let connectionId: string;

const IMAGE = { kind: 'image', filename: 'cover.png', license: 'اثر خود مالک', title_fa: 'کاور' };

async function upload(brand: BrandSummary, data: Buffer, query: Record<string, string | undefined> = IMAGE): Promise<AssetView> {
  const response = await owner.uploadAsset(brand.id, query, data);
  assert.equal(response.status, 201, response.raw.slice(0, 400));
  return response.json as AssetView;
}

async function uploadError(brand: BrandSummary, data: Buffer, query: Record<string, string | undefined> = IMAGE, headers?: Record<string, string>) {
  const response = await owner.uploadAsset(brand.id, query, data, headers);
  assert.ok(response.status >= 400, `انتظار رد بود: ${response.status} ${response.raw.slice(0, 200)}`);
  return { status: response.status, code: response.json?.error?.code as string };
}

function takeItem(): ContentItemSummary {
  const item = items.shift();
  assert.ok(item, 'محتوای کافی ساخته نشده است');
  return item;
}

before(async () => {
  harness = await createHarness();
  owner = await harness.owner();
  const seeded = await owner.ok('seedSampleBrands', { params: { workspace_id: owner.workspaceId } });
  brandA = seeded.items.find((item) => item.industry_pack.id === 'web-services') as BrandSummary;
  brandB = seeded.items.find((item) => item.id !== brandA.id) as BrandSummary;
  for (const intent of ['build_weekly_plan', 'generate_drafts'] as const) {
    const run = await owner.ok('createRun', {
      params: owner.brand(brandA.id),
      body: { intent, idempotency_key: newKey(), params: { week_of: '2026-11-11' } },
    });
    assert.equal(run.status, 'succeeded', JSON.stringify(run.error));
  }
  items = (await owner.ok('listContent', { params: owner.brand(brandA.id) })).items.filter(
    (item) => item.channel === 'instagram' && item.state === 'ready_for_review',
  );
  connectionId = (await owner.ok('listConnections', { params: owner.brand(brandA.id) })).items[0]?.id as string;
  assert.ok(items.length >= 2, `محتوای کافی نیست: ${items.length}`);
});
after(async () => {
  await harness.close();
});

describe('upload و دانلود', () => {
  it('نوع و ابعاد از محتوا خوانده می‌شود، فایل با checksum ذخیره و همان بایت‌ها تحویل می‌شود', async () => {
    const data = tinyPng(1080, 1350);
    const asset = await upload(brandA, data);
    assert.equal(asset.mime, 'image/png');
    assert.equal(asset.width, 1080);
    assert.equal(asset.height, 1350);
    assert.equal(asset.checksum, AssetStore.checksum(data));
    assert.equal(asset.version, 1);
    assert.equal(asset.provenance, 'owner_upload');
    assert.equal(asset.is_sample, true, 'برند نمونه → دارایی نمونه');

    const file = await owner.assetFile(brandA.id, asset.id);
    assert.equal(file.status, 200);
    assert.equal(file.headers['content-type'], 'image/png');
    assert.ok(String(file.headers['content-security-policy']).includes('sandbox'));
    assert.deepEqual(file.rawBody, data);

    const listed = await owner.ok('listAssets', { params: owner.brand(brandA.id) });
    assert.ok(listed.items.some((item) => item.id === asset.id));
    const events = await owner.ok('listAuditEvents', { params: owner.brand(brandA.id) });
    assert.ok(events.items.some((event) => event.action === 'asset.upload' && event.target_id === asset.id));
  });

  it('upload تکراری همان دارایی را برمی‌گرداند و ردیف تازه نمی‌سازد', async () => {
    const data = tinyPng(20, 20, 7);
    const first = await upload(brandA, data);
    const second = await upload(brandA, data, { ...IMAGE, filename: 'other-name.png' });
    assert.equal(second.id, first.id);
  });

  it('نام فایل مسیر و نویسهٔ خطرناک ندارد و پسوند از نوع واقعی می‌آید', async () => {
    const asset = await upload(brandA, tinyJpeg(640, 480), { ...IMAGE, filename: '..\\..\\evil<script>.png' });
    assert.equal(asset.filename, 'evilscript.jpg');
    assert.equal(asset.mime, 'image/jpeg');
  });

  it('نسخهٔ تازه با parent_asset_id؛ ردیف قبلی دست‌نخورده می‌ماند', async () => {
    const root = await upload(brandA, tinyPng(100, 100, 1));
    const v2 = await upload(brandA, tinyPng(100, 100, 2), { ...IMAGE, parent_asset_id: root.id });
    const v3 = await upload(brandA, tinyPng(100, 100, 3), { ...IMAGE, parent_asset_id: v2.id });
    assert.equal(v2.version, 2);
    assert.equal(v3.version, 3);
    assert.equal(v3.parent_asset_id, root.id, 'زنجیره به ریشه بسته می‌شود');
    const again = await owner.ok('getAsset', { params: { ...owner.brand(brandA.id), asset_id: root.id } });
    assert.deepEqual(again, root);
  });
});

describe('A17 — upload بد پیش از ذخیره رد می‌شود', () => {
  it('SVG، HTML و اجرایی با هر نام و سرآیندی رد می‌شوند', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    assert.equal((await uploadError(brandA, svg, { ...IMAGE, filename: 'logo.png' })).code, 'INVALID_MEDIA');
    const html = Buffer.from('<!doctype html><script>fetch("/")</script>');
    assert.equal((await uploadError(brandA, html)).code, 'INVALID_MEDIA');
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);
    assert.equal((await uploadError(brandA, exe, { ...IMAGE, filename: 'photo.jpg' })).code, 'INVALID_MEDIA');
  });

  it('نوع اعلام‌شده باید با محتوا بخواند؛ فایل خالی و نوع بدنهٔ نادرست رد می‌شود', async () => {
    assert.equal((await uploadError(brandA, tinyPng(10, 10), { ...IMAGE, kind: 'video' })).code, 'INVALID_MEDIA');
    assert.equal((await uploadError(brandA, Buffer.alloc(0))).status >= 400, true);
    const asJson = await uploadError(brandA, tinyPng(10, 10), IMAGE, { 'content-type': 'application/json' });
    assert.ok(['INVALID_MEDIA', 'VALIDATION_FAILED'].includes(asJson.code));
  });

  it('تصویر با ابعاد غیرعادی رد می‌شود', async () => {
    const huge = tinyPng(1, 1);
    huge.writeUInt32BE(50_000, 16); // سرآیند دست‌کاری‌شده
    assert.equal((await uploadError(brandA, huge)).code, 'INVALID_MEDIA');
  });

  it('بدون CSRF یا از مبدأ دیگر رد می‌شود؛ فراداده بدون مجوز استفاده ناقص است', async () => {
    assert.equal((await uploadError(brandA, tinyPng(11, 11), IMAGE, { 'x-csrf-token': 'wrong' })).code, 'CSRF_FAILED');
    assert.equal((await uploadError(brandA, tinyPng(11, 11), IMAGE, { origin: 'https://evil.example' })).code, 'CSRF_FAILED');
    const { license: _license, ...noLicense } = IMAGE;
    assert.equal((await uploadError(brandA, tinyPng(11, 11), noLicense)).code, 'VALIDATION_FAILED');
  });

  it('بدون نشست هیچ فایلی دریافت یا ثبت نمی‌شود', async () => {
    const asset = await upload(brandA, tinyPng(30, 30, 9));
    const anonymous = harness.client();
    anonymous.session = owner.session;
    const file = await anonymous.assetFile(brandA.id, asset.id);
    assert.equal(file.status, 401);
  });
});

describe('A07 — جداسازی دارایی بین برندها', () => {
  it('دارایی برند A از مسیر برند B دیده، دانلود یا فهرست نمی‌شود', async () => {
    const asset = await upload(brandA, tinyPng(40, 40, 11));
    await owner.fail('getAsset', 'NOT_FOUND', { params: { ...owner.brand(brandB.id), asset_id: asset.id } });
    const file = await owner.assetFile(brandB.id, asset.id);
    assert.equal(file.status, 404);
    const listed = await owner.ok('listAssets', { params: owner.brand(brandB.id) });
    assert.ok(!listed.items.some((item) => item.id === asset.id));
  });

  it('نسخهٔ تازه با والدی از برند دیگر ساخته نمی‌شود', async () => {
    const asset = await upload(brandA, tinyPng(41, 41, 12));
    const result = await uploadError(brandB, tinyPng(41, 41, 13), { ...IMAGE, parent_asset_id: asset.id });
    assert.equal(result.code, 'NOT_FOUND');
  });

  it('محتوای برند B نمی‌تواند به دارایی برند A ارجاع دهد', async () => {
    const asset = await upload(brandA, tinyPng(42, 42, 14));
    await owner.ok('createRun', {
      params: owner.brand(brandB.id),
      body: { intent: 'build_weekly_plan', idempotency_key: newKey(), params: { week_of: '2026-11-11' } },
    });
    await owner.ok('createRun', {
      params: owner.brand(brandB.id),
      body: { intent: 'generate_drafts', idempotency_key: newKey(), params: { week_of: '2026-11-11' } },
    });
    const content = (await owner.ok('listContent', { params: owner.brand(brandB.id) })).items[0];
    assert.ok(content);
    const detail = await owner.ok('getContent', { params: { ...owner.brand(brandB.id), content_id: content.id } });
    await owner.fail('createContentRevision', 'CROSS_BRAND_REFERENCE', {
      params: { ...owner.brand(brandB.id), content_id: content.id },
      body: {
        expected_revision: detail.item.current_revision,
        text: detail.revisions[0]?.text ?? 'متن',
        asset_ids: [asset.id],
      },
    });
  });

  it('در خود پایگاه داده هم ردیف دارایی تغییر یا حذف نمی‌شود', async () => {
    const asset = await upload(brandA, tinyPng(43, 43, 15));
    const client = new pg.Client({ connectionString: harness.database.appUrl });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [owner.workspaceId]);
      await assert.rejects(client.query(`UPDATE assets SET license = 'x' WHERE id = $1`, [asset.id]));
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
  });
});

describe('دارایی در نسخهٔ محتوا', () => {
  it('افزودن و ترتیب دارایی‌ها در نسخهٔ تازه ثبت می‌شود و hash را عوض می‌کند', async () => {
    const item = takeItem();
    const one = await upload(brandA, tinyPng(1080, 1350, 21));
    const two = await upload(brandA, tinyPng(1080, 1350, 22));
    const params = { ...owner.brand(brandA.id), content_id: item.id };
    const before = await owner.ok('getContent', { params });
    const text = before.revisions[0]?.text as string;
    const withAssets = await owner.ok('createContentRevision', {
      params,
      body: { expected_revision: before.item.current_revision, text, asset_ids: [one.id, two.id] },
    });
    assert.deepEqual(withAssets.revisions[0]?.asset_ids, [one.id, two.id]);
    assert.notEqual(withAssets.revisions[0]?.hash, before.revisions[0]?.hash);

    const reordered = await owner.ok('createContentRevision', {
      params,
      body: { expected_revision: withAssets.item.current_revision, text, asset_ids: [two.id, one.id] },
    });
    assert.notEqual(reordered.revisions[0]?.hash, withAssets.revisions[0]?.hash, 'ترتیب اسلاید بخشی از محتواست');

    // ویرایش متن بدون فهرست دارایی، دارایی‌های نسخهٔ قبل را نگه می‌دارد.
    const textOnly = await owner.ok('createContentRevision', {
      params,
      body: { expected_revision: reordered.item.current_revision, text: `${text}\nجملهٔ تازه.` },
    });
    assert.deepEqual(textOnly.revisions[0]?.asset_ids, [two.id, one.id]);

    await owner.fail('createContentRevision', 'CONFLICT', {
      params,
      body: { expected_revision: textOnly.item.current_revision, text: textOnly.revisions[0]?.text as string },
    });
    await owner.fail('createContentRevision', 'VALIDATION_FAILED', {
      params,
      body: { expected_revision: textOnly.item.current_revision, text, asset_ids: [one.id, one.id] },
    });
  });

  it('A04 — تعویض تصویر پس از تأیید، قصد انتشار را باطل می‌کند و چیزی منتشر نمی‌شود', async () => {
    const policy = await owner.ok('getPolicy', { params: owner.brand(brandA.id) });
    await owner.ok('updatePolicy', {
      params: owner.brand(brandA.id),
      body: { expected_revision: policy.revision, mode: 'review_required' },
    });
    const item = takeItem();
    const params = { ...owner.brand(brandA.id), content_id: item.id };
    const original = await upload(brandA, tinyPng(1080, 1350, 31));
    const start = await owner.ok('getContent', { params });
    const text = start.revisions[0]?.text as string;
    const ready = await owner.ok('createContentRevision', {
      params,
      body: { expected_revision: start.item.current_revision, text, asset_ids: [original.id] },
    });
    assert.notEqual(ready.item.state, 'needs_revision', JSON.stringify(ready.revisions[0]?.qa_result.checks));

    const intent: IntentView = await owner.ok('createPublishIntent', {
      params,
      body: { connection_id: connectionId, idempotency_key: newKey(), scheduled_at_utc: harness.clock.now.toISOString() },
    });
    const approved = await owner.ok('decideApproval', {
      params: { ...owner.brand(brandA.id), intent_id: intent.id },
      body: { decision: 'approved', payload_hash: intent.payload_hash },
    });
    assert.equal(approved.state, 'authorized');

    // فقط تصویر عوض می‌شود (نسخهٔ ۲ همان دارایی)؛ متن ثابت است.
    const replaced = await upload(brandA, tinyPng(1080, 1350, 32), { ...IMAGE, parent_asset_id: original.id });
    await owner.ok('createContentRevision', {
      params,
      body: { expected_revision: ready.item.current_revision, text, asset_ids: [replaced.id] },
    });
    const after = await owner.ok('getIntent', { params: { ...owner.brand(brandA.id), intent_id: intent.id } });
    assert.equal(after.state, 'denied');
    assert.equal(after.policy_reason, 'REVISION_CHANGED');
    const calls = harness.fakeState.publishCalls;
    await harness.studio.execution.tick({ worker: 'test-worker' });
    assert.equal(harness.fakeState.publishCalls, calls);
  });
});

describe('ذخیره روی دیسک', () => {
  it('فایل‌ها زیر پوشهٔ workspace/brand و با نام checksum هستند', async () => {
    const dirs = await readdir(`${harness.assetRoot}/${owner.workspaceId}`);
    assert.ok(dirs.includes(brandA.id));
    assert.ok(!dirs.includes(brandB.id), 'برند B هیچ upload موفقی نداشته است');
  });
});
