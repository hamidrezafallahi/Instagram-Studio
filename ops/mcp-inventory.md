# MCP connection inventory

Inspected on **2026-11-09** with read-only calls only. Nothing was created, changed, published or sent.

## Connectors in this session

| Connector | ID | Status | Tools | Role here |
|---|---|---|---|---|
| Zernio | `8ca0a414-7010-44c3-8a62-e915245ed1a6` | connected | 54 (plus `call_tool` gateway) | Scheduling, analytics, inbox |
| Canva | `1a7936a8-5034-48a7-964f-95bc40ca5782` | connected | 45 | Design production (Free) |
| Composio | `023fd27d-b909-4d50-9ccc-d8ad00dd3a07` | connected | 12 | **Not used**, blocked by guard |
| Cloudflare Developer Platform | `df486e43-5424-4b59-a9c1-099b469f7679` | connected | 23 | Outside the stack (marked deprecated by its server) |
| Mobbin | `e648a2f6-5bbf-4b55-97e1-f2f4cf6a09fa` | connected | 8 | Outside the stack |
| Claude Docs | `1a59c906-04da-521d-bda7-7f71b9f9e01c` | connected | 8 | Not used |
| scheduled-tasks | `scheduled-tasks` | connected | 6 | Not used (guard asks) |
| Google Search Console plugin | `plugin:mcp-gsc:gsc` | **failed** (ECONNREFUSED) | — | Not needed; retry if website search data is wanted later |

If a connector is reinstalled, its ID changes: update `SERVER_IDS` in `.claude/hooks/guard.mjs` and the rules in `.claude/settings.json`. The guard also recognises Zernio and Canva by tool names, so a new ID stays covered in the meantime.

## Zernio

| Item | Result |
|---|---|
| Profile | `Default` · `6af15a16068cbf4a0057e509` |
| Instagram account | `@hamidrezafalahi.ir` · `6af15b88576d0f544103ea7a` · display name «حمیدرضا فلاحی \| طراحی سایت» |
| Health | healthy; can post; analytics supported and syncing (last sync 2026-11-09 05:35 UTC); token valid until **2027-01-08** |
| Plan | `Usage` (usage-based billing via Metronome), `balanceBilling: true`, `autoUpgradeEnabled: false`, has access, not suspended |
| Billing period | 2026-11-09 → 2026-12-01; accrued $0.00; credits $0.00; X spend cap not set (no X account) |
| Metered usage | Every product family $0 (accounts, numbers, messages, SMS, calls, X API, ads, credits) |
| Connected accounts | 1 (2 are free under usage-based billing) |
| Posts / queue | No posts in any status; no queue slots |
| Automations | No workflows, automations, comment-to-DM automations, broadcasts or sequences |
| Webhooks | None |
| Inbox | No comments, DMs or mentions yet |
| Analytics | 0 followers, 0 posts, no daily metrics, no best-time data yet (new account) |

**Pricing and limits (from Zernio's docs):** every feature included on usage-based billing, first 2 connected accounts free; posts unlimited (velocity caps 25/hour and 100/day per Instagram account); managed messages free up to 10,000 a month (without a card the send that would pass the limit fails with 403; with a card, overage is billed); managed ads metered after 500; Support Assistant billed per question; a card is required before a third account or any X account.

**Tool behaviours that shape the workflow:**
- `posts_create` (simple) schedules 60 minutes ahead unless `is_draft: true`, so it is denied without a draft flag.
- `posts_create_post` (via `call_tool`) supports `requires_approval: true` (post waits as *pending_approval* until approved via `posts_review_post` or the dashboard), `scheduled_for` and `timezone`, `is_draft`, per-image `altText`, Reel covers (`instagramThumbnail`) and Stories (`platformSpecificData.contentType: "story"`). A `scheduled_for` in the past publishes immediately, so the guard requires 30+ minutes of lead time.
- Updating a draft's time alone keeps it a draft; promotion needs `is_draft: false` with `scheduled_for`.
- Feed and carousel images accept ratios from 9:16 to 1.91:1; 4:5 (1080 × 1350) is recommended. Carousels hold up to 20 items, all at the first item's ratio. JPEG/PNG, 8 MB each.
- Interactive story stickers aren't available through the API, so those stories are posted manually.
- Media hosting: `media_get_media_presigned_url` → PUT the file → public URL; or `media_generate_upload_link` for a browser upload.
- Rate limits: 60 requests a minute (small teams); analytics endpoints about 6 per second. Comment and inbox lists are cached for about 10 minutes.

## Canva

| Item | Result |
|---|---|
| Brand Kits | None |
| Folders | Only the system `Uploads` folder |
| Designs | One: «کاروسل اینستاگرامی ۵ اشتباه وب‌سایت‌های کسب‌وکار» · `DAHaZQXIBYA` · 5 pages · 1080 × 1440 · created 2026-11-09 with Canva AI (rebuilt as content draft IG-004; see `brand/canva-assets.md`) |
| Free vs Pro (Canva Help Center answer) | Pro only: Brand Kit controls, custom fonts, Resize & Magic Switch, premium elements and templates (crown icon). Canva Free includes AI design tools (with limits). Paid content can show a watermark or a payment prompt at download. |
| Connector limitation | `edit-design` can change text, colour, size, position and images, but not a text element's font family, so masters are built by hand in the editor. |
