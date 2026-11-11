# Implementation report: Instagram Studio setup

**Date:** 2026-11-09 (۱۸ آبان ۱۴۰۵) · **Scope:** first task: inspect connections, build the project structure, write CLAUDE.md and reusable skills, establish brand and content strategy.
**Status:** done. **Nothing was published, scheduled, sent or purchased.** Spend: $0. All connector calls were read-only (list, get, search, validate, docs).

## 1. Connection inspection

| Connector | Result |
|---|---|
| **Zernio** | Connected and healthy. One Instagram account `@hamidrezafalahi.ir` (`6af15b88576d0f544103ea7a`) in profile `Default` (`6af15a16068cbf4a0057e509`). Can post; analytics syncing. Token valid until **2027-01-08**. |
| Zernio billing | Plan **Usage** (usage-based, metered). $0 accrued, every metered family at $0, auto-upgrade off. 1 of 2 free connected accounts used. |
| Zernio content | No posts, queue slots, workflows, automations, comment-to-DM rules, broadcasts, sequences or webhooks. Inbox empty. 0 followers. |
| **Canva** | Connected, Free plan. No Brand Kit. One folder (`Uploads`). One design: a 5-page carousel «۵ اشتباه وب‌سایت‌های کسب‌وکار» (`DAHaZQXIBYA`) created with Canva AI. |
| Composio | Connected but outside the approved stack: **blocked** by the guard. |
| Cloudflare, Mobbin, Claude Docs, scheduled-tasks | Connected; outside the stack (guard asks before writes). |
| Google Search Console plugin | **Failed to connect** (ECONNREFUSED). Not needed for Instagram. |

**Risks found during inspection, and how each is handled**

| Finding | Risk | Handling |
|---|---|---|
| Zernio is on **usage-based (metered) billing** | A 3rd account, X, ads, numbers, SMS or the Support Assistant would cost money | Guard denies all of these; `free-tier-audit` skill checks monthly |
| `posts_create` **schedules a post 60 minutes out by default** unless `is_draft: true` | Accidental publishing | Guard denies it without `is_draft: true` |
| A `scheduled_for` in the past **publishes immediately** | Accidental publishing | Guard denies times in the past or < 30 minutes ahead |
| Zernio supports `requires_approval: true` (post waits as *pending approval*) | (an opportunity) | Made mandatory: every scheduled post needs Hamidreza's click in Zernio as a final gate |
| `support_ask` costs from $0.33 per question | Unexpected charge | Denied |
| Comment-to-DM automations, workflows, broadcasts can message people automatically | Unapproved commercial messages | All automation writes denied; cold outreach denied |
| Story stickers (poll, quiz, question, link) aren't available through the API | Story plans that can't run | Stories with stickers are marked `manual` |
| Canva connector can't set font families; Magic Resize and Brand Kit are Pro | Off-brand or paid designs | Masters are built once by hand; Pro tools denied |

## 2. What was built (70 files)

| Area | Contents |
|---|---|
| `CLAUDE.md` | Operating manual: mission, 8 hard rules, connector facts and IDs, guardrails, gates, Zernio and Canva rules, skills index, conventions, session checklist |
| `.claude/hooks/guard.mjs` + `guard.test.mjs` | Guard hook for every connector call, with a 77-case self-test |
| `.claude/settings.json` | Hook registration (fails closed) plus 18 deny and 16 ask permission rules |
| `.claude/skills/` | 12 project skills (section 5) |
| `brand/` | Positioning, voice and tone, terminology, visual identity, Instagram profile kit, Canva asset registry |
| `strategy/` | Content strategy, 4 personas, pillars with a 45-topic bank, hashtag bank, CTA library with DM-keyword registry, KPI framework |
| `calendar/` | Templates, plus cycle 1 (20 units) and a detailed launch week |
| `content/` | Pipeline (ideas → drafts → review → approved → scheduled → published), front-matter schema, 4 format templates, backlog, worked draft IG-004 |
| `projects/`, `assets/` | Consent levels A/B/C, redaction checklist, project template, asset conventions |
| `inbox/`, `leads/` | Triage categories and service levels, Persian reply playbook (15 templates), lead rubric (0–10), pipeline CSV |
| `analytics/` | Baseline, metrics log, report conventions |
| `ops/` | Guardrails matrix, connector inventory, approval log, free-tier audit log |
| `tools/` | `dates.mjs` (Jalali/Gregorian), `voice-lint.mjs` (Persian copy linter), `content-hash.mjs` (ties approvals to exact text) |

