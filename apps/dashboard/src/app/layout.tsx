import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { SessionProvider } from '@/lib/session.tsx';
import './globals.css';

// فونت فارسی داخل مخزن است (OFL)؛ ساخت به شبکه وابسته نیست.
const vazirmatn = localFont({
  src: '../fonts/Vazirmatn-Variable.woff2',
  variable: '--font-vazir',
  weight: '100 900',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'استودیو محتوا', template: '%s · استودیو محتوا' },
  description: 'داشبورد برنامه‌ریزی، تولید و گزارش محتوای برند',
  // داشبورد خصوصی است و نباید در موتورهای جست‌وجو نمایه شود.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
