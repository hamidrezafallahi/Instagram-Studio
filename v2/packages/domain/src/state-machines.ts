import {
  StudioError,
  type ActionState,
  type ContentState,
  type FundingRequestState,
  type InboxState,
  type ManualTaskState,
  type RunState,
} from '@studio/contracts';

/**
 * ماشین‌های حالت دامنه (packages/domain/README.md).
 * هر انتقالی که در این جدول‌ها نیست غیرمجاز است و با INVALID_TRANSITION رد می‌شود.
 */
export interface StateMachine<S extends string> {
  readonly name: string;
  readonly transitions: Readonly<Record<S, readonly S[]>>;
}

export const contentMachine: StateMachine<ContentState> = {
  name: 'content',
  transitions: {
    brief: ['researching', 'blocked', 'cancelled'],
    researching: ['drafting', 'blocked', 'failed', 'cancelled'],
    drafting: ['validating', 'blocked', 'failed', 'cancelled'],
    validating: ['ready_for_review', 'needs_revision', 'blocked', 'failed', 'cancelled'],
    // ویرایش در بازبینی: نسخهٔ تازه → validating → بازبینی دوباره.
    ready_for_review: ['approved', 'needs_revision', 'validating', 'cancelled'],
    needs_revision: ['validating', 'drafting', 'cancelled'],
    // هر ویرایش پس از تأیید، تأیید را باطل و محتوا را به بازبینی برمی‌گرداند.
    approved: ['scheduled', 'validating', 'needs_revision', 'cancelled'],
    scheduled: ['publishing', 'approved', 'validating', 'cancelled'],
    publishing: ['published', 'publishing_unknown', 'failed'],
    // نتیجهٔ نامعلوم فقط با reconcile حل می‌شود؛ بازگشت مستقیم به publishing (retry کور) وجود ندارد.
    publishing_unknown: ['published', 'failed', 'scheduled'],
    failed: ['scheduled', 'needs_revision', 'cancelled'],
    blocked: ['researching', 'drafting', 'validating', 'cancelled'],
    published: [],
    cancelled: [],
  },
};

export const runMachine: StateMachine<RunState> = {
  name: 'run',
  transitions: {
    queued: ['running', 'paused', 'cancelled'],
    running: [
      'succeeded', 'partially_succeeded', 'failed', 'waiting_for_input', 'waiting_for_approval',
      'waiting_for_funds', 'waiting_for_harness', 'paused', 'cancelled',
    ],
    waiting_for_input: ['running', 'paused', 'failed', 'cancelled'],
    waiting_for_approval: ['running', 'paused', 'failed', 'cancelled'],
    waiting_for_funds: ['running', 'paused', 'failed', 'cancelled'],
    waiting_for_harness: ['running', 'paused', 'failed', 'cancelled'],
    paused: ['queued', 'running', 'cancelled'],
    succeeded: [],
    partially_succeeded: [],
    failed: [],
    cancelled: [],
  },
};

export const actionMachine: StateMachine<ActionState> = {
  name: 'action',
  transitions: {
    proposed: ['authorized', 'awaiting_approval', 'awaiting_funds', 'denied', 'manual_required'],
    awaiting_approval: ['authorized', 'denied'],
    awaiting_funds: ['authorized', 'denied'],
    // بررسی دوباره درست پیش از dispatch ممکن است مجوز را پس بگیرد.
    authorized: ['reserved', 'awaiting_approval', 'denied'],
    reserved: ['executing', 'denied'],
    executing: ['succeeded', 'failed', 'unknown'],
    unknown: ['succeeded', 'failed', 'manual_required'],
    manual_required: ['succeeded', 'failed'],
    succeeded: [],
    denied: [],
    failed: [],
  },
};

export const manualTaskMachine: StateMachine<ManualTaskState> = {
  name: 'manual_task',
  transitions: {
    prepared: ['assigned'],
    assigned: ['completed_by_owner'],
    // نتیجهٔ دستی تا بررسی مالکیت و تطابق، owner_reported می‌ماند.
    completed_by_owner: ['verified', 'unverifiable'],
    verified: [],
    unverifiable: [],
  },
};

export const inboxMachine: StateMachine<InboxState> = {
  name: 'inbox',
  transitions: {
    received: ['classified'],
    classified: ['draft_reply', 'human_handoff'],
    draft_reply: ['review', 'auto_authorized', 'human_handoff'],
    review: ['sent', 'human_handoff'],
    auto_authorized: ['sent', 'human_handoff'],
    sent: [],
    human_handoff: [],
  },
};

export const fundingRequestMachine: StateMachine<FundingRequestState> = {
  name: 'funding_request',
  transitions: {
    proposed: ['owner_approved', 'declined', 'expired', 'cancelled'],
    owner_approved: ['awaiting_payment', 'cancelled'],
    awaiting_payment: ['verifying', 'expired', 'cancelled'],
    verifying: ['funded', 'awaiting_payment', 'expired'],
    funded: [],
    declined: [],
    expired: [],
    cancelled: [],
  },
};

export function canTransition<S extends string>(machine: StateMachine<S>, from: S, to: S): boolean {
  return machine.transitions[from].includes(to);
}

export function assertTransition<S extends string>(machine: StateMachine<S>, from: S, to: S): void {
  if (!canTransition(machine, from, to)) {
    throw new StudioError('INVALID_TRANSITION', {
      message_fa: `تغییر وضعیت ${machine.name} از «${from}» به «${to}» مجاز نیست.`,
    });
  }
}

export function isTerminal<S extends string>(machine: StateMachine<S>, state: S): boolean {
  return machine.transitions[state].length === 0;
}

/** وضعیت‌هایی که ویرایش متن در آن‌ها مجاز است؛ هر ویرایش نسخهٔ تازه می‌سازد و QA را تکرار می‌کند. */
export const CONTENT_EDITABLE_STATES: readonly ContentState[] = [
  'ready_for_review',
  'needs_revision',
  'approved',
  'scheduled',
  'blocked',
];

/** وضعیت‌های باز run؛ در «توقف» کار جدید شروع نمی‌شود و این‌ها صادقانه گزارش می‌شوند. */
export const OPEN_RUN_STATES: readonly RunState[] = [
  'queued',
  'running',
  'waiting_for_input',
  'waiting_for_approval',
  'waiting_for_funds',
  'waiting_for_harness',
  'paused',
];
