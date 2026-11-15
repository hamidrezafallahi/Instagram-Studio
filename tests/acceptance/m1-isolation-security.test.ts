/**
 * پذیرش M1 — جداسازی و امنیت: A07 (تعویض برند بدون نشت)، درخواست غیرعضو، راز canary،
 * اتصال‌ها بدون موفقیت ساختگی (پیش‌نیاز A12 و A13) و سیاست اختیار پیش‌فرض.
 * محیط: API درون‌فرایندی + PostgreSQL واقعی + کانکتور نمونه.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { BrandDetail, BrandProfile } from '@studio/contracts';
import { hashPassword } from '@studio/security';
import pg from 'pg';
import { createHarness, newKey, type Harness, type TestClient } from '../support/harness.ts';

let harness: Harness;
let owner: TestClient;
let db: pg.Client;
let brandA: BrandDetail;
let brandB: BrandDetail;
const CANARY = `canary-${randomUUID()}-do-not-leak`;
const OUTSIDER = { email: 'outsider@example.test', password: 'outsider-password-123' };
const outsider = { userId: randomUUID(), workspaceId: randomUUID() };

const ready = (profile: BrandProfile, title: string): BrandProfile => ({
  ...profile,
  offers: [{ id: 'main', title, kind: 'service', description: 'توضیح آزمون.' }],
  audience: { summary: 'مخاطب آزمون', segments: [] },
});

async function createBrand(name: string, pack: string): Promise<BrandDetail> {
  const created = await owner.ok('createBrand', {
    params: { workspace_id: owner.workspaceId },
    body: { name, industry_pack_id: pack },
  });
  return owner.ok('updateBrandProfile', {
    params: owner.brand(created.brand.id),
    body: { expected_revision: 1, profile: ready(created.profile, name) },
  });
}

before(async () => {
  harness = await createHarness();
  owner = await harness.owner();
  db = new pg.Client({ connectionString: harness.database.ownerUrl });
  await db.connect();
  brandA = await createBrand('برند الف', 'web-services');
  brandB = await createBrand('برند ب', 'generic');
  // کاربر دوم با فضای کاری خودش؛ مستقیماً در پایگاه داده ساخته می‌شود چون نسخهٔ اول دعوت کاربر ندارد.
  await db.query('INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4)', [
    outsider.userId, OUTSIDER.email, 'بیگانه', await hashPassword(OUTSIDER.password),
  ]);
  await db.query('INSERT INTO workspaces (id, name) VALUES ($1, $2)', [outsider.workspaceId, 'فضای بیگانه']);
  await db.query("INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [
    outsider.workspaceId, outsider.userId,
  ]);
});
after(async () => {
  await db.end();
  await harness.close();
});

describe('A07 — تعویض برند بدون نشت داده', () => {
  let contentA: string;
  let entryA: string;
  let runA: string;
  let connectionA: string;

  it('دادهٔ برند الف ساخته می‌شود', async () => {
    const plan = await owner.ok('createRun', {
      params: owner.brand(brandA.brand.id),
      body: { intent: 'build_weekly_plan', idempotency_key: newKey(), params: { week_of: '2026-11-11' } },
    });
    runA = plan.id;
    const drafts = await owner.ok('createRun', {
      params: owner.brand(brandA.brand.id),
      body: { intent: 'generate_drafts', idempotency_key: newKey(), params: { week_of: '2026-11-11' } },
    });
    contentA = drafts.result?.content_ids[0] as string;
    const plans = await owner.ok('listPlans', { params: owner.brand(brandA.brand.id) });
    entryA = plans.items[0]?.entries[0]?.id as string;
    const connection = await owner.ok('createConnection', {
      params: owner.brand(brandA.brand.id),
      body: { provider: 'fake', secret: CANARY, config: { scenario: 'happy', channel: 'instagram' } },
    });
    connectionA = connection.id;
    assert.ok(contentA && entryA && runA && connectionA);
  });

  it('شناسه‌های برند الف از مسیر برند ب «پیدا نشد» می‌گیرند', async () => {
    const b = owner.brand(brandB.brand.id);
    await owner.fail('getContent', 'NOT_FOUND', { params: { ...b, content_id: contentA } });
    await owner.fail('createContentRevision', 'NOT_FOUND', {
      params: { ...b, content_id: contentA },
      body: { expected_revision: 1, text: 'نفوذ' },
    });
    await owner.fail('updateScheduleEntry', 'NOT_FOUND', {
      params: { ...b, entry_id: entryA },
      body: { expected_version: 1, topic_fa: 'نفوذ' },
    });
    await owner.fail('getRun', 'NOT_FOUND', { params: { ...b, run_id: runA } });
    await owner.fail('testConnection', 'NOT_FOUND', { params: { ...b, connection_id: connectionA } });
    await owner.fail('revokeConnection', 'NOT_FOUND', { params: { ...b, connection_id: connectionA } });
    // تولید پیش‌نویس برای آیتم برند دیگر: هیچ محتوایی ساخته نمی‌شود.
    const cross = await owner.ok('createRun', {
      params: b,
      body: { intent: 'generate_drafts', idempotency_key: newKey(), params: { week_of: '2026-11-11', schedule_entry_ids: [entryA] } },
    });
    assert.deepEqual(cross.result?.content_ids ?? [], []);
  });

  it('فهرست‌های برند ب هیچ دادهٔ برند الف را ندارند', async () => {
    const b = owner.brand(brandB.brand.id);
    assert.deepEqual((await owner.ok('listContent', { params: b })).items, []);
    assert.deepEqual((await owner.ok('listPlans', { params: b })).items, []);
    assert.deepEqual((await owner.ok('listConnections', { params: b })).items, []);
    const runs = await owner.ok('listRuns', { params: b });
    assert.ok(runs.items.every((run) => run.brand_id === brandB.brand.id));
    const audit = await owner.ok('listAuditEvents', { params: b, query: { limit: 200 } });
    assert.ok(audit.items.every((event) => event.brand_id === brandB.brand.id));
    const report = await owner.ok('weeklyReport', { params: b, query: { week_of: '2026-11-11' } });
    assert.equal(report.work.drafts_created, 0);
    assert.equal(report.brand_name, 'برند ب');
    const profileB = await owner.ok('getBrand', { params: b });
    assert.equal(JSON.stringify(profileB).includes('برند الف'), false);
  });
});

describe('درخواست غیرعضو و نقش محدود', () => {
  let stranger: TestClient;

  it('کاربر فضای کاری دیگر هیچ‌چیز از این فضای کاری نمی‌بیند', async () => {
    stranger = harness.client();
    await stranger.ok('login', { body: OUTSIDER });
    assert.deepEqual(stranger.session?.workspaces.map((item) => item.id), [outsider.workspaceId]);
    const foreign = { workspace_id: owner.workspaceId };
    await stranger.fail('listBrands', 'NOT_FOUND', { params: foreign });
    await stranger.fail('workspaceOverview', 'NOT_FOUND', { params: foreign });
    await stranger.fail('getBrand', 'NOT_FOUND', { params: { ...foreign, brand_id: brandA.brand.id } });
    await stranger.fail('createRun', 'NOT_FOUND', {
      params: { ...foreign, brand_id: brandA.brand.id },
      body: { intent: 'build_weekly_plan', idempotency_key: newKey() },
    });
    // برند دیگران از مسیر فضای کاری خودش هم دیده نمی‌شود.
    await stranger.fail('getBrand', 'NOT_FOUND', {
      params: { workspace_id: outsider.workspaceId, brand_id: brandA.brand.id },
    });
    assert.deepEqual((await stranger.ok('listBrands', { params: { workspace_id: outsider.workspaceId } })).items, []);
    await owner.fail('listBrands', 'NOT_FOUND', { params: { workspace_id: randomUUID() } });
  });

  it('بیننده فقط برند مجاز خودش را می‌بیند و نمی‌تواند چیزی اجرا یا ویرایش کند', async () => {
    await db.query("INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'viewer')", [
      owner.workspaceId, outsider.userId,
    ]);
    await db.query(
      "INSERT INTO brand_memberships (workspace_id, brand_id, user_id, role) VALUES ($1, $2, $3, 'viewer')",
      [owner.workspaceId, brandA.brand.id, outsider.userId],
    );
    const a = { workspace_id: owner.workspaceId, brand_id: brandA.brand.id };
    assert.equal((await stranger.ok('getBrand', { params: a })).brand.name, 'برند الف');
    assert.ok((await stranger.ok('listContent', { params: a })).items.length > 0);
    await stranger.fail('getBrand', 'NOT_FOUND', { params: { ...a, brand_id: brandB.brand.id } });
    await stranger.fail('createRun', 'FORBIDDEN', {
      params: a,
      body: { intent: 'build_weekly_plan', idempotency_key: newKey() },
    });
    await stranger.fail('updatePolicy', 'FORBIDDEN', { params: a, body: { expected_revision: 1, paused: true } });
    await stranger.fail('listAuditEvents', 'FORBIDDEN', { params: a });
    await stranger.fail('createBrand', 'FORBIDDEN', {
      params: { workspace_id: owner.workspaceId },
      body: { name: 'نفوذ', industry_pack_id: 'generic' },
    });
  });
});

describe('راز اتصال (canary)', () => {
  it('راز پس از ذخیره هرگز بازنمایی نمی‌شود و فقط ارجاع آن نگه داشته می‌شود', async () => {
    const connections = await owner.ok('listConnections', { params: owner.brand(brandA.brand.id) });
    const connection = connections.items[0];
    assert.equal(connection?.has_secret, true);
    assert.equal(JSON.stringify(connections).includes(CANARY), false);
    const tested = await owner.call('testConnection', {
      params: { ...owner.brand(brandA.brand.id), connection_id: connection?.id as string },
    });
    assert.equal(tested.raw.includes(CANARY), false);

    const rows = await db.query<{ secret_ref: string; config: unknown }>('SELECT secret_ref, config FROM connections');
    assert.match(rows.rows[0]?.secret_ref ?? '', /^secret:\/\/vault\/[0-9a-f-]{36}$/);
    const vault = await db.query<{ ciphertext: Buffer; wrapped_key: Buffer }>('SELECT ciphertext, wrapped_key FROM secret_vault');
    assert.equal(vault.rows.length, 1);
    assert.equal(vault.rows[0]?.ciphertext.includes(Buffer.from(CANARY)), false, 'راز در پایگاه داده رمز نشده است');
  });

  it('راز در log، audit و هیچ جدول متنی نشت نمی‌کند', async () => {
    assert.equal(harness.logs.join('\n').includes(CANARY), false, 'راز در log نشت کرد');
    const audit = await db.query<{ metadata: unknown }>('SELECT metadata FROM audit_events');
    assert.equal(JSON.stringify(audit.rows).includes(CANARY), false);
    const dump = await db.query<{ doc: string }>(
      `SELECT row_to_json(c)::text AS doc FROM connections c
       UNION ALL SELECT row_to_json(r)::text FROM workflow_runs r
       UNION ALL SELECT row_to_json(s)::text FROM workflow_steps s`,
    );
    assert.equal(dump.rows.some((row) => row.doc.includes(CANARY)), false);
  });

  it('قطع اتصال راز را نابود می‌کند و فقط همان اتصال متوقف می‌شود', async () => {
    const other = await owner.ok('createConnection', {
      params: owner.brand(brandB.brand.id),
      body: { provider: 'fake', config: { scenario: 'happy' } },
    });
    const list = await owner.ok('listConnections', { params: owner.brand(brandA.brand.id) });
    const revoked = await owner.ok('revokeConnection', {
      params: { ...owner.brand(brandA.brand.id), connection_id: list.items[0]?.id as string },
    });
    assert.equal(revoked.status, 'revoked');
    assert.equal(revoked.has_secret, false);
    assert.deepEqual(revoked.capabilities, []);
    const vault = await db.query<{ ciphertext: Buffer; destroyed_at: Date | null }>('SELECT ciphertext, destroyed_at FROM secret_vault');
    assert.equal(vault.rows[0]?.ciphertext.length, 0);
    assert.ok(vault.rows[0]?.destroyed_at);
    await owner.fail('testConnection', 'CONFLICT', {
      params: { ...owner.brand(brandA.brand.id), connection_id: revoked.id },
    });
    const still = await owner.ok('listConnections', { params: owner.brand(brandB.brand.id) });
    assert.equal(still.items.find((item) => item.id === other.id)?.status, 'active');
  });
});

describe('اتصال‌ها بدون موفقیت ساختگی', () => {
  it('A13 — دسترسی منقضی فقط همان اتصال را متوقف می‌کند و علامت سالم نمی‌گیرد', async () => {
    const expired = await owner.ok('createConnection', {
      params: owner.brand(brandA.brand.id),
      body: { provider: 'fake', label: 'اتصال منقضی', config: { scenario: 'auth_expired' } },
    });
    assert.equal(expired.status, 'needs_access');
    assert.equal(expired.health?.ok, false);
    assert.equal(expired.health?.error_code, 'AUTH_EXPIRED');
    assert.equal(expired.capabilities.some((item) => item.status === 'verified'), false);
    const others = await owner.ok('listConnections', { params: owner.brand(brandB.brand.id) });
    assert.ok(others.items.every((item) => item.status === 'active'));

    // سنجه فقط از اتصال دارای قابلیت آزموده خوانده می‌شود؛ اتصال منقضی نادیده گرفته می‌شود.
    const run = await owner.ok('createRun', {
      params: owner.brand(brandA.brand.id),
      body: { intent: 'collect_metrics', idempotency_key: newKey(), params: { week_of: '2026-11-11' } },
    });
    assert.equal(run.status, 'succeeded');
    assert.ok(run.result?.summary_fa.includes('هیچ اتصالی'));
    const report = await owner.ok('weeklyReport', { params: owner.brand(brandA.brand.id), query: { week_of: '2026-11-11' } });
    assert.deepEqual(report.metrics, []);
    assert.equal(report.is_sample, false);
  });

  it('A12 — برای سرویس بدون adapter اتصال ساختگی ساخته نمی‌شود و دلیل و مسیر دستی گفته می‌شود', async () => {
    for (const provider of ['instagram', 'linkedin', 'wordpress', 'virgool', 'no_such_provider']) {
      const error = await owner.fail('createConnection', 'UNSUPPORTED_CAPABILITY', {
        params: owner.brand(brandA.brand.id),
        body: { provider },
      });
      assert.ok(error.message_fa.length > 20, provider);
      assert.ok(error.action_required);
    }
    const catalog = await owner.ok('listProviders');
    const find = (provider: string, action: string) =>
      catalog.items
        .find((entry) => entry.manifest.provider_id === provider)
        ?.register.filter((row) => row.action === action);
    assert.ok(find('instagram', 'trial_reel_publish')?.every((row) => row.status === 'manual_only'));
    assert.ok(find('linkedin', 'dm_send')?.every((row) => row.status === 'manual_only' || row.status === 'unsupported'));
    for (const entry of catalog.items) {
      if (entry.manifest.provider_id === 'fake') continue;
      assert.equal(entry.connectable, false, entry.manifest.provider_id);
      // مدل متن (ai) تنظیم سطح استودیوست، نه اتصال برند؛ ردیف verified آن باید آزمون حساب داشته باشد.
      if (entry.manifest.provider_id === 'ai') {
        assert.ok(entry.register.every((row) => row.status !== 'verified' || row.account_evidence.verified));
        continue;
      }
      assert.ok(entry.register.every((row) => !row.account_evidence.verified), entry.manifest.provider_id);
      assert.ok(entry.register.every((row) => row.status !== 'verified' || row.route === 'internal'));
    }
    assert.equal(catalog.items.find((entry) => entry.manifest.provider_id === 'fake')?.manifest.is_sample, true);
  });

  it('با خاموش‌بودن دادهٔ نمونه، برند و اتصال نمونه ساخته نمی‌شود', async () => {
    const strict = await createHarness({ sampleData: false });
    try {
      const client = await strict.owner();
      assert.equal((await client.ok('setupStatus')).sample_data, false);
      await client.fail('seedSampleBrands', 'FORBIDDEN', { params: { workspace_id: client.workspaceId } });
      await client.fail('createBrand', 'FORBIDDEN', {
        params: { workspace_id: client.workspaceId },
        body: { name: 'نمونه', industry_pack_id: 'generic', is_sample: true },
      });
      const real = await client.ok('createBrand', {
        params: { workspace_id: client.workspaceId },
        body: { name: 'واقعی', industry_pack_id: 'generic' },
      });
      await client.fail('createConnection', 'FORBIDDEN', {
        params: client.brand(real.brand.id),
        body: { provider: 'fake' },
      });
    } finally {
      await strict.close();
    }
  });
});

describe('سیاست اختیار', () => {
  it('حالت پیش‌فرض draft_only است و تغییر آن نسخه‌دار و با بررسی نسخه انجام می‌شود', async () => {
    const params = owner.brand(brandB.brand.id);
    const initial = await owner.ok('getPolicy', { params });
    assert.equal(initial.revision, 1);
    assert.deepEqual(initial.authority, { mode: 'draft_only', rules: [], spend_mode: 'free_only', paused: false });
    const error = await owner.fail('updatePolicy', 'NOT_IMPLEMENTED', {
      params,
      body: { expected_revision: 1, mode: 'auto_scoped' },
    });
    assert.ok(error.message_fa.includes('M2'));
    const changed = await owner.ok('updatePolicy', { params, body: { expected_revision: 1, mode: 'review_required' } });
    assert.equal(changed.revision, 2);
    assert.equal(changed.authority.mode, 'review_required');
    await owner.fail('updatePolicy', 'STALE_REVISION', { params, body: { expected_revision: 1, mode: 'draft_only' } });
    const versions = await db.query('SELECT revision FROM policies WHERE brand_id = $1 ORDER BY revision', [brandB.brand.id]);
    assert.deepEqual(versions.rows.map((row: { revision: number }) => row.revision), [1, 2]);
  });

  it('A15 (بخش M1) — توقف برند کار تازه را رد و ثبت می‌کند؛ برند دیگر ادامه می‌دهد', async () => {
    const params = owner.brand(brandB.brand.id);
    const paused = await owner.ok('updatePolicy', { params, body: { expected_revision: 2, paused: true } });
    assert.equal(paused.authority.paused, true);
    const denied = await owner.fail('createRun', 'POLICY_DENIED', {
      params,
      body: { intent: 'build_weekly_plan', idempotency_key: newKey() },
    });
    assert.ok(denied.message_fa.includes('متوقف'));
    const audit = await owner.ok('listAuditEvents', { params, query: { limit: 20 } });
    assert.ok(audit.items.some((event) => event.action === 'run.create' && event.outcome === 'denied'));
    const runs = await db.query("SELECT 1 FROM workflow_runs WHERE brand_id = $1 AND status = 'queued'", [brandB.brand.id]);
    assert.equal(runs.rowCount, 0, 'run ردشده نباید ساخته شود');

    const other = await owner.ok('createRun', {
      params: owner.brand(brandA.brand.id),
      body: { intent: 'collect_metrics', idempotency_key: newKey() },
    });
    assert.equal(other.status, 'succeeded', 'برند دیگر باید ادامه بدهد');

    await owner.ok('updatePolicy', { params, body: { expected_revision: 3, paused: false } });
    const resumed = await owner.ok('createRun', {
      params,
      body: { intent: 'build_weekly_plan', idempotency_key: newKey(), params: { week_of: '2026-11-11' } },
    });
    assert.equal(resumed.status, 'succeeded', JSON.stringify(resumed.error));
    const overview = await owner.ok('workspaceOverview', { params: { workspace_id: owner.workspaceId } });
    assert.equal(overview.brands.find((item) => item.brand.id === brandB.brand.id)?.authority_mode, 'review_required');
  });
});
