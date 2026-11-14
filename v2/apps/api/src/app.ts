import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import {
  ERROR_HTTP,
  StudioError,
  isStudioError,
  reportExportRoute,
  routes,
  type ApiError,
  type RouteBody,
  type RouteDef,
  type RouteId,
  type RouteParams,
  type RouteQuery,
  type RouteResponse,
} from '@studio/contracts';
import type {
  Access,
  AuthenticatedSession,
  BrandCall,
  IssuedSession,
  Studio,
  WorkspaceCall,
} from '@studio/orchestration';
import { safeEqual, type Logger } from '@studio/security';
import Fastify, {
  LogController,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import type { z } from 'zod';

export const SESSION_COOKIE = 'studio_session';

export interface ApiOptions {
  studio: Studio;
  logger: Logger;
  /** نشانی عمومی داشبورد؛ درخواست تغییردهنده فقط از همین مبدأ پذیرفته می‌شود. */
  publicUrl: string;
  secureCookies: boolean;
  /** سقف تلاش ورود/راه‌اندازی در هر پنجره برای هر نشانی؛ در آزمون بزرگ‌تر تنظیم می‌شود. */
  authAttemptsPerWindow?: number;
}

interface HandlerContext<K extends RouteId> {
  params: RouteParams<K>;
  query: RouteQuery<K>;
  body: RouteBody<K>;
  trace_id: string;
  /** برای مسیرهای غیر public همیشه مقدار دارد. */
  session: AuthenticatedSession;
  workspace(): WorkspaceCall;
  brand(): BrandCall;
  request: FastifyRequest;
  reply: FastifyReply;
}

type Handlers = { [K in RouteId]: (ctx: HandlerContext<K>) => Promise<RouteResponse<K>> };

function parse<T>(schema: z.ZodType<T> | undefined, value: unknown, where: string): T {
  if (!schema) return {} as T;
  const result = schema.safeParse(value ?? {});
  if (result.success) return result.data;
  throw new StudioError('VALIDATION_FAILED', {
    details: result.error.issues.slice(0, 20).map((issue) => ({
      path: [where, ...issue.path.map(String)].join('.'),
      message: issue.message,
    })),
  });
}

/** مبدأهای مجاز: نشانی عمومی داشبورد و، در نصب محلی، هر دو نام loopback با همان درگاه. */
function allowedOrigins(publicUrl: string): Set<string> {
  const url = new URL(publicUrl);
  const origins = new Set([url.origin]);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    for (const host of ['localhost', '127.0.0.1']) origins.add(`${url.protocol}//${host}:${url.port}`);
  }
  return origins;
}

