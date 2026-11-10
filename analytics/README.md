# Analytics

Built by the `analytics-report` skill from Zernio analytics (read-only, free), the inbox triage logs and `leads/pipeline.csv`. Definitions and targets: `strategy/kpi-framework.md`.

| File | Purpose |
|---|---|
| `baseline-2026-11-09.md` | Starting point recorded at setup |
| `metrics-log.csv` | One row per weekly report |
| `reports/weekly_<saturday YYYY-MM-DD>.md` | Weekly report (Saturday–Friday, Tehran time) |
| `reports/monthly_<1405-MM>.md` | Monthly report and retro (Jalali month) |

## `metrics-log.csv` columns

`week_start, week_end` (YYYY-MM-DD) · `posts_published, reels, carousels, story_sequences` · `reach_total, reach_median_post, views_total` · `likes, comments, shares, saves` · `profile_visits, website_clicks` · `followers_end, followers_net` · `inquiries, qualified_leads, opportunities, won` · `notes`

Empty means not measured; `0` means measured and zero. Manual inputs (account-level profile visits, bio link taps, website UTM sessions) are noted in `notes` with their source.
