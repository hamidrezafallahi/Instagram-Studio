# Initial integration audit · Instagram Studio

- **Date:** ۱۸ آبان ۱۴۰۵ · 2026-11-09, 11:37 Tehran
- **Scope:** project files, Canva connector, Zernio connector, cost control, security, content and inbox workflow
- **Mode:** audit only. Nothing was published, sent, deleted, edited or reconfigured. The one write was the Canva test design the brief asked for (§2). No paid feature was called.
- **Verdicts:** **PASS** = checked and working · **FAIL** = checked and not as required · **NOT VERIFIED** = could not be checked safely or at all

## Summary

| Area | PASS | FAIL | NOT VERIFIED |
|---|---|---|---|
| 1 Project | 11 | 0 | 0 |
| 2 Canva | 7 | 0 | 2 |
| 3 Zernio | 12 | 0 | 3 |
| 4 Cost control | 7 | 1 | 2 |
| 5 Security | 7 | 1 | 2 |
| 6 Workflow | 8 | 0 | 3 |
| **Total** | **52** | **2** | **12** |

**The two failures**

1. **Zernio auto top-up is ON with no monthly limit** (`enabled: true`, top up below $5 to $20, `monthlyLimitCents: null`). If a card is saved, the first pay-per-use call at a $0 balance charges about $20 to the card. The API doesn't show whether a card is saved. **Action for Hamidreza in Zernio → Billing:** confirm no card is saved. If one is, turn auto top-up off or set a monthly limit. I did not change this setting.
2. **No version control.** The folder is not a git repository. As a result, `.gitignore` protects nothing, and the "append-only" `ops/approval-log.md` has no history that could show tampering. Run `git init` and keep the repo private; I did not do this.

