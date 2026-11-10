# Content strategy

> v1, 2026-11-09. Reviewed monthly in the monthly report's retro section.

## 1. Objective and logic

**Goal:** qualified leads that become paid web development projects.

```
Reach (Reels, shareable carousels)
  → Trust (education, case studies, process)
    → Action (service intros, one clear CTA, stories)
      → Conversation (DM / comment)
        → Qualification (leads/pipeline.csv) → Discovery call → Proposal → Project
```

Instagram's job is to **start the right conversations**. The website and case studies build the remaining trust; Hamidreza closes.

## 2. Content mix (fixed)

| Pillar | Share | Units per 20 | Funnel role | Main formats |
|---|---|---|---|---|
| Real project case studies | **30%** | 6 | Consideration → conversion (proof) | Carousel problem → result, Reel walkthrough, story teaser |
| Business problem-solving education | **25%** | 5 | Awareness → trust | Carousel tests and checklists, short Reels |
| Service introductions | **20%** | 4 | Conversion | Carousel "what you get", story FAQ |
| Development process and behind-the-scenes | **15%** | 3 | Trust | Screen-recording Reels, story dev logs |
| Personal professional branding | **10%** | 2 | Connection | Reel to camera, story, lessons carousel |

**Accounting rules**
- 1 unit = 1 feed post **or** 1 themed story sequence (3–6 frames). Light daily stories (reposts, quick behind-the-scenes) are not counted.
- The mix is measured over a **4-week cycle of 20 units**. Tolerance: ±1 unit per pillar per cycle; any deficit carries into the next cycle.
- **Case-study fallback:** if no consented project data exists by a slot's G2 deadline, swap it for an education unit and log the deficit in the month plan. Clear the deficit within the next cycle. Never invent or "composite" a case study.

## 3. Cadence

| Phase | When | Feed | Story sequences | Units/week |
|---|---|---|---|---|
| 1 | Cycles 1–2, from Sat 30 Aban 1405 (21 Nov 2026) | 3/week: Sat, Mon, Wed at 20:30 | 2/week: Sun, Tue | 5 |
| 2 | Once a 2-week approved buffer exists and Phase 1 ran on time | 4/week (add Thu) | 2/week | 6 (24 per cycle: 7 · 6 · 5 · 4 · 2) |

- 20:30 Asia/Tehran is a **starting hypothesis** (evening attention, Saturday–Wednesday workweek). Re-check after 4 weeks with `analytics_get_best_time_to_post` once there are roughly 10+ posts of data.
- Feed format target: about 45% Reels (discovery), 55% carousels (depth, saves, shares). Single images only for announcements and testimonials.

## 4. Funnel and CTA per pillar

| Pillar | Stage | Primary CTA | Example (from `strategy/cta-library.md`) |
|---|---|---|---|
| Education | Awareness | Save / share / comment a number | «کدام مورد در سایت شما هست؟ شماره‌اش را کامنت کنید.» |
| Case study | Consideration | DM keyword or link | «اگر فروشگاه شما هم همین مشکل را دارد، «فروشگاه» را دایرکت کنید.» |
| Service | Conversion | DM keyword «مشاوره» or contact link | «برای یک جلسهٔ کوتاه دربارهٔ پروژه‌تان، «مشاوره» را دایرکت کنید.» |
| Process | Trust | Question in comments, follow | «سؤال فنی دارید؟ کامنت بگذارید؛ در استوری جواب می‌دهم.» |
| Personal | Connection | Comment, story reply | «شما هم تجربهٔ مشابهی داشته‌اید؟» |

## 5. Every post has

- One primary persona, one problem, one takeaway, one CTA.
- A proof element for case studies and services: screenshot, sourced number, or a live demo.
- A hook in the first 1–2 seconds (Reels), on the first slide and in the first caption line.
- Complete front matter (`content/README.md`): ID, pillar, persona, funnel stage, gates.

## 6. Hook patterns that fit the brand

