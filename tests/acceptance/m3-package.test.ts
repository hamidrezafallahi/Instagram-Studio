/**
 * پذیرش M3.5 — بستهٔ انتشار دستی (ZIP) از API که داشبورد به آن لینک می‌دهد.
 * پوشش: ترتیب و بایت‌های دارایی‌ها، کپشن جدا از متن کامل، هشدار صریح «تأییدنشده/نمونه» در README،
 * ثبت در audit، و جداسازی برند (A07). چیزی منتشر نمی‌شود.
 * محیط: API درون‌فرایندی + PostgreSQL واقعی؛ بدون مرورگر یا FFmpeg (دارایی‌ها upload می‌شوند).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { contentPackageRoute, type AssetView, type BrandSummary, type ContentItemSummary } from '@studio/contracts';
import { tinyPng } from '@studio/media/fixtures';
import { readStoredZip } from '@studio/media/zip-reader';
import { createHarness, newKey, type Harness, type TestClient } from '../support/harness.ts';

let harness: Harness;
let owner: TestClient;
let brand: BrandSummary;
let other: BrandSummary;
let carousel: ContentItemSummary;

const params = () => owner.brand(brand.id);
const download = (brandId: string, contentId: string) =>
  owner.request(contentPackageRoute.method, contentPackageRoute.path, {
    params: { ...owner.brand(brandId), content_id: contentId },
  });

before(async () => {
  harness = await createHarness();
  owner = await harness.owner();
  const seeded = await owner.ok('seedSampleBrands', { params: { workspace_id: owner.workspaceId } });
  brand = seeded.items.find((item) => item.industry_pack.id === 'web-services') as BrandSummary;
  other = seeded.items.find((item) => item.id !== brand.id) as BrandSummary;
  for (const intent of ['build_weekly_plan', 'generate_drafts'] as const) {
    await owner.ok('createRun', { params: params(), body: { intent, idempotency_key: newKey(), params: { week_of: '2026-11-11' } } });
  }
  carousel = (await owner.ok('listContent', { params: params() })).items.find((item) => item.format === 'carousel') as ContentItemSummary;
  assert.ok(carousel);
});
after(async () => {
  await harness.close();
});

describe('بستهٔ انتشار دستی', () => {
  it('دارایی‌ها به ترتیب نسخه، کپشن، متن کامل و راهنما؛ بایت‌ها همان فایل‌ها', async () => {
    const uploads: { asset: AssetView; data: Buffer }[] = [];
    for (const shade of [10, 20]) {
      const data = tinyPng(1080, 1350, shade);
      const response = await owner.uploadAsset(brand.id, { kind: 'image', filename: `slide-${shade}.png`, license: 'اثر خود مالک' }, data);
      assert.equal(response.status, 201, response.raw);
      uploads.push({ asset: response.json as AssetView, data });
    }
    const before = await owner.ok('getContent', { params: { ...params(), content_id: carousel.id } });
    // ترتیب عمداً برعکس upload است.
    await owner.ok('createContentRevision', {
      params: { ...params(), content_id: carousel.id },
      body: {
        expected_revision: before.item.current_revision,
        text: before.revisions[0]?.text as string,
        asset_ids: [uploads[1]?.asset.id as string, uploads[0]?.asset.id as string],
      },
    });

    const response = await download(brand.id, carousel.id);
    assert.equal(response.status, 200, response.raw.slice(0, 300));
    assert.equal(response.headers['content-type'], 'application/zip');
    assert.match(String(response.headers['content-disposition']), /attachment; filename="content-[0-9a-f]{8}-v\d+\.zip"/);
    const entries = readStoredZip(response.rawBody);
    assert.deepEqual(entries.map((entry) => entry.name), ['01-slide-20.png', '02-slide-10.png', 'caption.txt', 'draft.txt', 'README.txt']);
    assert.deepEqual(entries[0]?.data, uploads[1]?.data);
    assert.deepEqual(entries[1]?.data, uploads[0]?.data);

    const after = await owner.ok('getContent', { params: { ...params(), content_id: carousel.id } });
    const text = after.revisions[0]?.text as string;
    const caption = entries[2]?.data.toString('utf8') ?? '';
    assert.equal(entries[3]?.data.toString('utf8'), `${text}\n`);
    assert.ok(caption.length > 0 && caption.length < text.length, 'کپشن فقط بخش «کپشن:» است');
    assert.ok(!caption.includes('اسلاید ۱'));

    const readme = entries[4]?.data.toString('utf8') ?? '';
    assert.ok(readme.includes('هنوز تأیید نشده'));
    assert.ok(readme.includes('محتوای نمونه'));
    assert.ok(readme.includes(`نسخه: ${after.item.current_revision}`));
    assert.ok(readme.includes('چیزی از طرف شما ارسال نمی‌کند'));

    const events = await owner.ok('listAuditEvents', { params: params() });
    assert.ok(events.items.some((event) => event.action === 'content.package.download' && event.target_id === carousel.id));
  });

  it('A07 — محتوای برند دیگر از مسیر این برند دانلود نمی‌شود؛ بدون نشست هم نه', async () => {
    assert.equal((await download(other.id, carousel.id)).status, 404);
    const anonymous = harness.client();
    anonymous.session = owner.session;
    const response = await anonymous.request(contentPackageRoute.method, contentPackageRoute.path, {
      params: { ...owner.brand(brand.id), content_id: carousel.id },
    });
    assert.equal(response.status, 401);
  });
});
