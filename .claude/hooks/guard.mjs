#!/usr/bin/env node
/**
 * Instagram Studio guard: PreToolUse hook (CLAUDE.md §2, ops/guardrails.md).
 *
 *   deny         the call is blocked before it reaches the tool; nothing the user clicks overrides it
 *   ask          Claude Code shows a permission prompt that Hamidreza must approve
 *   (no output)  normal permission flow (read-only and low-risk calls)
 *
 * Covered paths: every MCP connector tool, including gateway tools such as Zernio `call_tool`
 * (unwrapped and judged by the inner tool and arguments), the Bash / PowerShell tools, the
 * desktop terminal, and URL-carrying browser actions. See ops/guardrails.md for what is NOT covered.
 *
 * Zero-spend policy (checked first, on every path): billing can only be READ, through an exact
 * allowlist of tool names and argument keys. Any other operation that touches billing, balance,
 * top-ups, payment methods, plans, subscriptions, credits, spend limits or pricing, by name, by
 * argument keys or by billing URLs in its arguments, is denied. Unknown or ambiguous calls fail
 * closed: unreadable input, gateway calls without a resolvable tool, nested gateways and guard
 * errors are denied.
 *
 * Approval gates: every Zernio post write must carry exactly one content ID (tags: ["IG-004"]) or
 * a post_id recorded in a content file; the guard then requires explicit approvals for that ID in
 * ops/approval-log.md (Hamidreza's words must name the ID and the gate; "approve all" never counts)
 * and an unchanged body hash.
 *
 * .claude/settings.json runs this with onFailure:"block", so if Node is missing the call is blocked.
 * Every deny/ask decision is appended to ops/guard-log.jsonl (set GUARD_LOG=off to disable).
 * Tests: node .claude/hooks/guard.test.mjs
 */
