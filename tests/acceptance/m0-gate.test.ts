/**
 * دروازهٔ پذیرش M0 (docs/implementation/README.md):
 * «هر قابلیت وضعیت و مدرک/عدم قطعیت دارد» + قراردادها و اسناد تولیدی با منبع هم‌خوان‌اند.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { CapabilityStatus, routes } from '@studio/contracts';
import { REPO_ROOT, loadCapabilityRegister, loadIndustryPacks } from '@studio/config';
import { renderAll } from '../../packages/contracts/scripts/generate.ts';
import { renderCapabilityRegister } from '../../config/scripts/render-capability-register.ts';

const read = (...parts: string[]): string => readFileSync(join(REPO_ROOT, ...parts), 'utf8');

describe('M0 — ثبت قابلیت‌ها', () => {
  const register = loadCapabilityRegister();
  const research = read('docs', 'research', 'README.md');

  it('هر قابلیت وضعیت معتبر و مدرک یا عدم قطعیت صریح دارد', () => {
    const statuses = new Set<string>(CapabilityStatus.options);
    for (const entry of register.entries) {
      const key = `${entry.provider}/${entry.route}/${entry.action}`;
      assert.ok(statuses.has(entry.status), `${key}: وضعیت نامعتبر`);
      const hasEvidence = entry.doc_evidence.source_ids.length > 0 && entry.doc_evidence.checked_at !== null;
      const hasUncertainty = entry.uncertainty_fa.trim().length >= 20;
      assert.ok(hasEvidence || hasUncertainty, `${key}: نه مدرک دارد نه عدم قطعیت`);
      assert.ok(entry.reason_code.length > 0, `${key}: دلیل وضعیت ندارد`);
      assert.ok(entry.fallback_fa.trim().length > 0, `${key}: مسیر جایگزین ندارد`);
    }
  });

  it('مدرک سند و مدرک حساب جدا هستند و هیچ قابلیتی بدون آزمون حساب verified نیست', () => {
    for (const entry of register.entries) {
      const key = `${entry.provider}/${entry.route}/${entry.action}`;
      if (entry.status === 'verified') {
        assert.equal(entry.account_evidence.verified, true, `${key}: verified بدون مدرک حساب`);
        assert.equal(entry.account_evidence.test_result, 'passed', `${key}: verified بدون آزمون موفق`);
        assert.ok(entry.account_evidence.tested_at, `${key}: verified بدون تاریخ آزمون`);
      }
      if (entry.account_evidence.verified) {
        assert.equal(entry.account_evidence.test_result, 'passed', `${key}: مدرک حساب بدون نتیجهٔ موفق`);
      }
      if (entry.route !== 'internal') {
        // در این مرحله هیچ حساب بیرونی متصل نشده است.
        assert.notEqual(entry.status, 'verified', `${key}: قابلیت بیرونی بدون اتصال واقعی verified شده است`);
      }
    }
  });

  it('شناسه‌های منبع به جدول پژوهش ارجاع معتبر دارند', () => {
    for (const entry of register.entries) {
      for (const id of entry.doc_evidence.source_ids) {
        assert.ok(research.includes(`| ${id} |`), `منبع ${id} در docs/research/README.md نیست`);
      }
      assert.equal(entry.doc_evidence.urls.length > 0, entry.doc_evidence.source_ids.length > 0);
    }
  });

  it('همهٔ ردیف‌های ماتریس قابلیت محصول پوشش داده شده‌اند', () => {
    const covered = new Set(register.entries.map((entry) => entry.provider));
    for (const provider of [
      'instagram', 'linkedin', 'telegram', 'whatsapp', 'wordpress', 'cms', 'canva', 'zernio', 'postiz',
      'tapsell', 'yektanet', 'virgool', 'google_search_console', 'ai', 'media', 'mcp',
    ]) {
      assert.ok(covered.has(provider), `ارائه‌دهندهٔ ${provider} در ثبت قابلیت‌ها نیست`);
    }
    const has = (provider: string, action: string): boolean =>
      register.entries.some((entry) => entry.provider === provider && entry.action === action);
    assert.ok(has('instagram', 'trial_reel_publish'));
    assert.ok(has('instagram', 'third_party_comment'));
    assert.ok(has('linkedin', 'dm_send'));
  });

  it('قابلیت‌های اثبات‌نشده هرگز خودکار نیستند: Trial و پیام لینکدین دستی‌اند', () => {
    const find = (provider: string, route: string, action: string) =>
      register.entries.find(
        (entry) => entry.provider === provider && entry.route === route && entry.action === action,
      );
    assert.equal(find('instagram', 'direct', 'trial_reel_publish')?.status, 'manual_only');
    assert.equal(find('linkedin', 'direct', 'dm_send')?.status, 'manual_only');
    assert.equal(find('linkedin', 'zernio', 'dm_send')?.status, 'unsupported');
    assert.equal(find('virgool', 'manual', 'article_publish')?.status, 'manual_only');
  });

  it('نمای خواندنی ثبت قابلیت‌ها با دادهٔ منبع هم‌خوان است', () => {
    assert.equal(read('docs', 'product', 'CAPABILITY-REGISTER.md'), renderCapabilityRegister(register));
  });
});

describe('M0 — قراردادها و اسناد تولیدی', () => {
  it('JSON Schema و OpenAPI تولیدشده با منبع zod هم‌خوان‌اند', () => {
    for (const [relative, content] of renderAll()) {
      const file = join(REPO_ROOT, 'packages', 'contracts', relative);
      assert.ok(existsSync(file), `${relative} تولید نشده است`);
      assert.equal(readFileSync(file, 'utf8'), content, `${relative} کهنه است؛ pnpm contracts:generate`);
    }
  });

  it('ده موجودیت مبادله schema دارند', () => {
    for (const name of [
      'BrandContext', 'ContentBrief', 'ContentRevision', 'PublicationTarget', 'ActionIntent', 'Approval',
      'Capability', 'ConnectorResult', 'FundingRequest', 'Event',
    ]) {
      assert.ok(existsSync(join(REPO_ROOT, 'packages', 'contracts', 'schema', `${name}.schema.json`)), name);
    }
  });

  it('همهٔ مسیرهای کسب‌وکار نسخه‌دار و زیر workspace/brand هستند', () => {
    for (const route of Object.values(routes)) {
      assert.ok(route.path.startsWith('/v1/'), `${route.id}: بدون نسخه`);
      if (route.scope === 'brand') {
        assert.ok(route.path.startsWith('/v1/workspaces/{workspace_id}/brands/{brand_id}'), route.id);
        assert.ok(route.min_role, `${route.id}: حداقل نقش ندارد`);
      }
      if (route.method !== 'GET' && route.scope !== 'public') {
        assert.ok(route.errors.includes('CSRF_FAILED'), `${route.id}: خطای CSRF اعلام نشده است`);
      }
    }
  });

  it('اسناد M0 موجودند', () => {
    for (const doc of [
      ['docs', 'architecture', 'ERD.md'],
      ['docs', 'architecture', 'THREAT-MODEL.md'],
      ['docs', 'implementation', 'DEPENDENCIES.md'],
      ['docs', 'implementation', 'M0.md'],
    ]) {
      assert.ok(existsSync(join(REPO_ROOT, ...doc)), doc.join('/'));
    }
  });
});

describe('M0 — بسته‌های صنعت', () => {
  const packs = loadIndustryPacks();

  it('چهار بستهٔ خواسته‌شده و یک بستهٔ عمومی بار می‌شوند', () => {
    for (const id of ['web-services', 'dental-loupes', 'language-school', 'crystal-decor', 'generic']) {
      assert.ok(packs.has(id), id);
    }
    assert.equal(packs.get('generic')?.is_generic, true);
  });

  it('هیچ pack راز یا credential ندارد', () => {
    for (const id of packs.keys()) {
      const raw = read('config', 'industry-packs', id, 'pack.json');
      assert.doesNotMatch(raw, /password|token|api[_-]?key|secret/i, `${id}: نشانهٔ راز در pack`);
    }
  });
});
