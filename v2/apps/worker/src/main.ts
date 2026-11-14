/**
 * نقطهٔ ورود worker (apps/worker/README.md). فقط composition و حلقهٔ زمان‌بندی؛ منطق در packages/orchestration.
 * اجرا: node apps/worker/src/main.ts  (یا pnpm dev / pnpm start از ریشه)
 *
 * هر دور: رویدادهای outbox به job تبدیل می‌شوند، کار سررسیده با lease برداشته می‌شود و اجرا می‌گردد.
 * shutdown: claim تازه متوقف می‌شود، دور جاری تمام می‌شود و lease کار ناتمام خودبه‌خود منقضی می‌شود؛
 * برای تماس بیرونی با نتیجهٔ نامعلوم هرگز retry کور انجام نمی‌شود (reconcile).
 */
import { hostname } from 'node:os';
import { loadRuntimeConfig, resolveDatabaseUrls } from '@studio/config';
import { createStudioFromConfig } from '@studio/orchestration';
import { createLogger } from '@studio/security';

const config = loadRuntimeConfig();
const logger = createLogger({ service: 'worker', level: config.logLevel });
const intervalMs = Math.max(1000, Number(process.env['STUDIO_WORKER_INTERVAL_MS'] ?? 5000));
const workerId = `${hostname()}-${process.pid}`;

const studio = createStudioFromConfig({
  config,
  databaseUrl: resolveDatabaseUrls(config).app,
  logger,
  applicationName: 'studio-worker',
});

let stopping = false;
let wake: (() => void) | null = null;

async function loop(): Promise<void> {
  await studio.ready();
  logger.info({ worker: workerId, interval_ms: intervalMs }, 'worker started');
  while (!stopping) {
    try {
      const result = await studio.execution.tick({ worker: workerId });
      if (result.claimed > 0 || result.dispatched > 0) {
        logger.info({ dispatched: result.dispatched, claimed: result.claimed, outcomes: result.outcomes }, 'worker tick');
      }
    } catch (error) {
      logger.error({ err: error }, 'worker tick failed');
    }
    if (stopping) break;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, intervalMs);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    wake = null;
  }
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'worker stopping');
  wake?.();
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await loop();
} catch (error) {
  logger.fatal({ err: error }, 'worker failed to start');
  process.exitCode = 1;
} finally {
  await studio.close().catch(() => undefined);
}
