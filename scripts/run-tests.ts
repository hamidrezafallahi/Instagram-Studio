/**
 * اجراکنندهٔ آزمون‌ها با node:test (بدون وابستگی اضافه).
 *   node scripts/run-tests.ts                → همهٔ آزمون‌ها (unit + integration + acceptance)
 *   node scripts/run-tests.ts --unit         → فقط آزمون‌های بدون پایگاه داده
 *   node scripts/run-tests.ts --acceptance   → فقط tests/acceptance
 *   node scripts/run-tests.ts --only <glob>  → فقط فایل‌های منطبق
 *   node scripts/run-tests.ts --evidence <file> → ذخیرهٔ خروجی کامل به‌عنوان مدرک پذیرش
 *
 * آزمون‌های integration و acceptance روی PostgreSQL واقعی (خوشهٔ جدا به نام test) اجرا می‌شوند؛
 * هر فایل آزمون پایگاه دادهٔ موقت خودش را از یک template مهاجرت‌شده می‌سازد.
 * این آزمون‌ها با محیط fake اجرا می‌شوند و گواه اتصال واقعی به هیچ سرویس بیرونی نیستند.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadRuntimeConfig } from '@studio/config';
import { migrate } from '@studio/data';
import {
  dropDatabase,
  ensureRolesAndDatabase,
  migratorUrl,
  startCluster,
  stopCluster,
  type ClusterOptions,
} from '../infra/local/pg.ts';

const UNIT_GLOBS = [
  'packages/*/src/**/*.test.ts',
  'packages/connectors/*/src/**/*.test.ts',
  'agents/src/**/*.test.ts',
  'workflows/src/**/*.test.ts',
  'config/src/**/*.test.ts',
  'apps/api/src/**/*.test.ts',
  'tests/unit/**/*.test.ts',
];
const INTEGRATION_GLOBS = ['tests/integration/**/*.test.ts'];
const ACCEPTANCE_GLOBS = ['tests/acceptance/**/*.test.ts'];
export const TEST_TEMPLATE = 'studio_template';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const unitOnly = process.argv.includes('--unit');
  const acceptanceOnly = process.argv.includes('--acceptance');
  const only = option('--only');
  const evidence = option('--evidence');

  const globs = only
    ? [only]
    : unitOnly
      ? UNIT_GLOBS
      : acceptanceOnly
        ? ACCEPTANCE_GLOBS
        : [...UNIT_GLOBS, ...INTEGRATION_GLOBS, ...ACCEPTANCE_GLOBS];
  const needsDatabase = !unitOnly;

  const cluster: ClusterOptions = { home: config.home, name: 'test', port: config.pgPort + 1 };
  // آزمون‌ها هرگز به مدل بیرونی وصل نمی‌شوند؛ کلید احتمالی STUDIO_HOME به فرایندهای آزمون نمی‌رسد.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    STUDIO_LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
    STUDIO_TEXT_MODEL: 'template',
    OPENROUTER_API_KEY: '',
  };

  if (needsDatabase) {
    await startCluster(cluster);
    // template همیشه از نو ساخته می‌شود تا «migration روی پایگاه دادهٔ خالی» در هر اجرا آزموده شود.
    await dropDatabase(cluster, TEST_TEMPLATE);
    await ensureRolesAndDatabase(cluster, TEST_TEMPLATE);
    await migrate(migratorUrl(cluster, TEST_TEMPLATE));
    env['STUDIO_TEST_HOME'] = config.home;
    env['STUDIO_TEST_PG_PORT'] = String(cluster.port);
    env['STUDIO_TEST_TEMPLATE'] = TEST_TEMPLATE;
  }

  const started = new Date();
  const args = ['--test', '--test-reporter=spec', ...globs];
  const chunks: string[] = [];
  const code = await new Promise<number>((resolveExit, reject) => {
    const child = spawn(process.execPath, args, { cwd: config.repoRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const forward = (chunk: Buffer): void => {
      const text = chunk.toString('utf8');
      chunks.push(text);
      process.stdout.write(text);
    };
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    child.once('error', reject);
    child.once('exit', (exitCode) => resolveExit(exitCode ?? 1));
  });

  if (needsDatabase) await stopCluster(cluster);

  if (evidence) {
    const file = resolve(config.repoRoot, evidence);
    mkdirSync(dirname(file), { recursive: true });
    const header = [
      `# مدرک اجرای آزمون`,
      `تاریخ (UTC): ${started.toISOString()}`,
      `محیط: ${process.platform}-${process.arch} | Node ${process.version} | پروفایل ${config.profile}`,
      `پایگاه داده: ${needsDatabase ? 'PostgreSQL توکار (خوشهٔ test)' : 'ندارد'} | کانکتورها: fake (آزمون ساختگی، نه اتصال واقعی)`,
      `فرمان: node scripts/run-tests.ts ${process.argv.slice(2).join(' ')}`.trimEnd(),
      `کد خروج: ${code}`,
      '',
      '```text',
    ].join('\n');
    // eslint-disable-next-line no-control-regex
    const body = chunks.join('').replace(/\u001b\[[0-9;]*m/g, '');
    writeFileSync(file, `${header}\n${body}\n\`\`\`\n`, 'utf8');
    console.log(`مدرک ذخیره شد: ${evidence}`);
  }
  process.exitCode = code;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
