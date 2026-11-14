import { randomBytes } from 'node:crypto';
import { Database } from '@studio/data';
import {
  appUrl,
  createDatabaseFromTemplate,
  dropDatabase,
  migratorUrl,
  type ClusterOptions,
} from '../../infra/local/pg.ts';

export interface TestDatabase {
  name: string;
  /** اتصال با نقش محدود برنامه (RLS فعال). */
  db: Database;
  appUrl: string;
  /** اتصال مالک schema؛ فقط برای بررسی‌های آزمون که باید RLS را دور بزنند. */
  ownerUrl: string;
  cluster: ClusterOptions;
  dispose(): Promise<void>;
}

function testCluster(): ClusterOptions {
  const home = process.env['STUDIO_TEST_HOME'];
  const port = Number(process.env['STUDIO_TEST_PG_PORT']);
  if (!home || !Number.isInteger(port)) {
    throw new Error('این آزمون به پایگاه داده نیاز دارد؛ آن را با node scripts/run-tests.ts اجرا کنید.');
  }
  return { home, name: 'test', port };
}

/** پایگاه دادهٔ موقت و مستقل برای یک فایل آزمون، ساخته‌شده از template مهاجرت‌شده. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const cluster = testCluster();
  const template = process.env['STUDIO_TEST_TEMPLATE'] ?? 'studio_template';
  const name = `t_${randomBytes(6).toString('hex')}`;
  await createDatabaseFromTemplate(cluster, name, template);
  const url = appUrl(cluster, name);
  const db = new Database(url, { max: 6, applicationName: 'studio-test' });
  return {
    name,
    db,
    appUrl: url,
    ownerUrl: migratorUrl(cluster, name),
    cluster,
    async dispose() {
      await db.close();
      await dropDatabase(cluster, name);
    },
  };
}
