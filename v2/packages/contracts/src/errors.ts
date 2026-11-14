import { z } from 'zod';

/**
 * کدهای خطای مشترک. بخش اول عیناً از packages/contracts/README.md است؛
 * بخش دوم خطاهای لایهٔ API/دامنه است که همان قالب پاسخ را دارند.
 */
export const ErrorCode = z.enum([
  // خطاهای مشترک کانکتور و اجرا
  'AUTH_EXPIRED',
  'RATE_LIMITED',
  'QUOTA_EXHAUSTED',
  'PAYMENT_REQUIRED',
  'INVALID_MEDIA',
  'POLICY_DENIED',
  'PROVIDER_UNAVAILABLE',
  'UNKNOWN_OUTCOME',
  'STALE_REVISION',
  'UNSUPPORTED_CAPABILITY',
  // خطاهای API و دامنه
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CSRF_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'IDEMPOTENCY_KEY_REUSED',
  'INVALID_TRANSITION',
  'CROSS_BRAND_REFERENCE',
  'SETUP_ALREADY_COMPLETED',
  'BRAND_NOT_READY',
  'NOT_IMPLEMENTED',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** نگاشت کد خطا به وضعیت HTTP و قابلیت تلاش دوباره. */
export const ERROR_HTTP: Record<ErrorCode, { status: number; retryable: boolean }> = {
  AUTH_EXPIRED: { status: 409, retryable: false },
  RATE_LIMITED: { status: 429, retryable: true },
  QUOTA_EXHAUSTED: { status: 409, retryable: false },
  PAYMENT_REQUIRED: { status: 402, retryable: false },
  INVALID_MEDIA: { status: 422, retryable: false },
  POLICY_DENIED: { status: 403, retryable: false },
  PROVIDER_UNAVAILABLE: { status: 503, retryable: true },
  UNKNOWN_OUTCOME: { status: 409, retryable: false },
  STALE_REVISION: { status: 409, retryable: false },
  UNSUPPORTED_CAPABILITY: { status: 422, retryable: false },
  VALIDATION_FAILED: { status: 400, retryable: false },
  UNAUTHENTICATED: { status: 401, retryable: false },
  FORBIDDEN: { status: 403, retryable: false },
  CSRF_FAILED: { status: 403, retryable: false },
  NOT_FOUND: { status: 404, retryable: false },
  CONFLICT: { status: 409, retryable: false },
  IDEMPOTENCY_KEY_REUSED: { status: 409, retryable: false },
  INVALID_TRANSITION: { status: 409, retryable: false },
  CROSS_BRAND_REFERENCE: { status: 422, retryable: false },
  SETUP_ALREADY_COMPLETED: { status: 409, retryable: false },
  BRAND_NOT_READY: { status: 422, retryable: false },
  NOT_IMPLEMENTED: { status: 501, retryable: false },
  INTERNAL: { status: 500, retryable: true },
};

/** پیام پیش‌فرض فارسی هر خطا؛ سرویس‌ها می‌توانند پیام دقیق‌تر بدهند. */
export const ERROR_MESSAGE_FA: Record<ErrorCode, string> = {
  AUTH_EXPIRED: 'دسترسی این اتصال منقضی شده است؛ اتصال را دوباره برقرار کنید.',
  RATE_LIMITED: 'تعداد درخواست‌ها از حد مجاز گذشته است؛ کمی بعد دوباره تلاش کنید.',
  QUOTA_EXHAUSTED: 'سهمیهٔ این سرویس تمام شده است.',
  PAYMENT_REQUIRED: 'ادامهٔ این کار به شارژ یا پرداخت مالک نیاز دارد.',
  INVALID_MEDIA: 'فایل رسانه با مشخصات مقصد سازگار نیست.',
  POLICY_DENIED: 'سیاست اختیار مالک این اقدام را مجاز نمی‌داند.',
  PROVIDER_UNAVAILABLE: 'سرویس بیرونی در دسترس نیست.',
  UNKNOWN_OUTCOME: 'نتیجهٔ عملیات نامعلوم است و به بررسی نیاز دارد؛ ارسال دوباره انجام نشد.',
  STALE_REVISION: 'این مورد در این فاصله تغییر کرده است؛ نسخهٔ تازه را ببینید و دوباره تلاش کنید.',
  UNSUPPORTED_CAPABILITY: 'این قابلیت برای این اتصال در دسترس نیست.',
  VALIDATION_FAILED: 'ورودی نامعتبر است.',
  UNAUTHENTICATED: 'ابتدا وارد حساب خود شوید.',
  FORBIDDEN: 'شما به این بخش دسترسی ندارید.',
  CSRF_FAILED: 'درخواست به دلیل نبود نشانهٔ امنیتی معتبر رد شد؛ صفحه را تازه کنید.',
  NOT_FOUND: 'مورد خواسته‌شده پیدا نشد.',
  CONFLICT: 'این درخواست با وضعیت فعلی سازگار نیست.',
  IDEMPOTENCY_KEY_REUSED: 'این کلید یکتایی قبلاً برای درخواست دیگری استفاده شده است.',
  INVALID_TRANSITION: 'این تغییر وضعیت مجاز نیست.',
  CROSS_BRAND_REFERENCE: 'ارجاع به دادهٔ برند دیگر مجاز نیست.',
  SETUP_ALREADY_COMPLETED: 'راه‌اندازی اولیه قبلاً انجام شده است.',
  BRAND_NOT_READY: 'اطلاعات ضروری برند برای این کار کامل نیست.',
  NOT_IMPLEMENTED: 'این بخش هنوز ساخته نشده است.',
  INTERNAL: 'خطای داخلی رخ داد.',
};

/** قالب پاسخ خطا: stack و secret هرگز در پاسخ عمومی نیست. */
export const ApiError = z
  .strictObject({
    error: z.strictObject({
      code: ErrorCode,
      message_fa: z.string(),
      retryable: z.boolean(),
      trace_id: z.string(),
      action_required: z.string().optional(),
      details: z
        .array(z.strictObject({ path: z.string(), message: z.string() }))
        .optional(),
    }),
  })
  .meta({ id: 'ApiError', description: 'قالب یکسان خطا در همهٔ مسیرها' });
export type ApiError = z.infer<typeof ApiError>;

export interface StudioErrorOptions {
  message_fa?: string;
  action_required?: string;
  details?: { path: string; message: string }[];
  cause?: unknown;
}

/** خطای typed مشترک بین سرویس‌ها، کانکتورها و API. */
export class StudioError extends Error {
  readonly code: ErrorCode;
  readonly message_fa: string;
  readonly action_required: string | undefined;
  readonly details: { path: string; message: string }[] | undefined;

  constructor(code: ErrorCode, options: StudioErrorOptions = {}) {
    super(`${code}: ${options.message_fa ?? ERROR_MESSAGE_FA[code]}`, { cause: options.cause });
    this.name = 'StudioError';
    this.code = code;
    this.message_fa = options.message_fa ?? ERROR_MESSAGE_FA[code];
    this.action_required = options.action_required;
    this.details = options.details;
  }

  get status(): number {
    return ERROR_HTTP[this.code].status;
  }

  get retryable(): boolean {
    return ERROR_HTTP[this.code].retryable;
  }
}

export function isStudioError(value: unknown): value is StudioError {
  return value instanceof StudioError;
}
