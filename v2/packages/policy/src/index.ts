import type {
  ActorType,
  AuthorityPolicy,
  AuthorityRule,
  BrandStatus,
  Channel,
  Money,
  PolicyDecision,
  Role,
  Weekday,
} from '@studio/contracts';

/**
 * موتور سیاست اختیار (packages/policy/README.md، ADR-003).
 * تابع خالص و مستقل از مدل زبانی: همان ورودی همیشه همان تصمیم را می‌دهد و هر ورودی
 * (داشبورد، MCP، پیام‌رسان مالک) از همین تابع عبور می‌کند. در enqueue و درست پیش از dispatch
 * دوباره صدا زده می‌شود.
 */

export type ActionCategory =
  /** کار داخلی استودیو که چیزی از آن بیرون نمی‌رود: برنامه، پیش‌نویس، QA، خواندن سنجه. */
  | 'internal'
  | 'external_publish'
  | 'external_message'
  /** تغییر در دارایی بیرونی: سایت، تنظیمات، حذف. */
  | 'external_change'
  | 'spend';

export interface PolicyInput {
  action_type: string;
  category: ActionCategory;
  channel?: Channel;
  actor: { type: ActorType; id: string; role?: Role };
  brand: { status: BrandStatus };
  policy: { revision: number; authority: AuthorityPolicy };
  estimated_cost?: Money | null;
  topic?: string;
  /** زمان اجرا به وقت برند، برای بررسی بازهٔ مجاز auto_scoped. */
  local?: { weekday: Weekday; time: string };
  /**
   * موارد حساس همیشه به مالک ارجاع می‌شوند، حتی در auto_scoped: پاسخ قراردادی، تخفیف خارج از حدود،
   * ادعای پزشکی، حذف، تغییر ساختار سایت و افزایش بودجه.
   */
  sensitive?: boolean;
}

const REASON_FA: Record<string, string> = {
  BRAND_ARCHIVED: 'برند آرشیو شده است و کار تازه‌ای برای آن شروع نمی‌شود.',
  BRAND_PAUSED: 'برند متوقف است؛ تا ادامهٔ کار توسط مالک، کار تازه‌ای شروع نمی‌شود.',
  INTERNAL_WORK: 'کار داخلی استودیو است و چیزی منتشر یا ارسال نمی‌شود.',
  FREE_ONLY: 'حالت «فقط رایگان» فعال است؛ این هزینه به درخواست شارژ یا پرداخت مالک تبدیل می‌شود.',
  DRAFT_ONLY: 'حالت «فقط پیش‌نویس» فعال است؛ اقدام خارجی انجام نمی‌شود و خروجی به‌صورت پیش‌نویس می‌ماند.',
  REVIEW_REQUIRED: 'این اقدام به تأیید مالک یا بازبین مجاز نیاز دارد.',
  SENSITIVE_ESCALATION: 'این مورد حساس است و همیشه به مالک ارجاع می‌شود.',
  NO_MATCHING_RULE: 'هیچ قاعدهٔ اختیار خودکاری این اقدام را پوشش نمی‌دهد؛ تأیید لازم است.',
  OUTSIDE_WINDOW: 'خارج از بازهٔ زمانی مجاز اجرای خودکار است؛ تأیید لازم است.',
  TOPIC_NOT_APPROVED: 'موضوع در فهرست موضوع‌های تأییدشده نیست؛ تأیید لازم است.',
  AUTO_SCOPED_RULE: 'قاعدهٔ اختیار خودکار مالک این اقدام را مجاز می‌داند.',
};

function decide(
  decision: PolicyDecision['decision'],
  reason: string,
  input: PolicyInput,
  extra: Record<string, unknown> = {},
): PolicyDecision {
  return {
    decision,
    reason,
    reason_fa: REASON_FA[reason] ?? reason,
    policy_revision: input.policy.revision,
    scope_snapshot: {
      action_type: input.action_type,
      category: input.category,
      channel: input.channel ?? null,
      mode: input.policy.authority.mode,
      spend_mode: input.policy.authority.spend_mode,
      brand_status: input.brand.status,
      actor_type: input.actor.type,
      ...extra,
    },
  };
}

function ruleMatches(rule: AuthorityRule, input: PolicyInput): boolean {
  if (rule.action_type !== input.action_type) return false;
  return rule.channel === undefined || rule.channel === input.channel;
}

function insideWindow(rule: AuthorityRule, input: PolicyInput): boolean {
  if (!rule.window) return true;
  if (!input.local) return false;
  if (!rule.window.days.includes(input.local.weekday)) return false;
  return input.local.time >= rule.window.start && input.local.time <= rule.window.end;
}

export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  const { authority } = input.policy;

  if (input.brand.status === 'archived') return decide('deny', 'BRAND_ARCHIVED', input);
  if (input.brand.status === 'paused' || authority.paused) return decide('deny', 'BRAND_PAUSED', input);

  const cost = input.estimated_cost?.amount_minor ?? 0;
  if (cost > 0 && authority.spend_mode === 'free_only') {
    return decide('needs_funds', 'FREE_ONLY', input, { estimated_cost: input.estimated_cost });
  }

  if (input.category === 'internal') return decide('allow', 'INTERNAL_WORK', input);

  // از این‌جا به بعد همه اقدام خارجی یا هزینه‌زا هستند.
  if (authority.mode === 'draft_only') return decide('deny', 'DRAFT_ONLY', input);
  if (input.sensitive) return decide('needs_approval', 'SENSITIVE_ESCALATION', input);
  if (authority.mode === 'review_required') return decide('needs_approval', 'REVIEW_REQUIRED', input);

  // auto_scoped: فقط قاعدهٔ صریح مالک می‌تواند اجازهٔ خودکار بدهد.
  const candidates = authority.rules.filter(
    (rule) => rule.mode === 'auto_scoped' && ruleMatches(rule, input),
  );
  if (candidates.length === 0) return decide('needs_approval', 'NO_MATCHING_RULE', input);
  let lastReason = 'NO_MATCHING_RULE';
  for (const rule of candidates) {
    if (!insideWindow(rule, input)) {
      lastReason = 'OUTSIDE_WINDOW';
      continue;
    }
    if (rule.approved_topics && !(input.topic && rule.approved_topics.includes(input.topic))) {
      lastReason = 'TOPIC_NOT_APPROVED';
      continue;
    }
    return decide('allow', 'AUTO_SCOPED_RULE', input, { rule_id: rule.id });
  }
  return decide('needs_approval', lastReason, input);
}

/**
 * چه کسی می‌تواند تأیید انسانی ثبت کند: فقط کاربر انسانی با نقش owner یا reviewer.
 * عامل (مدل) و سرویس هرگز نمی‌توانند approval بسازند، حتی برای خروجی خودشان.
 */
export function canApprove(actor: { type: ActorType; role?: Role }): boolean {
  return actor.type === 'user' && (actor.role === 'owner' || actor.role === 'reviewer');
}

/** ترتیب نقش‌ها برای بررسی «حداقل نقش لازم» هر مسیر. */
const ROLE_RANK: Record<Role, number> = { viewer: 1, service: 1, reviewer: 2, editor: 3, owner: 4 };

export function roleAtLeast(role: Role, minimum: Role): boolean {
  if (minimum === 'reviewer') return role === 'reviewer' || role === 'owner';
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
