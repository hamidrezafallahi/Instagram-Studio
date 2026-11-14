'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, ErrorNote, Field, Skeleton } from '@/components/ui.tsx';
import { api } from '@/lib/api.ts';
import { useMutation } from '@/lib/hooks.ts';
import { useSession } from '@/lib/session.tsx';

export default function LoginPage() {
  const router = useRouter();
  const { state, refresh } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (state.status === 'ready') router.replace('/');
    if (state.status === 'anonymous' && state.setup.needs_owner_setup) router.replace('/setup');
  }, [state, router]);

  const login = useMutation(async () => {
    await api('login', { body: { email, password } });
    await refresh();
  });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    void login.run();
  };

  if (state.status === 'loading' || state.status === 'ready') {
    return (
      <main className="auth">
        <div className="auth__card">
          <Skeleton />
        </div>
      </main>
    );
  }

  return (
    <main className="auth">
      <form className="card auth__card stack" onSubmit={submit} noValidate>
        <div className="stack stack--tight">
          <h1>ورود به استودیو محتوا</h1>
          <p className="muted">با حساب مالک وارد شوید.</p>
        </div>
        {state.status === 'error' ? <ErrorNote error={state.error} onRetry={() => void refresh()} /> : null}
        <ErrorNote error={login.error} />
        <Field label="ایمیل">
          {(props) => (
            <input
              {...props}
              className="input input--ltr"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>
        <Field label="رمز عبور">
          {(props) => (
            <input
              {...props}
              className="input input--ltr"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" pending={login.pending} disabled={!email || !password}>
          ورود
        </Button>
      </form>
    </main>
  );
}
