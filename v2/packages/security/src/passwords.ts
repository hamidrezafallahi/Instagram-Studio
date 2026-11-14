import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * هش رمز با argon2id داخلی Node (بدون وابستگی بومی).
 * پارامترها مطابق کمینهٔ توصیه‌شدهٔ OWASP: حافظهٔ ۱۹ مگابایت، ۲ گذر، ۱ رشته.
 * خروجی در قالب PHC ذخیره می‌شود تا پارامترها بعداً قابل ارتقا باشند.
 */

interface Argon2Params {
  memory: number;
  passes: number;
  parallelism: number;
}

const CURRENT: Argon2Params = { memory: 19_456, passes: 2, parallelism: 1 };
const TAG_LENGTH = 32;
const SALT_LENGTH = 16;

function derive(password: string, salt: Buffer, params: Argon2Params, tagLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      'argon2id',
      {
        message: Buffer.from(password, 'utf8'),
        nonce: salt,
        parallelism: params.parallelism,
        tagLength,
        memory: params.memory,
        passes: params.passes,
      },
      (error, tag) => (error ? reject(error) : resolve(Buffer.from(tag))),
    );
  });
}

const b64 = (buffer: Buffer): string => buffer.toString('base64').replace(/=+$/, '');

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const tag = await derive(password, salt, CURRENT, TAG_LENGTH);
  return `$argon2id$v=19$m=${CURRENT.memory},t=${CURRENT.passes},p=${CURRENT.parallelism}$${b64(salt)}$${b64(tag)}`;
}

function parse(phc: string): { params: Argon2Params; salt: Buffer; tag: Buffer } | null {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(phc);
  if (!match) return null;
  return {
    params: { memory: Number(match[1]), passes: Number(match[2]), parallelism: Number(match[3]) },
    salt: Buffer.from(match[4] as string, 'base64'),
    tag: Buffer.from(match[5] as string, 'base64'),
  };
}

export async function verifyPassword(password: string, phc: string): Promise<boolean> {
  const parsed = parse(phc);
  if (!parsed) return false;
  const candidate = await derive(password, parsed.salt, parsed.params, parsed.tag.length);
  return candidate.length === parsed.tag.length && timingSafeEqual(candidate, parsed.tag);
}

/** اگر پارامترهای ذخیره‌شده ضعیف‌تر از پارامتر فعلی باشد، در ورود موفق بعدی دوباره هش می‌شود. */
export function needsRehash(phc: string): boolean {
  const parsed = parse(phc);
  if (!parsed) return true;
  return (
    parsed.params.memory < CURRENT.memory ||
    parsed.params.passes < CURRENT.passes ||
    parsed.params.parallelism !== CURRENT.parallelism
  );
}

/**
 * هش ساختگی برای یکسان‌کردن زمان پاسخ وقتی کاربر وجود ندارد
 * (جلوگیری از افشای وجود حساب با اختلاف زمان).
 */
let dummy: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(24).toString('hex'));
  return dummy;
}
