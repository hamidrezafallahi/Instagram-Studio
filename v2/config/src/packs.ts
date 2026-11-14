import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CapabilityRegister,
  IndustryPack,
  type IndustryPackSummary,
} from '@studio/contracts';
import { REPO_ROOT } from './runtime.ts';

export const PACKS_DIR = join(REPO_ROOT, 'config', 'industry-packs');
export const CAPABILITY_REGISTER_FILE = join(REPO_ROOT, 'config', 'capability-register.json');

function describeIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  return issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`).join('; ');
}

/** درستی ارجاع‌های داخلی pack: ستون هر آیتم cadence باید وجود داشته باشد و قالب آن مجاز باشد. */
function checkPackIntegrity(pack: IndustryPack, file: string): void {
  const pillars = new Map(pack.content_pillars.map((pillar) => [pillar.id, pillar]));
  if (pillars.size !== pack.content_pillars.length) {
    throw new Error(`${file}: شناسهٔ ستون محتوایی تکراری است.`);
  }
  for (const slot of pack.default_cadence) {
    const pillar = pillars.get(slot.pillar);
    if (!pillar) throw new Error(`${file}: ستون «${slot.pillar}» در default_cadence تعریف نشده است.`);
    if (!pillar.formats.includes(slot.format)) {
      throw new Error(`${file}: قالب ${slot.format} برای ستون «${slot.pillar}» مجاز نیست.`);
    }
    if (!pack.default_channels.includes(slot.channel)) {
      throw new Error(`${file}: کانال ${slot.channel} در default_channels نیست.`);
    }
  }
  const keys = [...pack.required_fields, ...pack.faq_fields].map((field) => field.key);
  if (new Set(keys).size !== keys.length) throw new Error(`${file}: کلید فیلد تکراری است.`);
  for (const pillar of pack.content_pillars) {
    for (const key of pillar.source_fields) {
      if (!keys.includes(key)) {
        throw new Error(`${file}: فیلد «${key}» در source_fields ستون «${pillar.id}» تعریف نشده است.`);
      }
    }
  }
}

/**
 * همهٔ بسته‌های صنعت را از config/industry-packs/<id>/pack.json می‌خواند و اعتبارسنجی می‌کند.
 * افزودن صنعت تازه فقط یک پوشه و یک pack.json است؛ هیچ کدی تغییر نمی‌کند.
 */
export function loadIndustryPacks(dir: string = PACKS_DIR): Map<string, IndustryPack> {
  const packs = new Map<string, IndustryPack>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(dir, entry.name, 'pack.json');
    if (!existsSync(file)) continue;
    const parsed = IndustryPack.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (!parsed.success) throw new Error(`${file}: ${describeIssues(parsed.error.issues)}`);
    if (parsed.data.id !== entry.name) {
      throw new Error(`${file}: شناسهٔ pack («${parsed.data.id}») باید با نام پوشه یکی باشد.`);
    }
    checkPackIntegrity(parsed.data, file);
    packs.set(parsed.data.id, parsed.data);
  }
  if (![...packs.values()].some((pack) => pack.is_generic)) {
    throw new Error('دست‌کم یک بستهٔ عمومی (is_generic) برای برندهای بدون صنعت آماده لازم است.');
  }
  return packs;
}

export function summarizePack(pack: IndustryPack): IndustryPackSummary {
  return {
    id: pack.id,
    version: pack.version,
    name_fa: pack.name_fa,
    description_fa: pack.description_fa,
    is_generic: pack.is_generic,
    disclaimer_fa: pack.disclaimer_fa,
  };
}

/** ثبت قابلیت‌ها (خروجی M0). هر ردیف وضعیت و مدرک یا عدم قطعیت صریح دارد. */
export function loadCapabilityRegister(file: string = CAPABILITY_REGISTER_FILE): CapabilityRegister {
  const parsed = CapabilityRegister.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) throw new Error(`${file}: ${describeIssues(parsed.error.issues)}`);
  const seen = new Set<string>();
  for (const entry of parsed.data.entries) {
    const key = `${entry.provider}/${entry.route}/${entry.action}`;
    if (seen.has(key)) throw new Error(`${file}: ردیف تکراری ${key}`);
    seen.add(key);
  }
  return parsed.data;
}
