/**
 * پذیرش packages/data/README.md: migration روی پایگاه دادهٔ خالی، جداسازی سطری (RLS)،
 * FK بین برندها، جدول‌های immutable و نقش محدود برنامه. روی PostgreSQL واقعی اجرا می‌شود.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { StudioError } from '@studio/contracts';
import { listMigrations, migrate, type Database } from '@studio/data';
import pg from 'pg';
import { createTestDatabase, type TestDatabase } from '../support/db.ts';

let database: TestDatabase;
let db: Database;
let owner: pg.Client;
const ids = {
  wsA: randomUUID(), wsB: randomUUID(),
  brandA1: randomUUID(), brandA2: randomUUID(), brandB1: randomUUID(),
  connA1: randomUUID(), connA2: randomUUID(),
};

before(async () => {
  database = await createTestDatabase();
  db = database.db;
  owner = new pg.Client({ connectionString: database.ownerUrl });
  await owner.connect();
  // دادهٔ پایه با نقش مالک schema ساخته می‌شود تا آزمون‌ها فقط رفتار نقش برنامه را بسنجند.
  await owner.query('INSERT INTO workspaces (id, name) VALUES ($1, $2), ($3, $4)', [ids.wsA, 'A', ids.wsB, 'B']);
  for (const [id, ws, name] of [
    [ids.brandA1, ids.wsA, 'برند یک'],
    [ids.brandA2, ids.wsA, 'برند دو'],
    [ids.brandB1, ids.wsB, 'برند بیگانه'],
  ] as const) {
    await owner.query(
      `INSERT INTO brands (id, workspace_id, name, industry_pack_id, industry_pack_version, timezone, locale)
       VALUES ($1, $2, $3, 'generic', '1.0.0', 'Asia/Tehran', 'fa-IR')`,
      [id, ws, name],
    );
  }
  for (const [id, ws, brand] of [
    [ids.connA1, ids.wsA, ids.brandA1],
    [ids.connA2, ids.wsA, ids.brandA2],
  ] as const) {
    await owner.query(
      `INSERT INTO connections (id, workspace_id, brand_id, provider, label, status, auth_kind)
       VALUES ($1, $2, $3, 'fake', 'x', 'active', 'none')`,
      [id, ws, brand],
    );
  }
});

after(async () => {
  await owner.end();
  await database.dispose();
});

describe('migration', () => {
  it('روی پایگاه دادهٔ خالی اعمال شده و اجرای دوباره بی‌اثر است', async () => {
    const applied = await owner.query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY version');
    assert.deepEqual(applied.rows.map((row) => row.name), listMigrations().map((file) => file.name));
    const again = await migrate(database.ownerUrl);
    assert.deepEqual(again.applied, []);
  });

  it('تغییر فایل migration اعمال‌شده کشف و رد می‌شود', async () => {
    await owner.query("UPDATE schema_migrations SET checksum = 'tampered' WHERE version = '0001'");
    await assert.rejects(migrate(database.ownerUrl), /پس از اعمال تغییر کرده/);
    const real = listMigrations()[0];
    await owner.query("UPDATE schema_migrations SET checksum = $1 WHERE version = '0001'", [real?.checksum]);
  });

  it('همهٔ جدول‌های کسب‌وکار RLS فعال دارند', async () => {
    const result = await owner.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    );
    const identity = new Set(['users', 'workspaces', 'memberships', 'sessions', 'schema_migrations', 'schema_metadata']);
    for (const row of result.rows) {
      if (identity.has(row.relname)) continue;
      assert.equal(row.relrowsecurity, true, `${row.relname} بدون RLS است`);
    }
    assert.ok(result.rows.length >= 20);
  });

  it('نقش برنامه مالک جدول‌ها نیست و نمی‌تواند schema را تغییر دهد', async () => {
    await assert.rejects(db.identity((tx) => tx.query('ALTER TABLE brands DISABLE ROW LEVEL SECURITY')));
    await assert.rejects(db.identity((tx) => tx.query('CREATE TABLE sneaky (id int)')));
    await assert.rejects(db.identity((tx) => tx.query('DROP TABLE audit_events')));
    const role = await db.identity((tx) =>
      tx.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
        'SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user',
      ),
    );
    assert.deepEqual(role.rows[0], { rolbypassrls: false, rolsuper: false });
  });
});

describe('جداسازی سطری', () => {
  const brandNames = async (context: { workspaceId: string; brandId?: string } | null): Promise<string[]> => {
    const sql = 'SELECT name FROM brands ORDER BY name';
    const result = context
      ? await db.tenant(context, (tx) => tx.query<{ name: string }>(sql))
      : await db.identity((tx) => tx.query<{ name: string }>(sql));
    return result.rows.map((row) => row.name);
  };

  it('بدون زمینهٔ workspace هیچ ردیف کسب‌وکاری دیده نمی‌شود (fail closed)', async () => {
    assert.deepEqual(await brandNames(null), []);
    const connections = await db.identity((tx) => tx.query('SELECT 1 FROM connections'));
    assert.equal(connections.rowCount, 0);
  });

  it('هر workspace فقط برندهای خودش را می‌بیند', async () => {
    assert.deepEqual(await brandNames({ workspaceId: ids.wsA }), ['برند دو', 'برند یک']);
    assert.deepEqual(await brandNames({ workspaceId: ids.wsB }), ['برند بیگانه']);
  });

  it('A07 — در زمینهٔ یک برند، دادهٔ برند هم‌خانه هم دیده نمی‌شود حتی با query بدون فیلتر', async () => {
    assert.deepEqual(await brandNames({ workspaceId: ids.wsA, brandId: ids.brandA1 }), ['برند یک']);
    const visible = await db.tenant({ workspaceId: ids.wsA, brandId: ids.brandA1 }, (tx) =>
      tx.query<{ id: string }>('SELECT id FROM connections'),
    );
    assert.deepEqual(visible.rows.map((row) => row.id), [ids.connA1]);
    const direct = await db.tenant({ workspaceId: ids.wsA, brandId: ids.brandA1 }, (tx) =>
      tx.query('SELECT 1 FROM connections WHERE id = $1', [ids.connA2]),
    );
    assert.equal(direct.rowCount, 0);
  });

  it('زمینهٔ برندِ یک workspace دیگر چیزی نمی‌بیند', async () => {
    assert.deepEqual(await brandNames({ workspaceId: ids.wsB, brandId: ids.brandA1 }), []);
  });

  it('نوشتن برای برند دیگر با RLS رد می‌شود', async () => {
    const insert = (workspaceId: string, brandId: string, target: string) =>
      db.tenant({ workspaceId, brandId }, (tx) =>
        tx.query(
          `INSERT INTO connections (workspace_id, brand_id, provider, label, status, auth_kind)
           VALUES ($1, $2, 'fake', 'نفوذ', 'active', 'none')`,
          [workspaceId, target],
        ),
      );
    await assert.rejects(
      insert(ids.wsA, ids.brandA1, ids.brandA2),
      (error: unknown) => error instanceof StudioError && error.code === 'FORBIDDEN',
    );
    await assert.rejects(
      db.tenant({ workspaceId: ids.wsA }, (tx) =>
        tx.query(
          `INSERT INTO connections (workspace_id, brand_id, provider, label, status, auth_kind)
           VALUES ($1, $2, 'fake', 'نفوذ', 'active', 'none')`,
          [ids.wsB, ids.brandB1],
        ),
      ),
      (error: unknown) => error instanceof StudioError && error.code === 'FORBIDDEN',
    );
    const updated = await db.tenant({ workspaceId: ids.wsA, brandId: ids.brandA1 }, (tx) =>
      tx.query("UPDATE connections SET label = 'تغییر' WHERE id = $1", [ids.connA2]),
    );
    assert.equal(updated.rowCount, 0, 'به‌روزرسانی ردیف برند دیگر نباید اثر کند');
  });

  it('ارجاع بین برندها با FK مرکب رد می‌شود (CROSS_BRAND_REFERENCE)', async () => {
    await assert.rejects(
      db.tenant({ workspaceId: ids.wsA }, (tx) =>
        tx.query(
          `INSERT INTO capabilities (workspace_id, brand_id, connection_id, action, status, reason_code)
           VALUES ($1, $2, $3, 'feed_publish', 'verified', 'X')`,
          // قابلیت برای برند دو، ولی با اتصال برند یک.
          [ids.wsA, ids.brandA2, ids.connA1],
        ),
      ),
      (error: unknown) => error instanceof StudioError && error.code === 'CROSS_BRAND_REFERENCE',
    );
  });

  it('شناسهٔ نامعتبر در زمینه پیش از رسیدن به پایگاه داده رد می‌شود', async () => {
    await assert.rejects(
      db.tenant({ workspaceId: "x'; DROP TABLE brands; --" }, async () => undefined),
      (error: unknown) => error instanceof StudioError && error.code === 'VALIDATION_FAILED',
    );
  });

  it('زمینهٔ یک تراکنش به تراکنش بعدی همان اتصال نشت نمی‌کند', async () => {
    for (let round = 0; round < 12; round += 1) {
      await db.tenant({ workspaceId: ids.wsA }, (tx) => tx.query('SELECT 1 FROM brands'));
      assert.deepEqual(await brandNames(null), []);
    }
  });
});

describe('جدول‌های immutable و append-only', () => {
  it('نسخهٔ برند، نسخهٔ محتوا، سیاست و audit قابل تغییر یا حذف نیستند', async () => {
    await owner.query(
      `INSERT INTO brand_versions (workspace_id, brand_id, revision, profile, hash, created_by)
       VALUES ($1, $2, 1, '{}', $3, 'test')`,
      [ids.wsA, ids.brandA1, 'a'.repeat(64)],
    );
    await owner.query(
      `INSERT INTO audit_events (workspace_id, brand_id, actor_type, actor_id, action, target_type, outcome, trace_id)
       VALUES ($1, $2, 'system', 'test', 'x', 'y', 'succeeded', 't')`,
      [ids.wsA, ids.brandA1],
    );
    // حتی مالک schema هم با trigger متوقف می‌شود.
    await assert.rejects(owner.query("UPDATE brand_versions SET hash = 'b'"), /immutable/);
    await assert.rejects(owner.query('DELETE FROM audit_events'), /immutable/);
    // نقش برنامه اصلاً مجوز UPDATE/DELETE ندارد.
    await assert.rejects(
      db.tenant({ workspaceId: ids.wsA }, (tx) => tx.query("UPDATE audit_events SET action = 'z'")),
      (error: unknown) => error instanceof StudioError && error.code === 'FORBIDDEN',
    );
    await assert.rejects(
      db.tenant({ workspaceId: ids.wsA }, (tx) => tx.query('DELETE FROM brand_versions')),
      (error: unknown) => error instanceof StudioError && error.code === 'FORBIDDEN',
    );
  });

  it('آرشیو یا حذف برند رد حسابرسی را پاک نمی‌کند', async () => {
    const fk = await owner.query(
      `SELECT 1 FROM pg_constraint WHERE conrelid = 'audit_events'::regclass AND contype = 'f'`,
    );
    assert.equal(fk.rowCount, 0, 'audit_events نباید FK به برند داشته باشد');
  });

  it('تاریخ تقویمی بدون جابه‌جایی منطقهٔ زمانی خوانده می‌شود', async () => {
    const result = await db.identity((tx) => tx.query<{ d: string }>("SELECT DATE '2026-11-07' AS d"));
    assert.equal(result.rows[0]?.d, '2026-11-07');
  });
});
