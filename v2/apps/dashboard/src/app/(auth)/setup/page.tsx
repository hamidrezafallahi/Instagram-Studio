'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Banner, Button, ErrorNote, Field, Skeleton } from '@/components/ui.tsx';
import { api } from '@/lib/api.ts';
import { faDigits } from '@/lib/format.ts';
import { useMutation } from '@/lib/hooks.ts';
import { useSession } from '@/lib/session.tsx';

const MIN_PASSWORD = 12;

export default function SetupPage() {
  const router = useRouter();
  const { state, refresh } = useSession();
  const [form, setForm] = useState({ display_name: '', workspace_name: '', email: '', password: '', repeat: '' });
  const set = (key: keyof typeof form) => (value: string) => setForm((previous) => ({ ...previous, [key]: value }));

  useEffect(() => {
    if (state.status === 'ready') router.replace('/');
    if (state.status === 'anonymous' && !state.setup.needs_owner_setup) router.replace('/login');
  }, [state, router]);

  const setup = useMutation(async () => {
    await api('setupOwner', {
      body: {
        display_name: form.display_name.trim(),
        workspace_name: form.workspace_name.trim(),
        email: form.email.trim(),
        password: form.password,
      },
    });
    await refresh();
  });

  const passwordShort = form.password.length > 0 && form.password.length < MIN_PASSWORD;
  const mismatch = form.repeat.length > 0 && form.repeat !== form.password;
  const complete =
    form.display_name.trim() && form.workspace_name.trim() && form.email.trim() &&
    form.password.length >= MIN_PASSWORD && form.repeat === form.password;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (complete) void setup.run();
  };

  if (state.status !== 'anonymous' && state.status !== 'error') {
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
          <h1>راه‌اندازی استودیو</h1>
          <p className="muted">
            این مرحله فقط یک‌بار انجام می‌شود: حساب مالک و فضای کاری ساخته می‌شود. بعد از آن برندهایتان را اضافه
            می‌کنید.
          </p>
        </div>
        {state.status === 'error' ? <ErrorNote error={state.error} onRetry={() => void refresh()} /> : null}
        <ErrorNote error={setup.error} />
        <Field label="نام شما" required>
          {(props) => (
            <input {...props} className="input" autoComplete="name" value={form.display_name} onChange={(event) => set('display_name')(event.target.value)} />
          )}
        </Field>
        <Field label="نام فضای کاری" required hint="مثلاً نام شرکت یا نام خودتان؛ همهٔ برندها زیر همین فضا ساخته می‌شوند.">
          {(props) => (
            <input {...props} className="input" value={form.workspace_name} onChange={(event) => set('workspace_name')(event.target.value)} />
          )}
        </Field>
        <Field label="ایمیل ورود" required>
          {(props) => (
            <input {...props} className="input input--ltr" type="email" autoComplete="username" value={form.email} onChange={(event) => set('email')(event.target.value)} />
          )}
        </Field>
        <Field
          label="رمز عبور"
          required
          hint={`دست‌کم ${faDigits(MIN_PASSWORD)} نویسه. رمز فقط به‌صورت هش‌شده ذخیره می‌شود و قابل بازیابی نیست.`}
          error={passwordShort ? `رمز باید دست‌کم ${faDigits(MIN_PASSWORD)} نویسه باشد.` : undefined}
        >
          {(props) => (
            <input {...props} className="input input--ltr" type="password" autoComplete="new-password" value={form.password} onChange={(event) => set('password')(event.target.value)} />
          )}
        </Field>
        <Field label="تکرار رمز عبور" required error={mismatch ? 'تکرار رمز با رمز یکی نیست.' : undefined}>
          {(props) => (
            <input {...props} className="input input--ltr" type="password" autoComplete="new-password" value={form.repeat} onChange={(event) => set('repeat')(event.target.value)} />
          )}
        </Field>
        <Banner>
          حالت شروع «فقط پیش‌نویس» و «فقط رایگان» است: تا وقتی خودتان اجازه ندهید چیزی منتشر، ارسال یا هزینه
          نمی‌شود.
        </Banner>
        <Button
          type="submit"
          variant="primary"
          pending={setup.pending}
          disabledReason={complete ? undefined : 'همهٔ فیلدهای ضروری را کامل کنید.'}
        >
          ساخت حساب مالک
        </Button>
      </form>
    </main>
  );
}