import { readFileSync, appendFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// ── Policy knobs ────────────────────────────────────────────────────────────────
const CONFIG = {
  requireZernioReview: true,
  minLeadMinutes: 30,
  defaultTimezone: 'UTC',
  contentTimezone: 'Asia/Tehran',
  displayTimezone: 'Asia/Tehran',
  allowedPlatforms: new Set(['instagram']),
};
const projectDir = () => process.env.CLAUDE_PROJECT_DIR || process.cwd();

const SERVER_IDS = {
  '8ca0a414-7010-44c3-8a62-e915245ed1a6': 'zernio',
  '1a7936a8-5034-48a7-964f-95bc40ca5782': 'canva',
  '023fd27d-b909-4d50-9ccc-d8ad00dd3a07': 'composio',
  'df486e43-5424-4b59-a9c1-099b469f7679': 'cloudflare',
  'e648a2f6-5bbf-4b55-97e1-f2f4cf6a09fa': 'mobbin',
  'scheduled-tasks': 'scheduler',
};
const ZERNIO_FINGERPRINT = new Set([
  'zernio_overview', 'posts_publish_now', 'posts_create', 'posts_update', 'posts_cross_post',
  'posts_bulk_upload_posts', 'posts_retry_all_failed', 'support_ask', 'usage_get_usage',
  'queue_list_queue_slots', 'accounts_get_all_accounts_health', 'comments_reply_to_inbox_post',
  'mentions_reply_to_mention',
]);
const CANVA_FINGERPRINT = new Set([
  'generate-design', 'generate-design-structured', 'create-design', 'edit-design', 'export-design',
  'resize-design', 'remove-background', 'generate-image', 'create-video', 'separate-image-layers',
  'list-brand-kits', 'create-brand-template-draft', 'publish-brand-template',
  'create-design-from-brand-template',
]);

// ── Name normalisation ──────────────────────────────────────────────────────────
/** "mcp__x__treasuryUpdate-AutoRecharge " → "treasury_update_auto_recharge"; "top-ups" → "topup". */
function normName(name) {
  let s = String(name ?? '').trim();
  const m = /^mcp__.+?__(.+)$/.exec(s);
  if (m) s = m[1];
  s = s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  s = s.replace(/(^|_)top_?ups?(?=_|$)/g, '$1topup');
  return s;
}
const tokensOf = (name) => normName(name).split('_').filter(Boolean);

// ── Vocabulary ──────────────────────────────────────────────────────────────────
const READ_VERBS = new Set([
  'list', 'get', 'search', 'check', 'validate', 'preview', 'lookup', 'describe', 'count',
  'overview', 'download', 'fetch', 'read', 'resolve', 'status', 'health', 'help', 'find',
  'inspect', 'view', 'show',
]);
const WRITE_VERBS = new Set([
  'create', 'update', 'edit', 'delete', 'remove', 'send', 'reply', 'post', 'publish', 'unpublish',
  'schedule', 'reschedule', 'retry', 'accept', 'archive', 'unarchive', 'upload', 'add', 'set',
  'enable', 'disable', 'activate', 'deactivate', 'start', 'stop', 'pause', 'resume', 'cancel',
  'enroll', 'unenroll', 'trigger', 'run', 'execute', 'test', 'redeliver', 'restore', 'move',
  'import', 'export', 'sync', 'purchase', 'buy', 'release', 'connect', 'disconnect', 'invite',
  'subscribe', 'unsubscribe', 'boost', 'duplicate', 'clone', 'approve', 'reject', 'submit',
  'hide', 'unhide', 'like', 'unlike', 'react', 'mark', 'assign', 'unassign', 'tag', 'untag',
  'block', 'unblock', 'follow', 'unfollow', 'bulk', 'generate', 'review', 'transfer', 'refund',
  'withdraw', 'claim', 'register', 'rotate', 'revoke', 'toggle', 'apply', 'promote', 'share',
  'pin', 'unpin', 'rename', 'reorder', 'merge', 'copy', 'attach', 'detach', 'link', 'unlink',
  'upsert', 'patch', 'put', 'save', 'commit', 'end', 'close', 'open', 'join', 'leave', 'ban',
  'unban', 'mute', 'unmute', 'report', 'query', 'analyze', 'order', 'confirm', 'request',
  'increase', 'raise', 'upgrade', 'downgrade', 'charge', 'pay', 'vote',
]);
const firstVerb = (tokens) => tokens.find((t) => READ_VERBS.has(t) || WRITE_VERBS.has(t)) || null;

// Paid, metered, automated-messaging or out-of-scope areas of Zernio. Reads are fine, writes are not.
const PAID_TOKENS = new Set([
  'ad', 'ads', 'adset', 'adsets', 'campaign', 'campaigns', 'boost', 'boosts', 'creative', 'creatives',
  'broadcast', 'broadcasts', 'sequence', 'sequences', 'workflow', 'workflows', 'automation', 'automations',
  'phone', 'numbers', 'whatsapp', 'sms', 'rcs', 'imessage', 'calls', 'calling', 'voice',
  'verification', 'verifications', 'verify', 'business', 'agent', 'agents', 'creator', 'creators',
  'payout', 'payouts', 'keys', 'webhook', 'webhooks', 'connect', 'team', 'invitation', 'invitations',
  'invites', 'commerce', 'catalog', 'catalogs', 'lead', 'leads',
  'x', 'twitter', 'tiktok', 'youtube', 'linkedin', 'facebook', 'pinterest', 'threads', 'reddit',
  'bluesky', 'telegram', 'snapchat', 'discord', 'slack', 'shopify', 'wordpress', 'wix', 'webflow',
  'hubspot', 'googlebusiness', 'google',
]);
const DERISK_VERBS = new Set([
  'pause', 'disable', 'deactivate', 'cancel', 'stop', 'delete', 'remove', 'archive', 'reject',
  'unsubscribe', 'revoke', 'withdraw', 'end', 'close',
]);
const MESSAGING_TOKENS = new Set([
  'message', 'messages', 'dm', 'dms', 'comment', 'comments', 'mention', 'mentions', 'reply',
  'conversation', 'conversations', 'inbox',
]);
const MESSAGE_SEND_VERBS = new Set(['send', 'reply', 'accept', 'react', 'post', 'create']);
const GATEWAY_NAMES = new Set([
  'call_tool', 'call', 'invoke', 'invoke_tool', 'execute', 'execute_tool', 'run_tool', 'tool_call',
  'use_tool', 'proxy', 'gateway', 'multi_execute_tool', 'proxy_execute',
]);

// ── Zero-spend policy ───────────────────────────────────────────────────────────
// The ONLY billing operations allowed: exact tool names (from Zernio search_tools on 2026-11-09,
// all annotated readOnlyHint:true) with the argument keys their schemas define. Anything else
// in the billing area is denied, including when Hamidreza confirms.
const BILLING_READS = new Map([
  ['usage_get_usage', new Set(['range', 'granularity', 'from', 'to', 'group_by', 'profile_id', 'account_id'])],
  ['usage_get_usage_stats', new Set()],
  ['usage_get_billing', new Set()],
  ['usage_get_x_api_pricing', new Set()],
  ['treasury_get_balance', new Set()],
  ['treasury_get_auto_recharge', new Set()],
  ['treasury_get_topup_invoice', new Set(['topup_id'])],
  ['treasury_get_topup_statement', new Set(['topup_id'])],
  ['treasury_get_topup_receipt', new Set(['topup_id', 'download'])],
]);
// A tool name containing any of these is in the billing area.
const BILLING_TOKENS = new Set([
  'treasury', 'billing', 'bill', 'bills', 'balance', 'balances', 'topup', 'topups', 'recharge',
  'payment', 'payments', 'pay', 'card', 'cards', 'invoice', 'invoices', 'receipt', 'receipts',
  'statement', 'statements', 'subscription', 'subscriptions', 'subscribe', 'plan', 'plans',
  'upgrade', 'upgrades', 'downgrade', 'checkout', 'purchase', 'purchases', 'buy', 'order', 'orders',
  'credit', 'credits', 'spend', 'spending', 'cap', 'caps', 'limit', 'limits', 'overage', 'metronome',
  'stripe', 'price', 'prices', 'pricing', 'quota', 'quotas', 'tax', 'taxes', 'wallet', 'funding',
  'finance', 'finances', 'payout', 'payouts', 'trial', 'trials', 'coupon', 'coupons', 'promo',
  'discount', 'charge', 'charges', 'refund', 'refunds', 'usage', 'seat', 'seats', 'addon', 'addons',
]);
// An argument key (at any depth) from this set marks a call as moving money or changing billing.
const MONEY_KEYS = new Set([
  'amount', 'amount_cents', 'amounts', 'payment_method', 'payment_method_id', 'payment_methods',
  'monthly_limit', 'monthly_limit_cents', 'below_cents', 'to_cents', 'alert_below_cents',
  'spend_cap', 'spending_limit', 'spend_limit', 'spend_limit_cents', 'x_spend_limit',
  'x_spend_limit_cents', 'plan', 'plan_id', 'plan_name', 'price', 'price_id', 'coupon',
  'coupon_code', 'promo_code', 'card', 'card_id', 'card_token', 'setup_intent', 'setup_intent_id',
  'subscription', 'subscription_id', 'topup', 'topup_id', 'auto_recharge', 'auto_topup',
  'auto_upgrade', 'auto_upgrade_enabled', 'overage', 'allow_overage', 'credits', 'credit_cents',
  'budget', 'daily_budget', 'lifetime_budget', 'budget_cents', 'reconcile',
]);
// Billing endpoints or pages inside URL/path arguments, shell commands or page scripts.
const BILLING_URL_RE = /\/v\d\/(balance|billing|payments?|payment-methods?|subscriptions?|checkout|plans?|treasury|top-?ups?)\b|\/usage(-stats)?\?[^\s'"]*reconcile|top-?ups?\b|auto-?recharge|payment[-_]?methods?|setup[-_]?intents?|(billing|checkout|buy)\.stripe\.com/i;
const BILLING_PAGE_RE = /(zernio\.com|getlate\.dev)\/[^\s'"]*(billing|balance|top-?up|payment|plan|pricing|upgrade|checkout|subscription|invoice|credits?)|canva\.com\/[^\s'"]*(pricing|pro\b|upgrade|checkout|billing|subscription|teams|trial)|facebook\.com\/[^\s'"]*(billing|payment|adsmanager|ads\/manager)|adsmanager\.facebook\.com|stripe\.com/i;
const URLISH_RE = /^\s*(https?:\/\/|\/v\d\/|www\.)/i;
const ZERNIO_API_RE = /(zernio\.com|getlate\.dev)[^\s'"]*\/v\d\//i;
const NETWORK_RE = /\b(curl|wget|Invoke-WebRequest|Invoke-RestMethod|iwr|irm|httpie|http\s+(get|post|put|patch|delete))\b|fetch\s*\(|axios|XMLHttpRequest|requests\.(get|post|put|patch|delete)|https?\.request/i;

const BILLING_DENY = ' Zero-spend policy: billing is read-only from this project and no confirmation overrides it. Hamidreza changes billing himself in the Zernio or Canva dashboard.';

function walk(value, visit, depth = 0, key = '') {
  if (depth > 8 || value === null || value === undefined) return;
  if (Array.isArray(value)) { for (const v of value) walk(v, visit, depth + 1, key); return; }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { visit('key', k, v); walk(v, visit, depth + 1, k); }
    return;
  }
  visit('value', key, value);
}
function moneyKeysIn(args) {
  const hits = [];
  walk(args, (kind, k, v) => {
    if (kind === 'key' && MONEY_KEYS.has(normName(k)) && v !== null && v !== undefined && v !== false) hits.push(k);
  });
  return hits;
}
function billingUrlsIn(args) {
  const hits = [];
  walk(args, (kind, _k, v) => {
    if (kind === 'value' && typeof v === 'string' && URLISH_RE.test(v) && (BILLING_URL_RE.test(v) || BILLING_PAGE_RE.test(v))) hits.push(v.slice(0, 80));
  });
  return hits;
}

/** 'read' for an allowlisted billing read, a deny verdict for any other billing call, else null. */
function billingVerdict(name, args) {
  const n = normName(name);
  const allowed = BILLING_READS.get(n);
  if (allowed) {
    const extra = Object.entries(args || {})
      .filter(([, v]) => v !== null && v !== undefined && v !== false)
      .map(([k]) => normName(k))
      .filter((k) => !allowed.has(k));
    if (extra.length) return deny(`"${n}" is an allowlisted billing read, but argument(s) ${extra.join(', ')} are outside its read-only schema (e.g. reconcile forces a subscription pass).${BILLING_DENY}`);
    return 'read';
  }
  const tokens = n.split('_');
  const tokenHit = tokens.find((t) => BILLING_TOKENS.has(t));
  const keyHits = moneyKeysIn(args);
  const urlHits = billingUrlsIn(args);
  if (tokenHit || keyHits.length || urlHits.length) {
    const why = tokenHit ? `its name is in the billing area ("${tokenHit}")`
      : keyHits.length ? `its arguments change money or billing (${keyHits.slice(0, 4).join(', ')})`
        : `its arguments point at a billing endpoint (${urlHits[0]})`;
    return deny(`"${n || '?'}" is blocked: ${why}, and it is not one of the exact billing reads allowed (${[...BILLING_READS.keys()].join(', ')}).${BILLING_DENY}`);
  }
  return null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────
const deny = (reason) => ({ decision: 'deny', reason });
const ask = (reason) => ({ decision: 'ask', reason });
const pick = (obj, ...keys) => {
  for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
};

/**
 * Gateway arguments → { args } or { error: denyVerdict } when they can't be read unambiguously.
 * (Tagged, because inner tools have their own keys such as posts_review_post's `decision`.)
 */
function gatewayArgs(input) {
  let args = pick(input, 'arguments', 'args', 'params', 'input', 'parameters');
  if (args === undefined || args === null) return { args: {} };
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { return { error: deny('Gateway arguments are a string that is not valid JSON; the guard cannot see what the inner tool would do.') }; }
  }
  if (args === null) return { args: {} };
  if (typeof args !== 'object' || Array.isArray(args)) return { error: deny('Gateway arguments must be an object; the guard cannot classify this call.') };
  return { args };
}
const gatewayName = (input) => {
  const v = pick(input, 'name', 'tool', 'tool_name', 'toolName', 'tool_slug');
  return typeof v === 'string' ? v.trim() : '';
};

function tzOffsetMs(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs;
}
function parseScheduled(value, timeZone) {
  const s = String(value).trim();
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(s)) return Date.parse(s);
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return NaN;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  try {
    const first = asUtc - tzOffsetMs(asUtc, timeZone || CONFIG.defaultTimezone);
    return asUtc - tzOffsetMs(first, timeZone || CONFIG.defaultTimezone);
  } catch {
    return NaN;
  }
}
function fmt(ms) {
  try {
    const g = new Intl.DateTimeFormat('en-GB', {
      timeZone: CONFIG.displayTimezone, weekday: 'short', day: '2-digit', month: 'short',
      year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(ms);
    const j = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      timeZone: CONFIG.displayTimezone, day: 'numeric', month: 'long', year: 'numeric',
    }).format(ms);
    return `${g} Tehran (${j})`;
  } catch {
    return new Date(ms).toISOString();
  }
}

// ── Approval gates (ops/approval-log.md + content files) ────────────────────────
// Feed posts IG-001…, story sequences IG-S01… (CLAUDE.md §10).
const ID_RE = /\bIG-(?:S\d{2,3}|\d{3})\b/gi;
const ID_FILE_RE = /^(IG-(?:S\d{2,3}|\d{3}))_.+\.md$/i;
const GATES = ['G1', 'G2', 'G3', 'G4'];
const GATE_WORDS = {
  G1: /\bG1\b|بریف|brief|برنامه/i,
  G2: /\bG2\b|کپی|متن|copy/i,
  G3: /\bG3\b|طرح|دیزاین|design/i,
  G4: /\bG4\b|زمان[‌ ]?بندی|schedule/i,
};
// \b does not work around Persian letters, so «رد» is matched between spaces or string ends.
const REVOKE_RE = /revoke|cancel|withdraw|reject|invalid|لغو|ابطال|(^|\s)رد(\s|$)/i;
const asciiDigits = (s) => String(s).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
const idsIn = (s) => [...new Set((asciiDigits(s).match(ID_RE) || []).map((x) => x.toUpperCase()))];

function readApprovalRows() {
  const file = join(projectDir(), 'ops', 'approval-log.md');
  if (!existsSync(file)) return [];
  const rows = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 6 || !/^\d+$/.test(cells[0])) continue;
    rows.push({ n: +cells[0], ids: idsIn(cells[2]), gate: cells[3], hash: (/[0-9a-f]{12}/.exec(cells[4]) || [''])[0], words: asciiDigits(cells[5]) });
  }
  return rows;
}

