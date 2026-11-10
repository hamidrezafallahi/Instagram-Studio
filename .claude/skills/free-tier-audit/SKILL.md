---
name: free-tier-audit
description: Audit that Hamidreza Falahi's Instagram studio stays at zero cost - check Zernio billing, metered usage, connected-account count, automations, webhooks, broadcasts and message volume, review Canva for Pro or trial risks, and log the result. Use monthly; before connecting any new account, platform, connector or integration; whenever a tool or plan mentions a price, card, trial, upgrade or limit; and when the user asks about costs, billing or limits («هزینه»، «پولی»، «رایگان») or whether everything is still free.
---

# Free-tier audit

The studio's budget is **zero**. This audit proves it and stops anything that could change it.

## Zernio (read-only calls)

| Check | Call | Must be |
|---|---|---|
| Billing state | `call_tool` → `usage_get_billing` | `accruedThisPeriodCents: 0`, `autoUpgradeEnabled: false`, not suspended |
| Metered spend | `usage_get_usage` (default `range: cycle`) | every total 0 |
| Connected accounts | `call_tool` → `usage_get_usage_stats`; `accounts_list` | exactly 1 account (`@hamidrezafalahi.ir`). Two are free; a third needs a card and is billed per day |
| Account health | `accounts_get_all_accounts_health` | healthy; plan a reconnect before the token expires (2027-01-08 at the first check) |
| Automations that could send or spend | `call_tool` → `workflows_list_workflows`, `automations_list_automations`, `comment_automations_list_comment_automations`, `broadcasts_list_broadcasts`, `sequences_list_sequences`, `webhooks_get_webhook_settings` | all empty, unless Hamidreza approved one in writing |
| Outbound messages this month | count from `inbox/triage/*` | far below the 10,000 free allowance; internal cap 500 |

Never call `support_ask` or the Support Assistant: it is billed per question. The guard blocks it.

## Canva (ask Hamidreza; the connector can't read billing)

- The plan is **Free**, with no Pro or Teams trial running (trials convert to paid).
- Recent exports went through without a payment prompt, so no premium element slipped in.

## Manual dashboard checks for Hamidreza (quarterly)

- **Zernio → Billing:** no payment method saved; or, if one is saved, **auto top-up off**. Without a card, Zernio's free limits are hard stops; with a card, overage is billed.
- **Zernio:** don't connect an X/Twitter account (it needs a card and is pay-per-call).
- **Canva → Account:** the plan shows Free.

## Log and act

Append a row to `ops/zernio-usage-log.md` with the date and each check's result. If anything fails: pause the related work, tell Hamidreza in one clear message, and propose a fix. Never "fix" it by adding a card, upgrading, starting a trial or connecting another service.
