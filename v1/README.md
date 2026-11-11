# Instagram Studio · حمیدرضا فلاحی

استودیوی محتوای اینستاگرام [@hamidrezafalahi.ir](https://instagram.com/hamidrezafalahi.ir): برنامه‌ریزی، نوشتن، طراحی، تأیید، زمان‌بندی، پاسخ به پیام‌ها و گزارش، با Claude و فقط با ابزارهای رایگان. **هیچ چیزی بدون تأیید صریح شما منتشر یا ارسال نمی‌شود.**

An Instagram content studio run with Claude Code, Zernio (scheduling, analytics, inbox) and Canva Free. Operating manual for Claude: [CLAUDE.md](CLAUDE.md).

## How a post gets made

```
Idea → G1 brief (approved cycle plan) → draft copy → G2 copy approval
     → Canva design from masters → G3 design approval
     → G4 schedule approval → pending post in Zernio → you approve in Zernio → live
```

Approve in chat by naming the ID and the gate, for example «G2 تأیید IG-004» or «زمان‌بندی IG-004 برای ۷ آذر ساعت ۲۰:۳۰ تأیید».

## Things to ask Claude (examples)

| Ask | What happens |
|---|---|
| «برنامهٔ محتوای ماه بعد را آماده کن» | A 4-week plan with the 30/25/20/15/10 mix (`content-calendar`) |
| «یک کاروسل برای آموزشگاه‌ها دربارهٔ ثبت‌نام آنلاین بنویس» | A draft carousel file (`carousel`) |
| «اسکریپت ریلز IG-002 را بنویس» | A Reel script with shot list (`reel-script`) |
| «کامنت‌ها و دایرکت‌های امروز را بررسی کن» | Triage log and reply drafts, nothing sent (`inbox-triage`) |
| «ارسال R1 و R3» | Sends only those approved replies (`inbox-triage`) |
| «گزارش هفتگی» | Weekly report with at most 3 actions (`analytics-report`) |
| «همه‌چیز هنوز رایگان است؟» | Free-tier audit (`free-tier-audit`) |

## Repository map

| Folder | What's inside |
|---|---|
| `brand/` | Positioning, voice, terminology, visual identity, profile setup, Canva registry |
| `strategy/` | Content strategy, personas, pillars and topic bank, hashtags, CTAs, KPIs |
| `calendar/` | Cycle and weekly plans, templates |
| `content/` | The pipeline: ideas → drafts → review → approved → scheduled → published |
| `projects/` | Real projects and consent records (source of truth for case studies) |
| `assets/` | Brand photos, redacted screenshots, exports |
| `inbox/` | Reply playbook and daily triage logs |
| `leads/` | Lead pipeline and qualification rubric |
| `analytics/` | Baseline, metrics log, reports |
| `ops/` | Guardrails, connector inventory, approval log, free-tier audit log |
| `tools/` | Date, lint and hash scripts |
| `.claude/` | Skills, guard hook, settings |
| `reports/` | Setup and implementation reports |

## Safety in one paragraph

A guard hook (`.claude/hooks/guard.mjs`) checks every connector call. It **blocks** instant publishing, paid features, automations, cold DMs and Canva Pro/AI imagery. It **asks you** before any draft, schedule or reply. Even an approved schedule only creates a *pending-approval* post that waits for your click in Zernio. Details: [ops/guardrails.md](ops/guardrails.md).