**Recommended fixes (Hamidreza's call; I changed nothing):**

- Block billing-setting writes (`treasury_*` other than reads) in the guard. Today they only ask (§4.6).
- Add a note to the guard's `create-design` reason that Magic Design has a 10-use lifetime quota on Canva Free (§2.4).
- Do the account checks below by hand.

---

## 1. Project audit

| # | Capability | Verdict | Evidence |
|---|---|---|---|
| 1.1 | `CLAUDE.md` complete and consistent | PASS | Mission, 8 hard rules, connectors, guardrails, gates, Zernio and Canva rules, voice, skills, conventions, session start. Facts match the live connector data (account ID, profile ID, token expiry, plan). |
| 1.2 | Project skills present (12) | PASS | All 12 skills in `CLAUDE.md` §9 exist under `.claude/skills/` with `name` and `description` front matter, and all load in this session. |
| 1.3 | Folder structure matches the map | PASS | `brand/ strategy/ calendar/ content/ projects/ assets/ inbox/ leads/ analytics/ ops/ tools/ reports/` all present. Pipeline folders `00-ideas` to `05-published` exist. |
| 1.4 | Guard self-test | PASS | `node .claude/hooks/guard.test.mjs`: "All 77 decisions and the matcher checks pass." |
| 1.5 | Permission rules in `.claude/settings.json` | PASS | 18 deny rules (instant publish, bulk, cross-post, retry-all, Support Assistant, profile changes, Canva Pro/AI imagery, all of Composio) and 16 ask rules. The hook is registered with `onFailure: "block"`. |
| 1.6 | Tools run | PASS | `content-hash.mjs`, `voice-lint.mjs` and `dates.mjs` all run. Lint shows 0 errors and 0 warnings on all 6 content files. |
| 1.7 | Recorded approvals still valid | PASS | Current body hashes of IG-002 (`a55009086c21`), IG-003 (`ff3c4b068fa1`) and IG-S02 (`324e273cdbd4`) equal the G2 hashes in `ops/approval-log.md` #1–3. |
| 1.8 | Pipeline state | PASS | `02-in-review`: IG-002, IG-003, IG-S02 (G1 and G2 done, G3 pending). `01-drafts`: IG-001, IG-004, IG-S01. `03`–`05` are empty, matching Zernio (0 posts). |
| 1.9 | Week-01 calendar consistent | PASS | `calendar/1405-azar_cycle-01/week-01.md` matches the folder and approval states. |
| 1.10 | Free-tier audit log current | PASS | `ops/zernio-usage-log.md` last row is 2026-11-09 (under 31 days old). |
| 1.11 | Missing configuration listed | PASS | See "Missing configuration" below. |

**Missing configuration and open inputs**

- **No real projects:** `projects/` holds only `_template` and `README.md`. The IG-003 case study is blocked; the fallback runs unless project A with consent exists by ۲۹ آبان (20 Nov).
- **Canva masters not built:** BRAND BOARD, MASTER · Carousel, Story, Reel cover and Highlights are all "to create" (`brand/canva-assets.md`). G3 can't start for any item until they exist.
- **Font check table** in `brand/canva-assets.md` is empty (Vazirmatn and the others: free status, Persian shaping and ZWNJ all unchecked).
- **Open brand questions:** `brand/brand-identity.md` §9 has 7 open questions (projects and consent, tech stack, free consultation, minimum project size, website URL and channels, collaborators, weekly time).
- **Facts for drafts:** IG-001 needs Hamidreza's facts and a headshot. IG-S01 needs the service deliverables confirmed.
- **No git repository** (see Failure 2).
- **Optional:** the Google Search Console plugin failed to connect (ECONNREFUSED). It isn't needed for Instagram.

## 2. Canva MCP

| # | Capability | Verdict | Evidence |
|---|---|---|---|
| 2.1 | Connector connected | PASS | `search-designs`, `list-folder-items`, `list-brand-kits`, `get-export-formats` and `help` all answered. |
| 2.2 | Tools available | PASS | 45 tools: search, read, copy, edit, export, folders, uploads, comments, AI generation, brand templates, resize, background removal, video. |
| 2.3 | Free plan, no Brand Kit | PASS | `list-brand-kits` → `[]`. No Pro artifacts found. |
| 2.4 | Free-plan capabilities confirmed (Canva Help Center via `help`) | PASS | Creating designs with free templates, photos and graphics is free. **Magic Design (AI generation) on Free is limited to 10 lifetime uses.** The legacy design `DAHaZQXIBYA` was made with Canva AI and probably used one of them. Pro-only features (Magic Resize, Background Remover, Brand Kit controls, premium elements) are already denied by the guard. |
| 2.5 | Folder structure | PASS | `Instagram Studio` (`FAHaZ5c09dg`) contains `00 Brand`, `01 Masters`, `02 In production`, `03 Approved` and `99 Archive`, matching the registry. |
| 2.6 | Private test design created (free, no premium assets) | PASS | Made with `copy-design` (page 1 of `DAHaZQXIBYA`) rather than `create-design`. A copy is free, uses no AI quota and adds no new assets. New design **`DAHaaFszFRY`**, private, 1 page, filed in `99 Archive`. The source is unchanged. Hamidreza can delete it in Canva; the connector has no delete tool. |
| 2.7 | Export formats on Free | PASS | `get-export-formats` on the test copy lists PDF, JPG, PNG, PPTX, GIF and MP4. No export was run. |
| 2.8 | Account plan is Free and no trial is active | NOT VERIFIED | The connector doesn't show the plan or trial state. The missing Brand Kit is consistent with Free. Hamidreza to confirm in Canva → Account. |
| 2.9 | Fonts render Persian correctly on Free | NOT VERIFIED | The connector can't set fonts (`ops/mcp-inventory.md`). This is a manual check while building the masters. |

## 3. Zernio MCP

| # | Capability | Verdict | Evidence |
|---|---|---|---|
| 3.1 | Connector connected | PASS | All read calls answered. |
| 3.2 | Instagram Business account connected | PASS | `accounts_list`: 1 account, instagram `hamidrezafalahi.ir` (`6af15b88576d0f544103ea7a`), profile Default (`6af15a16068cbf4a0057e509`). |
| 3.3 | Account health and token | PASS | `status: healthy`, token valid until **2027-01-08** (59 days), `needsRefresh: false`, no issues, analytics sync `ok` (2026-11-09 05:35 UTC). |
| 3.4 | OAuth scopes | PASS | Granted: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights`, `instagram_business_manage_comments`, `instagram_business_manage_messages`. No required scopes are missing. |
| 3.5 | Recent posts | PASS | `posts_list` → "No posts found". `posts_list_failed` → none. The account has 0 posts on Instagram as well (analytics `totalPosts: 0`). |
| 3.6 | Analytics available | PASS | `hasAnalyticsAccess: true`. Followers 0, daily metrics empty (new account). Follower history has no data points yet. |
| 3.7 | Publishing capability (inspected, not used) | PASS | `canPost: true`. The safe route is `call_tool → posts_create_post` with `requires_approval: true`. `posts_publish_now`, bulk and cross-post are denied by the settings and the guard. |
| 3.8 | Queue | PASS | `queue_list_queue_slots(all)` → 0 queues. |
| 3.9 | Comments capability | PASS | `comments_list_inbox_comments` → 0 items, 1 account queried, 0 failed. |
| 3.10 | DM capability | PASS | `messages_list_inbox_conversations` → 0 conversations, 0 failed. |
| 3.11 | Mentions | PASS | `mentions_list_inbox_mentions` → 0. |
| 3.12 | Free-plan limits, from Zernio's docs | PASS | Usage plan: every feature included. 2 connected accounts free (then $1–6 per account per month), 10,000 outbound messages a month free (then $1 per 10,000), 500 managed ads free. Phone, SMS, RCS, X API and the Support Assistant (about $0.10–0.50 per question) are paid. |
| 3.13 | Pending-approval scheduling works end to end | NOT VERIFIED | Testing it would create a real post object. It is left for the first real G4. |
| 3.14 | Reply and DM sending works | NOT VERIFIED | Not tested, because sending is forbidden in this audit and there is no one to reply to. |
| 3.15 | Instagram account type is Business or Creator | NOT VERIFIED | Meta's API doesn't expose the type directly. The granted `instagram_business_*` scopes imply a professional account. |

## 4. Cost control

| # | Capability | Verdict | Evidence |
|---|---|---|---|
| 4.1 | Spend this cycle is $0 | PASS | `usage_get_usage(cycle)` totals 0 in every product family (accounts, numbers, messages, SMS, calls, X API, ads, credits). `usage_get_billing`: accrued $0. |
| 4.2 | Balance and card charges | PASS | `treasury_get_balance`: available $0, no top-ups, card charges this month 0. |
| 4.3 | Within the free account allowance | PASS | 1 of 2 free accounts in use. |
| 4.4 | No automations, webhooks or queues that could meter | PASS | Comment-to-DM automations `[]`, webhooks `[]`, queues 0. |
| 4.5 | Auto-upgrade off | PASS | `autoUpgradeEnabled: false`, not suspended. |
| 4.6 | Paid tools blocked | PASS | Guard probe: `support_ask`, `posts_publish_now`, `treasury_create_topup`, creator payouts, Business Agent and Canva Pro/AI imagery → **deny**. **Gap:** `treasury_update_auto_recharge` and `treasury_confirm_topup` only **ask** (they should deny under rule 3). |
| 4.7 | Canva AI quota protected | PASS | `create-design` and `generate-design*` ask. The ask reason doesn't mention the 10-use lifetime limit (worth adding). |
| 4.8 | **Auto top-up safe** | **FAIL** | `treasury_get_auto_recharge`: `enabled: true`, below 500¢ → 2000¢, `monthlyLimitCents: null`. This is harmless only if no card is saved. |
| 4.9 | No card on file | NOT VERIFIED | Not exposed by the API. Hamidreza to check Zernio → Billing. |
| 4.10 | Canva Pro trial not started | NOT VERIFIED | Not exposed by the connector (see 2.8). |

## 5. Security

| # | Capability | Verdict | Evidence |
|---|---|---|---|
| 5.1 | No tokens or secrets in the repo | PASS | A regex scan for API keys, bearer tokens, Meta tokens, `client_secret`, `access_token`, `refresh_token` and passwords found no matches. No `.mcp.json` or `.claude/settings.local.json`. None printed in this report. |
| 5.2 | OAuth is managed outside the repo | PASS | Zernio and Canva use claude.ai connector OAuth. There are no credentials in project files. |
| 5.3 | Token scopes minimal for the job | PASS | Only the five Instagram business scopes the workflow needs (3.4). |
| 5.4 | Composio blocked | PASS | The whole server is in `permissions.deny`, and the guard denies it too. |
| 5.5 | No unintended automated publishing | PASS | 0 posts, 0 queues, 0 automations, 0 webhooks. Guard probe: a schedule without `requires_approval` → deny, a past time → deny, `posts_create` without a draft flag → deny, publish-now → deny. |
| 5.6 | No unattended jobs | PASS | Scheduled-task writes ask in the guard. None were created. |
| 5.7 | Personal data kept out of version control | PASS (config) | `.gitignore` lists `leads/pipeline.csv` and `inbox/triage/*`. Currently `pipeline.csv` holds a header only and `triage/` is empty. |
| 5.8 | **Version control and audit trail** | **FAIL** | Not a git repository (Failure 2), so the `.gitignore` above has no effect yet and approval-log edits can't be detected. |
| 5.9 | Guard hook active live in this session | NOT VERIFIED | Every connector call in this audit was a "pass" decision, which isn't logged, and `ops/guard-log.jsonl` doesn't exist yet. The offline probe and self-test pass. Confirm live on the first ask-class call: a prompt should appear and a log line be written. |
| 5.10 | Browser routes guarded | NOT VERIFIED | The hook matcher excludes the built-in browser and Claude in Chrome. Publishing through instagram.com or the Zernio dashboard in a browser is stopped only by the `CLAUDE.md` rules, not by code. This is by design, but it's a gap worth knowing. |

## 6. Content workflow

| # | Capability | Verdict | Evidence |
|---|---|---|---|
| 6.1 | Idea stage | PASS | `content/00-ideas/backlog.md` exists, and the `content-calendar` skill turns ideas into G1 slots. |
| 6.2 | Draft stage | PASS | Templates for carousel, reel, story and single posts. Lint must show 0 errors before review, and all current drafts do. |
| 6.3 | Copy approval (G2) | PASS | 3 items recorded with hashes. The hashes still match (1.7). **Note:** the recorded words are «Approve all three», a reply to a question that named the IDs and gates. That is valid only through context. The skill asks for a message naming the ID and gate, so future approvals should name them explicitly. |
| 6.4 | Design stage (G3) | NOT VERIFIED | No masters exist yet, so `canva-production` can't run end to end. |
| 6.5 | Approval recording | PASS | The log, front matter and hash procedure are defined (`approval-workflow`) and were followed for #1–3. |
| 6.6 | Scheduling (G4) gate | PASS (design) | Preconditions are hash = G2 hash, G2 and G3 recorded, at least 30 minutes of lead time, validated media, then `posts_create_post` with `requires_approval: true` and Tehran time. The guard enforces each technical condition (probe). |
| 6.7 | Publishing only after approval in Zernio | PASS (design) | Pending posts publish only after Hamidreza approves them in Zernio. `posts_review_post approve` asks and needs his explicit approval. |
| 6.8 | End-to-end run, idea to published | NOT VERIFIED | No item has passed G3 yet. |
| 6.9 | Comment reply approval | PASS | `inbox-triage` drafts replies, waits for «ارسال R1…», and the guard asks on `comments_reply_to_inbox_post` and private replies. |
| 6.10 | DM approval | PASS | `messages_send_inbox_message` asks, and is denied with `message_tag` or `channel`. New conversations (cold DMs) are denied. Replies only inside the 24-hour window. |
| 6.11 | Live reply and DM test | NOT VERIFIED | Inbox is empty and sending is out of scope. |

---

## Actions for Hamidreza (manual, in your own accounts)

1. **Zernio → Billing:** confirm no card is saved. If one is, turn auto top-up off or set a monthly limit. *(Failure 1)*
2. **Canva → Account:** confirm the Free plan and that no trial is active. Delete the test copy `DAHaaFszFRY` in `99 Archive` if you don't want it.
3. Approve `git init` (private repository) so `.gitignore` and the approval log become meaningful. *(Failure 2)*
4. Decide whether to tighten the guard: deny `treasury_*` writes, and add the Magic Design quota note. I'll change `.claude/hooks/guard.mjs` only at your explicit request.
5. Build the Canva masters and fill the font table, which unblocks G3.
6. Answer the open questions in `brand/brand-identity.md` §9. Decide on project A for IG-003 by ۲۹ آبان (20 Nov).
7. Plan the Instagram reconnect before the token expires on 2027-01-08 (late December).

## Calls made during this audit

- **Canva (reads):** `list-brand-kits`, `search-designs`, `list-folder-items`, `get-export-formats` ×2, `help`
- **Canva (writes):** `copy-design` (test design), `move-item-to-folder` (filed the test copy only)
- **Zernio (reads only):** `accounts_list`, `accounts_get_account_health`, `usage_get_usage` ×2, `posts_list`, `posts_list_failed`, `queue_list_queue_slots`, `analytics_get_analytics`, `accounts_get_follower_stats`, `analytics_get_daily_metrics`, `comments_list_inbox_comments`, `mentions_list_inbox_mentions`, `search_tools` ×3, `docs_search`, and via `call_tool`: `messages_list_inbox_conversations`, `comment_automations_list_comment_automations`, `webhooks_get_webhook_settings`, `treasury_get_auto_recharge`, `treasury_get_balance`, `usage_get_billing`
- **Local:** guard self-test, an offline guard probe (stdin JSON with `GUARD_LOG=off`, no external calls), hash, lint and date tools, secret scan
- **Not called:** any publish, schedule, draft, reply, DM, delete or edit tool, any paid tool, Composio, Cloudflare, Mobbin
