import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RuntimeConfig } from './runtime.ts';

/**
 * نشانی اتصال پایگاه داده.
 * - server: از محیط (STUDIO_DATABASE_URL و STUDIO_MIGRATION_DATABASE_URL) که از secret manager تزریق می‌شود.
 * - local: از رمزهای ساخته‌شده در STUDIO_HOME (خارج از مخزن). رمزها هرگز چاپ یا log نمی‌شوند.
 */

export const MIGRATOR_ROLE = 'studio_migrator';
export const APP_ROLE = 'studio_app';
export const MAIN_DATABASE = 'studio';

export interface LocalDbSecrets {
  superuser_password: string;
  migrator_password: string;
  app_password: string;
}

export type ClusterName = 'main' | 'test';

export function localSecretsFile(home: string, cluster: ClusterName): string {
  return join(home, cluster === 'main' ? 'local-secrets.json' : 'test-secrets.json');
}

export function readLocalDbSecrets(home: string, cluster: ClusterName): LocalDbSecrets {
  const file = localSecretsFile(home, cluster);
  if (!existsSync(file)) {
    throw new Error('رمزهای محلی پایگاه داده پیدا نشد؛ ابتدا pnpm db:start را اجرا کنید.');
  }
  return JSON.parse(readFileSync(file, 'utf8')) as LocalDbSecrets;
}

export function localUrl(
  home: string,
  cluster: ClusterName,
  port: number,
  role: 'admin' | 'migrator' | 'app',
  database: string,
): string {
  const secrets = readLocalDbSecrets(home, cluster);
  const [user, password] =
    role === 'admin'
      ? ['postgres', secrets.superuser_password]
      : role === 'migrator'
        ? [MIGRATOR_ROLE, secrets.migrator_password]
        : [APP_ROLE, secrets.app_password];
  return `postgres://${user}:${password}@127.0.0.1:${port}/${database}`;
}

/** نشانی نقش برنامه (RLS فعال) و نقش migration برای پایگاه دادهٔ اصلی. */
export function resolveDatabaseUrls(config: RuntimeConfig): { app: string; migrator: string } {
  if (config.databaseUrl) {
    return { app: config.databaseUrl, migrator: config.migrationDatabaseUrl ?? config.databaseUrl };
  }
  return {
    app: localUrl(config.home, 'main', config.pgPort, 'app', MAIN_DATABASE),
    migrator: localUrl(config.home, 'main', config.pgPort, 'migrator', MAIN_DATABASE),
  };
}
