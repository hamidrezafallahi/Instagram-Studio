import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { buildApp } from '@studio/api';
import type { RuntimeConfig } from '@studio/config';
import { REPO_ROOT } from '@studio/config';
import { FakeProviderState } from '@studio/connector-fake';
import {
  reportExportRoute,
  routes,
  type ApiError,
  type ErrorCode,
  type RouteBodyInput,
  type RouteId,
  type RouteParams,
  type RouteQuery,
  type RouteResponse,
  type SessionInfo,
} from '@studio/contracts';
import { createStudioFromConfig, type ExecutionFaults, type Studio } from '@studio/orchestration';
import { SecretScrubber, createLogger } from '@studio/security';
import type { FastifyInstance } from 'fastify';
import { createTestDatabase, type TestDatabase } from './db.ts';

export const PUBLIC_URL = 'http://localhost:4300';
export const OWNER = {
  email: 'owner@example.test',
  password: 'correct-horse-battery-staple',
  display_name: 'مالک آزمون',
  workspace_name: 'فضای کاری آزمون',
};

interface CallInput<K extends RouteId> {
  params?: RouteParams<K>;
  query?: RouteQuery<K>;
  body?: RouteBodyInput<K>;
  headers?: Record<string, string>;
}

interface CallResult<K extends RouteId> {
  status: number;
  body: RouteResponse<K> | ApiError;
  headers: Record<string, string | string[] | number | undefined>;
  raw: string;
}

/** کلاینت آزمون با نگهداری کوکی نشست و نشانهٔ CSRF، مثل مرورگر مالک. */
export class TestClient {
  cookie: string | null = null;
  csrf: string | null = null;
  session: SessionInfo | null = null;
  readonly #app: FastifyInstance;

  constructor(app: FastifyInstance) {
    this.#app = app;
  }

  get workspaceId(): string {
    const id = this.session?.workspaces[0]?.id;
    assert.ok(id, 'نشست فضای کاری ندارد');
    return id;
  }

  brand(brandId: string): { workspace_id: string; brand_id: string } {
    return { workspace_id: this.workspaceId, brand_id: brandId };
  }

