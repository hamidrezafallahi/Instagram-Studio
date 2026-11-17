import {
  assetFileRoute,
  assetUploadRoute,
  contentPackageRoute,
  reportExportRoute,
  type AssetView,
  type UploadAssetQuery,
  routes,
  type ApiError,
  type ErrorCode,
  type RouteBodyInput,
  type RouteId,
  type RouteParams,
  type RouteQuery,
  type RouteResponse,
} from '@studio/contracts';

/**
 * کلاینت API داشبورد. همهٔ درخواست‌ها به مبدأ خود داشبورد (‎/api‎) می‌روند و Next آن‌ها را به API پروکسی می‌کند.
 * کوکی نشست HttpOnly است و جاوااسکریپت به آن دسترسی ندارد؛ فقط نشانهٔ CSRF در حافظهٔ صفحه نگه داشته می‌شود.
 */

export class ApiFailure extends Error {
  readonly code: ErrorCode | 'NETWORK';
  readonly status: number;
  readonly traceId: string | null;
  readonly actionRequired: string | null;
  readonly details: { path: string; message: string }[];

  constructor(input: {
    code: ErrorCode | 'NETWORK';
    message: string;
    status: number;
    traceId?: string | null;
    actionRequired?: string | null;
    details?: { path: string; message: string }[];
  }) {
    super(input.message);
    this.name = 'ApiFailure';
    this.code = input.code;
    this.status = input.status;
    this.traceId = input.traceId ?? null;
    this.actionRequired = input.actionRequired ?? null;
    this.details = input.details ?? [];
  }
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

interface CallInput<K extends RouteId> {
  params?: RouteParams<K>;
  query?: RouteQuery<K>;
  body?: RouteBodyInput<K>;
}

function buildUrl(path: string, params: unknown, query: unknown): string {
  let url = path.replace(/\{(\w+)\}/g, (_, key: string) =>
    encodeURIComponent(String((params as Record<string, unknown> | undefined)?.[key] ?? '')),
  );
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries((query ?? {}) as Record<string, unknown>)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  if (text) url += `?${text}`;
  return `/api${url}`;
}

export async function api<K extends RouteId>(id: K, input: CallInput<K> = {}): Promise<RouteResponse<K>> {
  const def = routes[id];
  const headers: Record<string, string> = { accept: 'application/json' };
  if (def.method !== 'GET' && csrfToken) headers['x-csrf-token'] = csrfToken;
  if (input.body !== undefined) headers['content-type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(buildUrl(def.path, input.params, input.query), {
      method: def.method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
  } catch {
    throw new ApiFailure({
      code: 'NETWORK',
      status: 0,
      message: 'ارتباط با سرور استودیو برقرار نیست. اتصال شبکه و اجرای سرویس را بررسی کنید.',
    });
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = (payload as ApiError | null)?.error;
    throw new ApiFailure({
      code: error?.code ?? (response.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'INTERNAL'),
      status: response.status,
      message:
        error?.message_fa ??
        (response.status >= 500
          ? 'سرور استودیو پاسخ نمی‌دهد. چند لحظهٔ دیگر دوباره تلاش کنید.'
          : 'درخواست انجام نشد.'),
      traceId: error?.trace_id ?? null,
      actionRequired: error?.action_required ?? null,
      details: error?.details ?? [],
    });
  }
  return payload as RouteResponse<K>;
}

/** نشانی دانلود گزارش هفتگی (فایل CSV یا JSON). */
export function reportExportUrl(
  params: { workspace_id: string; brand_id: string },
  query: { week_of?: string; format: 'csv' | 'json' },
): string {
  return buildUrl(reportExportRoute.path, params, query);
}

/** نشانی فایل یک دارایی (تصویر، ویدئو، زیرنویس) از مسیر پروکسی همان مبدأ؛ کوکی نشست لازم است. */
export function assetFileUrl(params: { workspace_id: string; brand_id: string }, assetId: string): string {
  return buildUrl(assetFileRoute.path, { ...params, asset_id: assetId }, {});
}

/** نشانی دانلود بستهٔ انتشار دستی (ZIP) نسخهٔ جاری یک محتوا. */
export function contentPackageUrl(params: { workspace_id: string; brand_id: string }, contentId: string): string {
  return buildUrl(contentPackageRoute.path, { ...params, content_id: contentId }, {});
}

/** بارگذاری خام یک فایل؛ نوع را سرور از محتوای فایل تشخیص می‌دهد. */
export async function uploadAsset(
  params: { workspace_id: string; brand_id: string },
  query: UploadAssetQuery,
  file: Blob,
): Promise<AssetView> {
  const headers: Record<string, string> = { accept: 'application/json', 'content-type': 'application/octet-stream' };
  if (csrfToken) headers['x-csrf-token'] = csrfToken;
  let response: Response;
  try {
    response = await fetch(buildUrl(assetUploadRoute.path, params, query), {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      body: file,
    });
  } catch {
    throw new ApiFailure({ code: 'NETWORK', status: 0, message: 'ارتباط با سرور استودیو برقرار نیست.' });
  }
  const payload = (await response.json().catch(() => null)) as AssetView | ApiError | null;
  if (!response.ok) {
    const error = (payload as ApiError | null)?.error;
    throw new ApiFailure({
      code: error?.code ?? 'INTERNAL',
      status: response.status,
      message: error?.message_fa ?? (response.status === 413 ? 'حجم فایل بیش از سقف مجاز است.' : 'بارگذاری انجام نشد.'),
      traceId: error?.trace_id ?? null,
      actionRequired: error?.action_required ?? null,
      details: error?.details ?? [],
    });
  }
  return payload as AssetView;
}

/** کلید یکتایی هر کلیک؛ دوبار کلیک روی همان پنجرهٔ تأیید همان کلید را می‌فرستد و run دوم نمی‌سازد. */
export function newIdempotencyKey(): string {
  return `ui-${crypto.randomUUID()}`;
}
