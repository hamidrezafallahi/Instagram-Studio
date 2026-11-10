---
name: analytics-report
description: Build Hamidreza Falahi's weekly and monthly Instagram performance reports from Zernio analytics (reach, views, engagement, saves, shares, profile visits, website clicks, followers) joined with inbox and lead data (inquiries, qualified leads, project opportunities), ending in at most three actions. Use whenever the user asks how posts or the account are doing, for stats, insights or a report («آمار»، «گزارش»، «ریچ»، «بازدید»), the best time to post or what's working, and for the Saturday weekly review and the monthly retro.
---

# Analytics report

The numbers serve one question: **which content brings qualified leads, and what do we change next?**

## Window

- **Weekly:** Saturday 00:00 to Friday 23:59, Asia/Tehran (the week just finished).
- **Monthly:** the Jalali month just finished (`node tools/dates.mjs` gives the bounds).

## Pull (read-only and free; analytics allows about 6 requests per second, so call sequentially)

1. `analytics_get_analytics(account_id="6af15b88576d0f544103ea7a", platform="instagram", from_date, to_date, limit=50)`: per-post metrics, including `profile_views` and `website_clicks` where Instagram provides them.
2. `analytics_get_daily_metrics(account_id, from_date, to_date)`: daily totals.
3. `accounts_get_follower_stats(account_ids="6af15b88576d0f544103ea7a", from_date, to_date)`.
4. Monthly only: `analytics_get_best_time_to_post(account_id)` and `call_tool` → `inbox_analytics_get_inbox_response_time {from_date}`.
5. Local files: `inbox/triage/*` for the window (inquiries by category); `leads/pipeline.csv` (qualified leads, opportunities, won).
6. Ask Hamidreza for what only the Instagram app or the website shows: account-level profile visits, bio link taps, UTM sessions. Anything not provided is `n/a`; never estimate it.

## Compute

- **Per post:** reach, views, engagement (likes + comments + shares + saves), engagement rate (÷ reach), saves per 1,000 reach, profile visits, website clicks, inquiries attributed to it (keywords, content IDs).
- **Per pillar and format:** medians, not averages; one viral post distorts an average.
- **Comparisons:** this week vs the previous week; in monthly mode, this cycle vs the previous one. Mix delivered vs planned.
- **Funnel:** reach → profile visits → website clicks and DMs → qualified leads → opportunities.

## Write

`analytics/reports/weekly_<saturday YYYY-MM-DD>.md` or `analytics/reports/monthly_<1405-MM>.md`:

1. **Headline:** the 3 numbers that matter (qualified leads, opportunities, median reach) with deltas.
2. Funnel table.
3. Posts table sorted by saves per 1,000 reach; top 3 and bottom 3, each with a one-line reason (hook, format, topic, time).
4. Pillar and format medians; mix delivered vs plan.
5. Data gaps and caveats (new account, sync lag, missing manual inputs).
6. **At most 3 actions**, each tied to a metric and to a change in the next cycle.

Then append one row to `analytics/metrics-log.csv` (columns in `analytics/README.md`).

## Honesty

Call small samples small. "Best time" means little before roughly 10+ posts. Don't present correlation as causation. Missing data stays missing.
