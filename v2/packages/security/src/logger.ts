import { processScrubber, redact, type SecretScrubber } from './redaction.ts';

/**
 * log ساخت‌یافتهٔ JSON با run_id/trace_id/brand_id و بدون متن محرمانه.
 * رابط آن با logger مورد انتظار Fastify (pino-like) سازگار است.
 */

const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60, silent: 100 } as const;
export type LogLevel = keyof typeof LEVELS;

type Fields = Record<string, unknown>;

export interface Logger {
  level: string;
  trace(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  fatal(obj: unknown, msg?: string): void;
  silent(obj: unknown, msg?: string): void;
  child(bindings: Fields): Logger;
}

export interface LoggerOptions {
  level?: LogLevel;
  service: string;
  scrubber?: SecretScrubber;
  /** مقصد خروجی؛ پیش‌فرض stdout. در آزمون برای بررسی نشت راز جایگزین می‌شود. */
  write?: (line: string) => void;
}

export function createLogger(options: LoggerOptions, bindings: Fields = {}): Logger {
  const threshold = LEVELS[options.level ?? 'info'];
  const scrubber = options.scrubber ?? processScrubber;
  const write = options.write ?? ((line: string) => void process.stdout.write(`${line}\n`));

  const emit = (level: Exclude<LogLevel, 'silent'>, obj: unknown, msg?: string): void => {
    if (LEVELS[level] < threshold) return;
    const fields: Fields =
      typeof obj === 'string' ? { msg: obj } : { ...(obj as Fields), ...(msg === undefined ? {} : { msg }) };
    const record = redact(
      { time: new Date().toISOString(), level, service: options.service, ...bindings, ...fields },
      scrubber,
    );
    write(JSON.stringify(record));
  };

  return {
    level: options.level ?? 'info',
    trace: (obj, msg) => emit('trace', obj, msg),
    debug: (obj, msg) => emit('debug', obj, msg),
    info: (obj, msg) => emit('info', obj, msg),
    warn: (obj, msg) => emit('warn', obj, msg),
    error: (obj, msg) => emit('error', obj, msg),
    fatal: (obj, msg) => emit('fatal', obj, msg),
    silent: () => undefined,
    child: (extra) => createLogger(options, { ...bindings, ...extra }),
  };
}
