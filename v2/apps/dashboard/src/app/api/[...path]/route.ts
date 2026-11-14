import type { NextRequest } from 'next/server';

/**
 * پروکسی زمان‌اجرا از داشبورد به API استودیو (ADR-023).
 * مرورگر فقط با مبدأ داشبورد حرف می‌زند؛ این handler درخواست ‎/api/v1/*‎ را به API می‌فرستد.
 * نشانی API در «زمان اجرا» از STUDIO_API_ORIGIN خوانده می‌شود، پس تغییر درگاه نیازی به build دوباره ندارد.
 * فقط سرآیندهای لازم عبور می‌کنند و هیچ رازی در این لایه نگه داشته نمی‌شود.
 */
export const dynamic = 'force-dynamic';

const REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'content-type',
  'cookie',
  'origin',
  'sec-fetch-site',
  'user-agent',
  'x-csrf-token',
] as const;

const RESPONSE_HEADERS = [
  'cache-control',
  'content-disposition',
  'content-type',
  'referrer-policy',
  'retry-after',
  'x-content-type-options',
] as const;

function unavailable(): Response {
  return Response.json(
    {
      error: {
        code: 'PROVIDER_UNAVAILABLE',
        message_fa: 'سرویس API استودیو در دسترس نیست. اجرای آن را بررسی کنید و دوباره تلاش کنید.',
        retryable: true,
        trace_id: 'dashboard-proxy',
      },
    },
    { status: 503, headers: { 'cache-control': 'no-store' } },
  );
}

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await context.params;
  // فقط مسیرهای نسخه‌دار API پروکسی می‌شوند.
  if (path[0] !== 'v1') {
    return Response.json(
      { error: { code: 'NOT_FOUND', message_fa: 'مورد خواسته‌شده پیدا نشد.', retryable: false, trace_id: 'dashboard-proxy' } },
      { status: 404 },
    );
  }
  const origin = process.env['STUDIO_API_ORIGIN'] ?? 'http://127.0.0.1:4310';
  const target = `${origin}/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const init: RequestInit = { method: request.method, headers, redirect: 'manual', cache: 'no-store' };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const body = await request.arrayBuffer();
    if (body.byteLength > 0) init.body = body;
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return unavailable();
  }

  const responseHeaders = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append('set-cookie', cookie);
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export { forward as DELETE, forward as GET, forward as PATCH, forward as POST, forward as PUT };
