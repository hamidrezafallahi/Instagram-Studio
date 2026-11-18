/**
 * تبدیل متن پیش‌نویس به اسلاید/فریم برای رندر. قالب متن همان است که نویسنده (قالبی یا مدل) می‌سازد:
 *   اسلاید ۱ (کاور): …   |   اسلاید ۲ — تیتر:\nبدنه   |   اسلاید پایانی: …   |   کپشن:\n…
 * استوری همین ساختار را با «فریم» دارد؛ پست تک‌تصویری خط اول را تیتر می‌گیرد؛ ریلز فقط کاور دارد.
 * متن از ویرایش انسانی هم می‌آید، پس parser سخت‌گیر نیست و چیزی را حدس نمی‌زند: اسلایدی که پیدا نشود ساخته نمی‌شود.
 */

export type SlideRole = 'cover' | 'body' | 'cta';

export interface Slide {
  role: SlideRole;
  title: string;
  body: string | null;
}

export interface ParsedVisual {
  slides: Slide[];
  caption: string | null;
}

export type VisualFormat = 'carousel' | 'story' | 'post' | 'reel';

const DIGIT = '[0-9۰-۹٠-٩]';

/** حذف نشانه‌گذاری markdown ساده که مدل گاهی اضافه می‌کند. */
function clean(text: string, forImage = true): string {
  const base = text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    // فقط تیتر markdown («# » با فاصله)؛ هشتگ (#بدون_فاصله) دست نمی‌خورد.
    .replace(/^#+[ \t]+/gm, '')
    .replace(/[ \t]+\n/g, '\n');
  if (!forImage) return base.trim();
  return base
    // پیشنهاد استیکر (نظرسنجی، سؤال…) دستور تولید برای مالک است، نه متن روی تصویر؛ در متن پیش‌نویس می‌ماند.
    .replace(/\s*[(（]\s*(?:استیکر|sticker)[^)）]*[)）]/gi, '')
    // سطری که فقط هشتگ است متعلق به کپشن است، نه تصویر (استوری بخش «کپشن:» ندارد).
    .replace(/^[ \t]*(?:#[^\s#]+[ \t]*)+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitCaption(text: string): { body: string; caption: string | null } {
  const match = /^\s*کپشن\s*:\s*/m.exec(text);
  if (!match) return { body: text, caption: null };
  return { body: text.slice(0, match.index), caption: clean(text.slice(match.index + match[0].length), false) || null };
}

/** بخش‌بندی بر اساس «اسلاید …» یا «فریم …» در ابتدای خط. */
function parseSequence(text: string, keyword: 'اسلاید' | 'فریم'): Slide[] {
  const marker = new RegExp(`^\\s*${keyword}\\s+(${DIGIT}+|پایانی|آخر)\\s*(\\((?:کاور|جلد)\\))?\\s*([—–:\\-])?\\s*(.*)$`);
  const blocks: { id: string; cover: boolean; head: string; lines: string[] }[] = [];
  for (const line of text.split('\n')) {
    const match = marker.exec(line);
    if (match) {
      blocks.push({ id: match[1] as string, cover: Boolean(match[2]), head: (match[4] ?? '').trim(), lines: [] });
    } else if (blocks.length > 0) {
      (blocks[blocks.length - 1] as { lines: string[] }).lines.push(line);
    }
  }
  return blocks
    .map((block, index): Slide | null => {
      const last = block.id === 'پایانی' || block.id === 'آخر';
      const extra = clean(block.lines.join('\n'));
      if (block.cover || (index === 0 && !last)) {
        const title = clean([block.head, extra].filter(Boolean).join('\n'));
        return title ? { role: 'cover', title, body: null } : null;
      }
      if (last) {
        const title = clean([block.head, extra].filter(Boolean).join('\n'));
        return title ? { role: 'cta', title, body: null } : null;
      }
      // «تیتر:» در خط نشانه و بدنه در خط‌های بعد؛ یا «تیتر: بدنه» در یک خط.
      const colon = block.head.indexOf(':');
      const title = clean(colon === -1 ? block.head : block.head.slice(0, colon));
      const inline = colon === -1 ? '' : block.head.slice(colon + 1).trim();
      const body = clean([inline, extra].filter(Boolean).join('\n'));
      if (!title && !body) return null;
      return title ? { role: 'body', title, body: body || null } : { role: 'body', title: body, body: null };
    })
    .filter((slide): slide is Slide => slide !== null);
}

/** مقدار برچسب‌دار مثل «متن روی تصویر: …». */
function labelled(text: string, label: RegExp): string | null {
  for (const line of text.split('\n')) {
    const match = label.exec(line);
    if (match) {
      const value = clean(line.slice(match[0].length));
      if (value) return value;
    }
  }
  return null;
}

export function parseVisual(format: VisualFormat, text: string): ParsedVisual {
  const { body, caption } = splitCaption(text.replace(/\r\n/g, '\n'));
  switch (format) {
    case 'carousel':
      return { slides: parseSequence(body, 'اسلاید'), caption };
    case 'story':
      return { slides: parseSequence(body, 'فریم'), caption };
    case 'reel': {
      const title = labelled(body, /^\s*متن روی تصویر\s*:\s*/) ?? labelled(body, /^\s*قلاب[^:]*:\s*/);
      return { slides: title ? [{ role: 'cover', title, body: null }] : [], caption };
    }
    case 'post': {
      const first = clean(body).split('\n').find((line) => line.trim());
      return { slides: first ? [{ role: 'cover', title: first.trim(), body: null }] : [], caption };
    }
  }
}

/** یک فریم ویدئو با مدت نمایش (ثانیه). */
export interface TimedSlide extends Slide {
  duration_s: number;
}

export interface ReelScript {
  /** فریم‌های ویدئو به ترتیب: قلاب، بخش‌ها، جمع‌بندی. */
  frames: TimedSlide[];
  /** تیتر کاور (متن روی تصویر)؛ اگر نباشد همان قلاب. */
  cover_title: string | null;
  caption: string | null;
}

/** سرعت خواندن متن روی صفحه (کلمه بر ثانیه) و سقف/کف نمایش هر فریم. */
const WORDS_PER_SECOND = 2.6;
const MIN_FRAME_S = 2.5;
const MAX_FRAME_S = 8;

export function frameDuration(slide: Slide): number {
  const words = `${slide.title} ${slide.body ?? ''}`.trim().split(/\s+/).filter(Boolean).length;
  const seconds = words / WORDS_PER_SECOND + 1;
  return Math.round(Math.min(MAX_FRAME_S, Math.max(MIN_FRAME_S, seconds)) * 10) / 10;
}

/**
 * اسکریپت ریلز نویسنده: «قلاب (سه ثانیهٔ اول): …»، «بخش ۱ — تیتر:\nگفتار»، «جمع‌بندی و دعوت به اقدام: …»،
 * «متن روی تصویر: …» و «کپشن:». هر بخش یک فریم؛ متن فریم همان متنی است که زیرنویس هم می‌شود.
 */
export function parseReelScript(text: string): ReelScript {
  const { body, caption } = splitCaption(text.replace(/\r\n/g, '\n'));
  type Block = { kind: 'hook' | 'section' | 'cta' | 'overlay'; head: string; inline: string; lines: string[] };
  const blocks: Block[] = [];
  const section = new RegExp(String.raw`^\s*بخش\s+${DIGIT}+\s*(?:[—–\-]\s*([^:]*?))?\s*:\s*(.*)$`);
  for (const line of body.split('\n')) {
    let match: RegExpExecArray | null;
    if ((match = /^\s*قلاب[^:]*:\s*(.*)$/.exec(line))) {
      blocks.push({ kind: 'hook', head: '', inline: match[1] ?? '', lines: [] });
    } else if ((match = section.exec(line))) {
      blocks.push({ kind: 'section', head: match[1] ?? '', inline: match[2] ?? '', lines: [] });
    } else if ((match = /^\s*جمع[‌ ]?بندی[^:]*:\s*(.*)$/.exec(line))) {
      blocks.push({ kind: 'cta', head: '', inline: match[1] ?? '', lines: [] });
    } else if ((match = /^\s*متن روی تصویر\s*:\s*(.*)$/.exec(line))) {
      blocks.push({ kind: 'overlay', head: '', inline: match[1] ?? '', lines: [] });
    } else if (blocks.length > 0) {
      (blocks[blocks.length - 1] as Block).lines.push(line);
    }
  }
  const textOf = (block: Block): string => clean([block.inline, ...block.lines].join('\n'));
  const frames: TimedSlide[] = [];
  let cover: string | null = null;
  for (const block of blocks) {
    const value = textOf(block);
    if (block.kind === 'overlay') {
      cover = value || cover;
      continue;
    }
    let slide: Slide | null = null;
    if (block.kind === 'hook' && value) slide = { role: 'cover', title: value, body: null };
    if (block.kind === 'cta' && value) slide = { role: 'cta', title: value, body: null };
    if (block.kind === 'section') {
      const title = clean(block.head);
      if (title || value) slide = title ? { role: 'body', title, body: value || null } : { role: 'body', title: value, body: null };
    }
    if (slide) frames.push({ ...slide, duration_s: frameDuration(slide) });
  }
  const hook = frames.find((frame) => frame.role === 'cover')?.title ?? null;
  return { frames, cover_title: cover ?? hook, caption };
}

const pad = (value: number, size: number): string => String(value).padStart(size, '0');

function timestamp(seconds: number, separator: ',' | '.'): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}${separator}${pad(ms % 1000, 3)}`;
}

export interface Cue {
  start_s: number;
  end_s: number;
  text: string;
}

/** یک زیرنویس برای هر فریم، هم‌زمان با نمایش همان فریم. */
export function cuesFor(frames: readonly TimedSlide[]): Cue[] {
  const cues: Cue[] = [];
  let at = 0;
  for (const frame of frames) {
    const text = [frame.title, frame.body].filter(Boolean).join('\n');
    cues.push({ start_s: at, end_s: at + frame.duration_s, text });
    at += frame.duration_s;
  }
  return cues;
}

// نشانهٔ RLM در آغاز هر سطر تا پخش‌کننده‌ها نقطه و علامت پایان جملهٔ فارسی را درست بچینند.
const rtl = (text: string): string => text.split('\n').map((line) => `‏${line}`).join('\n');

export function toSrt(cues: readonly Cue[]): string {
  return cues
    .map((cue, index) => `${index + 1}\n${timestamp(cue.start_s, ',')} --> ${timestamp(cue.end_s, ',')}\n${rtl(cue.text)}\n`)
    .join('\n');
}

export function toVtt(cues: readonly Cue[]): string {
  return `WEBVTT\n\n${cues
    .map((cue) => `${timestamp(cue.start_s, '.')} --> ${timestamp(cue.end_s, '.')}\n${rtl(cue.text)}\n`)
    .join('\n')}`;
}
