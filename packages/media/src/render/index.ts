import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrandVisual, QaCheck } from '@studio/contracts';
import type { HtmlRenderer } from './browser.ts';
import { parseVisual, type Slide, type VisualFormat } from './slides.ts';
import {
  DEFAULT_VISUAL,
  FORMAT_SPECS,
  contrastRatio,
  ctaTextColor,
  measureExpression,
  slideHtml,
  type Measure,
} from './templates.ts';

export { HtmlRenderer, findBrowser, type Viewport } from './browser.ts';
export {
  cuesFor,
  frameDuration,
  parseReelScript,
  parseVisual,
  toSrt,
  toVtt,
  type Cue,
  type ParsedVisual,
  type ReelScript,
  type Slide,
  type SlideRole,
  type TimedSlide,
  type VisualFormat,
} from './slides.ts';
export { DEFAULT_VISUAL, FORMAT_SPECS, contrastRatio, slideHtml, type FormatSpec } from './templates.ts';

/** نسخهٔ قالب‌ها؛ در فرادادهٔ هر دارایی رندرشده ثبت می‌شود تا بازتولید قابل ردیابی باشد. */
export const TEMPLATE_VERSION = 'notebook-1';
export const VISUAL_QA_VERSION = 'visual-qa-1';

/** فونت Vazirmatn (OFL 1.1، v33.003) از config/fonts. */
export function loadVazirmatn(repoRoot: string): string {
  return readFileSync(join(repoRoot, 'config', 'fonts', 'vazirmatn', 'Vazirmatn-wght.woff2')).toString('base64');
}

export const VISUAL_FORMATS: readonly VisualFormat[] = ['carousel', 'story', 'post', 'reel'];
export const isVisualFormat = (format: string): format is VisualFormat =>
  (VISUAL_FORMATS as readonly string[]).includes(format);

/** ضریب‌های کوچک‌کردن متن به ترتیب؛ اگر در کوچک‌ترین هم جا نشد، خطای سرریز ثبت می‌شود. */
const FIT_SCALES = [1, 0.9, 0.8, 0.7] as const;
/** حداقل اندازهٔ متن فارسی (v1: هیچ متنی کوچک‌تر از ۲۸ پیکسل). */
const MIN_FONT_PX = 26;

export interface RenderedSlide {
  slide: Slide;
  png: Buffer;
  width: number;
  height: number;
  scale: number;
  measure: Measure;
}

export interface VisualResult {
  format: VisualFormat;
  slides: RenderedSlide[];
  caption: string | null;
  checks: QaCheck[];
  dark: boolean;
}

export interface VisualRequest {
  format: VisualFormat;
  text: string;
  pillar: string;
  visual: BrandVisual | undefined;
  fontBase64: string;
}

function check(id: string, severity: QaCheck['severity'], passed: boolean, message_fa: string, excerpt?: string): QaCheck {
  return { id, severity, passed, message_fa, ...(excerpt ? { excerpt: excerpt.slice(0, 200) } : {}) };
}

/** کنتراست جفت‌رنگ‌هایی که قالب واقعاً به کار می‌برد. */
export function contrastChecks(visual: BrandVisual): QaCheck[] {
  const { colors } = visual;
  const pairs: [string, string, string, number][] = [
    ['متن روی زمینهٔ روشن', colors.ink, colors.paper, 4.5],
    ['متن ثانویه روی زمینهٔ روشن', colors.stone, colors.paper, 4.5],
    ['متن ثانویه روی زمینهٔ تیره', colors.mist, colors.ink, 4.5],
    ['متن دکمهٔ CTA', ctaTextColor(visual), colors.signal, 4.5],
    ['رنگ تأکید روی زمینهٔ روشن (فقط متن بزرگ)', colors.signal, colors.paper, 3],
  ];
  const failed = pairs.filter(([, fg, bg, min]) => contrastRatio(fg, bg) < min);
  return [
    check(
      'visual_contrast',
      'error',
      failed.length === 0,
      failed.length === 0
        ? 'کنتراست رنگ‌های قالب کافی است.'
        : `کنتراست ناکافی: ${failed.map(([label, fg, bg]) => `${label} (${contrastRatio(fg, bg).toFixed(2)})`).join('، ')}`,
    ),
  ];
}

/**
 * رندر همهٔ اسلایدهای یک محتوا با یک مرورگر باز. متن هر اسلاید تا جا شدن کوچک می‌شود
 * و نتیجهٔ سنجش هر اسلاید به چک‌های QA بصری تبدیل می‌شود (جایگزین بازبینی چشمی انسان نیست).
 */
export async function renderVisual(renderer: HtmlRenderer, request: VisualRequest): Promise<VisualResult> {
  const visual = request.visual ?? DEFAULT_VISUAL;
  const parsed = parseVisual(request.format, request.text);
  const dark = isDark(request.format, request.pillar, visual);
  const rendered = await renderSlides(renderer, { ...request, visual, slides: parsed.slides, dark });
  const checks = slideChecks(rendered, request.format, visual, 'اسلاید');
  return { format: request.format, slides: rendered, caption: parsed.caption, checks, dark };
}

