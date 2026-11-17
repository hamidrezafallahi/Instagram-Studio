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
function clean(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    // فقط تیتر markdown («# » با فاصله)؛ هشتگ (#بدون_فاصله) دست نمی‌خورد.
    .replace(/^#+[ \t]+/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function splitCaption(text: string): { body: string; caption: string | null } {
  const match = /^\s*کپشن\s*:\s*/m.exec(text);
  if (!match) return { body: text, caption: null };
  return { body: text.slice(0, match.index), caption: clean(text.slice(match.index + match[0].length)) || null };
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
