---
name: canva-production
description: Produce Instagram designs for Hamidreza Falahi in Canva Free through the Canva connector - copy the right master pages, replace text, place redacted screenshots, preview, commit after approval, check Persian rendering and export PNGs, without Pro features or AI imagery. Use whenever approved copy needs a design, or the user says «کانوا»، «طراحی پست»، "make the slides", "build the design", "export", or asks to update a design in Canva.
---

# Canva production (Free plan)

## Preconditions

- The copy is **G2-approved** (front matter and `ops/approval-log.md`). Designing unapproved copy wastes the expensive step.
- Masters exist and are registered in `brand/canva-assets.md`. If they don't, stop and point Hamidreza to `brand/canva-master-build-sheet.md`. The connector can't set a font family, so masters are built by hand in the Canva editor.

## Registering new masters

When Hamidreza says the masters are ready («مسترها آماده است»):
1. `search-designs(query="MASTER")` plus `search-designs(query="BRAND BOARD")`; note each design ID.
2. `read-design` each one (`filter.fields: ["design_metadata","page_metadata","design_content"]`). Check page counts (Carousel 18, Story 10, Reel cover 2, Highlights 6), page sizes, and that every placeholder in build sheet §3 is present on the pages that need it.
3. Record the IDs, plus anything missing, in `brand/canva-assets.md`. Send Hamidreza a short list of fixes if any are needed.

## Allowed and blocked (enforced by `.claude/hooks/guard.mjs`)

- **Free and allowed:** `search-designs`, `read-design`, `copy-design`, `edit-design` (saving asks first), `export-design` (regular quality), `get-export-formats`, `create-folder`, `move-item-to-folder`, `list-folder-items`, `create-upload-url`, `upload-asset-from-url`, `help`.
- **Blocked:** `resize-design` (Magic Resize, Pro), `remove-background` (Pro), Brand Templates, `generate-image` and `create-video` (AI imagery is off-brand), Pro-quality export.
- **Asks first:** `create-design` / `generate-design` (Canva AI): only a throwaway layout sketch, never a final asset.

## Procedure

1. **Copy master pages:** `copy-design(design_id=<master>, page_numbers=[…])` with the page map from the content file's design spec. Each number appears once; the master holds duplicates. Story sequences take one page per frame: text frames from pages 1, 5, 6, 7; behind-the-scenes frames from pages 3, 8, 9, 10.
2. **Open and name:** `read-design(open_transaction=true, filter.fields=["design_content","thumbnails"])`, then `edit-design` with `update_title`, for example `IG-004 · 5 website mistakes`.
3. **Replace text.** Masters carry fixed placeholders («[تیتر]», «[متن]», `// KICKER`, `00/00` and the rest of build sheet §3); swap each exact string with `find_and_replace_text`, which keeps the master's font, size and colour. Copy the Persian exactly from the approved file rather than retyping it, so no half-space gets lost. If a title runs to extra lines, move the boxes below it with `position_element` (spacing rule in build sheet §4.2), and delete placeholders a slide doesn't use with `delete_element`.
4. **Images:** for each redacted screenshot, `create-upload-url`, then `curl -X POST --data-binary @<file> -H "Content-Type: application/octet-stream" "<upload_url>"`, then `update_fill(locator_id, asset_type="image", asset_id, alt_text)`.
5. **Preview before saving.** Check every page thumbnail yourself, then show them to Hamidreza. Commit (`finalize: "commit"`) only after Hamidreza says the preview is right; the guard asks as well.
6. **Rendering QA** on the thumbnails: Persian letters join correctly at every half-space, English terms aren't flipped, nothing crosses the margins or safe zones, no crown elements, cursor and kicker in place.
7. **G3:** send the design's view link and thumbnails, wait for explicit design approval («G3 تأیید IG-004»), and record it with `approval-workflow`.
8. **Export:** `get-export-formats`, then `export-design(format={type:"png"})` at regular quality. Download each page with curl to `assets/exports/<ID>/<ID>_s01.png` and so on.
9. **Record** `canva_design_id` and the export paths in the content file's front matter. Keep the design in the Canva folder `02 In production`, then `03 Approved` after G3.

## If Canva asks for payment

A premium element slipped in. Find it (crown icon), swap in a free equivalent and export again. Never start a trial or upgrade.
