# Zero-spend security patch · Instagram Studio guard

- **Date:** ۱۸ آبان ۱۴۰۵ · 2026-11-09 (Tehran)
- **Requested by:** Hamidreza, in chat ("Implement a strict ZERO-SPEND security policy in the Instagram Studio guard")
- **Changed:** `.claude/hooks/guard.mjs` (rewritten), `.claude/hooks/guard.test.mjs` (rewritten), `.claude/settings.json` (hook matcher only), `CLAUDE.md` (§2.3, §4, §5, §6), `ops/guardrails.md`, `.claude/skills/approval-workflow/SKILL.md`, `ops/approval-log.md` (policy note appended, no rows changed), `calendar/1405-azar_cycle-01/week-01.md` (approval marks)
- **During testing:** nothing was published or sent, no billing setting was changed, no paid service was used, and no billing mutation tool was invoked. Zernio balance before and after: $0.00.
- **Verdicts:** PASS = verified by test or live call · FAIL = verified not working · NOT VERIFIED = could not be verified

## Summary

| # | Requirement | Verdict |
|---|---|---|
| 1 | Block all Zernio billing mutations, no confirmation override | **PASS** |
| 2 | Allow billing reads only (balance, usage, billing status, invoices) | **PASS** |
| 3 | Fail closed: exact names and schemas, effects, unknown/ambiguous blocked | **PASS** (limits below) |
| 4 | Regression tests for every billing category; blocked calls never reach the tool | **PASS** (live part: PASS for 3 paths) |
| 5 | Inspect all execution paths and aliases; no false browser claims | **PASS** (inspection); browser protection is **partial** (URLs only) |
| 6 | Explicit draft IDs and approval gates; "approve all" never counts | **PASS** |
| 7 | Update CLAUDE.md and security docs | **PASS** |
| 8 | Run existing and new tests | **PASS** (177/177, 0 failures) |

## 1. Billing mutations blocked

How exact names were resolved: Zernio `search_tools` was queried for treasury/balance/top-up, billing/subscription/plan/checkout, payment methods, spend caps/limits/credits/overage, and invoices/receipts/pricing (read-only searches). Real tools found and now denied, with their annotations:

| Tool | Annotation | Effect | Guard |
|---|---|---|---|
| `treasury_update_auto_recharge` | destructive | Auto top-up on/off, thresholds, monthly limit | **deny** (was *ask*) |
| `treasury_create_topup` | destructive | Charges the saved card | **deny** |
| `treasury_confirm_topup` | destructive | Credits a 3DS top-up | **deny** (was *ask*) |
| `treasury_cancel_topup` | destructive | Ends a pending top-up | **deny** (was *ask*) |
| `treasury_preview_topup` | destructive (though "charges nothing") | Tax preview | **deny** (classified by annotation, not by its description) |
| `creator_campaigns_create_campaign_payout_batch` | destructive | Card charge | **deny** |
| `phone_numbers_purchase_phone_number`, `whatsapp_phone_numbers_purchase_whats_app_phone_number`, `imessage_order_imessage_sender` | destructive | Monthly billing | **deny** |
| `ad_accounts_update_ad_account` (spend cap), `ad_accounts_set_up_ad_account_billing`, `sms_request_sms_sender_id_limit_increase` | destructive | Spend / limit increases | **deny** |

No Zernio tool for adding a payment method, changing plan or buying credits was found in `search_tools`. Those categories are still covered by name tokens and argument keys, and tested with hypothetical names (they would appear if Zernio adds them).

**No override:** these are hook `deny` decisions. Claude Code blocks the call before it reaches the MCP server, whatever the permission prompt or chat says. In the test harness, "ask" is treated as "user clicked Allow" (the worst case), and still 0 billing mutations reached the mock tool.

## 2. Billing reads allowed (exact allowlist)

`usage_get_usage`, `usage_get_usage_stats`, `usage_get_billing`, `usage_get_x_api_pricing`, `treasury_get_balance`, `treasury_get_auto_recharge`, `treasury_get_topup_invoice`, `treasury_get_topup_statement`, `treasury_get_topup_receipt`. All are `readOnlyHint: true`, and each is allowed only with its schema's argument keys. `reconcile: true` (forces a subscription pass) and any money key are denied. Null and false values are ignored. **Live:** `treasury_get_balance` with no arguments returned the balance ($0.00); the same tool with `amount_cents` was denied.

## 3. Fail closed

| Check | Verdict |
|---|---|
| Names normalised (camelCase, case, kebab, padding, `mcp__…__` prefix, "top_up" spellings) before every rule | PASS (tests) |
| Classified by tokens **and** argument keys (any depth) **and** billing URLs in arguments, on every server, not just Zernio | PASS (tests) |
| Unknown billing reads not in the allowlist → deny | PASS (tests) |
| Unknown Zernio operations (no verb) → deny (was *ask*) | PASS (tests) |
| Gateway without a resolvable name, arguments as non-object or invalid JSON string, nested gateway → deny | PASS (tests) |
| Malformed hook input, non-object `tool_input`, guard internal error → deny (were *ask*) | PASS (tests; internal-error path by code review) |
| Hook process can't start → blocked (`onFailure: "block"`) | NOT VERIFIED live (would need breaking Node); config checked by the test suite |
| Text classification is heuristic: a deliberately obfuscated shell command could slip past, and harmless text that mentions a billing URL is denied (seen live: an `echo` was blocked) | Known limit |

## 4. Tests

`node .claude/hooks/guard.test.mjs` → **177 decisions, 0 failures**, plus the no-reach check and the matcher checks. Each case runs the real hook as a child process. The approval cases use a throwaway fixture project (its own approval log and content files), so they never touch the real project.

