/**
 * پذیرش M3.4 — ویدئوی ریلز (A22 بخش ویدئو).
 * پوشش: run «ساخت تصویر» برای ریلز → MP4 (H.264/AAC، 1080×1920) + کاور + زیرنویس SRT/VTT هم‌زمان،
 * سنجش فایل واقعی با ffprobe، قطعی‌بودن خروجی، upload ویدئوی مالک با مدت واقعی و رد ویدئوی خراب، و
 * نبود FFmpeg → شکست صادقانه.
 * محیط: API درون‌فرایندی + PostgreSQL واقعی + Chrome و FFmpeg نصب‌شدهٔ همین دستگاه (بدون شبکه).
 * بدون FFmpeg یا مرورگر این آزمون شکست می‌خورد، نه skip.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AssetView, BrandSummary, ContentItemDetail, ContentItemSummary } from '@studio/contracts';
import { findBrowser, parseReelScript, probeMedia, videoToolsAvailable } from '@studio/media';
import { createHarness, newKey, type Harness, type TestClient } from '../support/harness.ts';

const TOOLS = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' };
let harness: Harness;
let owner: TestClient;
let brand: BrandSummary;
let reel: ContentItemSummary;
let detail: ContentItemDetail;
let assets: AssetView[];
let videoBytes: Buffer;
const WEEK_OF = '2026-11-11';

const params = () => owner.brand(brand.id);

before(async () => {
  assert.ok(findBrowser(), 'Chrome یا Edge نصب نیست.');
  assert.ok(await videoToolsAvailable(TOOLS), 'ffmpeg و ffprobe در PATH نیستند.');
  harness = await createHarness();
  owner = await harness.owner();
  const seeded = await owner.ok('seedSampleBrands', { params: { workspace_id: owner.workspaceId } });
  brand = seeded.items.find((item) => item.industry_pack.id === 'web-services') as BrandSummary;
  for (const intent of ['build_weekly_plan', 'generate_drafts'] as const) {
    await owner.ok('createRun', { params: params(), body: { intent, idempotency_key: newKey(), params: { week_of: WEEK_OF } } });
  }
  const items = (await owner.ok('listContent', { params: params() })).items;
  reel = items.find((item) => item.format === 'reel') as ContentItemSummary;
  assert.ok(reel, 'برنامهٔ نمونه ریلز ندارد');
  const run = await owner.ok('createRun', {
    params: params(),
    body: { intent: 'render_visuals', idempotency_key: newKey(), params: { content_ids: [reel.id] } },
  });
  assert.equal(run.status, 'succeeded', JSON.stringify(run.result));
  detail = await owner.ok('getContent', { params: { ...params(), content_id: reel.id } });
  assets = [];
  for (const id of detail.revisions[0]?.asset_ids ?? []) {
    assets.push(await owner.ok('getAsset', { params: { ...params(), asset_id: id } }));
  }
  videoBytes = (await owner.assetFile(brand.id, assets[0]?.id as string)).rawBody;
});
after(async () => {
  await harness?.close();
});

describe('ریلز → ویدئو', () => {
  it('ترتیب دارایی‌ها: ویدئو، کاور، SRT، VTT', () => {
    assert.deepEqual(assets.map((asset) => [asset.kind, asset.mime]), [
      ['video', 'video/mp4'],
      ['image', 'image/png'],
      ['subtitle', 'application/x-subrip'],
      ['subtitle', 'text/vtt'],
    ]);
    assert.ok(assets.every((asset) => asset.provenance === 'rendered' && asset.language === 'fa'));
  });

  it('فایل واقعی MP4 با مشخصات ریلز است و مدتش با مجموع فریم‌های اسکریپت می‌خواند', async () => {
    const probe = await probeMedia(TOOLS, videoBytes);
    assert.equal(probe.video_codec, 'h264');
    assert.equal(probe.pix_fmt, 'yuv420p');
    assert.deepEqual([probe.width, probe.height], [1080, 1920]);
    assert.equal(probe.audio_codec, 'aac');
    assert.equal(probe.fps, 30);
    const script = parseReelScript(detail.revisions[0]?.text ?? '');
    const planned = script.frames.reduce((sum, frame) => sum + frame.duration_s, 0);
    assert.ok(Math.abs(probe.duration_ms / 1000 - planned) <= 0.25, `${probe.duration_ms} در برابر ${planned}`);
    assert.equal(assets[0]?.duration_ms, probe.duration_ms);
    const file = await owner.assetFile(brand.id, assets[0]?.id as string);
    assert.equal(file.headers['content-type'], 'video/mp4');
  });

  it('زیرنویس‌ها برای هر فریم یک cue دارند و متن فارسی درست ذخیره شده', async () => {
    const script = parseReelScript(detail.revisions[0]?.text ?? '');
    const srt = (await owner.assetFile(brand.id, assets[2]?.id as string)).rawBody.toString('utf8');
    const vtt = (await owner.assetFile(brand.id, assets[3]?.id as string)).rawBody.toString('utf8');
    assert.equal(srt.match(/ --> /g)?.length, script.frames.length);
    assert.equal(vtt.match(/ --> /g)?.length, script.frames.length);
    assert.ok(vtt.startsWith('WEBVTT'));
    assert.ok(srt.includes(script.frames[0]?.title ?? '∅'));
  });

  it('QA ویدئو و فریم‌ها در نسخهٔ تازه ثبت شده است', () => {
    const checks = detail.revisions[0]?.qa_result.checks ?? [];
    for (const id of ['video_format', 'video_audio', 'video_duration', 'video_subtitles', 'visual_overflow']) {
      const found = checks.find((check) => check.id === id);
      assert.ok(found, `چک ${id} نیست`);
      assert.equal(found.passed, true, `${id}: ${found.message_fa}`);
    }
  });

  it('رندر دوباره همان فایل‌ها (checksum یکسان) و بدون نسخهٔ تازه', async () => {
    const run = await owner.ok('createRun', {
      params: params(),
      body: { intent: 'render_visuals', idempotency_key: newKey(), params: { content_ids: [reel.id] } },
    });
    assert.ok(run.result?.skipped.some((entry) => entry.reason_fa.includes('تغییری نکردند')), JSON.stringify(run.result));
    const again = await owner.ok('getContent', { params: { ...params(), content_id: reel.id } });
    assert.equal(again.item.current_revision, detail.item.current_revision);
  });
});

describe('upload ویدئوی مالک', () => {
  it('مدت و ابعاد واقعی با ffprobe ثبت می‌شود', async () => {
    // همان MP4 به‌عنوان فایل مالک، با نوع دیگر (video) دوباره ثبت می‌شود؛ checksum یکسان در همان kind برمی‌گردد.
    const response = await owner.uploadAsset(brand.id, { kind: 'video', filename: 'my-video.mp4', license: 'اثر خود مالک' }, videoBytes);
    assert.equal(response.status, 201, response.raw);
    const asset = response.json as AssetView;
    assert.ok(asset.duration_ms && asset.duration_ms > 1000);
    assert.deepEqual([asset.width, asset.height], [1080, 1920]);
  });

  it('MP4 خراب با سرآیند درست رد می‌شود', async () => {
    const broken = Buffer.concat([videoBytes.subarray(0, 64), Buffer.alloc(4096, 7)]);
    const response = await owner.uploadAsset(brand.id, { kind: 'video', filename: 'broken.mp4', license: 'اثر خود مالک' }, broken);
    assert.equal(response.status, 422, response.raw);
    assert.equal(response.json?.error?.code, 'INVALID_MEDIA');
  });
});

describe('نبود FFmpeg', () => {
  it('ریلز با دلیل روشن رد می‌شود و دارایی ساختگی ساخته نمی‌شود؛ کاروسل‌ها ادامه می‌دهند', async () => {
    const other = await createHarness({ ffmpegPath: 'C:/no/ffmpeg.exe' });
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
      const items = (await client.ok('listContent', { params: client.brand(target.id) })).items;
      const reelItem = items.find((item) => item.format === 'reel') as ContentItemSummary;
      assert.ok(run.result?.skipped.some((entry) => entry.ref === reelItem.id && entry.reason_fa.includes('FFmpeg')), JSON.stringify(run.result));
      assert.ok((run.result?.content_ids.length ?? 0) > 0, 'محتوای غیرریلز باید تصویر بگیرد');
      assert.equal(run.status, 'partially_succeeded');
      const videos = await client.ok('listAssets', { params: client.brand(target.id), query: { kind: 'video' } });
      assert.equal(videos.items.length, 0);
    } finally {
      await other.close();
    }
  });
});