/** Explicit approvals per gate for one ID. Rows whose own words don't name the ID and gate don't count. */
function approvalsFor(id) {
  const out = { vague: [] };
  for (const row of readApprovalRows()) {
    if (!row.ids.includes(id)) continue;
    if (REVOKE_RE.test(row.gate)) { for (const g of GATES) delete out[g]; continue; }
    for (const g of GATES) {
      if (!new RegExp(`\\b${g}\\b`, 'i').test(row.gate)) continue;
      const explicit = idsIn(row.words).includes(id) && GATE_WORDS[g].test(row.words);
      if (explicit) out[g] = row;
      else if (!out.vague.includes(`#${row.n}`)) out.vague.push(`#${row.n}`);
    }
  }
  return out;
}

function contentFiles() {
  const root = join(projectDir(), 'content');
  const files = [];
  if (!existsSync(root)) return files;
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory() || !/^\d\d-/.test(dir.name)) continue;
    for (const f of readdirSync(join(root, dir.name))) if (ID_FILE_RE.test(f)) files.push(join(root, dir.name, f));
  }
  return files;
}
const fileForId = (id) => contentFiles().find((f) => f.replace(/\\/g, '/').split('/').pop().toUpperCase().startsWith(`${id}_`));
function fileForPostId(postId) {
  if (!postId) return null;
  for (const f of contentFiles()) {
    const m = /^\s*zernio_post_id:\s*["']?([^"'\s#]+)/m.exec(readFileSync(f, 'utf8'));
    if (m && m[1] === String(postId)) return f;
  }
  return null;
}
const idOfFile = (f) => (ID_FILE_RE.exec(f.replace(/\\/g, '/').split('/').pop()) || [])[1]?.toUpperCase();

function bodyHash(text) {
  const t = text.replace(/\r\n/g, '\n');
  const body = t.startsWith('---\n') ? t.slice(t.indexOf('\n---', 4) + 4) : t;
  return createHash('sha256').update(body.split(/\n## Change log\b/)[0].trim(), 'utf8').digest('hex').slice(0, 12);
}
function approvedTime(text) {
  const m = /g4_schedule:[^\n]*scheduled_for:\s*["']([^"']+)["']/.exec(text);
  return m && m[1].trim() ? m[1].trim() : null;
}

/** Content ID from tags/metadata, or null; a deny verdict when several IDs are given. */
function contentIdFromArgs(args) {
  const found = new Set();
  const tags = pick(args, 'tags');
  if (Array.isArray(tags)) for (const t of tags) for (const id of idsIn(t)) found.add(id);
  const meta = pick(args, 'metadata');
  if (meta && typeof meta === 'object') for (const k of ['content_id', 'contentId']) if (meta[k]) for (const id of idsIn(meta[k])) found.add(id);
  if (found.size > 1) return deny(`One Zernio post must carry exactly one content ID; got ${[...found].join(', ')}. Approvals are per ID.`);
  return found.size ? [...found][0] : null;
}

/**
 * Checks that `id` has explicit approvals for `needed` gates and that the file is unchanged since.
 * Returns null when everything holds, else a deny verdict.
 */
function gateCheck(id, needed, action, scheduledMs) {
  if (!id) {
    return deny(`${action} needs an explicit content ID: pass tags: ["IG-0xx"] (exactly one), or use a post_id recorded as zernio_post_id in a content file. Vague approvals such as "approve all" never authorise posts.`);
  }
  const file = fileForId(id);
  if (!file) return deny(`${action}: no content file for ${id} under content/.`);
  const ap = approvalsFor(id);
  const missing = needed.filter((g) => !ap[g]);
  if (missing.length) {
    const vague = ap.vague.length ? ` Rows ${ap.vague.join(', ')} for ${id} don't count: Hamidreza's own words must name ${id} and the gate (e.g. «G2 تأیید ${id}»).` : '';
    return deny(`${action} for ${id} needs explicit ${missing.join(' + ')} approval in ops/approval-log.md.${vague}`);
  }
  const text = readFileSync(file, 'utf8');
  const hash = bodyHash(text);
  for (const g of needed.filter((x) => x !== 'G1')) {
    if (ap[g].hash && ap[g].hash !== hash) {
      return deny(`${action} for ${id}: the file changed after ${g} (approved ${ap[g].hash}, now ${hash}). Any edit after approval needs a new approval.`);
    }
  }
  if (needed.includes('G4') && scheduledMs !== undefined) {
    const t = approvedTime(text);
    const approvedMs = t ? parseScheduled(t, CONFIG.contentTimezone) : NaN;
    if (Number.isNaN(approvedMs)) return deny(`${action} for ${id}: no readable approvals.g4_schedule.scheduled_for in the content file.`);
    if (Math.abs(approvedMs - scheduledMs) > 60_000) {
      return deny(`${action} for ${id}: the requested time ${fmt(scheduledMs)} is not the G4-approved time ${fmt(approvedMs)}.`);
    }
  }
  return null;
}

// ── Zernio ──────────────────────────────────────────────────────────────────────
const Z_DENY = {
  posts_publish_now: 'Instant publishing is disabled. Approved posts go out through a pending-approval schedule (CLAUDE.md §6).',
  posts_bulk_upload_posts: 'Bulk upload bypasses per-post approval.',
  posts_cross_post: 'Cross-posting is out of scope: only the Instagram account is approved.',
  posts_retry_all_failed: 'Bulk retry republishes posts without a fresh per-post approval. Retry one post at a time, with approval.',
  profiles_create: 'Workspace changes are out of scope (one profile, one Instagram account).',
  profiles_delete: 'Deleting a Zernio profile is irreversible and out of scope.',
  accounts_move_account_to_profile: 'Moving accounts between profiles is out of scope.',
  messages_create_inbox_conversation: 'Starting new conversations is cold outreach. Only replies to people who wrote first are allowed, each one approved.',
  posts_create: 'The simple posts_create cannot carry a content ID and schedules 60 minutes ahead by default. Use call_tool → posts_create_post with tags: ["IG-0xx"] (is_draft:true for a draft).',
};

function zernio(tool, input) {
  const t = normName(tool);
  if (GATEWAY_NAMES.has(t)) {
    const inner = gatewayName(input);
    if (!inner) return deny('Zernio gateway call without a resolvable tool name. Unknown operations are blocked.');
    if (GATEWAY_NAMES.has(normName(inner))) return deny(`Nested gateway call ("${inner}") is blocked: the guard judges one exact tool per call.`);
    const { args, error } = gatewayArgs(input);
    if (error) return { ...error, inner };
    const verdict = zernioTool(inner, args);
    return verdict ? { ...verdict, inner } : null;
  }
  return zernioTool(tool, input);
}

function zernioTool(rawName, args) {
  const name = normName(rawName);
  const billing = billingVerdict(name, args);
  if (billing === 'read') return null;
  if (billing) return billing;

  const tokens = name.split('_');
  if (tokens.includes('support')) {
    return deny('The Zernio Support Assistant is billed per question (from $0.33). It is never used from this project.');
  }
  if (Z_DENY[name]) return deny(Z_DENY[name]);

  switch (name) {
    case 'posts_create_post': return fullCreate(args);
    case 'posts_update':
    case 'posts_update_post': return updatePost(args, name);
    case 'posts_edit_post': return editPublished(args);
    case 'posts_review_post': return review(args);
    case 'posts_retry': return retry(args);
    case 'messages_send_inbox_message':
      if (pick(args, 'message_tag', 'messageTag') !== undefined) {
        return deny('Message tags are not used. HUMAN_AGENT is for replies a person types; outside the 24-hour window Hamidreza replies in the Instagram app.');
      }
      if (pick(args, 'channel', 'category') !== undefined) {
        return deny('channel/category route messages through paid SMS, RCS or WhatsApp sends. Not allowed.');
      }
      return ask('Sends a DM to a real person on Instagram. Approve only if Hamidreza approved this exact text, by its reply number (see today\'s file in inbox/triage/).');
    case 'media_generate_upload_link':
    case 'media_check_upload_status':
    case 'zernio_overview':
    case 'search_tools':
    case 'docs_search':
      return null;
    default:
      break;
  }

  const verb = tokens.find((x) => READ_VERBS.has(x) || WRITE_VERBS.has(x)) || null;
  const isWrite = verb !== null && WRITE_VERBS.has(verb);
  const isRead = verb !== null && READ_VERBS.has(verb);

  if (tokens.some((x) => PAID_TOKENS.has(x))) {
    if (isRead && !isWrite) return null;
    if (!isWrite) return deny(`Unrecognised Zernio operation "${name}" in a paid or automation area. Unknown operations are blocked.`);
    if (DERISK_VERBS.has(verb)) {
      return ask(`"${name}" changes a paid or automation feature (${verb}). It lowers risk but still changes account state.`);
    }
    return deny(`"${name}" touches a paid, metered or automated-messaging feature (ads, broadcasts, workflows, automations, phone numbers, webhooks or a platform other than Instagram). Not allowed in this project.`);
  }
  if (isWrite) {
    if (MESSAGE_SEND_VERBS.has(verb) && tokens.some((x) => MESSAGING_TOKENS.has(x))) {
      return ask(`"${name}" sends a message, reply or comment to a real person on Instagram. Approve only if Hamidreza approved this exact text by its reply number (see today's file in inbox/triage/).`);
    }
    if (verb === 'send' || verb === 'reply' || verb === 'accept') {
      return ask(`"${name}" sends something to a real person. Approve only if Hamidreza approved this exact text.`);
    }
    return ask(`"${name}" changes data in Zernio. Approve only if it matches an approved task.`);
  }
  if (isRead) return null;
  return deny(`Unrecognised Zernio operation "${name}". Unknown or ambiguous operations are blocked; find the exact tool with search_tools.`);
}

function platformChecks(args) {
  const platforms = pick(args, 'platforms');
  if (platforms !== undefined && !Array.isArray(platforms)) return deny('platforms must be an array; the guard cannot check targets.');
  if (Array.isArray(platforms)) {
    for (const p of platforms) {
      const name = String(pick(p, 'platform') || '').toLowerCase();
      if (!CONFIG.allowedPlatforms.has(name)) return deny(`Only Instagram is in scope (platform "${name || '?'}").`);
      if (pick(p, 'publishNow', 'publish_now') === true) return deny('publishNow is disabled. Nothing is published immediately from this project.');
    }
  }
  if (pick(args, 'publish_now', 'publishNow') === true) return deny('publish_now is disabled. Nothing is published immediately from this project.');
  const recycling = pick(args, 'recycling');
  if (recycling && typeof recycling === 'object' && recycling.enabled === true) {
    return deny('Recycling republishes posts automatically, without per-post approval. Not allowed.');
  }
  if (pick(args, 'queued_from_profile', 'queuedFromProfile', 'queue_id', 'queueId') !== undefined) {
    return deny('Queue publishing skips the exact-time + Zernio review flow. Use scheduled_for with requires_approval:true.');
  }
  return null;
}

function scheduleTimes(args) {
  const rootTz = pick(args, 'timezone');
  const times = [];
  const root = pick(args, 'scheduled_for', 'scheduledFor');
  if (root) times.push({ value: root, tz: rootTz });
  const platforms = pick(args, 'platforms');
  if (Array.isArray(platforms)) {
    for (const p of platforms) {
      const v = pick(p, 'scheduledFor', 'scheduled_for');
      if (v) times.push({ value: v, tz: pick(p, 'timezone') || rootTz });
    }
  }
  return times;
}

function futureCheck(times) {
  const now = Date.now();
  for (const t of times) {
    const ms = parseScheduled(t.value, t.tz);
    if (Number.isNaN(ms)) {
      return deny(`Cannot read scheduled_for "${t.value}". Use ISO 8601, e.g. 2026-11-22T20:30:00 with timezone "Asia/Tehran".`);
    }
    if (ms < now + CONFIG.minLeadMinutes * 60000) {
      return deny(`scheduled_for "${t.value}" (${fmt(ms)}) is in the past or less than ${CONFIG.minLeadMinutes} minutes away. Zernio would publish it immediately.`);
    }
  }
  return null;
}

/** Content ID for a call: tags/metadata first, then the content file that records its post_id. */
function resolveId(args) {
  const fromArgs = contentIdFromArgs(args);
  if (fromArgs && fromArgs.decision) return fromArgs;
  const file = fileForPostId(pick(args, 'post_id', 'postId'));
  const fromFile = file ? idOfFile(file) : null;
  if (fromArgs && fromFile && fromArgs !== fromFile) return deny(`tags name ${fromArgs} but post ${pick(args, 'post_id', 'postId')} belongs to ${fromFile}.`);
  return fromArgs || fromFile;
}

function scheduledVerdict(args, times, action, id) {
  const timing = futureCheck(times);
  if (timing) return timing;
  if (pick(args, 'requires_approval', 'requiresApproval') !== true && CONFIG.requireZernioReview) {
    return deny('Scheduled posts must use requires_approval:true, so the post waits as pending_approval until Hamidreza approves it in Zernio.');
  }
  const ms = parseScheduled(times[0].value, times[0].tz);
  const gate = gateCheck(id, ['G2', 'G3', 'G4'], `${action} a scheduled post`, ms);
  if (gate) return gate;
  return ask(`${action} a PENDING-APPROVAL Instagram post for ${id} at ${fmt(ms)}. G2, G3 and G4 are recorded explicitly and the file is unchanged. It will not publish until it is approved in Zernio. Approve only if this matches Hamidreza's G4 message.`);
}

function fullCreate(args) {
  const blocked = platformChecks(args);
  if (blocked) return blocked;
  const id = resolveId(args);
  if (id && id.decision) return id;
  const times = scheduleTimes(args);
  if (pick(args, 'is_draft', 'isDraft') === true || times.length === 0) {
    const gate = gateCheck(id, ['G2', 'G3'], 'Creating a Zernio draft');
    if (gate) return gate;
    return ask(`Creates a Zernio DRAFT for ${id} (not scheduled, not published). G2 and G3 are recorded explicitly and the file is unchanged.`);
  }
  return scheduledVerdict(args, times, 'Creates', id);
}

function updatePost(args, name) {
  const blocked = platformChecks(args);
  if (blocked) return blocked;
  const id = resolveId(args);
  if (id && id.decision) return id;
  const isDraft = pick(args, 'is_draft', 'isDraft');
  const times = scheduleTimes(args);
  if (isDraft === false && times.length === 0) {
    return deny('Promoting a draft needs scheduled_for plus requires_approval:true (queue and publish-now are disabled).');
  }
  if (pick(args, 'requires_approval', 'requiresApproval') === true && times.length === 0) {
    return deny('Submitting a post for approval needs the G4-approved scheduled_for in the same call, so the guard can check the time.');
  }
  if (times.length > 0) {
    if (name === 'posts_update') {
      const timing = futureCheck(times);
      if (timing) return timing;
      const ms = parseScheduled(times[0].value, times[0].tz);
      const gate = gateCheck(id, ['G2', 'G3', 'G4'], 'Moving a post', ms);
      if (gate) return gate;
      return ask(`Moves Zernio post ${id} to ${fmt(ms)} (the G4-approved time). If the post is already approved in Zernio it will publish then.`);
    }
    return scheduledVerdict(args, times, 'Updates to', id);
  }
  const gate = gateCheck(id, ['G2', 'G3'], `Editing a Zernio post (${name})`);
  if (gate) return gate;
  return ask(`Edits Zernio post ${id}. The content file still matches its G2/G3 approval; check the new text equals the approved file.`);
}

function editPublished(args) {
  const id = resolveId(args);
  if (id && id.decision) return id;
  const gate = gateCheck(id, ['G2'], 'Editing a PUBLISHED post');
  if (gate) return gate;
  return ask(`Edits ${id}, which may already be PUBLISHED on Instagram. Approve only if Hamidreza approved the new text explicitly.`);
}

function review(args) {
  const decision = String(pick(args, 'decision') || '').toLowerCase();
  const postId = pick(args, 'post_id', 'postId') || '?';
  if (decision === 'reject') return ask(`Rejects pending post ${postId} (it returns to draft). Low risk.`);
  if (decision !== 'approve') return deny('posts_review_post needs decision "approve" or "reject".');
  const id = resolveId(args);
  if (id && id.decision) return id;
  const gate = gateCheck(id, ['G2', 'G3', 'G4'], `Approving pending post ${postId}`);
  if (gate) return gate;
  return ask(`APPROVES pending post ${postId} (${id}) in Zernio: it publishes automatically at its time. Only with Hamidreza's explicit message asking Claude to approve ${id} in Zernio.`);
}

function retry(args) {
  const id = resolveId(args);
  if (id && id.decision) return id;
  const gate = gateCheck(id, ['G2', 'G3', 'G4'], 'Retrying a failed post');
  if (gate) return gate;
  return ask(`Retries failed post ${id}: if it succeeds it goes live immediately. Needs Hamidreza's explicit approval for this retry.`);
}

// ── Canva ───────────────────────────────────────────────────────────────────────
const C_DENY = {
  'resize-design': 'Resize / Magic Switch is a Canva Pro feature. Copy the master template at the target size instead.',
  'remove-background': 'Background Remover is a Canva Pro feature.',
  'create-brand-template-draft': 'Brand Templates are a paid Canva feature. Masters are normal designs (brand/visual-identity.md §8).',
  'publish-brand-template': 'Brand Templates are a paid Canva feature.',
  'create-design-from-brand-template': 'Brand Templates are a paid Canva feature. Use copy-design on a master design.',
  'generate-image': 'AI image generation is off-brand: real screenshots and real photos only (brand/visual-identity.md §6).',
  'create-video': 'AI video generation is not used: Reels are built from real screen recordings and footage.',
  'separate-image-layers': 'AI layer separation is not part of the free workflow.',
};
const C_ASK = {
  'create-design': 'Generates a design with Canva AI (Magic Design: 10 lifetime uses on Canva Free). Allowed only as a rough layout sketch; final assets are built from the master templates. Prefer copy-design.',
  'generate-design': 'Generates designs with Canva AI (Magic Design: 10 lifetime uses on Canva Free). Allowed only as a rough layout sketch.',
  'generate-design-structured': 'Generates designs with Canva AI (Magic Design: 10 lifetime uses on Canva Free). Allowed only as a rough layout sketch.',
  'create-design-from-candidate': 'Saves an AI-generated candidate design into Canva.',
  'import-design-from-url': 'Imports an external design into Canva.',
  'import-claude-motion-from-url': 'Imports a motion design into Canva.',
  'comment-on-design': 'Posts a comment on a Canva design (visible to its collaborators).',
  'reply-to-comment': 'Posts a reply on a Canva design (visible to its collaborators).',
};
function canva(tool, input) {
  if (C_DENY[tool]) return deny(C_DENY[tool]);
  const billing = billingVerdict(tool, input);
  if (billing && billing !== 'read') return billing;
  if (C_ASK[tool]) return ask(C_ASK[tool]);
  if (tool === 'edit-design' && input.finalize === 'commit') {
    return ask('Saves the edits to the Canva design permanently. Approve after reviewing the preview.');
  }
  if (tool === 'export-design' && input.format && input.format.export_quality === 'pro') {
    return deny('Pro-quality export needs Canva Pro. Export with export_quality "regular".');
  }
  return null;
}

// ── Other connectors ────────────────────────────────────────────────────────────
function outOfScope(label, tool) {
  const verb = firstVerb(tokensOf(tool));
  if (verb && READ_VERBS.has(verb)) return null;
  return ask(`${label} is outside this project's approved stack. "${tool}" may create or change resources, which can leave a free tier. Confirm Hamidreza asked for it.`);
}
function scheduler(tool) {
  const verb = firstVerb(tokensOf(tool));
  if (verb && READ_VERBS.has(verb)) return null;
  return ask(`"${tool}" creates or changes an unattended scheduled task. Any scheduled job must follow the no-publish / no-send / zero-spend rules (CLAUDE.md §2).`);
}
/** Any other MCP server: zero-spend check on the tool and on a gateway's inner tool. */
function generic(tool, input) {
  const direct = billingVerdict(tool, input);
  if (direct && direct !== 'read') return direct;
  if (GATEWAY_NAMES.has(normName(tool))) {
    const inner = gatewayName(input);
    if (!inner) return null;
    const { args, error } = gatewayArgs(input);
    if (error) return error;
    const v = billingVerdict(inner, args);
    if (v && v !== 'read') return { ...v, inner };
    if (ZERNIO_FINGERPRINT.has(normName(inner))) return zernioTool(inner, args);
  }
  return null;
}

function serviceOf(server, tool, input) {
  if (SERVER_IDS[server]) return SERVER_IDS[server];
  const s = server.toLowerCase();
  for (const name of ['zernio', 'canva', 'composio', 'cloudflare', 'mobbin']) if (s.includes(name)) return name;
  if (s.includes('scheduled-tasks') || s.includes('scheduled_tasks')) return 'scheduler';
  if (ZERNIO_FINGERPRINT.has(normName(tool))) return 'zernio';
  if (CANVA_FINGERPRINT.has(tool)) return 'canva';
  if (/^COMPOSIO_/i.test(tool)) return 'composio';
  if (GATEWAY_NAMES.has(normName(tool)) && gatewayName(input)) return 'zernio';
  return 'other';
}

// ── Shell and browser paths ─────────────────────────────────────────────────────
function textOf(input) {
  const parts = [];
  walk(input, (kind, _k, v) => { if (kind === 'value' && typeof v === 'string') parts.push(v); });
  return parts.join('\n');
}
function shellVerdict(text) {
  const s = String(text || '');
  if (!NETWORK_RE.test(s)) return null;
  if (BILLING_URL_RE.test(s) || BILLING_PAGE_RE.test(s)) {
    return deny(`This command makes a network request to a billing endpoint or page.${BILLING_DENY}`);
  }
  if (ZERNIO_API_RE.test(s)) {
    return deny('Direct Zernio API calls from a shell bypass the connector guard. Use the Zernio connector (media uploads go to the presigned storage URL, which is not a /v1/ API path).');
  }
  return null;
}
function browserVerdict(tool, input) {
  const s = textOf(input);
  for (const m of s.matchAll(/https?:\/\/[^\s'"<>)]+|\b(?:www\.)?[a-z0-9-]+\.(?:com|dev|io)\/[^\s'"<>)]*/gi)) {
    if (BILLING_PAGE_RE.test(m[0]) || BILLING_URL_RE.test(m[0])) {
      return deny(`Browser access to a billing or upgrade page (${m[0].slice(0, 80)}) is blocked.${BILLING_DENY}`);
    }
  }
  if (/javascript/i.test(tool) && (shellVerdict(`fetch(${s})`) || ZERNIO_API_RE.test(s))) {
    return deny('Page scripts that call billing endpoints or the Zernio API are blocked.');
  }
  return null;
}

// ── Output ──────────────────────────────────────────────────────────────────────
function log(entry) {
  if (process.env.GUARD_LOG === 'off') return;
  try {
    const dir = join(projectDir(), 'ops');
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'guard-log.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    // Logging must never break the guard.
  }
}
function emit(verdict, toolName) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: verdict.decision,
      permissionDecisionReason: `[Instagram Studio guard] ${verdict.reason}`,
    },
  }));
  log({ ts: new Date().toISOString(), decision: verdict.decision, tool: toolName, inner: verdict.inner, reason: verdict.reason });
}

