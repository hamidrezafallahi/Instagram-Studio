import pg from 'pg';
import { StudioError } from '@studio/contracts';

// DATE را رشته نگه می‌داریم تا منطقهٔ زمانی دستگاه تاریخ تقویمی را جابه‌جا نکند.
pg.types.setTypeParser(1082, (value: string) => value);

export interface TenantContext {
  workspaceId: string;
  /** اگر تنظیم شود، RLS فقط همان برند را قابل دیدن و نوشتن می‌کند. */
  brandId?: string | null;
}

export interface Tx {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<pg.QueryResult<R>>;
  readonly tenant: TenantContext | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** خطاهای PostgreSQL را به خطای typed دامنه نگاشت می‌کند؛ جزئیات SQL به پاسخ عمومی نمی‌رسد. */
function translate(error: unknown): unknown {
  if (!(error instanceof Error) || !('code' in error)) return error;
  const { code, constraint } = error as pg.DatabaseError;
  if (code === '23503' && constraint?.endsWith('_scope_fkey')) {
    return new StudioError('CROSS_BRAND_REFERENCE', { cause: error });
  }
  if (code === '42501') {
    // نقض RLS یا نبود مجوز: همان رفتار «دسترسی ندارید»، بدون افشای ساختار.
    return new StudioError('FORBIDDEN', { cause: error });
  }
  return error;
}

export class Database {
  readonly pool: pg.Pool;

  constructor(connectionString: string, options: { max?: number; applicationName?: string } = {}) {
    this.pool = new pg.Pool({
      connectionString,
      max: options.max ?? 10,
      application_name: options.applicationName ?? 'studio',
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    // خطای اتصال idle نباید فرایند را بیندازد.
    this.pool.on('error', () => undefined);
  }

  /**
   * تراکنش در محدودهٔ یک workspace (و در صورت نیاز یک برند).
   * مقدارها با set_config محلیِ تراکنش تنظیم می‌شوند و RLS بر پایهٔ آن‌ها تصمیم می‌گیرد.
   */
  async tenant<T>(context: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!UUID.test(context.workspaceId) || (context.brandId && !UUID.test(context.brandId))) {
      throw new StudioError('VALIDATION_FAILED', { message_fa: 'شناسهٔ فضای کاری یا برند نامعتبر است.' });
    }
    return this.#run(context, fn);
  }

  /** تراکنش بدون محدودهٔ کسب‌وکار (فقط جدول‌های هویت). ردیف‌های کسب‌وکار در آن دیده نمی‌شوند. */
  async identity<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.#run(null, fn);
  }

  async #run<T>(context: TenantContext | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const tx: Tx = {
      tenant: context,
      query: async (text, params) => {
        try {
          return await client.query(text, params as unknown[] | undefined);
        } catch (error) {
          throw translate(error);
        }
      },
    };
    try {
      await client.query('BEGIN');
      if (context) {
        await client.query(
          "SELECT set_config('app.workspace_id', $1, true), set_config('app.brand_id', $2, true)",
          [context.workspaceId, context.brandId ?? ''],
        );
      }
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** timestamptz → رشتهٔ RFC3339 UTC. */
export function iso(value: Date): string;
export function iso(value: Date | null): string | null;
export function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!(error instanceof Error) || !('code' in error)) return false;
  const dbError = error as pg.DatabaseError;
  return dbError.code === '23505' && (constraint === undefined || dbError.constraint === constraint);
}
