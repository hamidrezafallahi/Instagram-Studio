import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export interface MigrationFile {
  version: string;
  name: string;
  sql: string;
  checksum: string;
}

export function listMigrations(dir: string = MIGRATIONS_DIR): MigrationFile[] {
  return readdirSync(dir)
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
    .sort()
    .map((file) => {
      const sql = readFileSync(join(dir, file), 'utf8').replaceAll('\r\n', '\n');
      return {
        version: file.slice(0, 4),
        name: file.replace(/\.sql$/, ''),
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    });
}

/**
 * migration رو به جلو با نقش جدا (نه نقش برنامه). بازگشت از طریق بازیابی نسخهٔ پشتیبان است.
 * هر فایل در یک تراکنش اجرا می‌شود؛ تغییر فایل اعمال‌شده با مقایسهٔ checksum کشف و رد می‌شود.
 */
export async function migrate(
  connectionString: string,
  options: { dir?: string; log?: (message: string) => void } = {},
): Promise<{ applied: string[]; current: string | null }> {
  const log = options.log ?? (() => undefined);
  const files = listMigrations(options.dir);
  const client = new pg.Client({ connectionString, application_name: 'studio-migrate' });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('studio_migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        name text NOT NULL,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const done = await client.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations',
    );
    const known = new Map(done.rows.map((row) => [row.version, row.checksum]));
    for (const file of files) {
      const existing = known.get(file.version);
      if (existing !== undefined) {
        if (existing !== file.checksum) {
          throw new Error(`migration ${file.name} پس از اعمال تغییر کرده است؛ migration تازه بنویسید.`);
        }
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(file.sql);
        await client.query('INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [
          file.version,
          file.name,
          file.checksum,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${file.name} شکست خورد: ${(error as Error).message}`, { cause: error });
      }
      applied.push(file.name);
      log(`migration اعمال شد: ${file.name}`);
    }
    return { applied, current: files.at(-1)?.version ?? null };
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('studio_migrations'))").catch(() => undefined);
    await client.end();
  }
}