function decide(toolName, input) {
  if (toolName === 'Bash' || toolName === 'PowerShell') return shellVerdict(input.command);
  const match = /^mcp__(.+?)__(.+)$/.exec(toolName);
  if (!match) return null;
  const [, server, tool] = match;
  if (server === 'terminal') return shellVerdict(textOf(input));
  if (server === 'Claude_Browser' || server === 'claude-in-chrome') return browserVerdict(tool, input);
  switch (serviceOf(server, tool, input)) {
    case 'zernio': return zernio(tool, input);
    case 'canva': return canva(tool, input);
    case 'composio': return deny('Composio is not part of the approved free stack for this project (CLAUDE.md §3).');
    case 'cloudflare': return generic(tool, input) || outOfScope('Cloudflare', tool);
    case 'mobbin': return generic(tool, input) || ask('Mobbin is not part of the approved free stack. Use it only if Hamidreza asked for UI references.');
    case 'scheduler': return generic(tool, input) || scheduler(tool);
    default: return generic(tool, input);
  }
}

function main() {
  let event;
  try {
    event = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    emit(deny('The guard could not read this tool call, so it is blocked (fail closed).'), '?');
    return;
  }
  const toolName = String(event.tool_name || '');
  const raw = event.tool_input;
  if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
    if (/^mcp__|^(Bash|PowerShell)$/.test(toolName)) emit(deny('Tool input is not an object; the guard cannot classify it (fail closed).'), toolName);
    return;
  }
  const input = raw || {};
  let verdict = null;
  try {
    verdict = decide(toolName, input);
  } catch (error) {
    verdict = /^mcp__|^(Bash|PowerShell)$/.test(toolName)
      ? deny(`The guard hit an internal error (${error && error.message}), so the call is blocked (fail closed).`)
      : null;
  }
  if (verdict) emit(verdict, toolName);
}

main();
