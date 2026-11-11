# Guardrails: cost and safety policy

The human-readable version of what `.claude/hooks/guard.mjs` and `.claude/settings.json` enforce, plus the account settings that must stay off. Any change to this policy needs Hamidreza's explicit request.

## Layers

1. **Rules for Claude:** `CLAUDE.md` §2.
2. **Guard hook:** `.claude/hooks/guard.mjs`, a PreToolUse hook on every connector tool, Bash, PowerShell, the desktop terminal and the two browsers (only the desktop app's own `ccd_*`, `visualize` and `mcp-registry` tools are excluded). It fails closed (`onFailure: "block"`, and unreadable input, unknown operations and internal errors are denied), logs every deny/ask to `ops/guard-log.jsonl`, and has a self-test: `node .claude/hooks/guard.test.mjs` (177 cases, a "blocked calls never reach the tool" check and matcher checks).
3. **Permission rules:** deny/ask lists in `.claude/settings.json` for the current connector IDs, a second layer if the hook is ever turned off.
4. **Zernio's own review gate:** posts are created with `requires_approval: true` and wait as *pending approval* until Hamidreza approves them in Zernio.
5. **Account settings:** manual, listed below.

**Activation:** verified live on 2026-11-09: edits to the hook script and matcher took effect in the running session (denials logged for `call_tool`, `Bash` and `Claude_Browser__navigate`).

## Zero-spend policy (billing)

Checked first, on every path, and always a **deny**: a hook deny blocks the call before it reaches the tool, and no permission prompt, "Allow" click or chat confirmation overrides it.

| Decision | What | How it is recognised |
|---|---|---|
| **Pass** | Exactly these billing reads, with only their schema's argument keys: `usage_get_usage` (range, granularity, from, to, group_by, profile_id, account_id), `usage_get_usage_stats`, `usage_get_billing`, `usage_get_x_api_pricing`, `treasury_get_balance`, `treasury_get_auto_recharge`, `treasury_get_topup_invoice`, `treasury_get_topup_statement`, `treasury_get_topup_receipt` | Exact normalised name from Zernio `search_tools` (all `readOnlyHint: true`) |
| **Deny** | An allowlisted read with any other argument (e.g. `reconcile: true`, which forces a subscription pass) | Argument keys vs. schema |
| **Deny** | Auto top-up changes (**on and off**, thresholds, monthly limit), manual top-ups, top-up confirm / cancel / preview (`treasury_preview_topup` is annotated destructive), payment methods and setup intents, subscriptions, plan changes and upgrades, checkout, paid add-ons, overage, credit or message-pack purchases, spend-limit and cap increases, ad billing and budgets, creator payouts, number / sender purchases | Name tokens in the billing area (treasury, billing, balance, topup, recharge, payment, card, invoice, subscription, plan, upgrade, checkout, purchase, buy, order, credit, spend, cap, limit, overage, price, quota, usage…) |
| **Deny** | Any tool, on any server, whose arguments carry money or billing keys (amount_cents, payment_method_id, monthly_limit_cents, spend_cap, plan_id, auto_upgrade_enabled, budget…) at any depth | Argument keys |
| **Deny** | URL or path arguments pointing at billing endpoints or pages (`/v1/balance`, `/v1/billing`, top-ups, auto-recharge, payment methods, Stripe checkout, Zernio/Canva billing, pricing and upgrade pages) | URL patterns |
| **Deny** | Unknown billing reads not in the allowlist (fail closed; add one only after checking its schema and annotations) | Not in allowlist |

**Name tricks covered:** camelCase, upper case, kebab case, padding, `mcp__…__` prefixes, "top_up"/"top-ups" spellings, gateway alternate keys (`name`, `tool`, `tool_name`), arguments passed as a JSON string, nested gateways (denied), and any server's gateway tool (`call_tool`, `execute_tool`…).

## Execution paths

| Path | Covered | Notes |
|---|---|---|
| Zernio direct tools | ✅ | Full rules |
| Zernio `call_tool` gateway | ✅ | Unwrapped; judged by inner tool + arguments; missing name, non-object or unparsable arguments, nested gateway → deny |
| Zernio under a new connector ID | ✅ | Fingerprints; billing check runs on every server anyway |
| Canva, Cloudflare, Mobbin, scheduled tasks, other MCP servers | ✅ | Their own rules plus the billing check |
| Composio | ✅ | Whole server denied |
| Bash, PowerShell, desktop terminal | ✅ partial | Network commands (curl, wget, Invoke-RestMethod, fetch…) to billing endpoints, or to the Zernio `/v1/` API, are denied. The check is text-based: it can be evaded by deliberately obfuscated commands, and it may deny harmless text that only *mentions* such a URL. No Zernio API key exists on disk (checked 2026-11-09), so a shell has no credentials to call the API with |
| Built-in browser and Claude in Chrome | ⚠️ partial | **URLs only:** navigating, opening tabs or batch steps to billing / pricing / upgrade / checkout pages is denied, and page scripts calling billing endpoints are denied. **Clicks, typing and form input on an already open page are NOT classifiable** and are not protected by code. CLAUDE.md forbids using a browser for billing, publishing or sending |
| Subagents, forks, scheduled sessions in this folder | ✅ (by design) | They load the same project settings; scheduled-task creation asks |
| Hamidreza acting manually in a dashboard or app | ❌ | Out of scope for code; covered by the account settings below |

## Decision matrix

### Zernio

| Decision | Tools or patterns | Why |
|---|---|---|
| **Deny** | Every billing mutation (see Zero-spend policy above) | Final; no confirmation overrides it |
| **Deny** | Post writes (`posts_create_post`, `posts_update*`, `posts_edit_post`, `posts_review_post` approve, `posts_retry`) without exactly one content ID (`tags: ["IG-0xx"]`, or a `post_id` recorded as `zernio_post_id` in a content file); without explicit log rows for the gates needed (draft or edit: G2 + G3; schedule, approve in Zernio, retry, move: G2 + G3 + G4); when the body hash changed since approval; when the requested time isn't the G4 time; after a Revoke row | Vague approvals («approve all») never authorise a post |
| **Deny** | Unknown Zernio operations (no recognisable verb), gateway calls without a resolvable tool, unreadable arguments | Fail closed |
| **Deny** | `posts_publish_now`; `publish_now: true` anywhere; the simple `posts_create` in every form (it can't carry a content ID; its default schedules the post 60 minutes out); `scheduled_for` in the past or under 30 minutes away; scheduling without `requires_approval: true`; queue publishing; `recycling`; `posts_cross_post`; `posts_bulk_upload_posts`; `posts_retry_all_failed`; any platform other than Instagram | Nothing publishes without the full approval chain |
| **Deny** | `support_ask` and every Support Assistant tool | Billed per question (from $0.33) |
| **Deny** | Write actions on ads, campaigns, boosts, broadcasts, sequences, workflows, automations (including comment-to-DM), phone numbers, WhatsApp, SMS, RCS, iMessage, calls, verification, billing, balance or top-up, purchases, API keys, webhooks, account connections, teams, commerce, lead forms, other platforms | Paid, metered or automated messaging |
| **Deny** | `messages_create_inbox_conversation` (cold outreach); `messages_send_inbox_message` with a `message_tag`, `channel` or `category` | Only approved replies to people who wrote first; no paid channels |
| **Deny** | `profiles_create`, `profiles_delete`, `accounts_move_account_to_profile` | Out of scope |
| **Ask** | Post writes that passed the approval check above, `posts_delete`, `posts_unpublish_post`, `posts_review_post` reject, queue-slot writes, comment and mention replies, private replies, DMs, `profiles_update`, pausing or cancelling an automation, other recognised writes | An external change: a human must say yes |
| **Pass** | List, get, search and validate reads; analytics; the allowlisted billing reads; media upload URLs | Read-only and free |

### Canva

| Decision | Tools | Why |
|---|---|---|
| **Deny** | `resize-design`, `remove-background`, brand templates (create, publish, use), `generate-image`, `create-video`, `separate-image-layers`, Pro-quality export | Pro features or AI imagery |
| **Ask** | `create-design`, `generate-design`, `generate-design-structured`, `create-design-from-candidate` (Canva AI); `edit-design` commit; comments and replies; design imports | Generates or permanently saves content |
| **Pass** | Search, read and copy designs; `edit-design` drafts; regular exports; folders; uploads | Free and reversible |

### Other connectors

| Connector | Decision | Why |
|---|---|---|
| Composio | Deny everything | Outside the approved free stack |
| Cloudflare | Ask for any write or query; reads pass | Outside the stack; could create billable resources |
| Mobbin | Ask | Outside the stack |
| Scheduled tasks | Ask for create, update, run | Unattended automation |

## Account settings to keep off (manual, by Hamidreza)

| Where | Setting | Required state | State on 2026-11-09 |
|---|---|---|---|
| Zernio → Billing | Payment method | None saved, so free limits act as hard stops. If one is ever saved: **auto top-up off** | Not visible through the API: **please check** |
| Zernio → Billing | Auto-upgrade | Off | `autoUpgradeEnabled: false` ✓ |
| Zernio → Billing | Auto top-up | Off, or a low monthly limit, if a card is ever saved | **On, no monthly limit** (`treasury_get_auto_recharge`, 2026-11-09). Harmless only while no card is saved. Hamidreza to change it by hand; the guard blocks Claude from changing it in either direction |
| Zernio | Connected accounts | 1 (2 are free) | 1 ✓ |
| Zernio | X/Twitter account | Never connected (card required, pay per call) | None ✓ |
| Zernio | Workflows, automations, comment-to-DM, broadcasts, sequences, webhooks | None | All empty ✓ |
| Zernio | Ads | None | None ✓ |
| Canva → Account | Plan | Free; never start a Pro or Teams trial | Free per the brief: **please confirm** |

## Free limits that matter

| Limit | Value | Our level |
|---|---|---|
| Zernio connected accounts | 2 free; a third needs a card and is billed per account per day | 1 |
| Zernio posts | Unlimited; 25 per hour and 100 per day per Instagram account | ≤ 2 per day |
| Zernio managed messages | 10,000 per month free; without a card, the send that would pass it fails | Internal cap: 500 per month |
| Zernio API | 60 requests per minute; analytics about 6 per second | Low |
| Zernio Support Assistant | Paid per question | Never used |
| Canva Free | Free elements and templates; AI tools have monthly limits | Free elements only; no AI imagery |

## When something is blocked

Read the guard's reason and take the safe path it names: a draft, a pending-approval post, or a manual post by Hamidreza. Never route around a block through another tool or connector. If the rule itself looks wrong, ask Hamidreza; only an explicit request changes the policy.
