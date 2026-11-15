/**
 * حذف راز از log و خروجی (AGENTS.md: «secrets در prompt، log، fixture، repository و گزارش ممنوع»).
 * دو لایه:
 *  ۱) کلیدهای حساس (password، token، secret، cookie و مانند آن) همیشه پوشانده می‌شوند؛
 *  ۲) مقدار رازهای زنده که در SecretScrubber ثبت شده‌اند از هر رشته‌ای پاک می‌شود (آزمون canary).
 */

const SENSITIVE_KEY = /pass(word|wd)?|secret|token|authorization|cookie|api[-_]?key|credential|csrf|master[-_]?key|private[-_]?key|session/i;
/** کلیدهایی که با وجود شباهت نام، راز نیستند. */
const SAFE_KEYS = new Set(['secret_ref', 'has_secret', 'session_id', 'idempotency_key', 'token_count']);
export const REDACTED = '[REDACTED]';

export class SecretScrubber {
  readonly #values = new Set<string>();

  /** رازهای کوتاه‌تر از ۶ نویسه ثبت نمی‌شوند تا متن عادی خراب نشود. */
  register(value: string | null | undefined): void {
    if (value && value.length >= 6) this.#values.add(value);
  }

  forget(value: string): void {
    this.#values.delete(value);
  }

  scrub(text: string): string {
    let out = text;
    for (const value of this.#values) {
      if (out.includes(value)) out = out.split(value).join(REDACTED);
    }
    return out;
  }
}

/** scrubber سراسری فرایند؛ vault هر رازی را که باز می‌کند این‌جا ثبت می‌کند. */
export const processScrubber = new SecretScrubber();

export function redact(value: unknown, scrubber: SecretScrubber = processScrubber, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return scrubber.scrub(value);
  if (typeof value !== 'object') return value;
  if (depth > 8) return '[TRUNCATED]';
  if (value instanceof Error) {
    return { name: value.name, message: scrubber.scrub(value.message) };
  }
  if (Buffer.isBuffer(value)) return `[BINARY ${value.length}]`;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redact(item, scrubber, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) && !SAFE_KEYS.has(key) ? REDACTED : redact(item, scrubber, depth + 1);
  }
  return out;
}