export const isDark = (format: VisualFormat, pillar: string, visual: BrandVisual): boolean =>
  format === 'reel' || (visual.dark_pillars ?? []).includes(pillar);

/** رندر فهرست مشخصی از اسلایدها؛ متن هر اسلاید تا جاشدن کوچک می‌شود. */
export async function renderSlides(
  renderer: HtmlRenderer,
  request: { format: VisualFormat; pillar: string; visual: BrandVisual; fontBase64: string; slides: readonly Slide[]; dark: boolean },
): Promise<RenderedSlide[]> {
  const { visual, format, slides, dark } = request;
  const spec = FORMAT_SPECS[format];
  const kicker = visual.pillar_kickers?.[request.pillar] ?? null;
  const total = slides.length;
  const rendered: RenderedSlide[] = [];
  let bodyNumber = 0;
  for (const [index, slide] of slides.entries()) {
    if (slide.role === 'body') bodyNumber += 1;
    let result: RenderedSlide | null = null;
    for (const scale of FIT_SCALES) {
      const html = slideHtml({
        slide, index, total, bodyNumber, format, visual, dark, kicker, fontBase64: request.fontBase64, scale,
      });
      const output = await renderer.render<Measure>(html, spec, measureExpression(format));
      result = { slide, png: output.png, width: spec.width, height: spec.height, scale, measure: output.measure };
      if (output.measure.overflow.length === 0 && output.measure.outside.length === 0) break;
    }
    rendered.push(result as RenderedSlide);
  }
  return rendered;
}

const faNumber = (value: number): string => String(value).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] as string);

/** چک‌های QA بصری برای اسلایدهای رندرشده؛ `noun` در پیام‌ها («اسلاید» یا «فریم») می‌آید. */
export function slideChecks(
  rendered: readonly RenderedSlide[],
  format: VisualFormat,
  visual: BrandVisual,
  noun: 'اسلاید' | 'فریم',
): QaCheck[] {
  const total = rendered.length;
  const label = (item: RenderedSlide): string =>
    `${noun} ${faNumber(rendered.indexOf(item) + 1)}: ${item.slide.title.slice(0, 60)}`;
  const overflowed = rendered.filter((item) => item.measure.overflow.length > 0);
  const outside = rendered.filter((item) => item.measure.outside.length > 0);
  const small = rendered.filter((item) => item.measure.minFont < MIN_FONT_PX);
  const shrunk = rendered.filter((item) => item.scale < 1);
  const noFont = rendered.filter((item) => !item.measure.fontApplied);
  return [
    check(
      'visual_slides',
      'error',
      total > 0,
      total > 0
        ? `${faNumber(total)} تصویر از متن ساخته شد.`
        : 'هیچ اسلایدی در متن پیدا نشد؛ ساختار «اسلاید ۱ (کاور): …»، «فریم ۱: …» یا «بخش ۱ — …:» لازم است.',
    ),
    check(
      'visual_overflow',
      'error',
      overflowed.length === 0,
      overflowed.length === 0 ? `متن همهٔ ${noun}ها در کادر جا شد.` : `متن در کادر جا نشد؛ کوتاه یا دو ${noun} شود.`,
      overflowed.map(label).join(' | '),
    ),
    check(
      'visual_safe_area',
      'error',
      outside.length === 0,
      outside.length === 0 ? 'متن در ناحیهٔ امن است.' : 'بخشی از متن بیرون از ناحیهٔ امن است.',
      outside.map((item) => `${label(item)} (${item.measure.outside.join('، ')})`).join(' | '),
    ),
    check(
      'visual_font',
      'error',
      noFont.length === 0,
      noFont.length === 0 ? 'فونت فارسی Vazirmatn روی همهٔ متن‌ها اعمال شد.' : 'فونت فارسی بارگیری یا اعمال نشد؛ متن با فونت جایگزین رندر شده است.',
      noFont.map(label).join(' | '),
    ),
    check(
      'visual_min_font',
      'warning',
      small.length === 0,
      small.length === 0 ? 'اندازهٔ متن خواناست.' : `متن کوچک‌تر از ${MIN_FONT_PX} پیکسل است.`,
    ),
    check(
      'visual_fit',
      'info',
      shrunk.length === 0,
      shrunk.length === 0 ? 'هیچ متنی کوچک نشد.' : `متن ${faNumber(shrunk.length)} ${noun} برای جاشدن کوچک شد؛ متن کوتاه‌تر خواناتر است.`,
    ),
    ...(format === 'carousel'
      ? [check('visual_slide_count', 'warning', total <= 20, total <= 20 ? 'تعداد اسلاید در سقف رایج کاروسل است.' : `کاروسل ${total} اسلاید دارد؛ پیش از انتشار سقف فعلی پلتفرم را بررسی کنید.`)]
      : []),
    ...contrastChecks(visual),
  ];
}
