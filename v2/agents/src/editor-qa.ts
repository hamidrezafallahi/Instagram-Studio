import {
  Claim,
  QaResult,
  type BrandProfile,
  type ContentFormat,
  type IndustryPack,
  type QaCheck,
} from '@studio/contracts';
import {
  countGraphemes,
  faDigits,
  findOwnerInputMarkers,
  findTypographyIssues,
  normalizePersian,
} from '@studio/domain';
import { z } from 'zod';
import type { AgentRole } from './types.ts';

export const QA_VERSION = 'rules-1.0.0';

export interface EditorQaInput {
  text: string;
  format: ContentFormat;
  cta_fa: string;
  profile: BrandProfile;
  pack: IndustryPack;
  is_sample: boolean;
  /** سقف‌های همان اتصال مقصد، اگر capability آن را اعلام کرده باشد. */
  limits?: { max_text_chars?: number };
  checked_at: string;
}

export const QaOutput = z.strictObject({ qa_result: QaResult, claims: z.array(Claim).max(60) });
export type QaOutput = z.infer<typeof QaOutput>;

/**
 * راهنمای طول تحریریه (نویسه). این‌ها سقف رسمی هیچ پلتفرمی نیستند و فقط هشدار می‌دهند؛
 * سقف واقعی هر مقصد از capability همان اتصال خوانده می‌شود.
 */
const LENGTH_GUIDE: Partial<Record<ContentFormat, number>> = {
  story: 700,
  post: 2200,
  carousel: 3500,
  reel: 2500,
  trial_reel: 2500,
  text_post: 3000,
};

const CLAIM_KIND: Record<string, Claim['kind']> = {
  guarantee: 'guarantee',
  superlative: 'guarantee',
  speed_promise: 'guarantee',
  score_promise: 'guarantee',
  medical: 'medical',
  result_number: 'result',
  student_result: 'result',
  discount: 'price',
  shipping_returns: 'other',
  spec_number: 'fact',
  certification: 'fact',
  authenticity: 'fact',
  material: 'fact',
  durability: 'fact',
};

