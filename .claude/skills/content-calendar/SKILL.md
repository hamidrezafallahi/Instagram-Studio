---
name: content-calendar
description: Plan Hamidreza Falahi's Instagram content calendars - 4-week cycles and weekly plans that hit the fixed pillar mix (30% case studies, 25% education, 20% services, 15% process, 10% personal), with Jalali and Gregorian dates, Tehran posting times, approval-gate deadlines and dependencies. Use whenever the user asks for a content calendar, posting plan, monthly or weekly schedule, "what should we post next week", «تقویم محتوا»، «برنامهٔ ماه/هفته», or wants to rebalance the mix or slot new ideas, even if they don't say "calendar". Plans only; never schedules or publishes anything.
---

# Content calendar

An approved cycle plan is gate **G1** for every slot in it. Scheduling happens later, one post at a time, through the `approval-workflow` skill.

## Read first

- `strategy/content-strategy.md` (mix rules, cadence, case-study fallback), `strategy/content-pillars.md` (topic bank), `strategy/audience-personas.md`
- The previous cycle's `month-plan.md` (carried deficits) and the latest monthly report in `analytics/reports/`
- `content/00-ideas/backlog.md`, and `projects/` to see which case studies are actually possible
- Templates: `calendar/templates/monthly-calendar.md`, `calendar/templates/weekly-calendar.md`
- Worked example: `calendar/1405-azar_cycle-01/month-plan.md`

## Cycle plan

1. **Dates.** A cycle is 4 weeks starting on a Saturday. Run `node tools/dates.mjs <saturday YYYY-MM-DD> 28` and copy the dates from its output. Never work out Jalali dates in your head: one off-by-one date silently breaks the plan.
2. **Allocate 20 units** (1 feed post or 1 themed story sequence each): case studies 6, education 5, services 4, process 3, personal 2, plus any deficit carried from the previous cycle. Phase 2 (4 feed posts a week) uses 24 units: 7 · 6 · 5 · 4 · 2.
3. **Check case-study supply.** Count consented projects in `projects/` (consent level A or B). One project can feed up to three units (carousel, Reel, story). If supply is short, plan the slot with its fallback topic named and flag the risk. Never plan around an invented project.
4. **Formats.** Feed: about 45% Reels, 55% carousels. Stories carry part of services, process and personal. Any story that needs a poll, quiz, question or link sticker gets `post mode: manual`, because the API can't add stickers.
5. **Personas and funnel.** Spread EC / ED / CO / WA across the cycle. Each week has at least one awareness unit and one consideration-or-conversion unit.
6. **Topics.** Pick from the topic bank and the backlog. Don't repeat a topic within two cycles unless the last report says it outperformed. Add seasonal angles from `content-strategy.md` §7.
7. **Slots.** Phase 1: feed Sat/Mon/Wed 20:30, story sequences Sun/Tue 20:00 (Asia/Tehran), unless the latest report recommends other times. Assign the next unused IDs (`IG-0NN` feed, `IG-SNN` stories).
8. **Gate deadlines** for a slot on day D: G2 by D−5, G3 by D−3, G4 by D−2, Zernio approval by D−1. Every dependency (project, filming, screenshots) gets an owner and a due date.
9. **Mix check.** The table shows Δ of 0 or ±1 per pillar; explain any deviation.
10. **Write** `calendar/<jalali-year>-<month>_cycle-NN/month-plan.md`, then `week-01.md`. Fill the "Used in" column of the topic bank.
11. **Ask for G1** in one short message listing the slots; record the answer with `approval-workflow`.

## Weekly mode

For "next week", build `week-NN.md` from the approved month plan: a 2–4 line brief per unit, production tasks with owners and dates, gate checkboxes. Call out anything at risk of missing its gate.

## Quality bar

- Every slot has ID, both dates, weekday, time, format, pillar, persona, funnel stage, working title, CTA or keyword, dependencies and post mode.
- No slot depends on something nobody owns.
- Be honest about risk (missing projects, filming load) rather than making the plan look full.
