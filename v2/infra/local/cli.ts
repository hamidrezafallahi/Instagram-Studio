/**
 * فرمان‌های پروفایل local.
 *   node infra/local/cli.ts db:start | db:stop | db:status | db:migrate | db:seed | dev | start
 * هیچ‌کدام رمز یا کلید را چاپ نمی‌کنند.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadRuntimeConfig, resolveDatabaseUrls, type RuntimeConfig } from '@studio/config';
import { migrate } from '@studio/data';
import { loadMasterKey } from '@studio/security';
import {
  clusterPaths,
  ensureRolesAndDatabase,
  isAcceptingConnections,
  startCluster,
  stopCluster,
  type ClusterOptions,
} from './pg.ts';

const say = (message: string): void => console.log(`[studio] ${message}`);

function mainCluster(config: RuntimeConfig): ClusterOptions {
  return { home: config.home, name: 'main', port: config.pgPort };
}

async function dbStart(config: RuntimeConfig): Promise<void> {
  if (config.databaseUrl) {
    say('STUDIO_DATABASE_URL تنظیم شده است؛ خوشهٔ محلی راه‌اندازی نمی‌شود.');
    return;
  }
  mkdirSync(config.home, { recursive: true });
  loadMasterKey(config.home);
  const cluster = mainCluster(config);
  const state = await startCluster(cluster);
  await ensureRolesAndDatabase(cluster);
  say(
    state === 'started'
      ? `PostgreSQL روی 127.0.0.1:${config.pgPort} بالا آمد (داده: ${clusterPaths(cluster).root}).`
      : `PostgreSQL از قبل روی 127.0.0.1:${config.pgPort} در حال اجراست.`,
  );
}

async function dbMigrate(config: RuntimeConfig): Promise<void> {
  const result = await migrate(resolveDatabaseUrls(config).migrator, { log: say });
  say(result.applied.length === 0 ? 'schema به‌روز است.' : `${result.applied.length} migration اعمال شد.`);
}

/** چهار برند نمونه را در فضای کاری مالک می‌سازد (همان کاری که دکمهٔ «برندهای نمونه» در داشبورد می‌کند). */
async function dbSeed(config: RuntimeConfig): Promise<void> {
  const { createStudioFromConfig } = await import('@studio/orchestration');
  const studio = createStudioFromConfig({ config, databaseUrl: resolveDatabaseUrls(config).app });
  try {
    const owner = await studio.deps.db.identity((tx) =>
      tx.query<{ workspace_id: string; user_id: string }>(
        `SELECT workspace_id, user_id FROM memberships WHERE role = 'owner' ORDER BY created_at LIMIT 1`,
      ),
    );
    const row = owner.rows[0];
    if (!row) {
      say('هنوز حساب مالک ساخته نشده است؛ ابتدا در داشبورد راه‌اندازی اولیه را انجام دهید و دوباره اجرا کنید.');
      return;
    }
    const brands = await studio.sampleData.seed({
      trace_id: 'cli-db-seed',
      workspace_id: row.workspace_id,
      actor: { type: 'user', id: row.user_id, role: 'owner' },
    });
    say(`${brands.length} برند نمونه (با برچسب sample و بدون هیچ کلید واقعی) آماده است.`);
  } finally {
    await studio.close();
  }
}

function launch(name: string, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const forward = (chunk: Buffer): void => {
    for (const line of chunk.toString('utf8').split(/\r?\n/)) {
      if (line.trim()) console.log(`[${name}] ${line}`);
    }
  };
  child.stdout?.on('data', forward);
  child.stderr?.on('data', forward);
  child.once('exit', (code) => say(`${name} با کد ${code ?? 'نامشخص'} پایان یافت.`));
  return child;
}

async function runApps(config: RuntimeConfig, mode: 'dev' | 'start'): Promise<void> {
  await dbStart(config);
  await dbMigrate(config);
  const env = { ...process.env, STUDIO_HOME: config.home };
  const dashboardDir = join(config.repoRoot, 'apps', 'dashboard');
  const nextBin = join(dashboardDir, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (mode === 'start' && !existsSync(join(dashboardDir, '.next', 'BUILD_ID'))) {
    throw new Error('داشبورد هنوز build نشده است؛ ابتدا pnpm build را اجرا کنید.');
  }
  const children = [
    launch(
      'api',
      process.execPath,
      [...(mode === 'dev' ? ['--watch'] : []), join('apps', 'api', 'src', 'main.ts')],
      config.repoRoot,
      env,
    ),
    launch(
      'worker',
      process.execPath,
      [...(mode === 'dev' ? ['--watch'] : []), join('apps', 'worker', 'src', 'main.ts')],
      config.repoRoot,
      env,
    ),
    launch(
      'dashboard',
      process.execPath,
      [nextBin, mode === 'dev' ? 'dev' : 'start', '-p', String(config.dashboardPort), '-H', '127.0.0.1'],
      dashboardDir,
      { ...env, STUDIO_API_ORIGIN: `http://127.0.0.1:${config.apiPort}` },
    ),
  ];
  say(`داشبورد: http://localhost:${config.dashboardPort}  |  API: http://127.0.0.1:${config.apiPort}`);
  say('برای توقف Ctrl+C بزنید. PostgreSQL مستقل می‌ماند؛ توقف آن با pnpm db:stop.');
  const shutdown = (): void => {
    for (const child of children) child.kill();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  await Promise.all(children.map((child) => new Promise((resolve) => child.once('exit', resolve))));
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const config = loadRuntimeConfig();
  switch (command) {
    case 'db:start':
      await dbStart(config);
      break;
    case 'db:stop':
      say((await stopCluster(mainCluster(config))) === 'stopped' ? 'PostgreSQL متوقف شد.' : 'PostgreSQL در حال اجرا نبود.');
      break;
    case 'db:status':
      say(
        config.databaseUrl
          ? 'پایگاه دادهٔ بیرونی (STUDIO_DATABASE_URL).'
          : (await isAcceptingConnections(mainCluster(config)))
            ? `در حال اجرا روی 127.0.0.1:${config.pgPort}`
            : 'متوقف',
      );
      break;
    case 'db:migrate':
      await dbStart(config);
      await dbMigrate(config);
      break;
    case 'db:seed':
      await dbStart(config);
      await dbMigrate(config);
      await dbSeed(config);
      break;
    case 'dev':
    case 'start':
      await runApps(config, command);
      break;
    default:
      console.error('فرمان ناشناخته. گزینه‌ها: db:start، db:stop، db:status، db:migrate، db:seed، dev، start');
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`[studio] خطا: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
