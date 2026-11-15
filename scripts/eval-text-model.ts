/**
 * ارزیابی دستی کیفیت فارسی مدل متن با برند واقعی (A22، بخش متن).
 *   node scripts/eval-text-model.ts [brand-slug] [format] [pillar]
 * با کلید OpenRouter در STUDIO_HOME/.env به مدل رایگان واقعی وصل می‌شود؛ جزو آزمون خودکار نیست.
 * فقط دادهٔ برند فرستاده می‌شود. هیچ چیزی ذخیره، منتشر یا ارسال نمی‌شود. کلید چاپ نمی‌شود.
 */
import { copywriter, editorQa, toRequest } from '@studio/agents';
import { loadIndustryPacks, loadRuntimeConfig } from '@studio/config';
import type { ContentFormat } from '@studio/contracts';
import { buildSeedProfile, createModelGateway, loadBrandSeeds } from '@studio/orchestration';
import { join } from 'node:path';

const slug = process.argv[2] ?? 'hamidreza-falahi';
const format = (process.argv[3] ?? 'carousel') as ContentFormat;

const config = loadRuntimeConfig();
const [entry] = loadBrandSeeds(join(config.repoRoot, 'config', 'brands', slug));
if (!entry) throw new Error(`برند ${slug} پیدا نشد.`);
const pack = loadIndustryPacks().get(entry.seed.industry_pack_id);
if (!pack) throw new Error('بستهٔ صنعت پیدا نشد.');
const profile = buildSeedProfile(entry.seed, pack);
const pillar = process.argv[4] ?? profile.cadence.find((slot) => slot.format === format)?.pillar ?? pack.content_pillars[0]?.id ?? 'customer_problem';
const offer = profile.offers[0]?.title ?? '';

console.log(`[eval] تولیدکنندهٔ متن: ${config.textModel} | مدل‌ها: ${config.openrouterModels.join('، ')}`);
const gateway = createModelGateway(config);
const session = gateway.session();
const started = Date.now();
const draft = await session.generate(
  toRequest(copywriter, {
    profile,
    pack,
    brand_revision: 1,
    entry: {
      channel: 'instagram',
      format,
      pillar,
      topic_fa: `اشتباه‌های رایج در ${offer}`,
      goal_fa: 'آگاهی و ذخیره',
      cta_fa: 'اگر می‌خواهید بدانید سایت فعلی‌تان کجا مشتری را از دست می‌دهد، «بررسی» را دایرکت کنید.',
    },
  }),
);
const qa = await session.generate(
  toRequest(editorQa, {
    text: draft.output.text,
    format,
    cta_fa: 'اگر می‌خواهید بدانید سایت فعلی‌تان کجا مشتری را از دست می‌دهد، «بررسی» را دایرکت کنید.',
    profile,
    pack,
    is_sample: false,
    checked_at: new Date().toISOString(),
  }),
);

console.log(`[eval] سازنده: ${draft.generator.kind} | ${draft.generator.provider} | ${Math.round((Date.now() - started) / 1000)} ثانیه | فراخوانی: ${session.calls}`);
for (const reason of draft.fallbacks_fa) console.log(`[eval] کنار رفت: ${reason}`);
console.log(`[eval] QA: ${qa.output.qa_result.status}`);
for (const check of qa.output.qa_result.checks.filter((item) => !item.passed)) {
  console.log(`  - [${check.severity}] ${check.message_fa}${check.excerpt ? ` «${check.excerpt}»` : ''}`);
}
console.log(`[eval] عنوان: ${draft.output.title_fa}`);
if (draft.output.open_questions_fa.length) console.log(`[eval] پرسش‌ها: ${draft.output.open_questions_fa.join(' | ')}`);
console.log('──────── متن ────────');
console.log(draft.output.text);
