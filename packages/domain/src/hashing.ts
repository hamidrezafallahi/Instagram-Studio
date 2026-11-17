import { createHash } from 'node:crypto';
import type { BrandProfile, Claim, SourceRef } from '@studio/contracts';

/** JSON قطعی: کلیدها مرتب، بدون فاصله؛ برای هشی که به ترتیب کلیدها وابسته نباشد. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function hashObject(value: unknown): string {
  return sha256(canonicalJson(value));
}

/**
 * هش نسخهٔ محتوا: متن، دارایی‌ها، منابع و ادعاها.
 * تأیید انسانی به همین هش بسته می‌شود؛ هر تغییر در این موارد هش و در نتیجه تأیید را عوض می‌کند (ADR-005).
 */
export function hashContentRevision(input: {
  text: string;
  asset_ids: readonly string[];
  source_refs: readonly SourceRef[];
  claims: readonly Claim[];
}): string {
  return hashObject({
    text: input.text,
    // ترتیب دارایی‌ها (مثلاً اسلایدهای کاروسل) بخشی از محتواست؛ جابه‌جایی هم تأیید را باطل می‌کند.
    asset_ids: [...input.asset_ids],
    source_refs: input.source_refs,
    claims: input.claims,
  });
}

export function hashBrandProfile(profile: BrandProfile): string {
  return hashObject(profile);
}
