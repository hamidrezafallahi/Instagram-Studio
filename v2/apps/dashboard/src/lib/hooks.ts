'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiFailure } from './api.ts';

export interface QueryState<T> {
  data: T | undefined;
  error: ApiFailure | null;
  loading: boolean;
  reload: () => void;
  setData: (value: T) => void;
}

function toFailure(error: unknown): ApiFailure {
  return error instanceof ApiFailure
    ? error
    : new ApiFailure({ code: 'INTERNAL', status: 0, message: 'خطای پیش‌بینی‌نشده در داشبورد رخ داد.' });
}

interface Stored<T> {
  key: string | null;
  data: T | undefined;
  error: ApiFailure | null;
  loading: boolean;
}

/**
 * واکشی داده با وضعیت‌های loading / error / data. با تغییر key دوباره واکشی می‌شود.
 * هر نتیجه همراه کلید خودش نگه داشته می‌شود؛ پس با تعویض برند، دادهٔ برند قبلی حتی برای یک لحظه
 * نمایش داده نمی‌شود و پاسخ دیررسیدهٔ درخواست قدیمی نادیده گرفته می‌شود.
 */
export function useQuery<T>(key: string | null, fetcher: () => Promise<T>): QueryState<T> {
  const [stored, setStored] = useState<Stored<T>>({ key, data: undefined, error: null, loading: key !== null });
  const [version, setVersion] = useState(0);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (key === null) {
      setStored({ key, data: undefined, error: null, loading: false });
      return;
    }
    let active = true;
    setStored((previous) => ({
      key,
      data: previous.key === key ? previous.data : undefined,
      error: null,
      loading: true,
    }));
    fetcherRef
      .current()
      .then((data) => {
        if (active) setStored({ key, data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (active) setStored({ key, data: undefined, error: toFailure(error), loading: false });
      });
    return () => {
      active = false;
    };
  }, [key, version]);

  const current = stored.key === key;
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const setData = useCallback(
    (value: T) => setStored({ key, data: value, error: null, loading: false }),
    [key],
  );
  return {
    data: current ? stored.data : undefined,
    error: current ? stored.error : null,
    loading: key !== null && (!current || stored.loading),
    reload,
    setData,
  };
}

export interface MutationState<A extends unknown[], R> {
  run: (...args: A) => Promise<R | undefined>;
  pending: boolean;
  error: ApiFailure | null;
  reset: () => void;
}

/** اجرای یک تغییر با وضعیت pending و خطا؛ هنگام اجرا فراخوان دوم نادیده گرفته می‌شود. */
export function useMutation<A extends unknown[], R>(action: (...args: A) => Promise<R>): MutationState<A, R> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const busy = useRef(false);
  const actionRef = useRef(action);
  useEffect(() => {
    actionRef.current = action;
  });

  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    if (busy.current) return undefined;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      return await actionRef.current(...args);
    } catch (failure) {
      setError(toFailure(failure));
      return undefined;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, []);
  const reset = useCallback(() => setError(null), []);
  return { run, pending, error, reset };
}
