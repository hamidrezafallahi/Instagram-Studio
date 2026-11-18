import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_VISUAL, contrastChecks, contrastRatio, parseVisual, slideHtml } from '../index.ts';

describe('parseVisual', () => {
  it('کاروسل نویسندهٔ قالبی: کاور، اسلایدهای بدنه، پایانی و کپشن', () => {
    const text = [
      'اسلاید ۱ (کاور): چرا سایت کند است؟',
      'اسلاید ۲ — تصویرها:\nتصویرها را فشرده کنید.',
      'اسلاید ۳ — کد اضافه:\nکتابخانهٔ بی‌استفاده را حذف کنید.\nخط دوم.',
      'اسلاید پایانی: در دایرکت «سرعت» بفرستید.',
      'کپشن:\nسه دلیل کندی سایت.\n#طراحی_سایت',
    ].join('\n\n');
    const parsed = parseVisual('carousel', text);
    assert.deepEqual(parsed.slides, [
      { role: 'cover', title: 'چرا سایت کند است؟', body: null },
      { role: 'body', title: 'تصویرها', body: 'تصویرها را فشرده کنید.' },
      { role: 'body', title: 'کد اضافه', body: 'کتابخانهٔ بی‌استفاده را حذف کنید.\nخط دوم.' },
      { role: 'cta', title: 'در دایرکت «سرعت» بفرستید.', body: null },
    ]);
    assert.equal(parsed.caption, 'سه دلیل کندی سایت.\n#طراحی_سایت');
  });

  it('خروجی مدل: رقم لاتین، خط تیره، تیتر و بدنه در یک خط و ** markdown', () => {
    const text = 'اسلاید 1 (کاور): **قلاب**\nاسلاید 2 - تیتر: بدنهٔ کوتاه\nاسلاید 3 – فقط تیتر\nاسلاید آخر: دعوت';
    const { slides } = parseVisual('carousel', text);
    assert.deepEqual(slides.map((slide) => [slide.role, slide.title, slide.body]), [
      ['cover', 'قلاب', null],
      ['body', 'تیتر', 'بدنهٔ کوتاه'],
      ['body', 'فقط تیتر', null],
      ['cta', 'دعوت', null],
    ]);
  });

  it('استوری با «فریم»، پست با خط اول، ریلز با «متن روی تصویر»', () => {
    assert.equal(parseVisual('story', 'فریم ۱: سؤال؟\n\nفریم ۲ — نکته:\nبدنه\n\nفریم پایانی: پاسخ بدهید').slides.length, 3);
    assert.deepEqual(parseVisual('post', 'تیتر پست\n\nکپشن:\nمتن').slides, [{ role: 'cover', title: 'تیتر پست', body: null }]);
    const reel = parseVisual('reel', 'قلاب (سه ثانیهٔ اول): قلاب\n\nمتن روی تصویر: تیتر کاور\n\nکپشن:\nک');
    assert.equal(reel.slides[0]?.title, 'تیتر کاور');
  });

  it('پیشنهاد استیکر روی تصویر نمی‌آید', () => {
    const { slides } = parseVisual('story', 'فریم ۱: آیا پرداخت ساده است؟ (استیکر نظرسنجی: بله / خیر)\n\nفریم پایانی: پیام بدهید');
    assert.equal(slides[0]?.title, 'آیا پرداخت ساده است؟');
  });

  it('سطر هشتگ (بدون بخش کپشن) روی تصویر نمی‌آید؛ هشتگ درون جمله می‌ماند', () => {
    const { slides } = parseVisual('story', 'فریم ۱: سؤال\n\nفریم پایانی: پیام بدهید.\n#طراحی_سایت #سرعت_سایت');
    assert.equal(slides[1]?.title, 'پیام بدهید.');
    const inline = parseVisual('post', 'برچسب #سئو در جمله\n\nکپشن:\n#a');
    assert.equal(inline.slides[0]?.title, 'برچسب #سئو در جمله');
  });

  it('متن بی‌ساختار اسلاید حدسی نمی‌سازد', () => {
    assert.deepEqual(parseVisual('carousel', 'یک پاراگراف آزاد بدون اسلاید.').slides, []);
  });
});

describe('قالب و کنتراست', () => {
  it('متن escape می‌شود و قالب هیچ اسکریپت یا منبع بیرونی ندارد', () => {
    const html = slideHtml({
      slide: { role: 'body', title: '<script>alert(1)</script>', body: '<img src=x onerror=1>' },
      index: 1, total: 3, bodyNumber: 1, format: 'carousel', visual: DEFAULT_VISUAL, dark: false,
      kicker: '"><b>', fontBase64: 'AAAA', scale: 1,
    });
    assert.ok(!html.includes('<script'));
    assert.ok(!html.includes('<img'));
    assert.ok(!/https?:\/\//.test(html));
  });

  it('کنتراست پالت v1 همان مقدار سند هویت بصری است و از چک عبور می‌کند', () => {
    assert.equal(contrastRatio('#111315', '#F4F1EA').toFixed(2), '16.51');
    const v1 = { colors: { ink: '#111315', paper: '#F4F1EA', signal: '#F2542D', stone: '#5E5A54', mist: '#A8A39A', hairline: '#D8D2C6' } };
    assert.equal(contrastChecks(v1)[0]?.passed, true);
    const bad = { colors: { ...v1.colors, stone: '#CCCCCC' } };
    assert.equal(contrastChecks(bad)[0]?.passed, false);
  });
});