  async request(
    method: string,
    path: string,
    input: { params?: object; query?: object; body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; raw: string; headers: Record<string, string | string[] | number | undefined> }> {
    let url = path.replace(/\{(\w+)\}/g, (_, key: string) => {
      const value = (input.params as Record<string, string> | undefined)?.[key];
      assert.ok(value !== undefined, `پارامتر مسیر ${key} داده نشده است`);
      return encodeURIComponent(value);
    });
    const query = Object.entries((input.query ?? {}) as Record<string, unknown>).filter(
      ([, value]) => value !== undefined,
    );
    if (query.length > 0) {
      url += `?${query.map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`).join('&')}`;
    }
    const headers: Record<string, string> = { origin: PUBLIC_URL, ...(input.headers ?? {}) };
    if (this.cookie && headers['cookie'] === undefined) headers['cookie'] = this.cookie;
    if (this.csrf && method !== 'GET' && headers['x-csrf-token'] === undefined) {
      headers['x-csrf-token'] = this.csrf;
    }
    const response = await this.#app.inject({
      method: method as 'GET',
      url,
      headers,
      ...(input.body === undefined ? {} : { payload: input.body as object }),
    });
    const setCookie = response.headers['set-cookie'];
    for (const line of Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []) {
      const [pair] = String(line).split(';');
      if (pair?.startsWith('studio_session=')) {
        this.cookie = pair === 'studio_session=' ? null : pair;
      }
    }
    return { status: response.statusCode, raw: response.payload, headers: response.headers };
  }

  async call<K extends RouteId>(id: K, input: CallInput<K> = {}): Promise<CallResult<K>> {
    const def = routes[id];
    const response = await this.request(def.method, def.path, input as {
      params?: object;
      query?: object;
      body?: unknown;
      headers?: Record<string, string>;
    });
    const body = response.raw ? (JSON.parse(response.raw) as RouteResponse<K> | ApiError) : ({} as ApiError);
    if (id === 'login' || id === 'setupOwner' || id === 'session') {
      if (response.status < 300) {
        this.session = body as SessionInfo;
        this.csrf = this.session.csrf_token;
      }
    }
    return { ...response, body };
  }

  /** فراخوان موفق؛ در غیر این صورت آزمون با متن خطا شکست می‌خورد. */
  async ok<K extends RouteId>(id: K, input: CallInput<K> = {}): Promise<RouteResponse<K>> {
    const result = await this.call(id, input);
    const expected: number = (routes[id] as { success_status?: number }).success_status ?? 200;
    assert.equal(result.status, expected, `${id}: ${result.raw.slice(0, 400)}`);
    return result.body as RouteResponse<K>;
  }

  /** فراخوانی که باید با کد خطای مشخص رد شود. */
  async fail<K extends RouteId>(id: K, code: ErrorCode, input: CallInput<K> = {}): Promise<ApiError['error']> {
    const result = await this.call(id, input);
    const error = (result.body as ApiError).error;
    assert.ok(error, `${id}: انتظار خطای ${code} بود ولی پاسخ ${result.status} آمد: ${result.raw.slice(0, 300)}`);
    assert.equal(error.code, code, `${id}: ${result.raw.slice(0, 400)}`);
    assert.ok(result.status >= 400);
    return error;
  }

  async exportReport(
    brandId: string,
    query: { week_of?: string; format?: 'csv' | 'json' },
  ): Promise<{ status: number; raw: string; headers: Record<string, string | string[] | number | undefined> }> {
    return this.request(reportExportRoute.method, reportExportRoute.path, {
      params: this.brand(brandId),
      query,
    });
  }
}

export interface Harness {
  app: FastifyInstance;
  studio: Studio;
  database: TestDatabase;
  fakeState: FakeProviderState;
  scrubber: SecretScrubber;
  /** همهٔ خط‌های log این نمونه؛ برای آزمون نشت راز. */
  logs: string[];
  clock: { now: Date };
  /** تزریق خطای worker در آزمون crash؛ فیلدها در زمان اجرا خوانده می‌شوند. */
  faults: ExecutionFaults;
  client(): TestClient;
  /** کلاینتی که راه‌اندازی مالک را انجام داده و وارد شده است. */
  owner(): Promise<TestClient>;
  close(): Promise<void>;
}

export async function createHarness(options: { sampleData?: boolean; now?: string } = {}): Promise<Harness> {
  const database = await createTestDatabase();
  const logs: string[] = [];
  const scrubber = new SecretScrubber();
  const logger = createLogger({ service: 'api-test', level: 'debug', write: (line) => void logs.push(line) });
  const clock = { now: new Date(options.now ?? '2026-11-11T08:00:00.000Z') };
  const fakeState = new FakeProviderState();
  const faults: ExecutionFaults = {};
  const config: RuntimeConfig = {
    profile: 'local',
    repoRoot: REPO_ROOT,
    home: database.cluster.home,
    apiHost: '127.0.0.1',
    apiPort: 0,
    dashboardPort: 4300,
    pgPort: database.cluster.port,
    publicUrl: PUBLIC_URL,
    secureCookies: false,
    sampleData: options.sampleData ?? true,
    logLevel: 'debug',
    databaseUrl: database.appUrl,
    migrationDatabaseUrl: database.ownerUrl,
    textModel: 'template',
    openrouterModels: [],
  };
  const studio = createStudioFromConfig({
    config,
    databaseUrl: database.appUrl,
    logger,
    now: () => clock.now,
    fakeState,
    masterKey: randomBytes(32),
    faults,
  });
  const app = await buildApp({
    studio,
    logger,
    publicUrl: PUBLIC_URL,
    secureCookies: false,
    authAttemptsPerWindow: 10_000,
  });
  await app.ready();
  return {
    app,
    studio,
    database,
    fakeState,
    scrubber,
    logs,
    clock,
    faults,
    client: () => new TestClient(app),
    async owner() {
      const client = new TestClient(app);
      if ((await client.ok('setupStatus')).needs_owner_setup) {
        await client.ok('setupOwner', { body: OWNER });
      } else {
        await client.ok('login', { body: { email: OWNER.email, password: OWNER.password } });
      }
      return client;
    },
    async close() {
      await app.close();
      await studio.close();
      await database.dispose();
    },
  };
}

/** کلید یکتایی تازه، مثل کلیدی که داشبورد برای هر کلیک می‌سازد. */
export const newKey = (): string => `test-${randomUUID()}`;