## 3. Guardrails (cost, publishing, messaging)

Five layers:
1. Hard rules in `CLAUDE.md`.
2. The **guard hook** (deny / ask / pass, fails closed, logs to `ops/guard-log.jsonl`).
3. Permission rules in `.claude/settings.json`.
4. **Zernio's pending-approval gate** on every scheduled post.
5. Manual account settings (section 8).

| Decision | Covers |
|---|---|
| **Deny** | Instant publish, default-scheduling `posts_create`, past or too-soon times, scheduling without review, queues, recycling, cross-post, bulk, other platforms, Support Assistant, ads, broadcasts, sequences, workflows, automations, numbers, SMS, webhooks, billing writes, cold DMs, message tags; Canva Magic Resize, Background Remover, Brand Templates, AI images and video, Pro export; all of Composio |
| **Ask** | Drafts, pending-approval posts, edits, deletes, retries, review approvals, comment and DM replies, Canva AI sketches and commits, Cloudflare writes, scheduled tasks, unknown operations |
| **Pass** | All reads (lists, analytics, usage, validation) |

**Important:** project hooks load when a session starts. The `.claude/` folder didn't exist when this session began, so **the guard becomes active from the next Claude Code session opened in this folder.** No write calls were made in this session.

## 4. Brand and strategy, in brief

- **Positioning:** a software engineer who builds fast, conversion-focused websites and custom web apps, starting from the business problem, with direct access to the builder and a clean handover. Tagline: «سایت را مهندسی می‌کنم، نه فقط طراحی.»
- **Voice:** precise, confident without hype, human, generous; «من» and «شما»; Persian first with English technical terms. Banned AI-marketing phrases are enforced by the linter.
- **Visual identity, "The Engineering Notebook":** Ink `#111315` / Paper `#F4F1EA` with one Signal accent `#F2542D` (large text only on Paper, 3.06:1). Vazirmatn plus JetBrains Mono (fonts to verify in Canva Free). Mono kickers, a "cursor" mark, real screenshots framed as figures. Feed size 4:5 (1080 × 1350).
- **Mix (fixed):** case studies 30% · education 25% · services 20% · process 15% · personal 10%, accounted over 20-unit cycles (±1 tolerance). Case studies are never invented; there is a logged fallback.
- **Cadence (Phase 1):** feed Sat/Mon/Wed 20:30, story sequences Sun/Tue 20:00 (Tehran time). 20:30 is a hypothesis to re-check after 4 weeks.
- **KPIs:** north star = qualified leads per month (rubric score 7+). Attribution via DM keywords, UTM links and content IDs. Cycle 1 targets are process targets (new account).
- **Cycle 1:** Sat 30 Aban → Fri 27 Azar 1405 (21 Nov → 18 Dec 2026). 12 feed posts (5 Reels, 7 carousels) + 8 story sequences, mix exactly 6/5/4/3/2. Launch prep runs 10–20 Nov.

## 5. Skills

| Skill | Purpose |
|---|---|
| `content-calendar` | Cycle and weekly plans with the fixed mix, computed dates, gate deadlines |
| `carousel` | Slide copy, caption, alt text, master-page spec |
| `reel-script` | Hook, timed beats, voiceover, on-screen text, shot list, cover |
| `story-sequence` | Frames, sticker plan, Zernio vs manual posting, highlights |
| `persian-caption` | Hook line, body, one CTA, 3–5 hashtags |
| `case-study` | Consent- and source-gated case-study packages |
| `canva-production` | Copy masters → replace text/images → preview → commit → export (Free only) |
| `approval-workflow` | G1–G4 gates, hashed approval log, Zernio pending-approval scheduling, changes, failures |
| `inbox-triage` | Categorise comments, DMs and mentions; score leads; draft replies; send only approved ones |
| `analytics-report` | Weekly and monthly reports ending in at most 3 actions |
| `brand-voice-qa` | Linter plus human voice, claims and persona check |
| `free-tier-audit` | Monthly zero-cost audit of Zernio and Canva |

## 6. Worked example: IG-004

