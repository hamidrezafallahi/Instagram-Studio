# Visual identity: "The Engineering Notebook"

> **Concept:** every post looks like a page from a well-designed technical journal: large Persian headlines, generous margins, visible structure (hairlines, numbered sections, mono labels) and **real work as the hero** (screenshots, code, metrics), framed as figures with captions. Calm, precise, unmistakably an engineer's work, and nothing like a generic template.
> Built entirely with **Canva Free**. Never use an element, font, photo or template with the crown icon.

## 1. Principles

1. **Proof is the picture.** Real screenshots, real code, real numbers. No stock "laptop on a desk", no AI-generated imagery, no fake dashboards.
2. **One idea per slide.** Big type, lots of air. If a slide needs a scroll of text, it is two slides.
3. **Visible structure.** Hairlines, a 6-column grid, numbered sections and figure captions signal engineering precision.
4. **Restraint.** Two base colours, one accent. No gradients, glows, glassmorphism, 3D blobs or emoji in designs.
5. **RTL first.** Persian text is right-aligned; reading flows right to left; the swipe cue points left («ورق بزنید ←»).

## 2. Colour

| Token | Hex | Role | Contrast (WCAG) |
|---|---|---|---|
| **Ink** | `#111315` | Primary text on Paper; dark backgrounds | 16.51:1 on Paper |
| **Paper** | `#F4F1EA` | Primary light background (warm off-white) | 16.51:1 on Ink |
| **Signal** | `#F2542D` | The single accent: key word, big numbers, the cursor, CTA button | 5.39:1 on Ink; **3.06:1 on Paper, large text only (≥ 48 px bold)** |
| **Graphite** | `#24272B` | Cards and figure frames on Ink slides | Paper on it 13.30:1 |
| **Stone** | `#5E5A54` | Secondary text and captions on Paper | 6.07:1 on Paper |
| **Mist** | `#A8A39A` | Secondary text on Ink and Graphite | 7.42:1 on Ink, 5.98:1 on Graphite |
| **Hairline** | `#D8D2C6` | Rules and borders on Paper (decorative only) | 1.33:1 |
| **Proof** | `#2A7050` | Positive deltas in case-study metrics only (▲) | 5.27:1 on Paper |

Rules:
- Signal covers at most about 10% of any slide. One Signal element per slide is the default.
- CTA button: Signal fill with **Ink** text (5.39:1). Never Paper text on Signal at small sizes.
- Two themes: **Paper** (education, services) and **Ink** (case studies, process, Reel covers: screenshots read better on dark).

## 3. Typography (Canva Free)

Check each font on first use: it must show no crown, must shape Persian correctly, and must render half-spaces (ZWNJ). Record the result in `brand/canva-assets.md`.

| Role | Primary | Fallbacks |
|---|---|---|
| Persian headlines | **Vazirmatn** 800–900 | Noto Sans Arabic Black, IBM Plex Sans Arabic Bold |
| Persian body | **Vazirmatn** 400–500 | Noto Sans Arabic Regular |
| Editorial accent (pull-quotes, testimonials only) | **Noto Naskh Arabic** Bold | Amiri Bold |
| Mono labels, counters, code, metrics labels | **JetBrains Mono** 500 | IBM Plex Mono, Roboto Mono, Space Mono |

**Scale for feed posts (1080 × 1350):**

| Element | Font | Size (px) | Line height | Limit |
|---|---|---|---|---|
| Cover title | Vazirmatn 900 | 104–128 | 1.25 | ≤ 9 words |
| Slide title | Vazirmatn 800 | 64–80 | 1.3 | ≤ 8 words |
| Body | Vazirmatn 400/500 | 38–44 | 1.65 | ≤ 35 words per slide |
| Big metric | Vazirmatn 900, Persian digits | 180–240 | 1.0 | One per slide |
| Kicker and counter | JetBrains Mono 500 | 24–28 | 1.4 | `// CASE STUDY` · `02/07` |
| Figure caption | Vazirmatn 400, Stone | 26–30 | 1.5 | One line |
| Minimum text size | | 28 (Persian), 24 (mono labels) | | Nothing smaller |

Stories and Reel covers (1080 × 1920): title 88–110 px, body 44–52 px.

## 4. Grid and safe zones

**Feed post and carousel: 1080 × 1350 (4:5)**, the size Zernio recommends for Instagram feed. Every slide of a carousel uses the same size.

- Margins: 96 px left and right, 120 px top and bottom. The profile grid shows a 3:4 crop (about 34 px off each side), which these margins absorb.
- 6 columns, 24 px gutters inside the 888 px live area.
- Header band (text at y 64, 2 px hairline at y 124): mono kicker at top-left (LTR box), mono counter `02/07` at top-right.
- Footer band (hairline at y 1226, text at y 1250): `@hamidrezafalahi.ir` in mono at left, swipe cue «ورق بزنید ←» at right; no swipe cue on the last slide.

**Story: 1080 × 1920.** Keep text out of the top 250 px and bottom 340 px (Instagram UI). Side margins 64 px.

**Reel cover: 1080 × 1920.** The profile grid shows the centre 3:4 area (y 240–1680) and the feed may show a 4:5 crop (y 285–1635). Keep the title inside y 300–1600.

