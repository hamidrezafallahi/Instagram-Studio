import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_AUTHORITY_POLICY, type AuthorityPolicy } from '@studio/contracts';
import { canApprove, evaluatePolicy, roleAtLeast, type PolicyInput } from './index.ts';

const base = (overrides: Partial<PolicyInput> = {}, authority: Partial<AuthorityPolicy> = {}): PolicyInput => ({
  action_type: 'publish',
  category: 'external_publish',
  channel: 'instagram',
  actor: { type: 'user', id: 'u1', role: 'owner' },
  brand: { status: 'active' },
  policy: { revision: 3, authority: { ...DEFAULT_AUTHORITY_POLICY, ...authority } },
  ...overrides,
});

describe('سیاست اختیار', () => {
  it('پیش‌فرض draft_only است و هر اقدام خارجی را رد می‌کند', () => {
    assert.equal(DEFAULT_AUTHORITY_POLICY.mode, 'draft_only');
    assert.equal(DEFAULT_AUTHORITY_POLICY.spend_mode, 'free_only');
    for (const category of ['external_publish', 'external_message', 'external_change'] as const) {
      const decision = evaluatePolicy(base({ category }));
      assert.equal(decision.decision, 'deny');
      assert.equal(decision.reason, 'DRAFT_ONLY');
      assert.equal(decision.policy_revision, 3);
    }
  });

  it('کار داخلی (برنامه و پیش‌نویس) در draft_only مجاز است', () => {
    const decision = evaluatePolicy(base({ action_type: 'generate_drafts', category: 'internal' }));
    assert.equal(decision.decision, 'allow');
    assert.equal(decision.scope_snapshot['mode'], 'draft_only');
  });

  it('برند متوقف یا آرشیوشده هیچ کار تازه‌ای شروع نمی‌کند', () => {
    assert.equal(evaluatePolicy(base({ category: 'internal', brand: { status: 'paused' } })).reason, 'BRAND_PAUSED');
    assert.equal(evaluatePolicy(base({ category: 'internal' }, { paused: true })).reason, 'BRAND_PAUSED');
    assert.equal(evaluatePolicy(base({ category: 'internal', brand: { status: 'archived' } })).reason, 'BRAND_ARCHIVED');
  });

  it('در free_only هر هزینه به needs_funds تبدیل می‌شود، حتی در حالت خودکار', () => {
    const decision = evaluatePolicy(
      base(
        { category: 'spend', estimated_cost: { amount_minor: 50_000, currency: 'IRT' } },
        { mode: 'auto_scoped' },
      ),
    );
    assert.equal(decision.decision, 'needs_funds');
    assert.equal(decision.reason, 'FREE_ONLY');
  });

  it('review_required به تأیید انسانی ارجاع می‌دهد', () => {
    assert.equal(evaluatePolicy(base({}, { mode: 'review_required' })).decision, 'needs_approval');
  });

  it('auto_scoped فقط با قاعدهٔ صریح، در بازهٔ زمانی و با موضوع تأییدشده اجازه می‌دهد', () => {
    const authority: Partial<AuthorityPolicy> = {
      mode: 'auto_scoped',
      rules: [
        {
          id: 'ig_publish',
          action_type: 'publish',
          channel: 'instagram',
          mode: 'auto_scoped',
          window: { days: ['saturday', 'sunday'], start: '09:00', end: '21:00' },
          approved_topics: ['نگهداری'],
        },
      ],
    };
    const inside = { weekday: 'saturday' as const, time: '10:00' };
    assert.equal(evaluatePolicy(base({ local: inside, topic: 'نگهداری' }, authority)).decision, 'allow');
    assert.equal(evaluatePolicy(base({ local: inside, topic: 'تخفیف' }, authority)).reason, 'TOPIC_NOT_APPROVED');
    assert.equal(
      evaluatePolicy(base({ local: { weekday: 'monday', time: '10:00' }, topic: 'نگهداری' }, authority)).reason,
      'OUTSIDE_WINDOW',
    );
    assert.equal(evaluatePolicy(base({ topic: 'نگهداری' }, authority)).reason, 'OUTSIDE_WINDOW');
    assert.equal(
      evaluatePolicy(base({ channel: 'linkedin', local: inside, topic: 'نگهداری' }, authority)).reason,
      'NO_MATCHING_RULE',
    );
  });

  it('موارد حساس حتی با قاعدهٔ خودکار به مالک ارجاع می‌شوند', () => {
    const decision = evaluatePolicy(
      base(
        { sensitive: true },
        { mode: 'auto_scoped', rules: [{ id: 'all', action_type: 'publish', mode: 'auto_scoped' }] },
      ),
    );
    assert.equal(decision.decision, 'needs_approval');
    assert.equal(decision.reason, 'SENSITIVE_ESCALATION');
  });

  it('عامل (مدل) و سرویس نمی‌توانند تأیید انسانی بسازند', () => {
    assert.equal(canApprove({ type: 'user', role: 'owner' }), true);
    assert.equal(canApprove({ type: 'user', role: 'reviewer' }), true);
    assert.equal(canApprove({ type: 'user', role: 'editor' }), false);
    assert.equal(canApprove({ type: 'agent', role: 'owner' }), false);
    assert.equal(canApprove({ type: 'service', role: 'owner' }), false);
  });

  it('حداقل نقش مسیرها درست مقایسه می‌شود', () => {
    assert.equal(roleAtLeast('owner', 'editor'), true);
    assert.equal(roleAtLeast('viewer', 'editor'), false);
    assert.equal(roleAtLeast('editor', 'owner'), false);
    assert.equal(roleAtLeast('editor', 'reviewer'), false);
    assert.equal(roleAtLeast('reviewer', 'viewer'), true);
  });
});