The existing Canva design `DAHaZQXIBYA` was rebuilt as `content/01-drafts/IG-004_carousel_5-website-mistakes.md`: 7 Persian slides, each mistake paired with a one-minute self-test; a correctly cited Core Web Vitals threshold (LCP ≤ 2.5 s); eNamad as the Iranian trust seal; caption, alt text, design spec and claim checks. Issues found in the old design: mixed English/Persian slides, kashida-stretched text, a typo («قابل»), an Arabic yeh, missing spaces, stray elements on page 1, and 3:4 instead of 4:5. Lint: 0 errors, 0 warnings. **Status: draft, awaiting G2.**

## 7. Verification performed

| Check | Result |
|---|---|
| Guard self-test (77 decisions plus matcher and fail-closed checks) | All pass |
| Exact hook command piped through bash with a Windows-style project path | Correct deny/ask JSON; Tehran and Jalali time shown in prompts |
| `settings.json` and linter config parse as JSON | OK |
| Skill front matter (name = folder, description, YAML-safe) | 12/12 OK |
| Persian lint across all 50 Markdown files | 0 errors, 0 warnings |
| Linter negative test on the old design's text | Catches all 16 planted errors and 8 warnings |
| Bio options vs Instagram's 150-character limit | 147 / 139 / 137 |
| Cycle dates vs `tools/dates.mjs` | Match (e.g. 1 Azar 1405 = Sun 22 Nov 2026) |
| Palette contrast ratios | Computed (WCAG), documented per pair |
| Referenced paths exist | All, except `ops/guard-log.jsonl`, which the hook creates on its first decision |

**Not verified:** the hook firing inside a live session (it activates next session); Canva font availability; hashtag volumes; Zernio card-on-file status (not exposed by the API). Skill trigger evals were not run, because they need subagents (available on request).

## 8. Manual checks for Hamidreza (one time, about 10 minutes)

1. **Zernio → Billing:** confirm no payment method is saved (free limits stay hard stops); if one is saved, turn **auto top-up off**. Don't connect an X account.
2. **Canva → Account:** confirm the plan is Free and no trial is running.
3. Start a **new Claude Code session** in `C:\fallahi\Instagram-Studio` so the guard loads (optional check: `node .claude/hooks/guard.test.mjs`).
4. Plan to **reconnect Instagram in Zernio before 2027-01-08** (token expiry).

## 9. Inputs needed (in priority order)

| # | Input | Needed for | Due |
|---|---|---|---|
| 1 | 3 delivered projects (ideally e-commerce, education or corporate, web app): details, **consent level**, sourced metrics, redacted screenshots | 6 case-study units in cycle 1 | 12 Nov |
| 2 | Real facts: experience, tech stack, services you actually offer, free consultation or review offer (yes/no) | IG-001, services posts, CTAs | 12 Nov |
| 3 | Website URL (is it `hamidrezafalahi.ir`?) and contact channels you check daily | Bio links, UTM, CTAs | 12 Nov |
| 4 | Headshot and a few workspace photos | IG-001, profile, stories | 14 Nov |
| 5 | Build the Canva Brand Board and masters (about 90 minutes; checklist in `brand/visual-identity.md` §10) | Every design | 14 Nov |
| 6 | Choose a bio (A, B or C) and confirm the posting times | Profile, calendar | 14 Nov |
| 7 | Review and approve the cycle 1 plan (G1) | Launch on 21 Nov | 14 Nov |
| 8 | Review the IG-004 draft (two claim checks in its review notes) | G2 | 16 Nov |
| 9 | Minimum project budget (private, for lead scoring) | Lead rubric | any time |

## 10. Assumptions to confirm

- Primary audience is Persian-speaking businesses in Iran; Asia/Tehran time; Saturday-start week.
- Hamidreza works solo (first person «من»); the four service lines in `brand/brand-identity.md` §6 are proposals.
- 4:5 feed format (Zernio's recommended spec) rather than 3:4.
- All Persian copy was written by Claude and needs native review at G2, as every piece does.

## 11. Recommended next steps

1. Do the manual checks (section 8) and start a new session.
2. Send inputs 1–4; build the Canva masters.
3. Approve cycle 1 (G1); Claude then drafts week 1 (IG-001, IG-S01, IG-002, IG-S02, IG-003) for G2 by 16 Nov.
4. Optional: `git init` with a **private** remote for history (personal-data files are already git-ignored).
5. Optional: run skill trigger evals once the skills have been used for a week.