## 5. Signature elements

1. **The cursor.** A small Signal block (about 16 × 72 px at cover size) right after the last word of a cover title, at the left end of the line in RTL: a text cursor, the engineer's mark. Covers only.
2. **Mono kicker.** Code-comment style label: `// GUIDE`, `// CASE STUDY 01`, `// SERVICE`, `// PROCESS`, `// NOTES`, optionally with a segment: `// CASE STUDY · ECOMMERCE`. Persian alternative if preferred: «مطالعهٔ موردی ۰۱».
3. **Figures.** Every screenshot sits in a Graphite (on Ink) or Hairline-bordered (on Paper) frame with a caption: «تصویر ۰۲ — صفحهٔ محصول، نسخهٔ موبایل» plus a mono source line `src: staging · 2026-10`.
4. **Numbered points.** List items use a large mono numeral in Signal (`01`, `02`) beside a Persian title.
5. **Hairlines.** 2 px rules separate header, body and footer.

## 6. Imagery

**Use:**
- Real screenshots captured at 2× and cropped to the relevant area; mobile screenshots for mobile points.
- Simple flat browser or phone frames drawn with Canva shapes (no premium mock-ups).
- Real photos of Hamidreza and the workspace, natural light, consistent warm grade.
- Screen recordings for Reels (desktop and phone), real code in a mono code card.

**Never:**
- AI-generated images or illustrations, stock photos of people or handshakes.
- Client data on screen: names, phone numbers, emails, addresses, order IDs and confidential prices are blurred or replaced before upload (`assets/README.md`).
- Neon gradients, glossy 3D, emoji in designs, lorem ipsum, fake UI.

## 7. Formats and master pages

Build these once in Canva as normal designs (Canva Free has no Brand Templates). Every post starts from a copy of a master, never from Canva's template gallery. Exact positions, sizes, styles and placeholder text: `brand/canva-master-build-sheet.md`.

| Master design | Size | Pages |
|---|---|---|
| `MASTER · Carousel` | 1080 × 1350 | 1 cover (Paper) · 2 cover (Ink) · 3–8 text (Paper, six identical copies) · 9–11 text (Ink, three copies) · 12 figure / screenshot (Ink) · 13 big metric · 14 before/after split · 15 code card · 16 closing CTA (Paper) · 17 closing CTA (Ink) · 18 figure (Paper) |
| `MASTER · Story` | 1080 × 1920 | 1 text (Paper) · 2 question or poll placeholder (Ink) · 3 behind-the-scenes photo (Ink) · 4 link-out (Paper) · 5–7 copies of page 1 · 8–10 copies of page 3 |
| `MASTER · Reel cover` | 1080 × 1920 | 1 Ink · 2 Paper |
| `MASTER · Highlights` | 1080 × 1920 | 6 covers: mono label on Ink (`01 خدمات` …) |
| `BRAND BOARD` | 1080 × 1350 | Palette with hex values, type specimens, cursor and kicker samples |

Record each design ID in `brand/canva-assets.md` once created.

**Why duplicate pages:** the Canva connector copies whole pages (`copy-design` with `page_numbers`) and can replace text, colours and images, but it **cannot change a text element's font family**. So Hamidreza builds the masters once in the Canva editor with the right fonts, and Claude assembles each post by copying the needed master pages (each page number once) and replacing their text and images.

## 8. Canva Free workflow and limits

- Not available on Free, so never planned around: Brand Kit controls, Brand Templates, Magic Resize (Resize & Magic Switch), Background Remover, custom font upload, premium stock, Pro-quality export.
- Brand consistency without Brand Kit: copy from the master pages; use the free **Copy style** tool from the Brand Board; type hex values manually.
- AI generation (Canva AI / Magic Design) is never used for final assets. A rough layout sketch is allowed only with approval; the final design is always rebuilt on a master.
- Export: PNG, regular quality, at the design size (1080 × 1350 or 1080 × 1920). JPEG or PNG, under 8 MB per image.
- If Canva asks for payment at export, a premium element slipped in: replace it with a free one. Never start a Pro trial (trials convert to paid).

## 9. Profile grid rhythm

Alternate themes so the grid reads as a deliberate pattern: case studies and Reel covers on Ink, education and services on Paper. The three pinned posts stay at the top (`brand/instagram-profile.md`). Before scheduling, preview the next 9 tiles together.

## 10. First-time setup checklist (about 90 minutes in Canva)

- [x] Create folders: `Instagram Studio / 00 Brand · 01 Masters · 02 In production · 03 Approved · 99 Archive` (done 2026-11-09).
- [ ] Build `BRAND BOARD`; verify all four fonts (no crown, Persian shaping, ZWNJ).
- [ ] Build the masters in §7 with free elements only, following `brand/canva-master-build-sheet.md`; export one test PNG of each.
- [ ] Record design IDs and font checks in `brand/canva-assets.md`.
- [ ] Rebuild the legacy draft `DAHaZQXIBYA` on the carousel master (see `content/01-drafts/IG-004_carousel_5-website-mistakes.md`).
