/**
 * پذیرش M1 — راه‌اندازی مالک، نشست و A01 (چهار برند و برند پنجم سفارشی).
 * محیط: API درون‌فرایندی + PostgreSQL واقعی + کانکتور نمونه. گواه اتصال واقعی به هیچ سرویسی نیست.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { ApiError, BrandDetail, BrandProfile } from '@studio/contracts';
import pg from 'pg';
import { OWNER, PUBLIC_URL, createHarness, newKey, type Harness, type TestClient } from '../support/harness.ts';

let harness: Harness;
let owner: TestClient;

before(async () => {
  harness = await createHarness();
});
after(async () => {
  await harness.close();
});

function fillProfile(profile: BrandProfile, title: string): BrandProfile {
  return {
    ...profile,
    offers: [{ id: 'main', title, kind: 'service', description: `${title} — توضیح آزمون.` }],
    audience: { summary: `مخاطبان ${title}`, segments: ['گروه یک'] },
  };
}

describe('راه‌اندازی مالک و نشست', () => {
  it('پیش از راه‌اندازی هیچ مسیری بدون نشست باز نیست', async () => {
    const client = harness.client();
    const status = await client.ok('setupStatus');
    assert.equal(status.needs_owner_setup, true);
    assert.equal(status.profile, 'local');
    const error = await client.fail('session', 'UNAUTHENTICATED');
    assert.ok(error.trace_id.length > 10);
    assert.equal(error.retryable, false);
    await client.fail('listPacks', 'UNAUTHENTICATED');
  });

  it('رمز کوتاه با مسیر دقیق خطا رد می‌شود', async () => {
    const error = await harness.client().fail('setupOwner', 'VALIDATION_FAILED', {
      body: { ...OWNER, password: 'short' },
    });
    assert.ok(error.details?.some((detail) => detail.path === 'body.password'));
  });

  it('حساب مالک یک‌بار ساخته می‌شود و کوکی نشست HttpOnly و SameSite=Strict است', async () => {
    const client = harness.client();
    const result = await client.call('setupOwner', { body: OWNER });
    assert.equal(result.status, 201);
    const cookie = String(result.headers['set-cookie']);
    assert.match(cookie, /studio_session=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.equal(result.raw.includes(OWNER.password), false);
    assert.equal((await client.ok('setupStatus')).needs_owner_setup, false);
    await harness.client().fail('setupOwner', 'SETUP_ALREADY_COMPLETED', {
      body: { ...OWNER, email: 'second@example.test' },
    });
    owner = await harness.owner();
    assert.equal(owner.session?.workspaces[0]?.role, 'owner');
  });

  it('رمز با argon2id هش و نشانهٔ نشست فقط به‌صورت هش ذخیره می‌شود', async () => {
    const db = new pg.Client({ connectionString: harness.database.ownerUrl });
    await db.connect();
    try {
      const users = await db.query<{ password_hash: string }>('SELECT password_hash FROM users');
      assert.match(users.rows[0]?.password_hash ?? '', /^\$argon2id\$/);
      const token = owner.cookie?.split('=')[1] ?? '';
      const sessions = await db.query<{ token_hash: string }>('SELECT token_hash FROM sessions');
      assert.ok(sessions.rows.length >= 1);
      assert.ok(sessions.rows.every((row) => row.token_hash !== token && /^[0-9a-f]{64}$/.test(row.token_hash)));
    } finally {
      await db.end();
    }
  });

  it('ورود نادرست پیام یکسان می‌دهد و وجود حساب را لو نمی‌دهد', async () => {
    const wrong = await harness.client().fail('login', 'UNAUTHENTICATED', {
      body: { email: OWNER.email, password: 'wrong-password-123' },
    });
    const unknown = await harness.client().fail('login', 'UNAUTHENTICATED', {
      body: { email: 'nobody@example.test', password: 'wrong-password-123' },
    });
    assert.equal(wrong.message_fa, unknown.message_fa);
  });

  it('پس از پنج تلاش ناموفق حساب موقتاً قفل می‌شود و با گذشت زمان باز می‌شود', async () => {
    const client = harness.client();
    // ورود موفق شمارندهٔ تلاش ناموفق را صفر می‌کند.
    await client.ok('login', { body: { email: OWNER.email, password: OWNER.password } });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await client.fail('login', 'UNAUTHENTICATED', { body: { email: OWNER.email, password: 'bad-password-000' } });
    }
    await client.fail('login', 'RATE_LIMITED', { body: { email: OWNER.email, password: OWNER.password } });
    harness.clock.now = new Date(harness.clock.now.getTime() + 16 * 60_000);
    await client.ok('login', { body: { email: OWNER.email, password: OWNER.password } });
  });

  it('درخواست تغییردهنده بدون نشانهٔ CSRF یا از مبدأ دیگر رد می‌شود', async () => {
    const body = { name: 'نباید ساخته شود', industry_pack_id: 'generic' };
    const params = { workspace_id: owner.workspaceId };
    await owner.fail('createBrand', 'CSRF_FAILED', { params, body, headers: { 'x-csrf-token': 'wrong' } });
    await owner.fail('createBrand', 'CSRF_FAILED', { params, body, headers: { origin: 'https://evil.example' } });
    await owner.fail('createBrand', 'CSRF_FAILED', { params, body, headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal((await owner.ok('listBrands', { params })).items.length, 0);
    // مبدأ loopback دیگر همان نصب محلی پذیرفته می‌شود.
    assert.equal(PUBLIC_URL, 'http://localhost:4300');
    await owner.ok('createBrand', {
      params,
      body: { name: 'موقت', industry_pack_id: 'generic' },
      headers: { origin: 'http://127.0.0.1:4300' },
    });
  });

  it('خروج نشست را در سرور باطل می‌کند', async () => {
    const client = await harness.owner();
    const cookie = client.cookie as string;
    await client.ok('logout');
    assert.equal(client.cookie, null);
    await client.fail('session', 'UNAUTHENTICATED', { headers: { cookie } });
  });

  it('خطاها قالب یکسان دارند و جزئیات داخلی را فاش نمی‌کنند', async () => {
    const missing = await owner.request('GET', '/v1/no-such-route');
    assert.equal(missing.status, 404);
    assert.equal((JSON.parse(missing.raw) as ApiError).error.code, 'NOT_FOUND');
    const badJson = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { 'content-type': 'application/json', origin: PUBLIC_URL },
      payload: '{not json',
    });
    assert.equal(badJson.statusCode, 400);
    const error = (JSON.parse(badJson.payload) as ApiError).error;
    assert.equal(error.code, 'VALIDATION_FAILED');
    assert.equal(/stack|at \w+ \(|SELECT|node_modules/.test(badJson.payload), false);
    const malformed = await owner.fail('getBrand', 'VALIDATION_FAILED', {
      params: { workspace_id: owner.workspaceId, brand_id: 'not-a-uuid' },
    });
    assert.ok(malformed.details?.some((detail) => detail.path === 'params.brand_id'));
  });

  it('پاسخ‌ها cache نمی‌شوند و سلامت سرویس قابل پرسش است', async () => {
    const response = await owner.request('GET', '/v1/auth/session');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal((await owner.request('GET', '/healthz')).status, 200);
    assert.equal((await owner.request('GET', '/readyz')).status, 200);
  });
});

describe('A01 — چهار برند و برند پنجم سفارشی، بدون تغییر کد', () => {
  const brands: Record<string, BrandDetail> = {};
  const specs = [
    ['web', 'استودیو طراحی آزمون', 'web-services'],
    ['loupe', 'فروش لوپ آزمون', 'dental-loupes'],
    ['school', 'آموزشگاه زبان آزمون', 'language-school'],
    ['crystal', 'کریستال آزمون', 'crystal-decor'],
    ['fifth', 'قنادی آزمون (برند پنجم)', 'generic'],
  ] as const;

  it('پنج بستهٔ صنعت در دسترس است و هر برند از دادهٔ pack ساخته می‌شود', async () => {
    const packs = await owner.ok('listPacks');
    assert.equal(packs.items.length, 5);
    assert.equal(packs.items.filter((pack) => pack.is_generic).length, 1);
    for (const [key, name, pack] of specs) {
      const created = await owner.ok('createBrand', {
        params: { workspace_id: owner.workspaceId },
        body: { name, industry_pack_id: pack },
      });
      brands[key] = created;
      assert.equal(created.brand.industry_pack.id, pack);
      assert.equal(created.brand.current_revision, 1);
      assert.equal(created.brand.is_sample, false);
      assert.equal(created.brand.timezone, 'Asia/Tehran');
      assert.equal(created.brand.readiness.draft_ready, false);
      assert.deepEqual(created.profile.cadence, created.pack.default_cadence);
      const policy = await owner.ok('getPolicy', { params: owner.brand(created.brand.id) });
      assert.equal(policy.authority.mode, 'draft_only');
      assert.equal(policy.authority.spend_mode, 'free_only');
    }
  });

  it('نام تکراری و بستهٔ ناشناخته رد می‌شود', async () => {
    const params = { workspace_id: owner.workspaceId };
    await owner.fail('createBrand', 'CONFLICT', { params, body: { name: 'کریستال آزمون', industry_pack_id: 'generic' } });
    await owner.fail('createBrand', 'VALIDATION_FAILED', { params, body: { name: 'تازه', industry_pack_id: 'no-such-pack' } });
  });

  it('تنظیمات نسخه‌دار است: ذخیره، ناهم‌خوانی نسخه، ذخیرهٔ بی‌تغییر و rollback', async () => {
    const brand = brands['web'] as BrandDetail;
    const params = owner.brand(brand.brand.id);
    const next = fillProfile(brand.profile, 'طراحی سایت');
    const saved = await owner.ok('updateBrandProfile', { params, body: { expected_revision: 1, profile: next } });
    assert.equal(saved.brand.current_revision, 2);
    assert.equal(saved.brand.readiness.draft_ready, true);
    // نویسندهٔ دوم با نسخهٔ قدیمی نمی‌تواند تغییر اول را بی‌صدا پاک کند.
    await owner.fail('updateBrandProfile', 'STALE_REVISION', { params, body: { expected_revision: 1, profile: brand.profile } });
    const same = await owner.ok('updateBrandProfile', { params, body: { expected_revision: 2, profile: next } });
    assert.equal(same.brand.current_revision, 2, 'ذخیرهٔ بی‌تغییر نباید نسخهٔ تازه بسازد');
    const rolled = await owner.ok('rollbackBrand', { params, body: { expected_revision: 2, target_revision: 1 } });
    assert.equal(rolled.brand.current_revision, 3);
    assert.deepEqual(rolled.profile, brand.profile);
    const history = await owner.ok('listBrandRevisions', { params });
    assert.deepEqual(history.items.map((item) => item.revision), [3, 2, 1]);
    assert.ok(history.items[0]?.note?.includes('بازگشت'));
    brands['web'] = await owner.ok('updateBrandProfile', { params, body: { expected_revision: 3, profile: next } });
  });

  it('سند ناسازگار با بستهٔ صنعت ذخیره نمی‌شود', async () => {
    const brand = brands['loupe'] as BrandDetail;
    const broken = structuredClone(brand.profile);
    broken.cadence.push({ weekday: 'friday', channel: 'instagram', format: 'post', pillar: 'no_such_pillar', time: '10:00' });
    const error = await owner.fail('updateBrandProfile', 'VALIDATION_FAILED', {
      params: owner.brand(brand.brand.id),
      body: { expected_revision: 1, profile: broken },
    });
    assert.ok(error.details?.some((detail) => detail.path.includes('cadence')));
  });

  it('داده، اتصال و تقویم هر برند مستقل است', async () => {
    const web = brands['web'] as BrandDetail;
    const fifth = brands['fifth'] as BrandDetail;
    const fifthParams = owner.brand(fifth.brand.id);
    brands['fifth'] = await owner.ok('updateBrandProfile', {
      params: fifthParams,
      body: { expected_revision: 1, profile: fillProfile(fifth.profile, 'شیرینی سفارشی') },
    });

    await owner.ok('createConnection', {
      params: owner.brand(web.brand.id),
      body: { provider: 'fake', config: { scenario: 'happy', channel: 'instagram' } },
    });
    assert.equal((await owner.ok('listConnections', { params: owner.brand(web.brand.id) })).items.length, 1);
    assert.equal((await owner.ok('listConnections', { params: fifthParams })).items.length, 0);

    for (const brand of [web, fifth]) {
      const run = await owner.ok('createRun', {
        params: owner.brand(brand.brand.id),
        body: { intent: 'build_weekly_plan', idempotency_key: newKey(), params: { week_of: '2026-11-11' } },
      });
      assert.equal(run.status, 'succeeded', JSON.stringify(run.error));
    }
    const webPlans = await owner.ok('listPlans', { params: owner.brand(web.brand.id), query: { week_of: '2026-11-11' } });
    const fifthPlans = await owner.ok('listPlans', { params: fifthParams, query: { week_of: '2026-11-11' } });
    const otherPlans = await owner.ok('listPlans', { params: owner.brand((brands['school'] as BrandDetail).brand.id) });
    assert.ok((webPlans.items[0]?.entries.length ?? 0) > 0);
    assert.ok((fifthPlans.items[0]?.entries.length ?? 0) > 0, 'برند پنجم با بستهٔ عمومی هم برنامه می‌گیرد');
    assert.equal(otherPlans.items.length, 0);
    assert.notDeepEqual(
      webPlans.items[0]?.entries.map((entry) => entry.pillar),
      fifthPlans.items[0]?.entries.map((entry) => entry.pillar),
    );
    assert.ok(webPlans.items[0]?.entries.every((entry) => entry.brand_id === web.brand.id));
  });

  it('ویرایش یک برند قالب صنعت و برندهای دیگر را تغییر نمی‌دهد', async () => {
    const web = brands['web'] as BrandDetail;
    const changed = structuredClone(web.profile);
    changed.cadence = changed.cadence.slice(0, 2);
    await owner.ok('updateBrandProfile', {
      params: owner.brand(web.brand.id),
      body: { expected_revision: web.brand.current_revision, profile: changed },
    });
    const sibling = await owner.ok('createBrand', {
      params: { workspace_id: owner.workspaceId },
      body: { name: 'استودیوی دوم', industry_pack_id: 'web-services' },
    });
    assert.equal(sibling.profile.cadence.length, sibling.pack.default_cadence.length);
    assert.ok(sibling.profile.cadence.length > 2);
  });

  it('برند بدون اطلاعات ضروری اجرا نمی‌شود و دلیل روشن می‌گیرد', async () => {
    const run = await owner.ok('createRun', {
      params: owner.brand((brands['crystal'] as BrandDetail).brand.id),
      body: { intent: 'build_weekly_plan', idempotency_key: newKey() },
    });
    assert.equal(run.status, 'failed');
    assert.equal(run.error?.code, 'BRAND_NOT_READY');
    assert.ok(run.error?.message_fa.includes('مخاطب'));
    assert.deepEqual(run.steps.map((step) => step.status), ['failed', 'skipped', 'skipped']);
  });

  it('آرشیو یک برند فقط همان برند را متوقف می‌کند و نمای کل مالک برندهای فعال را نشان می‌دهد', async () => {
    const crystal = brands['crystal'] as BrandDetail;
    const archived = await owner.ok('setBrandStatus', { params: owner.brand(crystal.brand.id), body: { status: 'archived' } });
    assert.equal(archived.status, 'archived');
    const denied = await owner.fail('createRun', 'POLICY_DENIED', {
      params: owner.brand(crystal.brand.id),
      body: { intent: 'build_weekly_plan', idempotency_key: newKey() },
    });
    assert.ok(denied.message_fa.includes('آرشیو'));
    const overview = await owner.ok('workspaceOverview', { params: { workspace_id: owner.workspaceId } });
    assert.equal(overview.brands.some((item) => item.brand.id === crystal.brand.id), false);
    const web = overview.brands.find((item) => item.brand.id === (brands['web'] as BrandDetail).brand.id);
    assert.ok((web?.counts.entries_this_week ?? 0) > 0);
    assert.equal(web?.counts.connections_total, 1);
    assert.equal(web?.authority_mode, 'draft_only');
    assert.deepEqual(overview.spend.totals, []);
    const all = await owner.ok('listBrands', { params: { workspace_id: owner.workspaceId } });
    assert.ok(all.items.length >= 6);
  });
});
