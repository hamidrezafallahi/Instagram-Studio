/**
 * مدیریت PostgreSQL پروفایل local بدون Docker، با باینری بستهٔ embedded-postgres.
 * خوشه با pg_ctl مستقل از API و worker اجرا می‌شود تا restart آن‌ها وضعیت کار را از بین نبرد.
 * رمزها در STUDIO_HOME/local-secrets.json (خارج از مخزن) ساخته می‌شوند و هرگز چاپ نمی‌شوند.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  APP_ROLE,
  MAIN_DATABASE,
  MIGRATOR_ROLE,
  localSecretsFile,
  localUrl,
  readLocalDbSecrets,
  type LocalDbSecrets,
} from '@studio/config';
import pg from 'pg';

export interface ClusterOptions {
  /** STUDIO_HOME */
  home: string;
  /** نام خوشه: main برای اجرا، test برای آزمون‌ها. */
  name: 'main' | 'test';
  port: number;
}

export { APP_ROLE, MAIN_DATABASE, MIGRATOR_ROLE };

interface PgBinaries {
  pg_ctl: string;
  initdb: string;
  postgres: string;
}

const PLATFORM_PACKAGES: Record<string, string> = {
  'win32-x64': '@embedded-postgres/windows-x64',
  'linux-x64': '@embedded-postgres/linux-x64',
  'linux-arm64': '@embedded-postgres/linux-arm64',
  'darwin-x64': '@embedded-postgres/darwin-x64',
  'darwin-arm64': '@embedded-postgres/darwin-arm64',
};

async function resolveBinaries(): Promise<PgBinaries> {
  const key = `${process.platform}-${process.arch}`;
  const name = PLATFORM_PACKAGES[key];
  if (!name) throw new Error(`باینری PostgreSQL توکار برای ${key} موجود نیست؛ از STUDIO_DATABASE_URL استفاده کنید.`);
  const fromRoot = createRequire(import.meta.url);
  const fromEmbedded = createRequire(fromRoot.resolve('embedded-postgres'));
  const entry = fromEmbedded.resolve(name);
  return (await import(pathToFileURL(entry).href)) as PgBinaries;
}

export function clusterPaths(options: ClusterOptions): {
  root: string;
  dataDir: string;
  logFile: string;
  secretsFile: string;
} {
  const root = join(options.home, 'pg', options.name);
  return {
    root,
    dataDir: join(root, 'data'),
    logFile: join(root, 'postgres.log'),
    secretsFile: localSecretsFile(options.home, options.name),
  };
}

function exec(file: string, args: string[]): Promise<number> {
  // stdio نادیده گرفته می‌شود تا pipe به ارث‌رسیده به postgres مانع پایان‌یافتن فرمان در ویندوز نشود.
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? -1));
  });
}

function newPassword(): string {
  return randomBytes(24).toString('hex');
}

function writePrivateFile(file: string, content: string): void {
  writeFileSync(file, content, { encoding: 'utf8', mode: 0o600 });
  if (process.platform !== 'win32') chmodSync(file, 0o600);
}

/** اگر خوشه وجود ندارد آن را با initdb می‌سازد. */
export async function ensureCluster(options: ClusterOptions): Promise<void> {
  const paths = clusterPaths(options);
  if (existsSync(join(paths.dataDir, 'PG_VERSION'))) return;
  const bin = await resolveBinaries();
  mkdirSync(paths.root, { recursive: true });
  const secrets: LocalDbSecrets = {
    superuser_password: newPassword(),
    migrator_password: newPassword(),
    app_password: newPassword(),
  };
  const pwFile = join(paths.root, `pw-${randomBytes(6).toString('hex')}.tmp`);
  writePrivateFile(pwFile, `${secrets.superuser_password}\n`);
  try {
    const code = await exec(bin.initdb, [
      '-D', paths.dataDir,
      '-U', 'postgres',
      `--pwfile=${pwFile}`,
      '--auth=scram-sha-256',
      '--encoding=UTF8',
      '--locale=C',
    ]);
    if (code !== 0) throw new Error(`initdb با کد ${code} شکست خورد.`);
  } finally {
    rmSync(pwFile, { force: true });
  }
  writePrivateFile(paths.secretsFile, `${JSON.stringify(secrets, null, 2)}\n`);
}

export function adminUrl(options: ClusterOptions, database = 'postgres'): string {
  return localUrl(options.home, options.name, options.port, 'admin', database);
}

export function migratorUrl(options: ClusterOptions, database = MAIN_DATABASE): string {
  return localUrl(options.home, options.name, options.port, 'migrator', database);
}

