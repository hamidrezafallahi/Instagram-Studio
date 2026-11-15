import { z } from 'zod';
import { Channel, LocalTime, Money, Slug, UtcTimestamp, Weekday } from './primitives.ts';
import { AuthorityMode, BillingMode, PolicyDecisionKind, SpendMode } from './states.ts';

/**
 * سیاست اختیار و هزینه (packages/policy/README.md و packages/billing/README.md).
 * اختیار مالک برای هر brand، channel، action_type، بازهٔ زمانی و سقف ثبت می‌شود.
 * تصمیم نهایی همیشه در سرور گرفته می‌شود؛ مدل زبانی هیچ اختیار اجرایی ندارد.
 */

export const AuthorityRule = z.strictObject({
  id: Slug,
  channel: Channel.optional(),
  action_type: Slug,
  mode: AuthorityMode,
  /** بازهٔ مجاز اجرای خودکار به وقت برند؛ خارج از آن به تأیید ارجاع می‌شود. */
  window: z
    .strictObject({ days: z.array(Weekday).min(1), start: LocalTime, end: LocalTime })
    .optional(),
  max_per_day: z.int().positive().optional(),
  /** فقط موضوع‌های تأییدشده در auto_scoped. */
  approved_topics: z.array(z.string().min(1).max(200)).optional(),
});
export type AuthorityRule = z.infer<typeof AuthorityRule>;

export const AuthorityPolicy = z
  .strictObject({
    /** حالت پیش‌فرض برند؛ تا انتخاب صریح مالک draft_only می‌ماند. */
    mode: AuthorityMode,
    rules: z.array(AuthorityRule).max(100),
    spend_mode: SpendMode,
    /** توقف برند: کار جدید شروع نمی‌شود؛ عملیات در حال ارسال صادقانه گزارش می‌شود. */
    paused: z.boolean(),
  })
  .meta({ id: 'AuthorityPolicy', description: 'سیاست اختیار نسخه‌دار هر برند' });
export type AuthorityPolicy = z.infer<typeof AuthorityPolicy>;

export const DEFAULT_AUTHORITY_POLICY: AuthorityPolicy = {
  mode: 'draft_only',
  rules: [],
  spend_mode: 'free_only',
  paused: false,
};

export const PolicyDecision = z
  .strictObject({
    decision: PolicyDecisionKind,
    reason: z.string().max(64),
    reason_fa: z.string().max(400),
    policy_revision: z.int().positive(),
    scope_snapshot: z.record(z.string(), z.unknown()),
  })
  .meta({ id: 'PolicyDecision', description: 'allow / needs_approval / deny / needs_funds با دلیل و نسخهٔ سیاست' });
export type PolicyDecision = z.infer<typeof PolicyDecision>;

/** برآورد هزینه پیش از هر مصرف (packages/billing/README.md). */
export const CostQuote = z
  .strictObject({
    provider: Slug,
    action: Slug,
    amount_min: Money,
    amount_max: Money,
    valid_until: UtcTimestamp,
    source: z.string().max(512),
    free_quota_remaining: z.int().nonnegative().nullable(),
    billing_mode: BillingMode,
  })
  .meta({ id: 'CostQuote', description: 'برآورد هزینه با اعتبار زمانی و منبع' });
export type CostQuote = z.infer<typeof CostQuote>;