| Pattern | Example |
|---|---|
| Self-test | «یک تست ۵ ثانیه‌ای که نشان می‌دهد سایت‌تان مشتری را گیج می‌کند یا نه» |
| Common mistake | «این اشتباه را در بیشتر فروشگاه‌هایی که از اینستاگرام شروع کرده‌اند می‌بینم.» **[confirm it reflects real experience]** |
| Before → after | «قبل: [X] ثانیه. بعد: [Y] ثانیه. سه تغییر.» (real data only) |
| Ownership question | «دامنهٔ سایت شما به نام چه کسی ثبت شده است؟» |
| Decision rule | «اکسل یا وب‌اپلیکیشن؟ ۶ نشانه برای تصمیم» |
| Behind the scenes | «قبل از نوشتن یک خط کد، این سند را آماده می‌کنم.» |

Never: clickbait, fake urgency, "you won't believe", hooks the content does not pay off.

## 7. Seasonal and market calendar (Iran)

| When | Moment | Persona | Angle |
|---|---|---|---|
| Aban–Azar (Nov–Dec) | Online sale events; Yalda gift sales (night of 30 Azar = 21 Dec) | E-commerce | Speed and checkout before traffic spikes |
| Azar–Bahman (Dec–Feb) | Nowruz preparation: a new store must launch by Bahman for the Esfand peak | E-commerce | «فروشگاه نوروز را از الان شروع کنید» with a realistic timeline |
| Dey–Bahman (Dec–Feb) | Winter-term enrollment | Education | Online registration before the term starts |
| Shahrivar–Mehr (Aug–Oct) | Main enrollment season | Education | Registration and payment flows |
| Spring and autumn peaks | Trade fairs | Companies and exhibitions | Exhibition landing pages, QR lead capture **[confirm specific fairs]** |
| Esfand–Farvardin (Mar–Apr) | Nowruz holidays, low B2B attention | All | Lighter, personal content; schedule in advance |

## 8. Weekly production rhythm (solo engineer, about 5–6 hours)

| Day | Work | Gate |
|---|---|---|
| Sat | Claude drafts next week's copy from the calendar | G2 approval by Sun |
| Mon | Hamidreza films 2 Reels in one batch; captures screenshots | |
| Tue | Designs built from Canva masters | G3 approval by Wed |
| Wed | Schedule approvals for next week; Claude creates pending-approval posts in Zernio | G4 in chat, then final approval in Zernio |
| Daily, 15 min | Inbox triage: Claude categorizes and drafts, Hamidreza approves every reply | |

## 9. Community (manual, by Hamidreza)

- Reply to every relevant comment during business hours (drafted by Claude, approved before sending).
- 10–15 minutes a day of genuine engagement with target accounts (local shops, institutes, exhibition organisers). No automation, no follow/unfollow tactics. Claude never likes, follows or comments on other accounts.
- Case studies as collaborator posts with the client, only with written consent.
- Share each feed post to stories with one line of context.

## 10. Repurposing: one project, many units

- **Case study** → carousel (8–10 slides) + Reel walkthrough (45–60 s) + 2 story sequences (teaser, before/after) + highlight frames + a case-study page on the website.
- **Education carousel** → Reel (the same 3 points to camera) + a story quiz (stickers added manually in the app).

## 11. Never

- Buying followers, likes or comments; engagement pods; follow/unfollow automation; follower giveaways.
- Ads or boosted posts (the brief forbids advertising).
- Comment-to-DM automations, auto-DMs, broadcasts, cold DMs.
- Reposting others' work without permission and credit.
- Publishing anything without all four approval gates (`.claude/skills/approval-workflow/SKILL.md`).

## 12. Review loop

- **Weekly** (Saturday): report plus at most 3 actions (`analytics/reports/`).
- **Monthly** (1st of the Jalali month): pillar and format performance (saves, shares, profile visits and leads per pillar), best times, winning hooks; adjust the next cycle.