function excerpt(text: string, index: number, length: number): string {
  return text
    .slice(Math.max(0, index - 20), Math.min(text.length, index + length + 20))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * بازبینی قاعده‌محور (بدون مدل): جای خالی اطلاعات مالک، ادعای ممنوع یا نیازمند مدرک،
 * نگارش فارسی، طول و وجود دعوت به اقدام. نتیجهٔ pass هرگز جایگزین تأیید انسانی نیست.
 */
function review(input: EditorQaInput): QaOutput {
  const text = normalizePersian(input.text);
  const haystack = text.toLowerCase();
  const checks: QaCheck[] = [];
  const claims: Claim[] = [];
  const add = (check: QaCheck): void => void checks.push(check);

  // ۱) متن خالی
  const empty = text.trim().length === 0;
  add({ id: 'non_empty', severity: 'error', passed: !empty, message_fa: empty ? 'متن خالی است.' : 'متن وجود دارد.' });

  // ۲) جای خالی اطلاعات مالک
  const markers = findOwnerInputMarkers(text);
  add({
    id: 'owner_input_markers',
    severity: 'error',
    passed: markers.length === 0,
    message_fa:
      markers.length === 0
        ? 'جای خالی اطلاعات مالک در متن نیست.'
        : `${faDigits(markers.length)} جای خالی باید با اطلاعات واقعی پر شود.`,
    ...(markers[0] ? { excerpt: markers[0].slice(0, 200) } : {}),
  });

  // ۳) ادعاها بر پایهٔ قواعد بستهٔ صنعت و فهرست ممنوع برند
  const rules = [
    ...input.pack.claims_policy.rules,
    ...(input.profile.forbidden_claims.length > 0
      ? [{ id: 'brand_forbidden', label_fa: 'ادعای ممنوع برند', phrases: input.profile.forbidden_claims, action: 'forbid' as const }]
      : []),
  ];
  let forbidden = 0;
  let needsEvidence = 0;
  let escalated = 0;
  for (const rule of rules) {
    for (const phrase of rule.phrases) {
      const index = haystack.indexOf(normalizePersian(phrase).toLowerCase());
      if (index === -1) continue;
      const status: Claim['status'] = rule.action === 'forbid' ? 'forbidden' : 'needs_verification';
      claims.push({
        id: `${rule.id}_${claims.length + 1}`.slice(0, 64),
        text: excerpt(text, index, phrase.length).slice(0, 500),
        kind: CLAIM_KIND[rule.id] ?? 'other',
        status,
      });
      if (rule.action === 'forbid') forbidden += 1;
      else if (rule.action === 'needs_evidence') needsEvidence += 1;
      else escalated += 1;
      add({
        id: `claim_${rule.id}`.slice(0, 64),
        severity: rule.action === 'forbid' ? 'error' : 'warning',
        passed: false,
        message_fa:
          rule.action === 'forbid'
            ? `«${rule.label_fa}» مجاز نیست و باید حذف شود.`
            : rule.action === 'needs_evidence'
              ? `«${rule.label_fa}» به مدرک نیاز دارد؛ پیش از تأیید منبع آن را بررسی کنید.`
              : `«${rule.label_fa}» به تصمیم مالک ارجاع می‌شود.`,
        excerpt: excerpt(text, index, phrase.length).slice(0, 200),
      });
      break; // از هر قاعده یک نمونه کافی است
    }
  }
  if (forbidden + needsEvidence + escalated === 0) {
    add({ id: 'claims', severity: 'info', passed: true, message_fa: 'عبارتی از فهرست ادعاهای حساس پیدا نشد.' });
  }

  // ۴) نگارش فارسی
  const typography = findTypographyIssues(text);
  if (typography.length === 0) {
    add({ id: 'typography', severity: 'info', passed: true, message_fa: 'ایراد نگارشی شناخته‌شده‌ای پیدا نشد.' });
  }
  for (const issue of typography) {
    add({
      id: `typography_${issue.id}`.slice(0, 64),
      severity: 'warning',
      passed: false,
      message_fa: issue.message_fa,
      excerpt: issue.excerpt.slice(0, 200),
    });
  }

  // ۵) طول
  const length = countGraphemes(text);
  const hardLimit = input.limits?.max_text_chars;
  if (hardLimit !== undefined) {
    add({
      id: 'length_destination',
      severity: 'error',
      passed: length <= hardLimit,
      message_fa:
        length <= hardLimit
          ? `طول متن (${faDigits(length)}) در سقف اعلام‌شدهٔ مقصد (${faDigits(hardLimit)}) است.`
          : `طول متن (${faDigits(length)}) از سقف اعلام‌شدهٔ مقصد (${faDigits(hardLimit)}) بیشتر است.`,
    });
  }
  const guide = LENGTH_GUIDE[input.format];
  if (guide !== undefined) {
    add({
      id: 'length_guide',
      severity: 'warning',
      passed: length <= guide,
      message_fa:
        length <= guide
          ? `طول متن (${faDigits(length)} نویسه) در راهنمای تحریریهٔ این قالب است.`
          : `طول متن (${faDigits(length)} نویسه) از راهنمای تحریریهٔ این قالب (${faDigits(guide)}) بیشتر است.`,
    });
  }

  // ۶) دعوت به اقدام
  if (input.cta_fa.trim()) {
    const hasCta = text.includes(normalizePersian(input.cta_fa.trim()));
    add({
      id: 'cta_present',
      severity: 'warning',
      passed: hasCta,
      message_fa: hasCta ? 'دعوت به اقدام در متن هست.' : 'دعوت به اقدامِ برنامه در متن نیست.',
    });
  }

  if (input.is_sample) {
    add({
      id: 'sample_brand',
      severity: 'info',
      passed: true,
      message_fa: 'این برند نمونه است؛ متن فقط برای نمایش روند کار است، نه انتشار واقعی.',
    });
  }

  const hasError = checks.some((check) => check.severity === 'error' && !check.passed);
  const hasWarning = checks.some((check) => check.severity === 'warning' && !check.passed);
  return {
    qa_result: {
      status: hasError ? 'fail' : hasWarning ? 'pass_with_warnings' : 'pass',
      qa_version: QA_VERSION,
      checked_at: input.checked_at,
      checks,
    },
    claims,
  };
}

export const editorQa: AgentRole<EditorQaInput, QaOutput> = {
  role: 'editor-qa',
  title_fa: 'بازبین کیفیت',
  prompt_version: `editor-qa-${QA_VERSION}`,
  output_schema: QaOutput,
  max_calls: 1,
  timeout_ms: 10_000,
  allowed_modes: ['template'],
  tool_allowlist: [],
  authority_fa: 'فقط pass/fail و فهرست ایراد؛ نمی‌تواند تأیید انسانی بدهد.',
  template: review,
};
