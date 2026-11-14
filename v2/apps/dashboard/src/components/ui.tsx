'use client';

import {
  CAPABILITY_STATUS_LABEL_FA,
  CONTENT_STATE_LABEL_FA,
  RUN_STATE_LABEL_FA,
  type CapabilityStatus,
  type ContentState,
  type RunState,
} from '@studio/contracts';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import type { ApiFailure } from '@/lib/api.ts';
import type { QueryState } from '@/lib/hooks.ts';

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'sample' | 'accent';

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={tone === 'neutral' ? 'badge' : `badge badge--${tone}`} title={title}>
      {children}
    </span>
  );
}

/** برچسب «نمونه»؛ هر چیزی که دادهٔ واقعی نیست همین نشان بنفش را می‌گیرد، نه علامت سبز. */
export function SampleBadge() {
  return (
    <Badge tone="sample" title="دادهٔ ساختگی برای نمایش روند کار؛ واقعی نیست">
      نمونه
    </Badge>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  small?: boolean;
  pending?: boolean;
  /** دلیل غیرفعال‌بودن و راه رفع؛ به‌صورت متن کمکی برای صفحه‌خوان و راهنمای ابزار نمایش داده می‌شود. */
  disabledReason?: string | undefined;
}

/**
 * دکمه. اگر disabledReason داده شود دکمه «غیرفعال با دلیل» است: قابل تمرکز می‌ماند، دلیل برای صفحه‌خوان
 * خوانده می‌شود و با کلیک یا لمس، دلیل و راه رفع زیر دکمه دیده می‌شود (راهنمای ابزار روی لمسی کار نمی‌کند).
 */
export function Button({
  variant = 'default',
  small,
  pending,
  disabledReason,
  children,
  disabled,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  const reasonId = useId();
  const [showReason, setShowReason] = useState(false);
  const classes = ['btn'];
  if (variant !== 'default') classes.push(`btn--${variant}`);
  if (small) classes.push('btn--small');

  if (disabledReason) {
    return (
      <span className="btn-wrap">
        <button
          {...rest}
          type="button"
          className={classes.join(' ')}
          aria-disabled="true"
          aria-describedby={reasonId}
          title={disabledReason}
          onClick={(event) => {
            event.preventDefault();
            setShowReason(true);
          }}
        >
          {children}
        </button>
        <span id={reasonId} className={showReason ? 'btn-reason' : 'sr-only'} role="note">
          {disabledReason}
        </span>
      </span>
    );
  }
  return (
    <button
      {...rest}
      type={type}
      className={classes.join(' ')}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      onClick={onClick}
    >
      {pending ? <span className="btn__spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Banner({ tone = 'info', children }: { tone?: 'info' | 'sample' | 'warn' | 'danger' | 'ok'; children: ReactNode }) {
  return (
    <div className={tone === 'info' ? 'banner' : `banner banner--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <div>{children}</div>
    </div>
  );
}

/** نمایش خطای API با پیام فارسی، اقدام لازم و شناسهٔ پیگیری. */
export function ErrorNote({ error, onRetry }: { error: ApiFailure | null; onRetry?: (() => void) | undefined }) {
  if (!error) return null;
  return (
    <Banner tone="danger">
      <div className="stack stack--tight">
        <strong>{error.message}</strong>
        {error.actionRequired ? <span>{error.actionRequired}</span> : null}
        {error.details.length > 0 ? (
          <ul className="bullets small">
            {error.details.slice(0, 6).map((detail) => (
              <li key={`${detail.path}:${detail.message}`}>
                <span className="ltr">{detail.path}</span> — {detail.message}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="row">
          {onRetry ? (
            <Button small onClick={onRetry}>
              تلاش دوباره
            </Button>
          ) : null}
          {error.traceId ? (
            <span className="small">
              شناسهٔ پیگیری: <span className="ltr">{error.traceId.slice(0, 8)}</span>
            </span>
          ) : null}
        </div>
      </div>
    </Banner>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="stack stack--tight" aria-busy="true" aria-label="در حال بارگذاری">
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className="skeleton" style={{ inlineSize: `${90 - index * 14}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

/** پوشش مشترک وضعیت‌های بارگذاری، خطا (با تلاش دوباره) و داده. */
export function QueryView<T>({
  query,
  children,
  skeletonLines,
}: {
  query: QueryState<T>;
  children: (data: T) => ReactNode;
  skeletonLines?: number;
}) {
  if (query.error) return <ErrorNote error={query.error} onRetry={query.reload} />;
  if (query.data === undefined) return <Skeleton lines={skeletonLines ?? 4} />;
  return <>{children(query.data)}</>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="stack stack--tight">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </header>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  optional,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  required?: boolean;
  optional?: boolean;
  children: (props: { id: string; 'aria-describedby': string | undefined; 'aria-invalid': boolean | undefined }) => ReactNode;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? <span className="field__req">ضروری</span> : null}
        {optional ? <span className="field__opt">اختیاری</span> : null}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint ? (
        <span className="field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="field__error" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** پنجرهٔ تأیید بر پایهٔ ‎<dialog>‎ بومی: تمرکز صفحه‌کلید، Escape و پس‌زمینهٔ تیره بدون وابستگی. */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {open ? (
        <>
          <div className="dialog__head">
            <h2 id={titleId}>{title}</h2>
          </div>
          <div className="dialog__body">{children}</div>
          <div className="dialog__foot">{footer}</div>
        </>
      ) : null}
    </dialog>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { id: T; label: string; badge?: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className="tabs__tab"
          aria-selected={tab.id === value}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.badge}
        </button>
      ))}
    </div>
  );
}

const CONTENT_TONE: Partial<Record<ContentState, Tone>> = {
  ready_for_review: 'info',
  approved: 'ok',
  scheduled: 'accent',
  published: 'ok',
  needs_revision: 'warn',
  blocked: 'danger',
  failed: 'danger',
  publishing_unknown: 'danger',
};

export function ContentStateBadge({ state }: { state: ContentState }) {
  return <Badge tone={CONTENT_TONE[state] ?? 'neutral'}>{CONTENT_STATE_LABEL_FA[state]}</Badge>;
}

/** وضعیت‌های «منتظر …» شکست نیستند و رنگ هشدار می‌گیرند، نه خطا. */
const RUN_TONE: Record<RunState, Tone> = {
  queued: 'neutral',
  running: 'info',
  waiting_for_input: 'warn',
  waiting_for_approval: 'warn',
  waiting_for_funds: 'warn',
  waiting_for_harness: 'warn',
  paused: 'warn',
  succeeded: 'ok',
  partially_succeeded: 'warn',
  failed: 'danger',
  cancelled: 'neutral',
};

export function RunStateBadge({ state }: { state: RunState }) {
  return <Badge tone={RUN_TONE[state]}>{RUN_STATE_LABEL_FA[state]}</Badge>;
}

/**
 * وضعیت قابلیت. «آزموده» فقط وقتی سبز است که اتصال واقعی باشد؛
 * قابلیت کانکتور نمونه همیشه نشان «نمونه» می‌گیرد تا با اتصال واقعی اشتباه نشود.
 */
export function CapabilityBadge({
  status,
  sample,
  internal,
}: {
  status: CapabilityStatus;
  sample?: boolean;
  /** قابلیت داخلی استودیو (بدون حساب بیرونی)؛ «آزموده» آن به معنی آزمون خودکار داخلی است. */
  internal?: boolean;
}) {
  if (status === 'verified') {
    if (sample) return <Badge tone="sample">آزموده در محیط نمونه</Badge>;
    if (internal) return <Badge tone="info">آزموده در آزمون داخلی</Badge>;
    return <Badge tone="ok">آزموده روی حساب</Badge>;
  }
  const tone: Tone = status === 'needs_access' ? 'warn' : status === 'degraded' ? 'danger' : 'neutral';
  return <Badge tone={tone}>{CAPABILITY_STATUS_LABEL_FA[status]}</Badge>;
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDone, 3500);
    return () => window.clearTimeout(timer);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <Banner tone="ok">{message}</Banner>
    </div>
  );
}
