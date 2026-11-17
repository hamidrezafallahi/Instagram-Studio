import type { BrandVisual } from '@studio/contracts';
import type { Slide, VisualFormat } from './slides.ts';

/**
 * قالب‌های HTML «دفترچهٔ مهندسی» (هویت بصری v1، tag v1-final: brand/visual-identity.md):
 * زمینهٔ روشن یا تیره، یک رنگ تأکید، تیتر بزرگ فارسی، خط‌های جداکننده، برچسب mono و شمارندهٔ اسلاید.
 * متن همیشه escape می‌شود و قالب هیچ اسکریپت یا منبع بیرونی ندارد.
 */

export interface FormatSpec {
  width: number;
  height: number;
  /** ناحیهٔ امن متن (پیکسل از لبه‌ها)؛ متن نباید از آن بیرون بزند. */
  safe: { top: number; bottom: number; left: number; right: number };
  /** نوار بالا و پایین (برچسب، شمارنده، نشانی صفحه). */
  bands: boolean;
}

export const FORMAT_SPECS: Record<VisualFormat, FormatSpec> = {
  carousel: { width: 1080, height: 1350, safe: { top: 120, bottom: 120, left: 96, right: 96 }, bands: true },
  post: { width: 1080, height: 1350, safe: { top: 120, bottom: 120, left: 96, right: 96 }, bands: true },
  // استوری: ۲۵۰ پیکسل بالا و ۳۴۰ پایین زیر رابط اینستاگرام می‌رود.
  story: { width: 1080, height: 1920, safe: { top: 250, bottom: 340, left: 64, right: 64 }, bands: false },
  // کاور ریلز: شبکهٔ پروفایل وسط 3:4 را نشان می‌دهد؛ تیتر در y ۳۰۰ تا ۱۶۰۰.
  reel: { width: 1080, height: 1920, safe: { top: 300, bottom: 320, left: 96, right: 96 }, bands: false },
};

/** قالب خنثی برای برندی که هویت بصری ثبت نکرده است. */
export const DEFAULT_VISUAL: BrandVisual = {
  colors: {
    ink: '#16181D',
    paper: '#F7F7F5',
    signal: '#2563EB',
    stone: '#55595F',
    mist: '#A3A8B0',
    hairline: '#DADCE0',
  },
};

