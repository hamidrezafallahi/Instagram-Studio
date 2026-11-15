'use client';

import type { BrandSummary, SessionInfo, SetupStatus } from '@studio/contracts';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiFailure, api, setCsrfToken } from './api.ts';
import type { CalendarMode } from './format.ts';

type SessionState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiFailure }
  | { status: 'anonymous'; setup: SetupStatus }
  | { status: 'ready'; setup: SetupStatus; session: SessionInfo };

interface SessionContextValue {
  state: SessionState;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  calendar: CalendarMode;
  setCalendar: (mode: CalendarMode) => void;
  /** فهرست برندهای فضای کاری برای انتخاب‌گر دائمی برند. */
  brands: BrandSummary[] | null;
  reloadBrands: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const CALENDAR_KEY = 'studio.calendar';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [brands, setBrands] = useState<BrandSummary[] | null>(null);
  const [calendar, setCalendarState] = useState<CalendarMode>('persian');

  const refresh = useCallback(async () => {
    try {
      const setup = await api('setupStatus');
      if (setup.needs_owner_setup) {
        setCsrfToken(null);
        setState({ status: 'anonymous', setup });
        return;
      }
      try {
        const session = await api('session');
        setCsrfToken(session.csrf_token);
        setState({ status: 'ready', setup, session });
      } catch (error) {
        if (error instanceof ApiFailure && error.code === 'UNAUTHENTICATED') {
          setCsrfToken(null);
          setState({ status: 'anonymous', setup });
          return;
        }
        throw error;
      }
    } catch (error) {
      setState({
        status: 'error',
        error:
          error instanceof ApiFailure
            ? error
            : new ApiFailure({ code: 'INTERNAL', status: 0, message: 'خطای پیش‌بینی‌نشده رخ داد.' }),
      });
    }
  }, []);

  const workspaceId = state.status === 'ready' ? (state.session.workspaces[0]?.id ?? null) : null;

  const reloadBrands = useCallback(async () => {
    if (!workspaceId) {
      setBrands(null);
      return;
    }
    try {
      const result = await api('listBrands', { params: { workspace_id: workspaceId } });
      setBrands(result.items);
    } catch {
      setBrands([]);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
    try {
      const stored = window.localStorage.getItem(CALENDAR_KEY);
      if (stored === 'gregory' || stored === 'persian') setCalendarState(stored);
    } catch {
      // ذخیره‌سازی مرورگر در دسترس نیست؛ پیش‌فرض شمسی می‌ماند.
    }
  }, [refresh]);

  useEffect(() => {
    void reloadBrands();
  }, [reloadBrands]);

  const setCalendar = useCallback((mode: CalendarMode) => {
    setCalendarState(mode);
    try {
      window.localStorage.setItem(CALENDAR_KEY, mode);
    } catch {
      // نادیده گرفته می‌شود.
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api('logout');
    } finally {
      setCsrfToken(null);
      setBrands(null);
      await refresh();
    }
  }, [refresh]);

  const value = useMemo(
    () => ({ state, refresh, signOut, calendar, setCalendar, brands, reloadBrands }),
    [state, refresh, signOut, calendar, setCalendar, brands, reloadBrands],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider در درخت نیست.');
  return value;
}

/** نشست آماده؛ فقط در صفحه‌های داخل پوستهٔ برنامه استفاده می‌شود که ورود را تضمین کرده است. */
export function useReadySession(): { session: SessionInfo; setup: SetupStatus; workspaceId: string } {
  const { state } = useSession();
  if (state.status !== 'ready') throw new Error('نشست آماده نیست.');
  const workspaceId = state.session.workspaces[0]?.id;
  if (!workspaceId) throw new Error('این حساب عضو هیچ فضای کاری نیست.');
  return { session: state.session, setup: state.setup, workspaceId };
}
