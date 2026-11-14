/**
 * نمای خواندنی ثبت قابلیت‌ها را از config/capability-register.json می‌سازد.
 *   node config/scripts/render-capability-register.ts          → بازنویسی docs/product/CAPABILITY-REGISTER.md
 *   node config/scripts/render-capability-register.ts --check  → خطا در صورت ناهم‌خوانی
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CapabilityRegister, CapabilityStatus } from '@studio/contracts';
import { REPO_ROOT, loadCapabilityRegister } from '../src/index.ts';

const TARGET = join(REPO_ROOT, 'docs', 'product', 'CAPABILITY-REGISTER.md');

const STATUS_FA: Record<CapabilityStatus, string> = {
  verified: 'verified (آزموده)',
  needs_access: 'needs_access (نیاز به دسترسی)',
  manual_only: 'manual_only (فقط دستی)',
  unsupported: 'unsupported (پشتیبانی نمی‌شود)',
  unverified: 'unverified (اثبات‌نشده)',
  degraded: 'degraded (ناقص)',
};

export function renderCapabilityRegister(register: CapabilityRegister): string {
  const lines: string[] = [];
  const counts = new Map<string, number>();
  for (const entry of register.entries) counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1);

  lines.push('# ثبت قابلیت‌ها (Capability Register)');
  lines.push('');
  lines.push(
    'این فایل از `config/capability-register.json` تولید می‌شود؛ دستی ویرایش نکنید ' +
      '(`node config/scripts/render-capability-register.ts`).',
  );
  lines.push(`تاریخ بررسی منابع: ${register.checked_at} | منبع: ${register.generated_from}`);
  lines.push('');
  lines.push(
    'مدرک سند (doc) و مدرک حساب (account) جدا هستند: پشتیبانی در سند به معنی آزمون روی حساب مالک نیست. ' +
      'تا وقتی آزمون واقعی حساب با رسید ثبت نشده، هیچ قابلیت بیرونی `verified` نمی‌شود و در داشبورد علامت سبز نمی‌گیرد.',
  );
  lines.push('');
  lines.push('## خلاصهٔ وضعیت');
  lines.push('');
  lines.push('| وضعیت | تعداد |');
  lines.push('|---|---|');
  for (const [status, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${STATUS_FA[status as CapabilityStatus]} | ${count} |`);
  }
  lines.push('');

  const providers = [...new Set(register.entries.map((entry) => entry.provider))];
  for (const provider of providers) {
    lines.push(`## ${provider}`);
    lines.push('');
    lines.push('| قابلیت | مسیر | وضعیت | دلیل | سند | حساب | هزینه | جایگزین | مرحله |');
    lines.push('|---|---|---|---|---|---|---|---|---|');
    for (const entry of register.entries.filter((item) => item.provider === provider)) {
      const doc =
        entry.doc_evidence.source_ids.length > 0
          ? `${entry.doc_evidence.supported} (${entry.doc_evidence.source_ids.join('، ')})`
          : `${entry.doc_evidence.supported} (بدون منبع)`;
      const account = entry.account_evidence.verified
        ? `آزموده ${entry.account_evidence.tested_at ?? ''}`
        : entry.account_evidence.test_result;
      lines.push(
        `| ${entry.title_fa} (\`${entry.action}\`) | ${entry.route} | ${entry.status} | ${entry.reason_code} | ` +
          `${doc} | ${account} | ${entry.cost_model} | ${entry.fallback_fa} | ${entry.milestone} |`,
      );
    }
    lines.push('');
    lines.push('عدم قطعیت‌ها:');
    for (const entry of register.entries.filter((item) => item.provider === provider)) {
      lines.push(`- \`${entry.route}/${entry.action}\`: ${entry.uncertainty_fa}`);
    }
    lines.push('');
  }
  lines.push(
    `بازبینی بعدی همهٔ ردیف‌های بیرونی: ${register.entries[0]?.next_review ?? '-'}. ` +
      'شناسه‌های S01 تا S21 به جدول docs/research/README.md ارجاع می‌دهند.',
  );
  lines.push('');
  return lines.join('\n');
}

function main(): void {
  const content = renderCapabilityRegister(loadCapabilityRegister());
  const current = existsSync(TARGET) ? readFileSync(TARGET, 'utf8') : null;
  if (process.argv.includes('--check')) {
    if (current !== content) {
      console.error('docs/product/CAPABILITY-REGISTER.md کهنه است؛ اسکریپت را بدون --check اجرا کنید.');
      process.exitCode = 1;
    } else {
      console.log('CAPABILITY-REGISTER.md با ثبت قابلیت‌ها هم‌خوان است.');
    }
    return;
  }
  if (current !== content) writeFileSync(TARGET, content, 'utf8');
  console.log('نوشته شد: docs/product/CAPABILITY-REGISTER.md');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
