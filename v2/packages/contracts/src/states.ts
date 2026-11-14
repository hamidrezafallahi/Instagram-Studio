import { z } from 'zod';

/**
 * حالت‌های ماشین حالت دامنه (packages/domain/README.md).
 * خود قواعد انتقال در @studio/domain پیاده می‌شوند؛ این‌جا فقط واژگان مشترک است.
 */

export const ContentState = z.enum([
  'brief',
  'researching',
  'drafting',
  'validating',
  'ready_for_review',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'needs_revision',
  'blocked',
  'cancelled',
  'publishing_unknown',
  'failed',
]);
export type ContentState = z.infer<typeof ContentState>;

/** run_state از content_state جداست؛ waiting_for_approval شکست نیست. */
export const RunState = z.enum([
  'queued',
  'running',
  'waiting_for_input',
  'waiting_for_approval',
  'waiting_for_funds',
  'waiting_for_harness',
  'paused',
  'succeeded',
  'partially_succeeded',
  'failed',
  'cancelled',
]);
export type RunState = z.infer<typeof RunState>;

export const ActionState = z.enum([
  'proposed',
  'authorized',
  'reserved',
  'executing',
  'succeeded',
  'awaiting_approval',
  'denied',
  'awaiting_funds',
  'failed',
  'unknown',
  'manual_required',
]);
export type ActionState = z.infer<typeof ActionState>;

export const ManualTaskState = z.enum([
  'prepared',
  'assigned',
  'completed_by_owner',
  'verified',
  'unverifiable',
]);
export type ManualTaskState = z.infer<typeof ManualTaskState>;

export const InboxState = z.enum([
  'received',
  'classified',
  'draft_reply',
  'review',
  'auto_authorized',
  'sent',
  'human_handoff',
]);
export type InboxState = z.infer<typeof InboxState>;

export const FundingRequestState = z.enum([
  'proposed',
  'owner_approved',
  'awaiting_payment',
  'verifying',
  'funded',
  'declined',
  'expired',
  'cancelled',
]);
export type FundingRequestState = z.infer<typeof FundingRequestState>;

/** وضعیت گام‌های یک run. */
export const StepState = z.enum(['pending', 'running', 'succeeded', 'failed', 'skipped']);
export type StepState = z.infer<typeof StepState>;

/** وضعیت برند. آرشیو حذف نیست؛ حذف مطابق retention جداگانه انجام می‌شود. */
export const BrandStatus = z.enum(['active', 'paused', 'archived']);
export type BrandStatus = z.infer<typeof BrandStatus>;

/**
 * وضعیت پشتیبانی هر قابلیت (README ریشه).
 * - verified: سند پشتیبانی می‌کند «و» روی حساب واقعی آزموده شده است.
 * - needs_access: مسیر مستند وجود دارد ولی حساب، مجوز یا token هنوز فراهم/آزموده نشده.
 * - manual_only: مسیر API اثبات‌شده نیست؛ خروجی به‌صورت بستهٔ دستی تحویل می‌شود.
 * - unsupported: سند صراحتاً پشتیبانی نمی‌کند.
 * - unverified: مدرک کافی یا خوانا در دست نیست؛ تا اثبات، مثل دستی رفتار می‌شود.
 * - degraded: قبلاً verified بوده و اکنون ناقص یا خراب است.
 */
export const CapabilityStatus = z.enum([
  'verified',
  'needs_access',
  'manual_only',
  'unsupported',
  'unverified',
  'degraded',
]);
export type CapabilityStatus = z.infer<typeof CapabilityStatus>;

/** وضعیت نتیجهٔ کانکتور. accepted به معنی انتشار نیست. */
export const ConnectorResultStatus = z.enum([
  'succeeded',
  'accepted',
  'failed',
  'unknown',
  'manual_required',
]);
export type ConnectorResultStatus = z.infer<typeof ConnectorResultStatus>;

/** حالت‌های اختیار مالک (packages/policy/README.md). پیش‌فرض draft_only. */
export const AuthorityMode = z.enum(['draft_only', 'review_required', 'auto_scoped']);
export type AuthorityMode = z.infer<typeof AuthorityMode>;

export const PolicyDecisionKind = z.enum(['allow', 'needs_approval', 'deny', 'needs_funds']);
export type PolicyDecisionKind = z.infer<typeof PolicyDecisionKind>;

/** حالت هزینه (packages/billing/README.md). پیش‌فرض free_only. */
export const SpendMode = z.enum(['free_only', 'permitted_paid']);
export type SpendMode = z.infer<typeof SpendMode>;

export const BillingMode = z.enum(['prepaid', 'postpaid', 'subscription', 'manual']);
export type BillingMode = z.infer<typeof BillingMode>;

export const ApprovalDecision = z.enum(['approved', 'rejected', 'changes_requested']);
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;
