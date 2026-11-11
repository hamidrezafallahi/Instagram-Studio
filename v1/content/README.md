# Content pipeline

Every piece of content is one Markdown file that moves through stage folders. **The folder is the status.** Approvals are recorded in the file's front matter *and* in `ops/approval-log.md`, only from Hamidreza's explicit chat messages.

## Stages

| Folder | Status | Enters when | Leaves when |
|---|---|---|---|
| `00-ideas/` | idea | An idea is logged in `backlog.md` | It gets a slot in an approved cycle plan (G1) and a file in `01-drafts/` |
| `01-drafts/` | draft | Claude writes the copy | Self-QA passes: `node tools/voice-lint.mjs <file>` shows 0 errors |
| `02-in-review/` | in-review | Waiting for Hamidreza (G2 copy, then G3 design) | Approved, or back to drafts with notes |
| `03-approved/` | approved | G2 and G3 both approved | G4 approved and a pending-approval post exists in Zernio |
| `04-scheduled/` | scheduled | The Zernio post exists (pending_approval, then scheduled once Hamidreza approves it in Zernio) | It is live |
| `05-published/` | published | Live on Instagram | Metrics captured at D+7, then status `archived` |

**Any edit after approval sends the file back to `02-in-review/`.** Approval covers the exact text, design and time that were shown.

## IDs and file names

- Feed posts: `IG-001`, `IG-002` … Story sequences: `IG-S01` … IDs are never reused.
- File: `<ID>_<format>_<slug>.md`, for example `IG-004_carousel_5-website-mistakes.md`.
- Exports: `assets/exports/<ID>/<ID>_s01.png` (carousel slides), `<ID>_f01.png` (story frames), `<ID>_cover.png`, `<ID>_reel.mp4`.

## Front matter schema

```yaml
---
id: IG-004
title: "…"
format: carousel            # reel | carousel | story | single
pillar: education           # case-study | education | service | process | personal
persona: [ALL]              # EC | ED | CO | WA | ALL
funnel: awareness           # awareness | consideration | conversion | connection
status: draft               # idea | draft | in-review | approved | scheduled | published | archived
cycle: "01"
slot_date: 1405-09-07       # Jalali
slot_date_gregorian: 2026-11-28
slot_time: "20:30"          # Asia/Tehran
post_mode: zernio           # zernio | manual (stories with stickers)
cta_keyword: ""             # DM keyword from strategy/cta-library.md, if any
topic_id: T-EDU-01
project: ""                 # projects/<slug> (case studies)
canva_design_id: ""
media: []                   # Zernio-hosted media URLs, in slide order
zernio_post_id: ""
approvals:                  # only from Hamidreza's explicit messages (ops/approval-log.md)
  g1_brief: { at: "", ref: "" }
  g2_copy: { at: "", ref: "" }
  g3_design: { at: "", ref: "" }
  g4_schedule: { at: "", ref: "", scheduled_for: "" }
  zernio_review: { at: "", by: "" }
lint: { errors: null, warnings: null, run_at: "" }
---
```

## Body sections

1. `## Brief`: persona, problem, takeaway, proof, CTA
2. Copy: `## Slides` (carousel) · `## Script` (Reel) · `## Frames` (story)
3. `## Caption`: hook line, body, one CTA, 3–5 hashtags (the linter checks this section)
4. `## Alt text`: one line per image (Zernio sends it to Instagram feed images)
5. `## Design spec`: master pages, assets, notes
6. `## Review notes`: claims to confirm, open questions for Hamidreza
7. `## Change log`

Templates: `content/templates/`. Skills that write these files: `carousel`, `reel-script`, `story-sequence`, `persian-caption`, `case-study`.