export function appUrl(options: ClusterOptions, database = MAIN_DATABASE): string {
  return localUrl(options.home, options.name, options.port, 'app', database);
}

export async function isAcceptingConnections(options: ClusterOptions): Promise<boolean> {
  if (!existsSync(clusterPaths(options).secretsFile)) return false;
  const client = new pg.Client({ connectionString: adminUrl(options), connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function startCluster(options: ClusterOptions): Promise<'started' | 'already_running'> {
  await ensureCluster(options);
  if (await isAcceptingConnections(options)) return 'already_running';
  const bin = await resolveBinaries();
  const paths = clusterPaths(options);
  const settings = [
    `-p ${options.port}`,
    '-c listen_addresses=127.0.0.1',
    '-c max_connections=60',
    '-c shared_buffers=64MB',
    '-c min_wal_size=32MB',
    '-c max_wal_size=96MB',
    '-c timezone=UTC',
    '-c log_timezone=UTC',
  ];
  if (options.name === 'test') {
    settings.push('-c fsync=off', '-c synchronous_commit=off', '-c full_page_writes=off');
  }
  const code = await exec(bin.pg_ctl, [
    'start', '-D', paths.dataDir, '-l', paths.logFile, '-w', '-t', '60', '-o', settings.join(' '),
  ]);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await isAcceptingConnections(options)) return 'started';
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`PostgreSQL روی درگاه ${options.port} بالا نیامد (pg_ctl کد ${code}). گزارش: ${paths.logFile}`);
}

export async function stopCluster(options: ClusterOptions): Promise<'stopped' | 'not_running'> {
  const paths = clusterPaths(options);
  if (!existsSync(join(paths.dataDir, 'postmaster.pid'))) return 'not_running';
  const bin = await resolveBinaries();
  await exec(bin.pg_ctl, ['stop', '-D', paths.dataDir, '-m', 'fast', '-w', '-t', '60']);
  return 'stopped';
}

/** نقش‌های جدا برای migration و برنامه (packages/data/README.md) و پایگاه دادهٔ اصلی. */
export async function ensureRolesAndDatabase(
  options: ClusterOptions,
  database = MAIN_DATABASE,
): Promise<void> {
  const secrets = readLocalDbSecrets(options.home, options.name);
  const client = new pg.Client({ connectionString: adminUrl(options) });
  await client.connect();
  try {
    const ensureRole = async (role: string, password: string, extra: string): Promise<void> => {
      const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
      const literal = pg.escapeLiteral(password);
      if (exists.rowCount === 0) {
        await client.query(`CREATE ROLE ${pg.escapeIdentifier(role)} LOGIN PASSWORD ${literal} ${extra}`);
      } else {
        await client.query(`ALTER ROLE ${pg.escapeIdentifier(role)} LOGIN PASSWORD ${literal} ${extra}`);
      }
    };
    await ensureRole(MIGRATOR_ROLE, secrets.migrator_password, 'NOSUPERUSER NOCREATEDB NOCREATEROLE');
    await ensureRole(APP_ROLE, secrets.app_password, 'NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');
    await ensureDatabase(client, database);
  } finally {
    await client.end();
  }
}

async function ensureDatabase(client: pg.Client, database: string, template = 'template0'): Promise<void> {
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
  if (exists.rowCount === 0) {
    await client.query(
      `CREATE DATABASE ${pg.escapeIdentifier(database)} OWNER ${pg.escapeIdentifier(MIGRATOR_ROLE)} ` +
        `TEMPLATE ${pg.escapeIdentifier(template)}${template === 'template0' ? " ENCODING 'UTF8'" : ''}`,
    );
  }
  await client.query(`REVOKE ALL ON DATABASE ${pg.escapeIdentifier(database)} FROM PUBLIC`);
  await client.query(
    `GRANT CONNECT ON DATABASE ${pg.escapeIdentifier(database)} TO ${pg.escapeIdentifier(APP_ROLE)}`,
  );
}

/** پایگاه دادهٔ موقت آزمون از روی یک template مهاجرت‌شده. */
export async function createDatabaseFromTemplate(
  options: ClusterOptions,
  database: string,
  template: string,
): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl(options) });
  await client.connect();
  try {
    await ensureDatabase(client, database, template);
  } finally {
    await client.end();
  }
}

export async function dropDatabase(options: ClusterOptions, database: string): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl(options) });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${pg.escapeIdentifier(database)} WITH (FORCE)`);
  } finally {
    await client.end();
  }
}