| Group | Cases |
|---|---|
| Billing mutations: auto top-up ON, OFF, threshold, monthly limit; top-up create, confirm, cancel, preview; payment method add, update, setup intent; subscription upgrade, plan change, checkout; paid feature activation (key and add-on); overage, message pack, credits purchase; X spend limit, sender limit, ad spend cap, ad billing; payouts, number and sender purchases; unlisted billing reads; billing URL in args; nested money key | 30 |
| Aliases and gateway tricks (camelCase, kebab, padding, prefix, top_up, JSON-string args, invalid string, array args, alt key, nested gateway, new server ID, other server gateway, other server direct) | 13 |
| Billing reads (9 allowlisted, nulls, reconcile true/false, off-schema key) | 14 |
| Shell, terminal, browser paths | 14 |
| Approval gates (explicit IDs, vague, changed hash, revoked, wrong time, missing or multiple IDs, review/retry/update/edit, story IDs) | 32 |
| Existing publishing, messaging, paid, Canva and other-connector rules (kept) | 74 |

Of the 77 existing cases, 9 were changed on purpose. Unknown op, call_tool without a name and malformed input now **deny** instead of ask. The simple `posts_create` draft is now **deny**, because it can't carry a content ID. The 5 ask cases for drafts, schedules, review, retry and update now need a content ID with recorded approvals.

**"Blocked calls never reach the tool":**
- **Simulation: PASS.** A mock tool counted invocations, with the harness calling it only when the hook didn't deny. 62 of 177 calls reached it; billing mutations reached: **0 of 54**.
- **Live in this session: PASS.** Three probes were each denied before execution and logged in `ops/guard-log.jsonl`. They were chosen to be harmless even if they had leaked:
  - Zernio `call_tool` → `treasury_get_balance` with an off-schema `amount_cents` (a read)
  - Bash `echo` of a curl-to-top-ups string
  - Browser navigate to `zernio.com/dashboard/billing`

No real billing mutation was attempted live, deliberately.

## 5. Execution paths and aliases

| Path | Verdict | Notes |
|---|---|---|
| Zernio direct tools | PASS | |
| Zernio `call_tool` (the only gateway; `search_tools` found no raw-HTTP proxy tool) | PASS | |
| Zernio under a new connector ID | PASS | |
| Any other MCP server (billing check runs on all) | PASS | |
| Composio | PASS | Denied whole |
| Bash / PowerShell / desktop terminal | PASS (partial) | Network commands to billing endpoints or the Zernio `/v1/` API are denied. The settings matcher now covers them, verified live. No Zernio API key is on disk (secret scan, initial audit) |
| Built-in browser and Claude in Chrome: URLs and page scripts | PASS | Billing, pricing, upgrade and checkout pages denied (live for navigate) |
| **Browser clicks, typing and form input on an open page** | **NOT VERIFIED / not protected** | The hook sees coordinates, not the page. A click on "Upgrade" in an already open dashboard cannot be classified. CLAUDE.md now says so and forbids using a browser for billing, publishing or sending |
| Subagents, forks, scheduled sessions in this folder | NOT VERIFIED | Same project settings by design; not tested live |
| Manual actions by Hamidreza | n/a | Out of scope for code |

## 6. Explicit approvals

- Every Zernio post write (draft, schedule, update, edit, review-approve, retry) must carry exactly **one** content ID, as `tags: ["IG-0xx"]` or via a `post_id` recorded as `zernio_post_id` in a content file. The guard then reads `ops/approval-log.md`.
- **Gates needed:** a draft or edit needs G2 + G3. Scheduling, approving in Zernio, retrying or moving needs G2 + G3 + G4.
- A row counts only if Hamidreza's verbatim words name **that ID and the gate**. The body hash must be unchanged, the requested time must equal the G4 time in the file, and a later Revoke/لغو row cancels earlier approvals.
- «Approve all», «همه را زمان‌بندی کن» and similar never count (tested).
- **Effect on current work:** log rows #1–3 («Approve all three») don't name the IDs, so **IG-002, IG-003 and IG-S02 no longer have a valid G1/G2.** I did not change the rows (append-only). I appended a policy note under the table and updated the week-01 calendar marks. To restore them, Hamidreza replies with something like «G2 تأیید IG-002 و IG-003 و IG-S02».
- The comment and DM flow is unchanged: each send still asks and must match an approved reply number. The guard can't read the triage file to compare texts (NOT VERIFIED by code; procedural).

## 7. Documentation

| File | Change |
|---|---|
| `CLAUDE.md` | §2.3 billing read-only, no override; §4 coverage, allowlist, what is not protected, 177 tests; §5 explicit approval wording; §6 `tags`, simple `posts_create` denied, `zernio_post_id` |
| `ops/guardrails.md` | Zero-spend policy table, execution-path table, Zernio matrix, auto top-up account row, live activation note |
| `.claude/skills/approval-workflow/SKILL.md` | Vague approvals, no "approve all" buttons, guard enforcement, `tags` in payload, drafts via `posts_create_post` |
| `ops/approval-log.md` | Policy note on rows #1–3 |
| `calendar/1405-azar_cycle-01/week-01.md` | G1/G2 marks set back to "to re-confirm" |

## Still open (Hamidreza)

1. **Zernio auto top-up is still ON with no monthly limit.** The guard now blocks Claude from changing it in either direction, so Hamidreza must turn it off, or set a limit, in Zernio → Billing if a card is ever saved.
2. Re-confirm G1 + G2 for IG-002, IG-003 and IG-S02 with explicit IDs.
3. Browser clicks remain unprotected by code. Keep billing and publishing actions in the browser to yourself.
4. The folder is still not a git repository (initial audit, Failure 2), so changes to the guard or the approval log have no history.