export async function buildApp(options: ApiOptions): Promise<FastifyInstance> {
  const { studio, logger } = options;
  const origins = allowedOrigins(options.publicUrl);
  const attemptsLimit = options.authAttemptsPerWindow ?? 10;
  const attempts = new Map<string, number[]>();

  const app = Fastify({
    loggerInstance: logger,
    genReqId: () => randomUUID(),
    bodyLimit: 1_048_576,
    // log پیش‌فرض هر درخواست خاموش است؛ یک خط فشرده و بدون داده در onResponse نوشته می‌شود.
    logController: new LogController({ disableRequestLogging: true, requestIdLogLabel: 'trace_id' }),
  });
  await app.register(cookie);

  app.addHook('onResponse', async (request, reply) => {
    if (request.url === '/healthz' || request.url === '/readyz') return;
    // فقط الگوی مسیر ثبت می‌شود، نه نشانی کامل؛ پس query و شناسه‌ها وارد log نمی‌شوند.
    request.log.info(
      {
        method: request.method,
        route: request.routeOptions.url ?? null,
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
      },
      'request completed',
    );
  });

  const errorPayload = (
    code: ApiError['error']['code'],
    traceId: string,
    extra: Partial<ApiError['error']> = {},
  ): ApiError => ({
    error: {
      code,
      message_fa: extra.message_fa ?? new StudioError(code).message_fa,
      retryable: ERROR_HTTP[code].retryable,
      trace_id: traceId,
      ...(extra.action_required ? { action_required: extra.action_required } : {}),
      ...(extra.details ? { details: extra.details } : {}),
    },
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
  });

  // خطا: همیشه قالب یکسان؛ stack، SQL و راز هرگز به پاسخ عمومی نمی‌رسد.
  app.setErrorHandler((error: unknown, request, reply) => {
    const traceId = request.id;
    if (isStudioError(error)) {
      if (error.code === 'INTERNAL') request.log.error({ err: error, trace_id: traceId }, 'internal error');
      return reply.code(error.status).send(
        errorPayload(error.code, traceId, {
          message_fa: error.message_fa,
          ...(error.action_required ? { action_required: error.action_required } : {}),
          ...(error.details ? { details: error.details } : {}),
        }),
      );
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      // خطای خود Fastify برای بدنهٔ نامعتبر، نوع محتوای نادرست یا حجم زیاد.
      return reply.code(status).send(errorPayload('VALIDATION_FAILED', traceId));
    }
    request.log.error({ err: error, trace_id: traceId, url: request.routeOptions.url }, 'unhandled error');
    return reply.code(500).send(errorPayload('INTERNAL', traceId));
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send(errorPayload('NOT_FOUND', request.id)),
  );

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async (_request, reply) => {
    try {
      await studio.ready();
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'not_ready' });
    }
  });

  const setSessionCookie = (reply: FastifyReply, issued: IssuedSession): void => {
    reply.setCookie(SESSION_COOKIE, issued.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: options.secureCookies,
      path: '/',
      maxAge: issued.max_age_seconds,
    });
  };

  /** محدودیت سادهٔ تلاش ورود در حافظه؛ قفل پایدار هر حساب جدا در پایگاه داده است. */
  const throttle = (request: FastifyRequest): void => {
    const now = Date.now();
    const recent = (attempts.get(request.ip) ?? []).filter((time) => now - time < 5 * 60_000);
    if (recent.length >= attemptsLimit) {
      attempts.set(request.ip, recent);
      throw new StudioError('RATE_LIMITED');
    }
    recent.push(now);
    attempts.set(request.ip, recent);
  };

  /** درخواست تغییردهنده از مبدأ دیگر رد می‌شود؛ کلاینت غیرمرورگری سرآیند Origin ندارد. */
  const checkOrigin = (request: FastifyRequest): void => {
    const origin = request.headers.origin;
    if (typeof origin === 'string' && !origins.has(origin)) throw new StudioError('CSRF_FAILED');
    if (request.headers['sec-fetch-site'] === 'cross-site') throw new StudioError('CSRF_FAILED');
  };

  const userAgent = (request: FastifyRequest): string | null =>
    typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null;

  /** احراز هویت، CSRF، اعتبارسنجی و بررسی عضویت/نقش — مشترک بین همهٔ مسیرها. */
  async function secure(
    def: Pick<RouteDef, 'scope' | 'method' | 'min_role' | 'params' | 'query' | 'body'>,
    request: FastifyRequest,
  ): Promise<{
    session: AuthenticatedSession | null;
    access: Access | null;
    params: Record<string, string>;
    query: unknown;
    body: unknown;
  }> {
    let session: AuthenticatedSession | null = null;
    if (def.scope !== 'public') {
      session = await studio.auth.authenticate(request.cookies[SESSION_COOKIE]);
      if (!session) throw new StudioError('UNAUTHENTICATED');
    }
    if (def.method !== 'GET') {
      checkOrigin(request);
      if (session) {
        const header = request.headers['x-csrf-token'];
        if (typeof header !== 'string' || !safeEqual(header, session.csrf_token)) {
          throw new StudioError('CSRF_FAILED');
        }
      }
    }
    const params = parse(def.params, request.params, 'params') as Record<string, string>;
    let access: Access | null = null;
    if (session && (def.scope === 'workspace' || def.scope === 'brand')) {
      access = await studio.auth.authorize(
        session.principal,
        params['workspace_id'] as string,
        def.scope === 'brand' ? params['brand_id'] : undefined,
        def.min_role ?? 'owner',
      );
    }
    return {
      session,
      access,
      params,
      query: parse(def.query, request.query, 'query'),
      body: def.body ? parse(def.body, request.body, 'body') : undefined,
    };
  }

  function calls(access: Access | null, session: AuthenticatedSession | null, traceId: string) {
    const workspace = (): WorkspaceCall => {
      if (!access || !session) throw new StudioError('INTERNAL', { message_fa: 'زمینهٔ دسترسی ساخته نشده است.' });
      return {
        trace_id: traceId,
        workspace_id: access.workspace_id,
        actor: { type: 'user', id: session.principal.user_id, role: access.role },
      };
    };
    const brand = (): BrandCall => {
      const call = workspace();
      if (!access?.brand_id) throw new StudioError('INTERNAL', { message_fa: 'زمینهٔ برند ساخته نشده است.' });
      return { ...call, brand_id: access.brand_id };
    };
    return { workspace, brand };
  }

  const handlers: Handlers = {
    setupStatus: () => studio.auth.setupStatus(),
    async setupOwner(ctx) {
      throttle(ctx.request);
      const issued = await studio.auth.setupOwner(ctx.body, {
        trace_id: ctx.trace_id,
        user_agent: userAgent(ctx.request),
      });
      setSessionCookie(ctx.reply, issued);
      return issued.info;
    },
    async login(ctx) {
      throttle(ctx.request);
      const issued = await studio.auth.login(ctx.body, { user_agent: userAgent(ctx.request) });
      setSessionCookie(ctx.reply, issued);
      return issued.info;
    },
    async logout(ctx) {
      await studio.auth.logout(ctx.session);
      ctx.reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return { ok: true };
    },
    session: (ctx) => studio.auth.sessionInfo(ctx.session),
    listPacks: async () => ({ items: studio.catalog.listPacks() }),
    getPack: async (ctx) => studio.catalog.getPack(ctx.params.pack_id),
    listProviders: async () => ({ items: studio.connections.catalog() }),
    workspaceOverview: (ctx) => studio.reports.workspaceOverview(ctx.workspace()),
    listBrands: async (ctx) => ({ items: await studio.brands.list(ctx.workspace()) }),
    createBrand: (ctx) => studio.brands.create(ctx.workspace(), ctx.body),
    seedSampleBrands: async (ctx) => ({ items: await studio.sampleData.seed(ctx.workspace()) }),
    getBrand: (ctx) => studio.brands.get(ctx.brand()),
    updateBrandProfile: (ctx) => studio.brands.updateProfile(ctx.brand(), ctx.body),
    listBrandRevisions: async (ctx) => ({ items: await studio.brands.revisions(ctx.brand()) }),
    rollbackBrand: (ctx) => studio.brands.rollback(ctx.brand(), ctx.body),
    setBrandStatus: (ctx) => studio.brands.setStatus(ctx.brand(), ctx.body.status),
    listConnections: async (ctx) => ({ items: await studio.connections.list(ctx.brand()) }),
    createConnection: (ctx) => studio.connections.create(ctx.brand(), ctx.body),
    testConnection: (ctx) => studio.connections.test(ctx.brand(), ctx.params.connection_id),
    revokeConnection: (ctx) => studio.connections.revoke(ctx.brand(), ctx.params.connection_id),
    listPlans: async (ctx) => ({ items: await studio.planning.listPlans(ctx.brand(), ctx.query.week_of) }),
    updateScheduleEntry: (ctx) => studio.planning.updateEntry(ctx.brand(), ctx.params.entry_id, ctx.body),
    listContent: async (ctx) => ({ items: await studio.planning.listContent(ctx.brand(), ctx.query.state) }),
    getContent: (ctx) => studio.planning.getContent(ctx.brand(), ctx.params.content_id),
    createContentRevision: (ctx) =>
      studio.planning.createRevision(ctx.brand(), ctx.params.content_id, ctx.body),
    createRun: (ctx) => studio.runs.create(ctx.brand(), ctx.body),
    listRuns: async (ctx) => ({ items: await studio.runs.list(ctx.brand()) }),
    getRun: (ctx) => studio.runs.get(ctx.brand(), ctx.params.run_id),
    weeklyReport: (ctx) => studio.reports.weekly(ctx.brand(), ctx.query.week_of),
    getPolicy: (ctx) => studio.brands.getPolicy(ctx.brand()),
    updatePolicy: (ctx) => studio.brands.updatePolicy(ctx.brand(), ctx.body),
    listAuditEvents: async (ctx) => ({
      items: await studio.reports.auditEvents(ctx.brand(), ctx.query.limit ?? 50),
    }),
  };

  const fastifyPath = (path: string): string => path.replace(/\{(\w+)\}/g, ':$1');

  // همان جدول مسیری که OpenAPI از آن تولید شده است ثبت می‌شود؛ مسیر دستی و میان‌بری وجود ندارد.
  for (const [id, def] of Object.entries(routes) as [RouteId, RouteDef][]) {
    app.route({
      method: def.method,
      url: fastifyPath(def.path),
      handler: async (request, reply) => {
        const secured = await secure(def, request);
        const handler = handlers[id] as (ctx: HandlerContext<RouteId>) => Promise<unknown>;
        const result = await handler({
          params: secured.params,
          query: secured.query,
          body: secured.body,
          trace_id: request.id,
          session: secured.session as AuthenticatedSession,
          ...calls(secured.access, secured.session, request.id),
          request,
          reply,
        } as HandlerContext<RouteId>);
        // پاسخ با قرارداد سنجیده می‌شود تا رفتار واقعی از سند فاصله نگیرد.
        const checked = def.response.safeParse(result);
        if (!checked.success) {
          request.log.error(
            { route: id, trace_id: request.id, issues: checked.error.issues.slice(0, 5) },
            'response does not match contract',
          );
          throw new StudioError('INTERNAL');
        }
        return reply.code(def.success_status ?? 200).send(checked.data);
      },
    });
  }

  app.route({
    method: reportExportRoute.method,
    url: fastifyPath(reportExportRoute.path),
    handler: async (request, reply) => {
      const secured = await secure(reportExportRoute, request);
      const query = secured.query as z.infer<typeof reportExportRoute.query>;
      const file = await studio.reports.export(
        calls(secured.access, secured.session, request.id).brand(),
        query.week_of,
        query.format,
      );
      return reply
        .header('content-type', file.content_type)
        .header('content-disposition', `attachment; filename="${file.filename}"`)
        .send(file.body);
    },
  });

  return app;
}
