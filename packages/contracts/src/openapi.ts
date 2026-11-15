import { z } from 'zod';
import { API_VERSION, reportExportRoute, routes, type RouteDef } from './api.ts';
import { ApiError, ERROR_HTTP, ERROR_MESSAGE_FA, type ErrorCode } from './errors.ts';
import { SCHEMA_VERSION } from './primitives.ts';

type Json = Record<string, unknown>;

/**
 * تبدیل یک schema به JSON Schema 2020-12. schemaهای نام‌دار (meta.id) به $defs می‌روند؛
 * سپس به components/schemas منتقل و ارجاع‌ها بازنویسی می‌شوند.
 */
function toSchema(schema: z.ZodType, io: 'input' | 'output', components: Json): Json {
  const json = z.toJSONSchema(schema, { io, unrepresentable: 'any' }) as Json;
  const defs = (json['$defs'] ?? {}) as Json;
  delete json['$defs'];
  delete json['$schema'];
  for (const [name, def] of Object.entries(defs)) {
    components[name] ??= rewriteRefs(def);
  }
  const id = json['id'];
  if (typeof id === 'string') {
    delete json['id'];
    components[id] ??= rewriteRefs(json);
    return { $ref: `#/components/schemas/${id}` };
  }
  return rewriteRefs(json) as Json;
}

function rewriteRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteRefs);
  if (node === null || typeof node !== 'object') return node;
  const out: Json = {};
  for (const [key, value] of Object.entries(node as Json)) {
    if (key === '$ref' && typeof value === 'string') {
      out[key] = value.replace(/^#\/\$defs\//, '#/components/schemas/');
    } else if (key === 'id' && typeof value === 'string' && 'type' in (node as Json)) {
      // شناسهٔ ثبت‌شده در registry؛ در خروجی OpenAPI لازم نیست.
      continue;
    } else {
      out[key] = rewriteRefs(value);
    }
  }
  return out;
}

function paramList(def: RouteDef, components: Json): Json[] {
  const params: Json[] = [];
  const add = (schema: z.ZodType | undefined, where: 'path' | 'query'): void => {
    if (!schema) return;
    const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Json;
    const defs = (json['$defs'] ?? {}) as Json;
    for (const [name, value] of Object.entries(defs)) components[name] ??= rewriteRefs(value);
    const props = (json['properties'] ?? {}) as Record<string, unknown>;
    const required = new Set((json['required'] as string[] | undefined) ?? []);
    for (const [name, value] of Object.entries(props)) {
      params.push({
        name,
        in: where,
        required: where === 'path' ? true : required.has(name),
        schema: rewriteRefs(value),
      });
    }
  };
  add(def.params, 'path');
  add(def.query, 'query');
  return params;
}

function errorResponses(codes: readonly ErrorCode[]): Json {
  const byStatus = new Map<number, ErrorCode[]>();
  for (const code of [...codes, 'INTERNAL' as const]) {
    const status = ERROR_HTTP[code].status;
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }
  const out: Json = {};
  for (const [status, list] of [...byStatus.entries()].sort((a, b) => a[0] - b[0])) {
    out[String(status)] = {
      description: list.map((code) => `${code}: ${ERROR_MESSAGE_FA[code]}`).join(' | '),
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
    };
  }
  return out;
}

/** سند OpenAPI 3.1 از همان جدول مسیری که API واقعاً ثبت می‌کند. */
export function buildOpenApiDocument(): Json {
  const components: Json = {};
  toSchema(ApiError, 'output', components);
  const paths: Record<string, Json> = {};

  for (const def of Object.values(routes) as RouteDef[]) {
    const operation: Json = {
      operationId: def.id,
      tags: [def.tag],
      summary: def.summary_fa,
      'x-scope': def.scope,
      ...(def.min_role ? { 'x-min-role': def.min_role } : {}),
      parameters: paramList(def, components),
      responses: {
        [String(def.success_status ?? 200)]: {
          description: 'موفق',
          content: {
            'application/json': { schema: toSchema(def.response, 'output', components) },
          },
        },
        ...errorResponses(def.errors),
      },
    };
    if (def.scope !== 'public') operation['security'] = [{ sessionCookie: [] }];
    if (def.method !== 'GET' && def.scope !== 'public') {
      (operation['parameters'] as Json[]).push({
        name: 'x-csrf-token',
        in: 'header',
        required: true,
        schema: { type: 'string' },
        description: 'نشانهٔ CSRF همان نشست',
      });
    }
    if (def.body) {
      operation['requestBody'] = {
        required: true,
        content: { 'application/json': { schema: toSchema(def.body, 'input', components) } },
      };
    }
    paths[def.path] ??= {};
    (paths[def.path] as Json)[def.method.toLowerCase()] = operation;
  }

  // مسیر دانلود گزارش (پاسخ فایل).
  paths[reportExportRoute.path] = {
    get: {
      operationId: reportExportRoute.id,
      tags: [reportExportRoute.tag],
      summary: reportExportRoute.summary_fa,
      'x-scope': reportExportRoute.scope,
      'x-min-role': reportExportRoute.min_role,
      security: [{ sessionCookie: [] }],
      parameters: paramList(
        { ...reportExportRoute, response: z.string(), errors: [] } as unknown as RouteDef,
        components,
      ),
      responses: {
        '200': {
          description: 'فایل گزارش؛ مقدار ناموجود با N/A نوشته می‌شود',
          content: {
            'text/csv': { schema: { type: 'string' } },
            'application/json': { schema: { $ref: '#/components/schemas/WeeklyReport' } },
          },
        },
        ...errorResponses(['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION_FAILED']),
      },
    },
  };

  return {
    openapi: '3.1.0',
    info: {
      title: 'استودیو محتوای برند — API',
      version: API_VERSION,
      description:
        'مسیرهای نسخه‌دار استودیو. این سند از جدول مسیرهای packages/contracts تولید می‌شود ' +
        'و همان جدول را API اجرا می‌کند؛ دستی ویرایش نشود.',
      'x-schema-version': SCHEMA_VERSION,
    },
    servers: [{ url: 'http://localhost:4310', description: 'پروفایل local' }],
    tags: [...new Set((Object.values(routes) as RouteDef[]).map((def) => def.tag))].map(
      (name) => ({ name }),
    ),
    paths,
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'studio_session' },
      },
      schemas: Object.fromEntries(Object.entries(components).sort(([a], [b]) => a.localeCompare(b))),
    },
  };
}

/** JSON Schema مستقل یک موجودیت (برای فایل‌های schema/*.schema.json). */
export function buildEntitySchema(schema: z.ZodType): Json {
  return z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' }) as Json;
}
