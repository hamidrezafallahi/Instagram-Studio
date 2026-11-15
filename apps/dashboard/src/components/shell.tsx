'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSession } from '@/lib/session.tsx';
import { Banner, Button, ErrorNote, Skeleton } from './ui.tsx';

interface NavItem {
  href: string;
  label: string;
  /** بخشی که هنوز ساخته نشده: غیرفعال با ذکر مرحله و دلیل، نه صفحهٔ خالی. */
  planned?: string;
}

const BRAND_SECTIONS: readonly (Omit<NavItem, 'href'> & { segment: string })[] = [
  { segment: '', label: 'خانهٔ برند' },
  { segment: '/profile', label: 'راه‌اندازی برند' },
  { segment: '/connections', label: 'اتصال‌ها' },
  { segment: '/calendar', label: 'تقویم' },
  { segment: '/studio', label: 'استودیو' },
  { segment: '/approvals', label: 'تأییدها و صف انتشار' },
  { segment: '/reports', label: 'گزارش' },
  { segment: '/runs', label: 'اجراها' },
  { segment: '/settings', label: 'اختیار و تنظیمات' },
];

const PLANNED: readonly { label: string; stage: string; reason: string }[] = [
  { label: 'صندوق پیام', stage: 'M6', reason: 'پاسخ پیام‌ها پس از اتصال واقعی حساب‌ها در مرحلهٔ M6 ساخته می‌شود.' },
  { label: 'رشد و مشتری', stage: 'M6', reason: 'ثبت سرنخ و پیگیری در مرحلهٔ M6 ساخته می‌شود.' },
  { label: 'سایت و سئو', stage: 'M7', reason: 'بررسی سایت و تغییر قابل برگشت در مرحلهٔ M7 ساخته می‌شود.' },
  { label: 'تبلیغات', stage: 'M7', reason: 'بستهٔ تبلیغات و بودجه در مرحلهٔ M7 ساخته می‌شود.' },
];

function isCurrent(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * پوستهٔ برنامه: ورود را تضمین می‌کند، انتخاب‌گر دائمی برند را نشان می‌دهد و بنر «دادهٔ نمونه» را
 * هر جا برند جاری نمونه باشد بالای صفحه نگه می‌دارد.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { state, brands, signOut, calendar, setCalendar, refresh } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ brandId?: string }>();
  const brandId = params.brandId;

  useEffect(() => {
    if (state.status !== 'anonymous') return;
    router.replace(state.setup.needs_owner_setup ? '/setup' : '/login');
  }, [state, router]);

  if (state.status === 'error') {
    return (
      <main className="auth">
        <div className="auth__card stack">
          <h1>استودیو محتوا</h1>
          <ErrorNote error={state.error} onRetry={() => void refresh()} />
        </div>
      </main>
    );
  }
  if (state.status !== 'ready') {
    return (
      <main className="auth">
        <div className="auth__card">
          <Skeleton lines={4} />
        </div>
      </main>
    );
  }

  const current = brands?.find((brand) => brand.id === brandId) ?? null;
  const base = brandId ? `/b/${brandId}` : null;
  const section = base && pathname.startsWith(base) ? pathname.slice(base.length).split('/').slice(0, 2).join('/') : '';

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brandmark" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="brandmark__dot" aria-hidden="true">
            س
          </span>
          استودیو محتوا
        </Link>
        <nav className="nav" aria-label="بخش‌های اصلی">
          <Link className="nav__item" href="/" aria-current={pathname === '/' ? 'page' : undefined}>
            نمای کل برندها
          </Link>
          {base ? (
            <>
              <span className="nav__label">{current?.name ?? 'برند'}</span>
              {BRAND_SECTIONS.map((item) => {
                const href = `${base}${item.segment}`;
                return (
                  <Link
                    key={item.segment}
                    className="nav__item"
                    href={href}
                    aria-current={isCurrent(pathname, href, item.segment === '') ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <span className="nav__label">در مرحله‌های بعد</span>
              {PLANNED.map((item) => (
                <span key={item.label} className="nav__item nav__item--disabled" title={item.reason} aria-disabled="true">
                  {item.label}
                  <span className="nav__tag">{item.stage}</span>
                </span>
              ))}
            </>
          ) : null}
          <span className="nav__label">کمک</span>
          <Link className="nav__item" href="/guide" aria-current={pathname === '/guide' ? 'page' : undefined}>
            راهنما و محدودیت‌ها
          </Link>
        </nav>
      </aside>

      <div className="main">
        <div className="topbar">
          <label className="row" style={{ gap: 8 }}>
            <span className="small muted">برند</span>
            <select
              className="select"
              style={{ inlineSize: 'auto', minInlineSize: 210 }}
              value={brandId ?? ''}
              aria-label="انتخاب برند"
              onChange={(event) => {
                const value = event.target.value;
                if (value === '__new') router.push('/brands/new');
                else if (value === '') router.push('/');
                else router.push(`/b/${value}${section}`);
              }}
            >
              <option value="">همهٔ برندها (نمای کل)</option>
              {(brands ?? [])
                .filter((brand) => brand.status !== 'archived' || brand.id === brandId)
                .map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                    {brand.is_sample ? ' — نمونه' : ''}
                    {brand.status === 'archived' ? ' — آرشیو' : ''}
                  </option>
                ))}
              <option value="__new">＋ برند جدید…</option>
            </select>
          </label>
          <div className="grow" />
          <div className="row" role="group" aria-label="تقویم نمایش">
            <Button small variant={calendar === 'persian' ? 'primary' : 'default'} onClick={() => setCalendar('persian')}>
              شمسی
            </Button>
            <Button small variant={calendar === 'gregory' ? 'primary' : 'default'} onClick={() => setCalendar('gregory')}>
              میلادی
            </Button>
          </div>
          <span className="small muted">{state.session.user.display_name}</span>
          <Button small variant="ghost" onClick={() => void signOut()}>
            خروج
          </Button>
        </div>

        <main className="content">
          <div className="stack">
            {current?.is_sample ? (
              <Banner tone="sample">
                <strong>دادهٔ نمونه.</strong> «{current.name}» برند ساختگی است؛ متن‌ها، سنجه‌ها و اتصال آن واقعی نیستند
                و چیزی از این برند منتشر یا ارسال نمی‌شود.
              </Banner>
            ) : null}
            {current?.status === 'archived' ? (
              <Banner tone="warn">این برند آرشیو شده است و کار تازه‌ای برای آن شروع نمی‌شود.</Banner>
            ) : null}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
