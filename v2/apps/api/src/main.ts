/**
 * نقطهٔ ورود API. فقط composition و transport: منطق کسب‌وکار در packages است.
 * اجرا: node apps/api/src/main.ts  (یا pnpm dev / pnpm start از ریشه)
 */
import { loadRuntimeConfig, resolveDatabaseUrls } from '@studio/config';
import { createStudioFromConfig } from '@studio/orchestration';
import { createLogger } from '@studio/security';
import { buildApp } from './app.ts';

const config = loadRuntimeConfig();
const logger = createLogger({ service: 'api', level: config.logLevel });

const studio = createStudioFromConfig({
  config,
  databaseUrl: resolveDatabaseUrls(config).app,
  logger,
});
const app = await buildApp({
  studio,
  logger,
  publicUrl: config.publicUrl,
  secureCookies: config.secureCookies,
});

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  logger.info({ signal }, 'shutting down');
  // توقف پذیرش درخواست تازه، اتمام درخواست‌های جاری و سپس بستن اتصال‌های پایگاه داده.
  await app.close().catch(() => undefined);
  await studio.close().catch(() => undefined);
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await studio.ready();
  await app.listen({ host: config.apiHost, port: config.apiPort });
  logger.info(
    { host: config.apiHost, port: config.apiPort, profile: config.profile, sample_data: config.sampleData },
    'api listening',
  );
} catch (error) {
  logger.fatal({ err: error }, 'api failed to start');
  await studio.close().catch(() => undefined);
  process.exit(1);
}
