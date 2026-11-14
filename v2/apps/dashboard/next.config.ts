import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * داشبورد فقط با مبدأ خودش حرف می‌زند (ADR-023): درخواست‌های ‎/api/v1/*‎ را route handler
 * ‎src/app/api/[...path]/route.ts‎ در زمان اجرا به API استودیو می‌فرستد (نشانی از STUDIO_API_ORIGIN).
 * مرورگر هیچ رازی نگه نمی‌دارد و کوکی نشست HttpOnly است.
 */
const nextConfig: NextConfig = {
  // قراردادهای مشترک مستقیماً از سورس TypeScript خوانده می‌شوند.
  transpilePackages: ['@studio/contracts'],
  turbopack: { root: join(here, '..', '..') },
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
