import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * تنظیمات اجرا (config/README.md → Runtime config): local/server، storage، database و درگاه‌ها.
 * هیچ رازی در این ساختار نیست؛ رازها در STUDIO_HOME (خارج از مخزن) یا secret manager هستند.
 */

const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const port = z.coerce.number().int().min(1).max(65535);

const RuntimeEnv = z.object({
  STUDIO_PROFILE: z.enum(['local', 'server']).default('local'),
  STUDIO_HOME: z.string().min(1).optional(),
  STUDIO_API_HOST: z.string().min(1).default('127.0.0.1'),
  STUDIO_API_PORT: port.default(4310),
  STUDIO_DASHBOARD_PORT: port.default(4300),
  STUDIO_PG_PORT: port.default(54329),
  STUDIO_PUBLIC_URL: z.url().default('http://localhost:4300'),
  STUDIO_SAMPLE_DATA: booleanish.default(true),
  STUDIO_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  STUDIO_DATABASE_URL: z.string().min(1).optional(),
  STUDIO_MIGRATION_DATABASE_URL: z.string().min(1).optional(),
});

export interface RuntimeConfig {
  readonly profile: 'local' | 'server';
  /** ریشهٔ مخزن (پوشه‌ای که pnpm-workspace.yaml در آن است). */
  readonly repoRoot: string;
  /** محل دادهٔ اجرا خارج از مخزن: کلید اصلی، رمزهای محلی، دادهٔ PostgreSQL و دارایی‌ها. */
  readonly home: string;
  readonly apiHost: string;
  readonly apiPort: number;
  readonly dashboardPort: number;
  readonly pgPort: number;
  readonly publicUrl: string;
  readonly secureCookies: boolean;
  readonly sampleData: boolean;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  /** فقط در پروفایل server از محیط می‌آید؛ در local از رمزهای محلی STUDIO_HOME ساخته می‌شود. */
  readonly databaseUrl: string | undefined;
  readonly migrationDatabaseUrl: string | undefined;
}

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function defaultHome(): string {
  if (process.platform === 'win32') {
    const base = process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local');
    return join(base, 'ContentStudio');
  }
  const base = process.env['XDG_DATA_HOME'] ?? join(homedir(), '.local', 'share');
  return join(base, 'content-studio');
}

let envFilesLoaded = false;

/** ‎.env.local و ‎.env ریشهٔ مخزن را (در صورت وجود) بار می‌کند؛ متغیر موجود محیط بازنویسی نمی‌شود. */
export function loadEnvFiles(): void {
  if (envFilesLoaded) return;
  envFilesLoaded = true;
  for (const name of ['.env.local', '.env']) {
    const file = join(REPO_ROOT, name);
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  if (env === process.env) loadEnvFiles();
  const parsed = RuntimeEnv.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`تنظیمات محیطی نامعتبر است → ${problems}`);
  }
  const value = parsed.data;
  if (value.STUDIO_PROFILE === 'server' && !value.STUDIO_DATABASE_URL) {
    throw new Error('در پروفایل server مقدار STUDIO_DATABASE_URL باید از secret manager تزریق شود.');
  }
  return {
    profile: value.STUDIO_PROFILE,
    repoRoot: REPO_ROOT,
    home: resolve(value.STUDIO_HOME ?? defaultHome()),
    apiHost: value.STUDIO_API_HOST,
    apiPort: value.STUDIO_API_PORT,
    dashboardPort: value.STUDIO_DASHBOARD_PORT,
    pgPort: value.STUDIO_PG_PORT,
    publicUrl: value.STUDIO_PUBLIC_URL.replace(/\/$/, ''),
    secureCookies: value.STUDIO_PUBLIC_URL.startsWith('https://'),
    sampleData: value.STUDIO_SAMPLE_DATA,
    logLevel: value.STUDIO_LOG_LEVEL,
    databaseUrl: value.STUDIO_DATABASE_URL,
    migrationDatabaseUrl: value.STUDIO_MIGRATION_DATABASE_URL,
  };
}
