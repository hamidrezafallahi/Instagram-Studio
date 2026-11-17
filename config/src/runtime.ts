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
  /** تولید متن: auto = OpenRouter اگر کلیدش در STUDIO_HOME باشد، وگرنه تولید قالبی. */
  STUDIO_TEXT_MODEL: z.enum(['auto', 'template', 'openrouter']).default('auto'),
  /** فهرست مدل‌های رایگان OpenRouter به ترتیب ترجیح، جداشده با ویرگول؛ فقط شناسه‌های «:free». */
  STUDIO_OPENROUTER_MODELS: z.string().min(1).optional(),
  /** مسیر Chrome/Edge برای رندر تصویر؛ خالی = جست‌وجوی مسیرهای معمول. */
  STUDIO_BROWSER_PATH: z.string().min(1).optional(),
  /** مسیر ffmpeg و ffprobe برای ساخت ویدئو؛ خالی = همان نام در PATH. */
  STUDIO_FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
  STUDIO_FFPROBE_PATH: z.string().min(1).default('ffprobe'),
});

/**
 * مدل‌های رایگان OpenRouter به ترتیب ترجیح. فهرست و فارسی‌نویسی هر مدل در 2026-11-15
 * با GET /api/v1/models و یک درخواست آزمایشی بررسی شد (docs/product/CAPABILITY-REGISTER.md).
 * مدل‌های رایگان ممکن است حذف یا محدود شوند؛ مدل در دسترس نبود → مدل بعدی → تولید قالبی.
 */
export const DEFAULT_OPENROUTER_MODELS: readonly string[] = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'baidu/ernie-5.5-flash-preview:free',
  'google/gemma-4-31b-it:free',
];

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
  /** تولیدکنندهٔ متن پیش‌نویس. کلید OpenRouter در این ساختار نیست؛ فقط در محیط فرایند خوانده می‌شود. */
  readonly textModel: 'template' | 'openrouter';
  readonly openrouterModels: readonly string[];
  /** مسیر صریح مرورگر رندر؛ undefined = جست‌وجوی خودکار. */
  readonly browserPath?: string | undefined;
  /** ابزار ویدئو؛ undefined = ffmpeg و ffprobe از PATH. */
  readonly ffmpegPath?: string | undefined;
  readonly ffprobePath?: string | undefined;
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

/**
 * رازهای همین دستگاه از `${STUDIO_HOME}/.env` (بیرون از مخزن)، مثل OPENROUTER_API_KEY.
 * متغیر موجود محیط بازنویسی نمی‌شود و مقدارها هرگز در RuntimeConfig یا log قرار نمی‌گیرند.
 */
export function loadHomeSecrets(home: string): void {
  const file = join(home, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  if (env === process.env) {
    loadEnvFiles();
    loadHomeSecrets(resolve(env['STUDIO_HOME'] ?? defaultHome()));
  }
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
    textModel:
      value.STUDIO_TEXT_MODEL === 'auto'
        ? env['OPENROUTER_API_KEY'] ? 'openrouter' : 'template'
        : value.STUDIO_TEXT_MODEL,
    openrouterModels: value.STUDIO_OPENROUTER_MODELS
      ? value.STUDIO_OPENROUTER_MODELS.split(',').map((item) => item.trim()).filter(Boolean)
      : DEFAULT_OPENROUTER_MODELS,
    browserPath: value.STUDIO_BROWSER_PATH,
    ffmpegPath: value.STUDIO_FFMPEG_PATH,
    ffprobePath: value.STUDIO_FFPROBE_PATH,
  };
}
