# Leads

`pipeline.csv` is the single list of people who might become clients. It holds personal data, so it is **git-ignored by default**. Keep it private, collect the minimum, and delete a person's row if they ask.

## Stages

`new` → `contacted` → `qualified` | `nurture` | `not-a-fit` → `discovery` (call booked or held) → `proposal` (sent) → `won` | `lost`

## Qualification rubric (0–10)

| Criterion | Points |
|---|---|
| The need matches the services (website, store, web app, redesign) | 0–3 |
| The business is in a target segment (EC, ED, CO, WA) | 0–2 |
| Budget signal at or above Hamidreza's minimum (private number, **[confirm]**) | 0–2 |
| Timeline within about 3 months | 0–1 |
| Talking to the decision-maker, or has direct access | 0–1 |
| Engaged: answers questions, shares specifics | 0–1 |

**7–10** qualified (counts toward the north-star metric) · **4–6** nurture · **0–3** not a fit.
Score only what is known; unknown criteria score 0 until learned. Never guess a budget.

## Columns

| Column | Values |
|---|---|
| `lead_id` | L-001, L-002 … |
| `first_contact` | YYYY-MM-DD |
| `source_channel` | dm · comment · story_reply · mention · website · other |
| `source_content_id` | IG-0xx, IG-S0x or `bio` |
| `keyword` | DM keyword used, if any |
| `handle` | Instagram handle |
| `business_name` | If shared |
| `segment` | EC · ED · CO · WA · other |
| `need_summary` | One line |
| `budget_band` | unknown · below_min · ok · high |
| `timeline` | Free text, e.g. "before Nowruz" |
| `decision_maker` | yes · no · unknown |
| `score` | 0–10 |
| `stage` | See stages above |
| `next_action`, `next_action_date` | What happens next, and when |
| `last_update` | YYYY-MM-DD |
| `notes` | Short; no sensitive data |

## Rules

- Add a row when `inbox-triage` categorises an inquiry as `lead-hot` or `lead-warm`.
- Store a phone number or email only if the person offered it for follow-up.
- Every stage change updates `last_update`.
