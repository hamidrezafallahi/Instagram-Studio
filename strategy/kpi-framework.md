# KPI framework

## Metrics, definitions and sources

| Metric | Definition | Source | Cadence |
|---|---|---|---|
| Reach | Unique accounts that saw a post | Zernio `analytics_get_analytics` (per post), `analytics_get_daily_metrics` | Weekly |
| Views / impressions | Total views (Reels: plays) | Zernio analytics | Weekly |
| Profile visits | Visits to the profile from a post | Zernio per-post `profile_views` (sortable); account total from the Instagram app (manual) | Weekly |
| Website clicks | Clicks to the website | Zernio per-post `website_clicks`; bio link taps from the Instagram app (manual); UTM sessions from website analytics (manual) | Weekly |
| Engagement | Likes + comments + shares + saves | Zernio analytics | Weekly |
| Engagement rate | Engagement ÷ reach | Calculated | Weekly |
| Saves, shares | Quality signals for education and case studies | Zernio analytics | Weekly |
| Followers, net growth | Follower count and change | Zernio `accounts_get_follower_stats` (refreshed daily) | Weekly |
| Incoming inquiries | DMs and comments triaged as `lead-hot` or `lead-warm` | `inbox/triage/` logs | Weekly |
| Qualified leads | Inquiries scoring 7+ (`leads/README.md`) | `leads/pipeline.csv` | Weekly |
| Project opportunities | Leads at `discovery` or `proposal` stage | `leads/pipeline.csv` | Weekly |
| Won projects (private) | Leads at `won` | `leads/pipeline.csv` | Monthly |
| Inbox response time | Time from inquiry to first reply | Zernio `inbox_analytics_get_inbox_response_time` (read-only) | Monthly |

## Attribution

- **DM keywords** per content type (`strategy/cta-library.md`): triage tags each lead with the keyword and the content ID.
- **UTM links:** `utm_source=instagram&utm_medium=social&utm_campaign=<bio|bio-portfolio|story-IG-0xx>`.
- **Ask once, politely:** «از کجا با من آشنا شدید؟» in the first reply when the source is unclear.
- `leads/pipeline.csv` records `source_channel`, `source_content_id` and `keyword` for every lead.

## Targets

The account starts at 0 followers and 0 posts (baseline 2026-11-09), so the first targets are **process targets**. Outcome targets get set from real data after cycle 1.

| Horizon | Target | Type |
|---|---|---|
| Cycle 1 (4 weeks) | ≥ 90% of planned units published on time; every post passed all 4 gates | Process |
| Cycle 1 | Inbox: every inquiry triaged within 1 business day; replies sent within 1 business day of approval | Process |
| Cycle 1 | Baseline per format: median reach, saves per 1,000 reach, profile visits per post | Measure |
| Cycles 2–3 | Median reach per post up vs. cycle 1; saves per 1,000 reach up for education posts | Outcome **[set after cycle 1]** |
| By day 90 | First qualified leads from Instagram, and at least one discovery call per month | Outcome **[calibrate]** |

## Reporting

| Report | When | File | Built by |
|---|---|---|---|
| Weekly | Saturday morning, covering the previous Saturday–Friday | `analytics/reports/weekly_<saturday YYYY-MM-DD>.md` | `.claude/skills/analytics-report` |
| Monthly | 1st of each Jalali month | `analytics/reports/monthly_<1405-MM>.md` | same skill, monthly mode |
| Snapshot log | Each weekly report appends one row | `analytics/metrics-log.csv` | same skill |

Every report ends with at most **3 actions**, each tied to a metric.
