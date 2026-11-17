import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cuesFor, frameDuration, parseReelScript, slideshowArgs, toSrt, toVtt, videoChecks } from './index.ts';

const SCRIPT = [
  'قلاب (سه ثانیهٔ اول): سه اشتباه رایج',
  'بخش ۱ — صفحهٔ کند:\nکاربر قبل از دیدن قیمت می‌رود.',
  'بخش 2 - خرید طولانی: هر مرحلهٔ اضافه یک جای منصرف‌شدن است.',
  'جمع‌بندی و دعوت به اقدام: در دایرکت «بررسی» بفرستید.',
  'متن روی تصویر: سه اشتباه فروشگاه',
  'کپشن:\nسه اشتباه.\n#فروشگاه_اینترنتی',
].join('\n\n');

describe('اسکریپت ریلز', () => {
  it('قلاب، بخش‌ها و جمع‌بندی فریم می‌شوند؛ «متن روی تصویر» کاور است', () => {
    const script = parseReelScript(SCRIPT);
    assert.deepEqual(script.frames.map((frame) => [frame.role, frame.title, frame.body]), [
      ['cover', 'سه اشتباه رایج', null],
      ['body', 'صفحهٔ کند', 'کاربر قبل از دیدن قیمت می‌رود.'],
      ['body', 'خرید طولانی', 'هر مرحلهٔ اضافه یک جای منصرف‌شدن است.'],
      ['cta', 'در دایرکت «بررسی» بفرستید.', null],
    ]);
    assert.equal(script.cover_title, 'سه اشتباه فروشگاه');
    assert.equal(script.caption, 'سه اشتباه.\n#فروشگاه_اینترنتی');
  });

  it('مدت فریم از طول متن، با کف و سقف', () => {
    assert.equal(frameDuration({ role: 'cover', title: 'کوتاه', body: null }), 2.5);
    assert.equal(frameDuration({ role: 'body', title: 'تیتر', body: Array(60).fill('کلمه').join(' ') }), 8);
  });

  it('زیرنویس SRT و VTT هم‌زمان با فریم‌ها و با نشانهٔ راست‌به‌چپ', () => {
    const cues = cuesFor(parseReelScript(SCRIPT).frames);
    assert.equal(cues.length, 4);
    assert.equal(cues[1]?.start_s, cues[0]?.end_s);
    const srt = toSrt(cues);
    assert.match(srt, /^1\n00:00:00,000 --> 00:00:0\d,\d{3}\n‏سه اشتباه رایج\n/);
    assert.ok(srt.includes('‏صفحهٔ کند\n‏کاربر قبل از دیدن قیمت می‌رود.'));
    const vtt = toVtt(cues);
    assert.ok(vtt.startsWith('WEBVTT\n\n00:00:00.000 --> '));
  });
});

describe('FFmpeg', () => {
  it('گذارها مدت کل را تغییر نمی‌دهند: offset هر گذار = مجموع مدت فریم‌های قبلی', () => {
    const args = slideshowArgs(['a.png', 'b.png', 'c.png'], [3, 4, 5], 'out.mp4');
    const filter = args[args.indexOf('-filter_complex') + 1] as string;
    assert.ok(filter.includes('xfade=transition=fade:duration=0.4:offset=3.000'));
    assert.ok(filter.includes('xfade=transition=fade:duration=0.4:offset=7.000'));
    assert.equal(args[args.indexOf('-t', args.indexOf('-c:a')) + 1], '12.000');
    assert.ok(args.includes('+bitexact'));
    // هر کلیپ جز آخری ۰٫۴ ثانیه بلندتر است.
    assert.deepEqual(args.filter((_, i) => args[i - 1] === '-t').slice(0, 3), ['3.400', '4.400', '5.000']);
  });

  it('یک فریم بدون xfade', () => {
    const args = slideshowArgs(['a.png'], [3], 'out.mp4');
    assert.ok(!(args[args.indexOf('-filter_complex') + 1] as string).includes('xfade'));
  });

  it('QA فنی از روی خود فایل', () => {
    const good = { duration_ms: 12_000, width: 1080, height: 1920, video_codec: 'h264', pix_fmt: 'yuv420p', fps: 30, audio_codec: 'aac' };
    const ok = videoChecks(good, { width: 1080, height: 1920, duration_s: 12, cues: 3, frames: 3 });
    assert.ok(ok.every((check) => check.passed), JSON.stringify(ok));
    const bad = videoChecks({ ...good, width: 720, audio_codec: null, duration_ms: 3000 }, { width: 1080, height: 1920, duration_s: 12, cues: 2, frames: 3 });
    assert.deepEqual(bad.filter((check) => !check.passed).map((check) => check.id).sort(), [
      'video_audio', 'video_duration', 'video_format', 'video_length_range', 'video_subtitles',
    ]);
  });
});
