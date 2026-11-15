import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { PACKS_DIR, loadIndustryPacks, loadRuntimeConfig } from './index.ts';

describe('تنظیمات اجرا', () => {
  it('پیش‌فرض‌ها: local، دادهٔ نمونه روشن، بدون نیاز به هیچ کلید', () => {
    const config = loadRuntimeConfig({});
    assert.equal(config.profile, 'local');
    assert.equal(config.sampleData, true);
    assert.equal(config.apiHost, '127.0.0.1');
    assert.equal(config.secureCookies, false);
    assert.equal(config.databaseUrl, undefined);
    assert.ok(config.home.length > 0);
  });

  it('HTTPS کوکی Secure را روشن می‌کند و مقدار نامعتبر رد می‌شود', () => {
    assert.equal(loadRuntimeConfig({ STUDIO_PUBLIC_URL: 'https://studio.example.test/' }).secureCookies, true);
    assert.throws(() => loadRuntimeConfig({ STUDIO_API_PORT: 'abc' }));
    assert.throws(() => loadRuntimeConfig({ STUDIO_PROFILE: 'cloud' }));
    assert.throws(() => loadRuntimeConfig({ STUDIO_PROFILE: 'server' }), /STUDIO_DATABASE_URL/);
  });
});

describe('بسته‌های صنعت به‌عنوان داده', () => {
  it('A01 — صنعت تازه فقط با یک پوشه و pack.json اضافه می‌شود، بدون تغییر کد', () => {
    const dir = mkdtempSync(join(tmpdir(), 'studio-packs-'));
    try {
      cpSync(PACKS_DIR, dir, { recursive: true });
      const source = JSON.parse(readFileSync(join(dir, 'generic', 'pack.json'), 'utf8')) as Record<string, unknown>;
      cpSync(join(dir, 'generic'), join(dir, 'bakery'), { recursive: true });
      writeFileSync(
        join(dir, 'bakery', 'pack.json'),
        JSON.stringify({ ...source, id: 'bakery', name_fa: 'نانوایی و شیرینی', is_generic: false }),
      );
      const packs = loadIndustryPacks(dir);
      assert.equal(packs.size, loadIndustryPacks().size + 1);
      assert.equal(packs.get('bakery')?.name_fa, 'نانوایی و شیرینی');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('pack ناسازگار با پیام روشن رد می‌شود', () => {
    const dir = mkdtempSync(join(tmpdir(), 'studio-packs-'));
    try {
      cpSync(PACKS_DIR, dir, { recursive: true });
      const file = join(dir, 'generic', 'pack.json');
      const pack = JSON.parse(readFileSync(file, 'utf8')) as { default_cadence: { pillar: string }[] };
      (pack.default_cadence[0] as { pillar: string }).pillar = 'missing_pillar';
      writeFileSync(file, JSON.stringify(pack));
      assert.throws(() => loadIndustryPacks(dir), /missing_pillar/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
