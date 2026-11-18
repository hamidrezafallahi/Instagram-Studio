/**
 * ارزیابی دستی تصویر و ویدئو با برند واقعی (A22، M3.6).
 *   node scripts/eval-visual.ts [brand-slug] [formats]      مثال: pnpm eval:visual hamidreza-falahi carousel,reel
 * متن هر قالب را همان نویسندهٔ استودیو می‌سازد (مدل رایگان OpenRouter اگر کلیدش در STUDIO_HOME/.env باشد،
 * وگرنه قالبی)، سپس با همان مسیر تولید رندر می‌شود. خروجی در STUDIO_HOME/eval/visual-<زمان>/ (بیرون از مخزن).
 * به پایگاه داده دست نمی‌زند؛ چیزی منتشر یا ارسال نمی‌شود. کلید چاپ نمی‌شود.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { copywriter, editorQa, toRequest } from '@studio/agents';
import { loadIndustryPacks, loadRuntimeConfig } from '@studio/config';
import type { ContentFormat, QaCheck } from '@studio/contracts';
import { DEFAULT_VISUAL, HtmlRenderer, findBrowser, isVisualFormat, loadVazirmatn, renderVisual } from '@studio/media';
import { buildSeedProfile, createModelGateway, loadBrandSeeds, reelOutputs } from '@studio/orchestration';

const slug = process.argv[2] ?? 'hamidreza-falahi';
const formats = (process.argv[3] ?? 'carousel,reel,story,post').split(',').map((item) => item.trim()) as ContentFormat[];

const config = loadRuntimeConfig();
const [entry] = loadBrandSeeds(join(config.repoRoot, 'config', 'brands', slug));
if (!entry) throw new Error(`برند ${slug} پیدا نشد.`);
const pack = loadIndustryPacks().get(entry.seed.industry_pack_id);
if (!pack) throw new Error('بستهٔ صنعت پیدا نشد.');
const profile = buildSeedProfile(entry.seed, pack);
const visual = profile.visual ?? DEFAULT_VISUAL;
const browser = findBrowser(config.browserPath);
if (!browser) throw new Error('Chrome یا Edge پیدا نشد.');
const tools = { ffmpeg: config.ffmpegPath ?? 'ffmpeg', ffprobe: config.ffprobePath ?? 'ffprobe' };
const font = loadVazirmatn(config.repoRoot);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(config.home, 'eval', `visual-${stamp}`);
const offer = profile.offers[0]?.title ?? '';
const cta = 'اگر می‌خواهید بدانید سایت فعلی‌تان کجا مشتری را از دست می‌دهد، «بررسی» را دایرکت کنید.';

console.log(`[eval] برند: ${entry.seed.name} | متن: ${config.textModel} | هویت بصری: ${profile.visual ? 'ثبت‌شده' : 'پیش‌فرض'}`);
console.log(`[eval] خروجی: ${outDir}`);
const session = createModelGateway(config).session();
const renderer = await HtmlRenderer.launch(browser);
const summary: string[] = [];
try {
  for (const format of formats) {
    if (!isVisualFormat(format)) {
      console.log(`[eval] ${format} قالب تصویری نیست؛ رد شد.`);
      continue;
    }
    const pillar = profile.cadence.find((slot) => slot.format === format)?.pillar ?? pack.content_pillars[0]?.id ?? 'customer_problem';
    const started = Date.now();
    const draft = await session.generate(
      toRequest(copywriter, {
        profile, pack, brand_revision: 1,
        entry: { channel: 'instagram', format, pillar, topic_fa: `اشتباه‌های رایج در ${offer}`, goal_fa: 'آگاهی و ذخیره', cta_fa: cta },
      }),
    );
    const qa = await session.generate(
      toRequest(editorQa, {
        text: draft.output.text, format, cta_fa: cta, profile, pack, is_sample: false, checked_at: new Date().toISOString(),
      }),
    );
    const dir = join(outDir, format);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'draft.txt'), `${draft.output.text}\n`, 'utf8');

    const cover = await renderVisual(renderer, { format, text: draft.output.text, pillar, visual, fontBase64: font });
    let checks: QaCheck[] = cover.checks;
    const files: string[] = [];
    if (format === 'reel') {
      const reel = await reelOutputs(renderer, cover, draft.output.text, pillar, visual, font, tools);
      checks = reel.checks;
      for (const output of reel.outputs) {
        writeFileSync(join(dir, output.filename), output.data);
        files.push(output.filename);
      }
    } else {
      cover.slides.forEach((slide, index) => {
        const name = `${format}-${String(index + 1).padStart(2, '0')}.png`;
        writeFileSync(join(dir, name), slide.png);
        files.push(name);
      });
    }
    const all = [...qa.output.qa_result.checks, ...checks];
    writeFileSync(join(dir, 'qa.json'), `${JSON.stringify(all, null, 2)}\n`, 'utf8');
    const failed = all.filter((check) => !check.passed && check.severity !== 'info');
    const line = `${format}: ${draft.generator.provider} | ${Math.round((Date.now() - started) / 1000)} ثانیه | ${files.length} فایل | ایراد: ${failed.length}`;
    summary.push(line);
    console.log(`[eval] ${line}`);
    for (const check of failed) console.log(`  - [${check.severity}] ${check.id}: ${check.message_fa}${check.excerpt ? ` «${check.excerpt}»` : ''}`);
    for (const reason of draft.fallbacks_fa) console.log(`  - کنار رفت: ${reason}`);
  }
} finally {
  await renderer.close();
}
writeFileSync(join(outDir, 'summary.txt'), `${summary.join('\n')}\n`, 'utf8');
console.log(`[eval] تمام. فراخوانی مدل: ${session.calls}`);
