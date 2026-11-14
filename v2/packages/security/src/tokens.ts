import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** نشانهٔ تصادفی غیرقابل‌حدس (نشست، CSRF، کد یک‌بارمصرف). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/** مقایسهٔ زمان‌ثابت دو رشته. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
