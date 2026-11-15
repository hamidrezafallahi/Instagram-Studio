/**
 * تولید JSON Schema و OpenAPI از منبع zod.
 *   node packages/contracts/scripts/generate.ts          → بازنویسی فایل‌ها
 *   node packages/contracts/scripts/generate.ts --check  → خطا اگر فایل‌ها با منبع هم‌خوان نباشند
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import {
  ActionIntent,
  ApiError,
  Approval,
  AuditEvent,
  AuthorityPolicy,
  BrandContext,
  BrandProfile,
  Capability,
  CapabilityRegister,
  ConnectorManifest,
  ConnectorResult,
  ContentBrief,
  ContentRevision,
  CostQuote,
  DomainEvent,
  FundingRequest,
  IndustryPack,
  PolicyDecision,
  PublicationTarget,
  buildEntitySchema,
  buildOpenApiDocument,
} from '../src/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const entities: Record<string, z.ZodType> = {
  // ده موجودیت مبادله
  BrandContext,
  ContentBrief,
  ContentRevision,
  PublicationTarget,
  ActionIntent,
  Approval,
  Capability,
  ConnectorResult,
  FundingRequest,
  Event: DomainEvent,
  // قراردادهای پشتیبان
  ApiError,
  AuditEvent,
  AuthorityPolicy,
  BrandProfile,
  CapabilityRegister,
  ConnectorManifest,
  CostQuote,
  IndustryPack,
  PolicyDecision,
};

export function renderAll(): Map<string, string> {
  const files = new Map<string, string>();
  const render = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
  for (const [name, schema] of Object.entries(entities)) {
    files.set(join('schema', `${name}.schema.json`), render(buildEntitySchema(schema)));
  }
  files.set(join('openapi', 'studio-v1.openapi.json'), render(buildOpenApiDocument()));
  return files;
}

function main(): void {
  const check = process.argv.includes('--check');
  const stale: string[] = [];
  for (const [relative, content] of renderAll()) {
    const target = join(root, relative);
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (current === content) continue;
    if (check) {
      stale.push(relative);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
    console.log(`نوشته شد: packages/contracts/${relative.replaceAll('\\', '/')}`);
  }
  if (check && stale.length > 0) {
    console.error(`فایل‌های تولیدی کهنه‌اند؛ pnpm contracts:generate را اجرا کنید:\n- ${stale.join('\n- ')}`);
    process.exitCode = 1;
  } else if (check) {
    console.log('فایل‌های تولیدی با منبع قرارداد هم‌خوان‌اند.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
