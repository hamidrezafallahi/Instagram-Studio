/**
 * شناسایی نوع فایل از روی محتوا (magic bytes)، نه پسوند یا Content-Type اعلام‌شده (A17).
 * فقط قالب‌های فهرست‌شده پذیرفته می‌شوند؛ SVG، HTML، اجرایی و هر نوع دیگر رد می‌شود.
 */

export type MediaFamily = 'image' | 'video' | 'audio' | 'font';

export interface SniffResult {
  mime: string;
  family: MediaFamily;
  ext: string;
  width: number | null;
  height: number | null;
}

/** سقف حجم هر خانواده (بایت). */
export const MAX_BYTES: Record<MediaFamily, number> = {
  image: 20 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  audio: 30 * 1024 * 1024,
  font: 5 * 1024 * 1024,
};

/** سقف ابعاد تصویر برای جلوگیری از «بمب تصویری» هنگام رندر. */
export const MAX_IMAGE_SIDE = 12_000;

const ascii = (buf: Buffer, start: number, end: number): string =>
  buf.length >= end ? buf.toString('latin1', start, end) : '';

function pngSize(buf: Buffer): [number, number] | null {
  if (buf.length < 24 || ascii(buf, 12, 16) !== 'IHDR') return null;
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

/** ابعاد JPEG از نخستین قطعهٔ SOF. */
function jpegSize(buf: Buffer): [number, number] | null {
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1] as number;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buf.readUInt16BE(offset + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return [buf.readUInt16BE(offset + 7), buf.readUInt16BE(offset + 5)];
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

function webpSize(buf: Buffer): [number, number] | null {
  const chunk = ascii(buf, 12, 16);
  if (chunk === 'VP8 ' && buf.length >= 30) {
    return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  }
  if (chunk === 'VP8L' && buf.length >= 25) {
    const bits = buf.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  if (chunk === 'VP8X' && buf.length >= 30) {
    return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  }
  return null;
}

const image = (mime: string, ext: string, size: [number, number] | null): SniffResult | null =>
  size ? { mime, family: 'image', ext, width: size[0], height: size[1] } : null;

const plain = (mime: string, family: MediaFamily, ext: string): SniffResult => ({
  mime,
  family,
  ext,
  width: null,
  height: null,
});

export function sniffMedia(buf: Buffer): SniffResult | null {
  if (buf.length < 12) return null;
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) {
    return image('image/png', 'png', pngSize(buf));
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return image('image/jpeg', 'jpg', jpegSize(buf));
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return image('image/webp', 'webp', webpSize(buf));
  if (ascii(buf, 4, 8) === 'ftyp') {
    const brand = ascii(buf, 8, 12);
    if (brand === 'M4A ') return plain('audio/mp4', 'audio', 'm4a');
    if (['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash'].includes(brand)) {
      return plain('video/mp4', 'video', 'mp4');
    }
    return null;
  }
  if (ascii(buf, 0, 3) === 'ID3' || (buf[0] === 0xff && ((buf[1] as number) & 0xe0) === 0xe0)) {
    return plain('audio/mpeg', 'audio', 'mp3');
  }
  if (ascii(buf, 0, 4) === 'wOF2') return plain('font/woff2', 'font', 'woff2');
  if (ascii(buf, 0, 4) === 'OTTO') return plain('font/otf', 'font', 'otf');
  if (buf.readUInt32BE(0) === 0x00010000 || ascii(buf, 0, 4) === 'true') return plain('font/ttf', 'font', 'ttf');
  return null;
}
