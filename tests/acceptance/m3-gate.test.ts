/**
 * دروازهٔ M3 — A22 (متن و ویدئوی فارسی: خوانایی، نیم‌فاصله، فونت و زیرنویس).
 * بقیهٔ سناریوهای M3 در فایل‌های جدا: A04/A07/A17 در m3-assets، رندر در m3-render، ویدئو در m3-video،
 * بستهٔ دستی در m3-package. این فایل فقط آنچه آن‌ها نمی‌سنجند را می‌سنجد:
 * فونت فارسی واقعاً اعمال شده و نبودش بی‌صدا pass نمی‌شود؛ نیم‌فاصله و رقم فارسی در زیرنویس حفظ می‌شود.
 * محیط: Chrome نصب‌شدهٔ همین دستگاه؛ بدون پایگاه داده و شبکه.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { REPO_ROOT } from '@studio/config';
import {
  DEFAULT_VISUAL,
  HtmlRenderer,
  cuesFor,
  findBrowser,
  loadVazirmatn,
  parseReelScript,
  renderVisual,
  toSrt,
  toVtt,
} from '@studio/media';

const TEXT = [
  'اسلاید ۱ (کاور): چرا کسب‌وکارها سایت می‌خواهند؟',
  'اسلاید ۲ — نیم‌فاصله:\nمی‌شود، کسب‌وکار، سایت‌ها و ۱۴۰۵ با رقم فارسی.',
  'اسلاید پایانی: «بررسی» را دایرکت کنید.',
].join('\n\n');

let renderer: HtmlRenderer;

before(async () => {
  const path = findBrowser();
  assert.ok(path, 'Chrome یا Edge نصب نیست.');
  renderer = await HtmlRenderer.launch(path);
});
after(async () => {
  await renderer?.close();
});

describe('A22 — فونت و نگارش فارسی', () => {
  it('با Vazirmatn همهٔ چک‌های بصری، از جمله اعمال فونت، pass است', async () => {
    const result = await renderVisual(renderer, {
      format: 'carousel', text: TEXT, pillar: 'process', visual: DEFAULT_VISUAL, fontBase64: loadVazirmatn(REPO_ROOT),
    });
    const font = result.checks.find((check) => check.id === 'visual_font');
    assert.equal(font?.passed, true, font?.message_fa ?? 'چک visual_font نیست');
    assert.ok(result.slides.every((slide) => slide.measure.fontApplied));
    assert.deepEqual(result.checks.filter((check) => !check.passed && check.severity === 'error'), []);
  });

  it('فونت خراب بی‌صدا pass نمی‌شود: یا رندر شکست می‌خورد یا visual_font ناموفق است', async () => {
    const broken = Buffer.from('not a font at all').toString('base64');
    let outcome: 'threw' | 'failed_check' | 'passed';
    try {
      const result = await renderVisual(renderer, {
        format: 'carousel', text: TEXT, pillar: 'process', visual: DEFAULT_VISUAL, fontBase64: broken,
      });
      outcome = result.checks.find((check) => check.id === 'visual_font')?.passed ? 'passed' : 'failed_check';
    } catch {
      outcome = 'threw';
    }
    assert.notEqual(outcome, 'passed');
  });

  it('زیرنویس نیم‌فاصله، رقم فارسی و گیومه را دست‌نخورده نگه می‌دارد', () => {
    const script = parseReelScript('قلاب: کسب‌وکار شما\n\nبخش ۱ — سال ۱۴۰۵:\nسایت‌ها «سریع‌تر» می‌شوند.\n\nجمع‌بندی: پیام بدهید.');
    const cues = cuesFor(script.frames);
    for (const output of [toSrt(cues), toVtt(cues)]) {
      assert.ok(output.includes('کسب‌وکار'), 'نیم‌فاصله');
      assert.ok(output.includes('۱۴۰۵'), 'رقم فارسی');
      assert.ok(output.includes('«سریع‌تر»'), 'گیومه و نیم‌فاصله');
      assert.ok(!/[كي]/.test(output), 'ک و ی عربی نیست');
    }
  });
});