export interface SlideContext {
  slide: Slide;
  index: number;
  total: number;
  /** شمارهٔ این اسلاید میان اسلایدهای بدنه (۱ به بعد). */
  bodyNumber: number;
  format: VisualFormat;
  visual: BrandVisual;
  dark: boolean;
  kicker: string | null;
  fontBase64: string;
  /** ضریب کوچک‌کردن متن برای جاشدن (۱ = اندازهٔ اصلی). */
  scale: number;
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** اندازهٔ پایهٔ متن‌ها (پیکسل) برای هر قالب؛ با scale کوچک می‌شوند ولی از کف پایین‌تر نمی‌روند. */
function sizes(format: VisualFormat, scale: number) {
  const tall = format === 'story' || format === 'reel';
  const s = (base: number, floor: number) => Math.max(floor, Math.round(base * scale));
  return {
    cover: s(tall ? 104 : 116, 56),
    title: s(tall ? 80 : 72, 44),
    body: s(tall ? 48 : 42, 28),
    numeral: s(96, 56),
    mono: 26,
    cta: s(tall ? 72 : 64, 40),
  };
}

export function slideHtml(ctx: SlideContext): string {
  const spec = FORMAT_SPECS[ctx.format];
  const { colors } = ctx.visual;
  const bg = ctx.dark ? colors.ink : colors.paper;
  const fg = ctx.dark ? colors.paper : colors.ink;
  const muted = ctx.dark ? colors.mist : colors.stone;
  const rule = ctx.dark ? '#2E3236' : colors.hairline;
  const ctaText = ctaTextColor(ctx.visual);
  const size = sizes(ctx.format, ctx.scale);
  const last = ctx.index === ctx.total - 1;
  const { slide } = ctx;

  // ناحیهٔ زنده: میان نوارها (یا ناحیهٔ امن در قالب‌های بلند).
  const liveTop = spec.bands ? 124 + 56 : spec.safe.top;
  const liveBottom = spec.bands ? spec.height - 1226 + 56 : spec.safe.bottom;

  let content: string;
  if (slide.role === 'cover') {
    content = `
      ${ctx.kicker && !spec.bands ? `<div class="kicker-lg" dir="ltr" data-text="kicker">${escapeHtml(ctx.kicker)}</div>` : ''}
      <h1 class="cover" data-text="title">${escapeHtml(slide.title)}<span class="cursor" aria-hidden="true"></span></h1>`;
  } else if (slide.role === 'cta') {
    content = `
      <div class="cta" data-text="cta">${escapeHtml(slide.title)}</div>
      ${ctx.visual.handle && !spec.bands ? `<div class="handle-lg" dir="ltr" data-text="handle">${escapeHtml(ctx.visual.handle)}</div>` : ''}`;
  } else {
    content = `
      <div class="numeral" dir="ltr" data-text="numeral">${pad2(ctx.bodyNumber)}</div>
      <h2 class="title" data-text="title">${escapeHtml(slide.title)}</h2>
      ${slide.body ? `<p class="body" data-text="body">${escapeHtml(slide.body)}</p>` : ''}`;
  }

  const bands = spec.bands
    ? `
    <div class="band top">
      <span class="mono" dir="ltr" data-text="kicker">${escapeHtml(ctx.kicker ?? '')}</span>
      ${ctx.total > 1 ? `<span class="mono" dir="ltr" data-text="counter">${pad2(ctx.index + 1)}/${pad2(ctx.total)}</span>` : ''}
    </div>
    <div class="rule" style="top:124px"></div>
    <div class="rule" style="top:1226px"></div>
    <div class="band bottom">
      <span class="mono" dir="ltr" data-text="handle">${escapeHtml(ctx.visual.handle ?? '')}</span>
      ${!last && ctx.total > 1 ? `<span class="swipe" data-text="swipe">${escapeHtml(ctx.visual.swipe_cue_fa ?? 'ورق بزنید ←')}</span>` : ''}
    </div>`
    : '';

  // در قالب‌های بلند (استوری، ریلز) همه وسط‌چین؛ در پست و کاروسل بدنه از بالای صفحه.
  const justify = slide.role === 'body' && spec.bands ? 'flex-start' : 'center';
  return `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8">
<style>
@font-face { font-family: 'Vazirmatn'; src: url(data:font/woff2;base64,${ctx.fontBase64}) format('woff2'); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${spec.width}px; height: ${spec.height}px; overflow: hidden; }
body { background: ${bg}; color: ${fg}; font-family: 'Vazirmatn', sans-serif; position: relative;
  font-feature-settings: 'ss01'; -webkit-font-smoothing: antialiased; }
.mono, .kicker-lg, .numeral, .handle-lg { font-family: 'JetBrains Mono', Consolas, 'DejaVu Sans Mono', monospace; }
.band { position: absolute; left: ${spec.safe.left}px; right: ${spec.safe.right}px; display: flex;
  justify-content: space-between; align-items: center; direction: ltr; color: ${muted}; font-size: ${size.mono}px; }
.band.top { top: 64px; height: 40px; }
.band.bottom { top: 1250px; height: 40px; }
.swipe { font-family: 'Vazirmatn'; direction: rtl; font-size: 28px; }
.rule { position: absolute; left: ${spec.safe.left}px; right: ${spec.safe.right}px; height: 2px; background: ${rule}; }
.live { position: absolute; top: ${liveTop}px; bottom: ${liveBottom}px; left: ${spec.safe.left}px; right: ${spec.safe.right}px;
  display: flex; flex-direction: column; justify-content: ${justify}; gap: 36px; overflow: hidden; }
.cover { font-weight: 900; font-size: ${size.cover}px; line-height: 1.25; text-wrap: balance; }
.cursor { display: inline-block; width: ${Math.round(size.cover * 0.14)}px; height: ${Math.round(size.cover * 0.62)}px;
  background: ${colors.signal}; margin-inline-start: ${Math.round(size.cover * 0.14)}px; vertical-align: -0.08em; }
.kicker-lg { color: ${colors.signal}; font-size: 30px; text-align: right; }
.numeral { color: ${colors.signal}; font-size: ${size.numeral}px; font-weight: 500; line-height: 1.3; text-align: right; }
.title { font-weight: 800; font-size: ${size.title}px; line-height: 1.3; text-wrap: balance; }
.body { font-weight: 400; font-size: ${size.body}px; line-height: 1.65; white-space: pre-line; color: ${fg}; }
.cta { align-self: stretch; background: ${colors.signal}; color: ${ctaText}; font-weight: 800; font-size: ${size.cta}px;
  line-height: 1.4; padding: 48px 56px; border-radius: 4px; text-wrap: balance; }
.handle-lg { color: ${muted}; font-size: 32px; text-align: center; }
</style></head>
<body>
  ${bands}
  <main class="live" data-fit="live">${content}
  </main>
</body></html>`;
}

/**
 * عبارت سنجش QA بصری که پس از بارگیری فونت در صفحه ارزیابی می‌شود:
 * سرریز ناحیهٔ زنده، خروج متن از ناحیهٔ امن (با کادر واقعی سطرها) و کوچک‌ترین اندازهٔ فونت.
 */
export function measureExpression(format: VisualFormat): string {
  const spec = FORMAT_SPECS[format];
  const safe = {
    top: spec.bands ? 56 : spec.safe.top,
    bottom: spec.height - (spec.bands ? 56 : spec.safe.bottom),
    left: spec.safe.left,
    right: spec.width - spec.safe.right,
  };
  return `(() => {
    const safe = ${JSON.stringify(safe)};
    const overflow = [];
    for (const el of document.querySelectorAll('[data-fit]')) {
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) overflow.push(el.dataset.fit);
    }
    const outside = [];
    let minFont = 1000;
    for (const el of document.querySelectorAll('[data-text]')) {
      if (!el.textContent.trim()) continue;
      minFont = Math.min(minFont, parseFloat(getComputedStyle(el).fontSize));
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const box of range.getClientRects()) {
        if (box.width < 1) continue;
        if (box.top < safe.top - 1 || box.bottom > safe.bottom + 1 || box.left < safe.left - 1 || box.right > safe.right + 1) {
          outside.push(el.dataset.text);
          break;
        }
      }
    }
    return { overflow, outside: [...new Set(outside)], minFont };
  })()`;
}

export interface Measure {
  overflow: string[];
  outside: string[];
  minFont: number;
}

/** رنگ متن دکمهٔ CTA: هر کدام از ink یا paper که روی رنگ تأکید کنتراست بیشتری دارد. */
export function ctaTextColor(visual: BrandVisual): string {
  const { ink, paper, signal } = visual.colors;
  return contrastRatio(ink, signal) >= contrastRatio(paper, signal) ? ink : paper;
}

/** نسبت کنتراست WCAG بین دو رنگ hex. */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string): number => {
    const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
    const [r, g, bl] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
