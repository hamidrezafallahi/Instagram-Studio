#!/usr/bin/env node
// Self-test for guard.mjs. Run: node .claude/hooks/guard.test.mjs
// Feeds synthetic PreToolUse events to the hook (a real child process, as Claude Code runs it)
// and checks each decision. Approval-gate cases run against a throwaway fixture project.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const guard = join(here, 'guard.mjs');
const Z = 'mcp__8ca0a414-7010-44c3-8a62-e915245ed1a6__';
const C = 'mcp__1a7936a8-5034-48a7-964f-95bc40ca5782__';
const B = 'mcp__Claude_Browser__';
const ACC = '6af15b88576d0f544103ea7a';
const IG = [{ platform: 'instagram', accountId: ACC }];

// ── Times ───────────────────────────────────────────────────────────────────────
function tehranLocal(offsetMs) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran', hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(Date.now() + offsetMs)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00`;
}
const DAY = 86_400_000;
const FUTURE = tehranLocal(3 * DAY);
const OTHER_FUTURE = tehranLocal(4 * DAY);
const PAST = tehranLocal(-DAY);
const SOON = tehranLocal(5 * 60_000);
const tz = 'Asia/Tehran';
const call = (name, args = {}) => ({ name, arguments: args });

// ── Fixture project (approval log + content files) ──────────────────────────────
const fx = mkdtempSync(join(tmpdir(), 'guard-fixture-'));
const hashOf = (text) => {
  const body = text.slice(text.indexOf('\n---', 4) + 4);
  return createHash('sha256').update(body.split(/\n## Change log\b/)[0].trim(), 'utf8').digest('hex').slice(0, 12);
};
function contentFile(id, postId, body) {
  const text = `---\nid: ${id}\nzernio_post_id: "${postId}"\napprovals:\n  g4_schedule: { at: "x", ref: "x", scheduled_for: "${FUTURE}" }\n---\n\n## Caption\n\n${body}\n\n## Change log\n\n- created\n`;
  mkdirSync(join(fx, 'content', '03-approved'), { recursive: true });
  writeFileSync(join(fx, 'content', '03-approved', `${id}_carousel_fixture.md`), text);
  return hashOf(text);
}
const h900 = contentFile('IG-900', 'zp900', 'متن تأییدشده');
const h901 = contentFile('IG-901', 'zp901', 'vague approvals');
contentFile('IG-902', 'zp902', 'edited after approval');
const h903 = contentFile('IG-903', 'zp903', 'revoked');
const hS90 = contentFile('IG-S90', 'zps90', 'story sequence');
mkdirSync(join(fx, 'ops'), { recursive: true });
writeFileSync(join(fx, 'ops', 'approval-log.md'), [
  '| # | Date-time | ID(s) | Gate | Body hash | Words | Shown | By |',
  '|---|---|---|---|---|---|---|---|',
  `| 1 | 2026-11-09 10:00 | IG-900 | G1 + G2 | \`${h900}\` | «G2 تأیید IG-900» | x | Claude |`,
  `| 2 | 2026-11-09 10:05 | IG-900 | G3 | \`${h900}\` | «طرح IG-900 تأیید» | x | Claude |`,
  `| 3 | 2026-11-09 10:10 | IG-900 | G4 | \`${h900}\` | «زمان‌بندی IG-900 برای ۲ آذر ساعت ۲۰:۳۰ تأیید» | x | Claude |`,
  `| 4 | 2026-11-09 10:15 | IG-901 | G1 + G2 | \`${h901}\` | «Approve all three» | x | Claude |`,
  `| 5 | 2026-11-09 10:16 | IG-901 | G3 | \`${h901}\` | «approve all» | x | Claude |`,
  `| 6 | 2026-11-09 10:17 | IG-901 | G4 | \`${h901}\` | «همه را زمان‌بندی کن» | x | Claude |`,
  '| 7 | 2026-11-09 10:20 | IG-902 | G2 | `000000000000` | «G2 تأیید IG-902» | x | Claude |',
  '| 8 | 2026-11-09 10:21 | IG-902 | G3 | `000000000000` | «G3 تأیید IG-902» | x | Claude |',
  '| 9 | 2026-11-09 10:22 | IG-902 | G4 | `000000000000` | «G4 تأیید IG-902» | x | Claude |',
  `| 10 | 2026-11-09 10:30 | IG-903 | G2 + G3 + G4 | \`${h903}\` | «G2 G3 G4 تأیید IG-903» | x | Claude |`,
  `| 11 | 2026-11-09 10:40 | IG-903 | Revoke | \`${h903}\` | «IG-903 لغو» | x | Claude |`,
  `| 12 | 2026-11-09 10:50 | IG-S90 | G2 + G3 | \`${hS90}\` | «G2 و G3 تأیید IG-S90» | x | Claude |`,
  '',
].join('\n'));

function run(toolName, toolInput = {}, raw) {
  const r = spawnSync(process.execPath, [guard], {
    input: raw ?? JSON.stringify({ tool_name: toolName, tool_input: toolInput }),
    env: { ...process.env, GUARD_LOG: 'off', CLAUDE_PROJECT_DIR: fx },
    encoding: 'utf8',
  });
  if (r.status !== 0) return `exit:${r.status}`;
  if (!r.stdout.trim()) return 'pass';
  return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
}

const tagged = (id, extra) => ({ content: 'x', platforms: IG, tags: [id], ...extra });
const sched = (id, when = FUTURE, extra = {}) => tagged(id, { scheduled_for: when, timezone: tz, requires_approval: true, ...extra });

const cases = [
  // ── Zero-spend: billing mutations (every category), via call_tool ──────────────
  ['deny auto top-up ON', Z + 'call_tool', call('treasury_update_auto_recharge', { enabled: true }), 'deny', 'billing'],
  ['deny auto top-up OFF', Z + 'call_tool', call('treasury_update_auto_recharge', { enabled: false }), 'deny', 'billing'],
  ['deny auto top-up threshold change', Z + 'call_tool', call('treasury_update_auto_recharge', { below_cents: 500, to_cents: 2000 }), 'deny', 'billing'],
  ['deny auto top-up monthly limit increase', Z + 'call_tool', call('treasury_update_auto_recharge', { monthly_limit_cents: '100000' }), 'deny', 'billing'],
  ['deny manual top-up (credit purchase)', Z + 'call_tool', call('treasury_create_topup', { amount_cents: 500, method: 'card' }), 'deny', 'billing'],
  ['deny top-up confirm (3DS)', Z + 'call_tool', call('treasury_confirm_topup', { topup_id: 't' }), 'deny', 'billing'],
  ['deny top-up cancel', Z + 'call_tool', call('treasury_cancel_topup', { topup_id: 't' }), 'deny', 'billing'],
  ['deny top-up preview (annotated destructive)', Z + 'call_tool', call('treasury_preview_topup', { amount_cents: 500 }), 'deny', 'billing'],
  ['deny payment method add', Z + 'call_tool', call('billing_add_payment_method', { card_token: 'tok' }), 'deny', 'billing'],
  ['deny payment method update', Z + 'call_tool', call('payment_methods_update_payment_method', { payment_method_id: 'pm_1' }), 'deny', 'billing'],
  ['deny payment setup intent', Z + 'call_tool', call('billing_create_setup_intent'), 'deny', 'billing'],
  ['deny subscription upgrade', Z + 'call_tool', call('billing_upgrade_subscription', { plan_id: 'pro' }), 'deny', 'billing'],
  ['deny plan change', Z + 'call_tool', call('plans_change_plan', { plan: 'business' }), 'deny', 'billing'],
  ['deny checkout session', Z + 'call_tool', call('checkout_create_checkout_session'), 'deny', 'billing'],
  ['deny paid feature activation (auto-upgrade key)', Z + 'call_tool', call('accounts_update_account_settings', { auto_upgrade_enabled: true }), 'deny', 'billing'],
  ['deny paid add-on enable', Z + 'call_tool', call('addons_enable_addon', { addon: 'ads' }), 'deny', 'billing'],
  ['deny usage overage purchase', Z + 'call_tool', call('usage_purchase_overage', {}), 'deny', 'billing'],
  ['deny message pack buy', Z + 'call_tool', call('messages_buy_message_pack', {}), 'deny', 'billing'],
  ['deny credits purchase', Z + 'call_tool', call('credits_purchase_credits', { credits: 100 }), 'deny', 'billing'],
  ['deny X spend limit increase', Z + 'call_tool', call('usage_update_x_spend_limit', { x_spend_limit_cents: 10000 }), 'deny', 'billing'],
  ['deny sender ID limit increase', Z + 'call_tool', call('sms_request_sms_sender_id_limit_increase', { requested_cap: 1000, reason: 'x' }), 'deny', 'billing'],
  ['deny ad account spend cap', Z + 'call_tool', call('ad_accounts_update_ad_account', { account_id: 'a', ad_account_id: 'act_1', spend_cap: '1000' }), 'deny', 'billing'],
  ['deny ad billing setup', Z + 'call_tool', call('ad_accounts_set_up_ad_account_billing', { account_id: 'a' }), 'deny', 'billing'],
  ['deny creator payout card charge', Z + 'call_tool', call('creator_campaigns_create_campaign_payout_batch', {}), 'deny', 'billing'],
  ['deny phone number purchase', Z + 'call_tool', call('phone_numbers_purchase_phone_number', { profile_id: 'p' }), 'deny', 'billing'],
  ['deny iMessage sender order', Z + 'call_tool', call('imessage_order_imessage_sender', { profile_id: 'p', kind: 'phone' }), 'deny', 'billing'],
  ['deny unlisted billing read (fail closed)', Z + 'call_tool', call('billing_get_portal_url'), 'deny', 'billing'],
  ['deny unlisted treasury read (fail closed)', Z + 'call_tool', call('treasury_list_payment_methods'), 'deny', 'billing'],
  ['deny billing URL inside arguments', Z + 'call_tool', call('webhooks_get_webhook_settings', { url: 'https://zernio.com/api/v1/balance/top-ups' }), 'deny', 'billing'],
  ['deny money key nested in body', Z + 'call_tool', call('ad_accounts_create_ad_account', { body: { daily_budget: 50 } }), 'deny', 'billing'],
  // Aliases, spellings and gateway tricks
  ['deny camelCase alias', Z + 'call_tool', call('treasuryUpdateAutoRecharge', { enabled: false }), 'deny', 'billing'],
  ['deny upper/kebab alias', Z + 'call_tool', call('TREASURY-UPDATE-AUTO-RECHARGE', { enabled: false }), 'deny', 'billing'],
  ['deny padded name', Z + 'call_tool', call('  treasury_create_topup  ', { amount_cents: 500 }), 'deny', 'billing'],
  ['deny prefixed inner name', Z + 'call_tool', call(`${Z}treasury_create_topup`, { amount_cents: 500 }), 'deny', 'billing'],
  ['deny "top_up" spelling', Z + 'call_tool', call('balance_create_top_up', {}), 'deny', 'billing'],
  ['deny args as JSON string', Z + 'call_tool', { name: 'treasury_update_auto_recharge', arguments: '{"enabled":true}' }, 'deny', 'billing'],
  ['deny args as invalid string', Z + 'call_tool', { name: 'posts_list', arguments: 'enabled=true' }, 'deny'],
  ['deny args as array', Z + 'call_tool', { name: 'posts_list', arguments: [1] }, 'deny'],
  ['deny gateway alt key "tool"', Z + 'call_tool', { tool: 'treasury_create_topup', args: { amount_cents: 500 } }, 'deny', 'billing'],
  ['deny nested gateway', Z + 'call_tool', call('call_tool', { name: 'treasury_create_topup' }), 'deny', 'billing'],
  ['deny billing tool on reinstalled server id', 'mcp__aaaa-bbbb__treasury_create_topup', { amount_cents: 500 }, 'deny', 'billing'],
  ['deny billing via unknown server gateway', 'mcp__some-server__execute_tool', call('treasury_update_auto_recharge', { enabled: false }), 'deny', 'billing'],
  ['deny billing tool on any other server', 'mcp__df486e43-5424-4b59-a9c1-099b469f7679__billing_update_plan', {}, 'deny', 'billing'],
  // Zero-spend: billing reads (allowlist only)
  ['pass read usage_get_usage', Z + 'usage_get_usage', { range: 'cycle', granularity: 'total' }, 'pass'],
  ['pass read usage_get_usage with nulls', Z + 'usage_get_usage', { range: 'cycle', account_id: null, reconcile: null }, 'pass'],
  ['deny usage_get_usage reconcile:true', Z + 'usage_get_usage', { reconcile: true }, 'deny', 'billing'],
  ['pass read usage_get_usage_stats', Z + 'call_tool', call('usage_get_usage_stats'), 'pass'],
  ['pass read usage_get_usage_stats reconcile:false', Z + 'call_tool', call('usage_get_usage_stats', { reconcile: false }), 'pass'],
  ['deny usage_get_usage_stats reconcile:true', Z + 'call_tool', call('usage_get_usage_stats', { reconcile: true }), 'deny', 'billing'],
  ['pass read usage_get_billing', Z + 'call_tool', call('usage_get_billing'), 'pass'],
  ['pass read usage_get_x_api_pricing', Z + 'call_tool', call('usage_get_x_api_pricing'), 'pass'],
  ['pass read treasury_get_balance', Z + 'call_tool', call('treasury_get_balance'), 'pass'],
  ['pass read treasury_get_auto_recharge', Z + 'call_tool', call('treasury_get_auto_recharge'), 'pass'],
  ['pass read treasury_get_topup_invoice', Z + 'call_tool', call('treasury_get_topup_invoice', { topup_id: 't' }), 'pass'],
  ['pass read treasury_get_topup_statement', Z + 'call_tool', call('treasury_get_topup_statement', { topup_id: 't' }), 'pass'],
  ['pass read treasury_get_topup_receipt', Z + 'call_tool', call('treasury_get_topup_receipt', { topup_id: 't', download: true }), 'pass'],
  ['deny read with off-schema money key', Z + 'call_tool', call('treasury_get_balance', { amount_cents: 500 }), 'deny', 'billing'],
  // Shell, terminal and browser paths
  ['deny Bash curl to billing endpoint', 'Bash', { command: 'curl -X PATCH https://zernio.com/api/v1/balance/auto-recharge -d enabled=false' }, 'deny', 'billing'],
  ['deny Bash curl to Zernio API', 'Bash', { command: 'curl -H "Authorization: Bearer $K" https://zernio.com/api/v1/posts' }, 'deny'],
  ['deny PowerShell Invoke-RestMethod top-up', 'PowerShell', { command: 'Invoke-RestMethod -Method Post https://zernio.com/api/v1/balance/top-ups' }, 'deny', 'billing'],
  ['deny terminal run curl billing', 'mcp__terminal__run_in_terminal', { command: 'curl https://checkout.stripe.com/pay/x' }, 'deny', 'billing'],
  ['pass Bash presigned media upload', 'Bash', { command: 'curl -X PUT -H "Content-Type: image/png" --upload-file a.png "https://storage.example.com/u/abc?sig=1"' }, 'pass'],
  ['pass Bash grep for billing words', 'Bash', { command: 'grep -n "top-up" ops/guardrails.md' }, 'pass'],
  ['pass Bash running tests', 'Bash', { command: 'node .claude/hooks/guard.test.mjs' }, 'pass'],
  ['deny browser navigate Zernio billing', B + 'navigate', { url: 'https://zernio.com/dashboard/billing' }, 'deny', 'billing'],
  ['deny browser navigate Canva pricing', B + 'navigate', { url: 'https://www.canva.com/pricing/' }, 'deny', 'billing'],
  ['deny Chrome open Stripe checkout', 'mcp__claude-in-chrome__navigate', { url: 'https://checkout.stripe.com/c/pay/cs_1' }, 'deny', 'billing'],
  ['deny browser batch with billing navigate', B + 'browser_batch', { actions: [{ name: 'navigate', input: { url: 'https://zernio.com/settings/billing' } }] }, 'deny', 'billing'],
  ['deny page script fetching top-ups', B + 'javascript_tool', { action: 'javascript_exec', text: "fetch('/v1/balance/top-ups',{method:'POST'})" }, 'deny', 'billing'],
  ['pass browser navigate Zernio posts', B + 'navigate', { url: 'https://zernio.com/dashboard/posts' }, 'pass'],
  ['pass browser click (NOT classifiable)', B + 'computer', { action: 'left_click', coordinate: [10, 10] }, 'pass'],
  // ── Approval gates: explicit content IDs ──────────────────────────────────────
  ['ask  draft with explicit G2+G3 (IG-900)', Z + 'call_tool', call('posts_create_post', tagged('IG-900', { is_draft: true })), 'ask'],
  ['ask  no-schedule post = draft (IG-900)', Z + 'call_tool', call('posts_create_post', tagged('IG-900')), 'ask'],
  ['ask  pending-approval schedule at G4 time', Z + 'call_tool', call('posts_create_post', sched('IG-900')), 'ask'],
  ['deny schedule at a time other than G4', Z + 'call_tool', call('posts_create_post', sched('IG-900', OTHER_FUTURE)), 'deny'],
  ['deny draft without content ID', Z + 'call_tool', call('posts_create_post', { content: 'x', is_draft: true }), 'deny'],
  ['deny schedule without content ID', Z + 'call_tool', call('posts_create_post', { content: 'x', platforms: IG, scheduled_for: FUTURE, timezone: tz, requires_approval: true }), 'deny'],
  ['deny two content IDs in one post', Z + 'call_tool', call('posts_create_post', { ...sched('IG-900'), tags: ['IG-900', 'IG-901'] }), 'deny'],
  ['deny vague "approve all" draft (IG-901)', Z + 'call_tool', call('posts_create_post', tagged('IG-901', { is_draft: true })), 'deny'],
  ['deny vague "approve all" schedule (IG-901)', Z + 'call_tool', call('posts_create_post', sched('IG-901')), 'deny'],
  ['deny file changed after approval (IG-902)', Z + 'call_tool', call('posts_create_post', sched('IG-902')), 'deny'],
  ['deny revoked approval (IG-903)', Z + 'call_tool', call('posts_create_post', sched('IG-903')), 'deny'],
  ['deny unknown content ID', Z + 'call_tool', call('posts_create_post', sched('IG-999')), 'deny'],
  ['ask  story draft with two-digit ID (IG-S90)', Z + 'call_tool', call('posts_create_post', tagged('IG-S90', { is_draft: true })), 'ask'],
  ['deny story schedule without G4 (IG-S90)', Z + 'call_tool', call('posts_create_post', sched('IG-S90')), 'deny'],
  ['ask  review approve recorded post', Z + 'call_tool', call('posts_review_post', { post_id: 'zp900', decision: 'approve' }), 'ask'],
  ['deny review approve unrecorded post', Z + 'call_tool', call('posts_review_post', { post_id: 'p', decision: 'approve' }), 'deny'],
  ['deny review approve vague post (IG-901)', Z + 'call_tool', call('posts_review_post', { post_id: 'zp901', decision: 'approve' }), 'deny'],
  ['ask  review reject', Z + 'call_tool', call('posts_review_post', { post_id: 'p', decision: 'reject' }), 'ask'],
  ['deny review without decision', Z + 'call_tool', call('posts_review_post', { post_id: 'zp900' }), 'deny'],
  ['ask  retry recorded post', Z + 'posts_retry', { post_id: 'zp900' }, 'ask'],
  ['deny retry unrecorded post', Z + 'posts_retry', { post_id: 'p' }, 'deny'],
  ['ask  update_post promote with review (IG-900)', Z + 'call_tool', call('posts_update_post', { post_id: 'zp900', is_draft: false, scheduled_for: FUTURE, timezone: tz, requires_approval: true }), 'ask'],
  ['deny update_post submit for approval without time', Z + 'call_tool', call('posts_update_post', { post_id: 'zp900', requires_approval: true }), 'deny'],
  ['deny tag/post_id mismatch', Z + 'call_tool', call('posts_update_post', { post_id: 'zp900', tags: ['IG-901'], content: 'x' }), 'deny'],
  ['ask  posts_update to G4 time', Z + 'posts_update', { post_id: 'zp900', scheduled_for: `${FUTURE}+03:30` }, 'ask'],
  ['deny posts_update to another time', Z + 'posts_update', { post_id: 'zp900', scheduled_for: `${OTHER_FUTURE}+03:30` }, 'deny'],
  ['ask  posts_update content (IG-900)', Z + 'posts_update', { post_id: 'zp900', content: 'new' }, 'ask'],
  ['deny posts_update content unrecorded post', Z + 'posts_update', { post_id: 'p', content: 'new' }, 'deny'],
  ['ask  posts_edit_post recorded post', Z + 'posts_edit_post', { post_id: 'zp900', content: 'x' }, 'ask'],
  ['deny posts_edit_post unrecorded post', Z + 'posts_edit_post', { post_id: 'p', content: 'x' }, 'deny'],
  // ── Zernio publishing rules (unchanged behaviour) ─────────────────────────────
  ['deny posts_publish_now', Z + 'posts_publish_now', { content: 'x' }, 'deny'],
  ['deny posts_create default', Z + 'posts_create', { content: 'x', platform: 'instagram' }, 'deny'],
  ['deny posts_create draft (no content ID possible)', Z + 'posts_create', { content: 'x', platform: 'instagram', is_draft: true }, 'deny'],
  ['deny posts_create publish_now', Z + 'posts_create', { content: 'x', platform: 'instagram', publish_now: true }, 'deny'],
  ['deny create_post without requires_approval', Z + 'call_tool', call('posts_create_post', { ...tagged('IG-900'), scheduled_for: FUTURE, timezone: tz }), 'deny'],
  ['deny create_post time in the past', Z + 'call_tool', call('posts_create_post', sched('IG-900', PAST)), 'deny'],
  ['deny create_post time 5 minutes away', Z + 'call_tool', call('posts_create_post', sched('IG-900', SOON)), 'deny'],
  ['deny create_post per-platform past time', Z + 'call_tool', call('posts_create_post', { content: 'x', tags: ['IG-900'], requires_approval: true, platforms: [{ platform: 'instagram', accountId: ACC, scheduledFor: PAST, timezone: tz }] }), 'deny'],
  ['deny create_post unreadable time', Z + 'call_tool', call('posts_create_post', sched('IG-900', 'next friday')), 'deny'],
  ['deny create_post publish_now', Z + 'call_tool', call('posts_create_post', tagged('IG-900', { publish_now: true })), 'deny'],
  ['deny create_post queue', Z + 'call_tool', call('posts_create_post', tagged('IG-900', { queued_from_profile: 'p' })), 'deny'],
  ['deny create_post recycling', Z + 'call_tool', call('posts_create_post', tagged('IG-900', { is_draft: true, recycling: { enabled: true, gap: 1 } })), 'deny'],
  ['deny create_post to facebook', Z + 'call_tool', call('posts_create_post', { content: 'x', tags: ['IG-900'], platforms: [{ platform: 'facebook' }], is_draft: true }), 'deny'],
  ['deny create_post platforms not an array', Z + 'call_tool', call('posts_create_post', { content: 'x', tags: ['IG-900'], platforms: { platform: 'instagram' } }), 'deny'],
  ['deny update_post promote without time', Z + 'call_tool', call('posts_update_post', { post_id: 'zp900', is_draft: false }), 'deny'],
  ['deny posts_update to a past time', Z + 'posts_update', { post_id: 'zp900', scheduled_for: `${PAST}+03:30` }, 'deny'],
  ['deny posts_retry_all_failed', Z + 'posts_retry_all_failed', {}, 'deny'],
  ['deny posts_cross_post', Z + 'posts_cross_post', {}, 'deny'],
  ['deny posts_bulk_upload_posts', Z + 'posts_bulk_upload_posts', {}, 'deny'],
  ['ask  posts_delete', Z + 'posts_delete', { post_id: 'p' }, 'ask'],
  // ── Zernio reads ──────────────────────────────────────────────────────────────
  ['pass accounts_list', Z + 'accounts_list', {}, 'pass'],
  ['pass analytics_get_analytics', Z + 'analytics_get_analytics', { platform: 'instagram', limit: 10, order: 'desc' }, 'pass'],
  ['pass validate_post', Z + 'validate_post', { platforms: IG }, 'pass'],
  ['pass posts_list', Z + 'posts_list', { limit: 20 }, 'pass'],
  ['pass comments list with limit', Z + 'comments_list_inbox_comments', { account_id: ACC, limit: 20 }, 'pass'],
  ['pass workflows_list_workflows', Z + 'call_tool', call('workflows_list_workflows'), 'pass'],
  ['pass webhooks_get_webhook_settings', Z + 'call_tool', call('webhooks_get_webhook_settings'), 'pass'],
  ['pass messages_list_inbox_conversations', Z + 'call_tool', call('messages_list_inbox_conversations', { limit: 20 }), 'pass'],
  ['pass media_get_media_presigned_url', Z + 'call_tool', call('media_get_media_presigned_url', { filename: 'a.png', content_type: 'image/png' }), 'pass'],
  ['pass media_generate_upload_link', Z + 'media_generate_upload_link', {}, 'pass'],
  ['pass search_tools', Z + 'search_tools', { query: 'billing' }, 'pass'],
  ['pass docs_search', Z + 'docs_search', { query: 'pricing' }, 'pass'],
  // ── Messaging ─────────────────────────────────────────────────────────────────
  ['ask  comments_reply_to_inbox_post', Z + 'comments_reply_to_inbox_post', { post_id: 'p', account_id: ACC, message: 'hi' }, 'ask'],
  ['ask  mentions_reply_to_mention', Z + 'mentions_reply_to_mention', {}, 'ask'],
  ['ask  private reply to comment', Z + 'call_tool', call('comments_send_private_reply_to_comment', { message: 'hi' }), 'ask'],
  ['ask  send DM reply', Z + 'call_tool', call('messages_send_inbox_message', { conversation_id: 'c', account_id: ACC, message: 'hi' }), 'ask'],
  ['deny send DM with HUMAN_AGENT tag', Z + 'call_tool', call('messages_send_inbox_message', { conversation_id: 'c', message: 'hi', message_tag: 'HUMAN_AGENT' }), 'deny'],
  ['deny cold outreach (new conversation)', Z + 'call_tool', call('messages_create_inbox_conversation', { account_id: ACC, message: 'hi' }), 'deny'],
  // ── Paid / automation ─────────────────────────────────────────────────────────
  ['deny support_ask', Z + 'support_ask', { question: 'x' }, 'deny', 'billing'],
  ['deny support answer via call_tool', Z + 'call_tool', call('support_assistant_get_support_answer'), 'deny', 'billing'],
  ['deny comment-to-DM automation', Z + 'call_tool', call('comment_automations_create_comment_automation'), 'deny'],
  ['deny broadcast send', Z + 'call_tool', call('broadcasts_send_broadcast'), 'deny'],
  ['ask  broadcast cancel', Z + 'call_tool', call('broadcasts_cancel_broadcast'), 'ask'],
  ['deny webhook test', Z + 'call_tool', call('webhooks_test_webhook'), 'deny'],
  ['deny sms send', Z + 'call_tool', call('sms_send_sms'), 'deny'],
  ['deny lead form (ads)', Z + 'call_tool', call('lead_gen_create_lead_form'), 'deny'],
  ['deny business agent settings', Z + 'call_tool', call('business_agent_update_business_agent_settings', { account_id: 'a' }), 'deny'],
  // ── Fail closed ───────────────────────────────────────────────────────────────
  ['deny unknown operation', Z + 'call_tool', call('frobnicate_things'), 'deny'],
  ['deny call_tool without name', Z + 'call_tool', {}, 'deny'],
  ['deny malformed stdin', Z + 'posts_list', null, 'deny', null, '{not json'],
  ['deny tool_input not an object', Z + 'posts_list', null, 'deny', null, JSON.stringify({ tool_name: Z + 'posts_list', tool_input: 'x' })],
  ['deny fingerprint posts_publish_now (new id)', 'mcp__aaaa-bbbb__posts_publish_now', {}, 'deny'],
  ['deny fingerprint call_tool (new id)', 'mcp__aaaa-bbbb__call_tool', call('posts_publish_now'), 'deny'],
  // ── Canva ─────────────────────────────────────────────────────────────────────
  ['pass canva read-design', C + 'read-design', { design_id: 'DAHaZQXIBYA' }, 'pass'],
  ['pass canva copy-design', C + 'copy-design', { design_id: 'DAHaZQXIBYA' }, 'pass'],
  ['pass canva move-item-to-folder', C + 'move-item-to-folder', { item_id: 'D', to_folder_id: 'F' }, 'pass'],
  ['pass canva edit-design keep_open', C + 'edit-design', { transaction_id: 't', finalize: 'keep_open' }, 'pass'],
  ['ask  canva edit-design commit', C + 'edit-design', { transaction_id: 't', finalize: 'commit' }, 'ask'],
  ['pass canva export png regular', C + 'export-design', { design_id: 'DAHaZQXIBYA', format: { type: 'png' } }, 'pass'],
  ['deny canva export pro quality', C + 'export-design', { design_id: 'DAHaZQXIBYA', format: { type: 'png', export_quality: 'pro' } }, 'deny'],
  ['deny canva resize (Magic Resize)', C + 'resize-design', {}, 'deny'],
  ['deny canva remove-background', C + 'remove-background', {}, 'deny'],
  ['deny canva generate-image', C + 'generate-image', {}, 'deny'],
  ['deny canva brand template', C + 'create-brand-template-draft', {}, 'deny'],
  ['ask  canva AI create-design', C + 'create-design', { brief: 'x' }, 'ask'],
  ['ask  canva comment', C + 'comment-on-design', {}, 'ask'],
  ['pass canva help (pricing question)', C + 'help', { prompt: 'Is Magic Resize Pro only?' }, 'pass'],
  // ── Other connectors ──────────────────────────────────────────────────────────
  ['deny composio', 'mcp__023fd27d-b909-4d50-9ccc-d8ad00dd3a07__COMPOSIO_SEARCH_TOOLS', {}, 'deny'],
  ['ask  cloudflare create', 'mcp__df486e43-5424-4b59-a9c1-099b469f7679__d1_database_create', {}, 'ask'],
  ['ask  cloudflare d1 query', 'mcp__df486e43-5424-4b59-a9c1-099b469f7679__d1_database_query', {}, 'ask'],
  ['pass cloudflare list', 'mcp__df486e43-5424-4b59-a9c1-099b469f7679__workers_list', {}, 'pass'],
  ['ask  mobbin', 'mcp__e648a2f6-5bbf-4b55-97e1-f2f4cf6a09fa__search_screens', {}, 'ask'],
  ['ask  scheduled task create', 'mcp__scheduled-tasks__create_scheduled_task', {}, 'ask'],
  ['pass scheduled task list', 'mcp__scheduled-tasks__list_scheduled_tasks', {}, 'pass'],
  ['pass claude docs', 'mcp__1a59c906-04da-521d-bda7-7f71b9f9e01c__create', {}, 'pass'],
  ['pass non-MCP tool', 'Write', { file_path: 'x' }, 'pass'],
];

// ── Run every case through the hook ─────────────────────────────────────────────
let failed = 0;
const results = [];
for (const [label, tool, input, expected, tag, raw] of cases) {
  const got = run(tool, input ?? {}, raw);
  results.push({ label, tool, input, expected, got, tag });
  const ok = got === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(52)} expected=${expected.padEnd(4)} got=${got}`);
}

// ── "Blocked calls never reach the tool": simulate Claude Code's PreToolUse contract ──
// A mock MCP tool counts invocations. The harness calls it only when the hook did not deny,
// and treats every "ask" as if the user clicked Allow (the worst case for billing).
let reached = 0;
let billingReached = 0;
for (const r of results) {
  const invoked = r.got !== 'deny';
  if (invoked) reached += 1;
  if (invoked && r.tag === 'billing') billingReached += 1;
}
const billingCases = results.filter((r) => r.tag === 'billing').length;
if (billingReached) { failed += 1; console.log(`FAIL  ${billingReached} billing mutation(s) reached the mock tool`); }
console.log(`\nmock tool: ${reached} of ${results.length} calls reached it; billing mutations reached: ${billingReached} of ${billingCases}`);

// ── settings.json matcher and fail-closed config ─────────────────────────────────
const settings = JSON.parse(readFileSync(join(here, '..', 'settings.json'), 'utf8'));
const entry = settings.hooks.PreToolUse.find((h) => String(h.hooks?.[0]?.command || '').includes('guard.mjs'));
const matcher = new RegExp(entry.matcher);
const mustMatch = [Z + 'call_tool', C + 'export-design', 'mcp__scheduled-tasks__create_scheduled_task',
  'mcp__023fd27d-b909-4d50-9ccc-d8ad00dd3a07__COMPOSIO_SEARCH_TOOLS', 'Bash', 'PowerShell',
  'mcp__terminal__run_in_terminal', B + 'navigate', B + 'javascript_tool', 'mcp__claude-in-chrome__navigate',
  'mcp__aaaa-bbbb__treasury_create_topup'];
const mustSkip = ['mcp__ccd_turn__update_plan', 'mcp__visualize__show_widget', 'mcp__mcp-registry__list_connectors', 'Write', 'Read', 'Edit'];
for (const name of mustMatch) if (!matcher.test(name)) { failed += 1; console.log(`FAIL  matcher should cover ${name}`); }
for (const name of mustSkip) if (matcher.test(name)) { failed += 1; console.log(`FAIL  matcher should skip ${name}`); }
if (entry.hooks[0].onFailure !== 'block') { failed += 1; console.log('FAIL  guard hook must use onFailure:"block"'); }

rmSync(fx, { recursive: true, force: true });
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${cases.length} decisions, the no-reach check and the matcher checks pass.`);
process.exit(failed ? 1 : 0);
