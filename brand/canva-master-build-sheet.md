# Canva master build sheet

Step-by-step instructions for building the five master designs in **Canva Free**, with exact sizes, positions, fonts, colours and placeholder text. Time: about 90–120 minutes, once. Background: `brand/visual-identity.md`.

**Why it matters:** Claude produces every post by copying these master pages and replacing their **placeholder text** (§3) through the Canva connector. The connector can change text, colours, positions and images, but not fonts. So the fonts, sizes and layout you set here are what every future post inherits.

---

## 1. Before you start (15 min)

1. **Folders:** ✅ done on 2026-11-09. `Instagram Studio` with `00 Brand`, `01 Masters`, `02 In production`, `03 Approved`, `99 Archive` already exists in your Canva (IDs in `brand/canva-assets.md`).
2. **Font check:** create any design, add a text box, paste the test line below, and try each font. A font qualifies only if it shows **no crown**, joins Persian letters correctly at every half-space, and shows Persian digits.

   > می‌خواهم · نمی‌شود · کسب‌وکار · طراحی‌شده · سریع‌تر · پروژه‌ها · ۱۴۰۵ · ۲٫۵ ثانیه · «گیومه»

   | Role | Try in this order |
   |---|---|
   | Persian (all text) | Vazirmatn → Noto Sans Arabic → IBM Plex Sans Arabic |
   | Mono labels and code | JetBrains Mono → IBM Plex Mono → Roboto Mono → Space Mono |
   | Pull-quotes only | Noto Naskh Arabic → Amiri |

   Write the winners, and which weights Canva offers for them, in `brand/canva-assets.md` → *Font checks*. If the Persian font only offers Regular and Bold, use Bold wherever this sheet says ExtraBold or Black.
3. **Colours:** in the first master, open any colour picker → **+** → type each hex below. They then stay in *Document colors* for that design.

   | Name | Hex | Name | Hex |
   |---|---|---|---|
   | Ink | `#111315` | Stone | `#5E5A54` |
   | Paper | `#F4F1EA` | Mist | `#A8A39A` |
   | Signal | `#F2542D` | Hairline | `#D8D2C6` |
   | Graphite | `#24272B` | Proof | `#2A7050` |

4. **Guides (optional, helps a lot):** File → Settings → Show rulers and guides; then *Add guides* → custom: 6 columns, gutter 24, margin 96.
5. **Positioning:** select an element → **Position** → *Advanced* to type exact **W, H, X, Y** (X and Y are the top-left corner). All numbers below are pixels.

## 2. Text styles

Persian text: **align right, letter spacing 0**. Letter spacing breaks Persian letter joins. Mono and Latin text: align left, letter spacing as listed. "Paper colour" applies on light pages, "Ink colour" on dark pages.

| Style | Font, weight | Size | Line spacing | Letter spacing | Align | Colour on Paper | Colour on Ink |
|---|---|---|---|---|---|---|---|
| T-cover | Vazirmatn Black | 112 | 1.25 | 0 | right | Ink | Paper |
| T-title | Vazirmatn ExtraBold | 72 | 1.3 | 0 | right | Ink | Paper |
| T-title-s | Vazirmatn ExtraBold | 56 | 1.3 | 0 | right | Ink | Paper |
| T-sub | Vazirmatn Medium | 40 | 1.5 | 0 | right | Stone | Mist |
| T-body | Vazirmatn Regular | 40 | 1.65 | 0 | right | Ink | Paper |
| T-cta | Vazirmatn Bold | 40 | 1.45 | 0 | right | Ink (on a Signal box) | Ink (on a Signal box) |
| T-caption | Vazirmatn Regular | 28 | 1.5 | 0 | right | Stone | Mist |
| T-swipe | Vazirmatn Medium | 28 | 1.2 | 0 | right | Stone | Mist |
| T-metric | Vazirmatn Black | 220 | 1.0 | 0 | right | Signal | Signal |
| T-delta | Vazirmatn ExtraBold | 56 | 1.2 | 0 | right | Proof | Proof |
| T-quote | Noto Naskh Arabic Bold | 56 | 1.5 | 0 | right | Ink | Paper |
| T-kicker | JetBrains Mono Medium | 26 | 1.2 | 40 | left | Stone | Mist |
| T-counter | JetBrains Mono Medium | 26 | 1.2 | 40 | right | Stone | Mist |
| T-numeral | JetBrains Mono Bold | 120 | 1.0 | 0 | right | Signal | Signal |
| T-source | JetBrains Mono Regular | 24 | 1.3 | 20 | left | Stone | Mist |
| T-handle | JetBrains Mono Medium | 24 | 1.2 | 20 | left | Stone | Mist |
| T-code | JetBrains Mono Regular | 30 | 1.5 | 0 | left | n/a | Paper (on Graphite) |

Story and Reel-cover sizes are listed in their sections.

## 3. Placeholder vocabulary

Type these **exactly** as shown, square brackets included. Claude looks for them with find-and-replace, so a typo means the box gets missed.

| Placeholder | Meaning | Placeholder | Meaning |
|---|---|---|---|
| `// KICKER` | Mono label, top-left | `00/00` | Slide counter |
| `00` | Big numeral | «[تیتر]» | Title |
| «[زیرتیتر]» | Subtitle | «[متن]» | Body text |
| «[دعوت]» | CTA text in the Signal box | «[شرح تصویر]» | Figure caption |
| `[src]` | Source line | «[عدد]» | Big metric |
| «[واحد]» | Metric unit | «[تغییر]» | Metric change |
| «[برچسب]» | Metric label | «[فهرست]» | Story list line |
| `[code]` | Code card text | | |

Fixed text (same on every post): handle `@hamidrezafalahi.ir`, swipe cue «ورق بزنید ←».

## 4. MASTER · Carousel (1080 × 1350, 18 pages)

Create a design → **Custom size** 1080 × 1350 px → name it exactly `MASTER · Carousel`.

### 4.1 Frame (every page)

| Element | X | Y | W | H | Style or fill | Content |
|---|---|---|---|---|---|---|
| Background | 0 | 0 | 1080 | 1350 | Paper, or Ink on dark pages | |
| Kicker | 96 | 64 | 600 | auto | T-kicker | `// KICKER` |
| Counter | 784 | 64 | 200 | auto | T-counter | `00/00` (not on covers) |
| Header rule | 96 | 124 | 888 | 2 | Line, Hairline (Graphite on dark pages) | |
| Footer rule | 96 | 1226 | 888 | 2 | Same as header rule | |
| Handle | 96 | 1250 | 480 | auto | T-handle | `@hamidrezafalahi.ir` |
| Swipe cue | 600 | 1250 | 384 | auto | T-swipe | «ورق بزنید ←» (not on CTA pages) |

### 4.2 Pages

Build page 3 first, then duplicate it (page menu → *Duplicate page*, free) and adapt. To turn a page dark, change its background to Ink and switch each element to its "Colour on Ink" from §2.

| Page | Name (page title) | Background | Elements in addition to the frame |
|---|---|---|---|
| 1 | `01 cover-paper` | Paper | Title (T-cover) X 96, Y 340, W 888: «[تیتر]» · **Cursor**: rectangle 16 × 88, Signal, at the left end of the title's last line · Subtitle (T-sub) X 96, Y 900, W 888: «[زیرتیتر]» · no counter |
| 2 | `02 cover-ink` | Ink | Same as page 1, dark colours |
| 3 | `03 text-paper` | Paper | Numeral (T-numeral) X 784, Y 180, W 200: `00` · Title (T-title) X 96, Y 340, W 888: «[تیتر]» · Body (T-body) X 96, Y 580, W 888: «[متن]» |
| 4–8 | `04 text-paper` … `08 text-paper` | Paper | Exact duplicates of page 3 |
| 9–11 | `09 text-ink` … `11 text-ink` | Ink | Page 3, dark colours |
| 12 | `12 figure-ink` | Ink | Title (T-title-s) X 96, Y 180, W 888: «[تیتر]» · Frame card: rectangle X 96, Y 300, W 888, H 700, Graphite · Image: Canva *Frames* → square frame, X 120, Y 324, W 840, H 652 · Caption (T-caption) X 96, Y 1030, W 888: «[شرح تصویر]» · Source (T-source) X 96, Y 1090, W 888: `[src]` |
| 13 | `13 metric-ink` | Ink | Label (T-sub) X 96, Y 220, W 888: «[برچسب]» · Metric (T-metric) X 96, Y 320, W 888: «[عدد]» · Unit (T-title-s) X 96, Y 560, W 888: «[واحد]» · Change (T-delta) X 96, Y 660, W 888: «[تغییر]» · Context (T-body) X 96, Y 780, W 888: «[متن]» · Source (T-source) X 96, Y 1110, W 888: `[src]` |
| 14 | `14 before-after-ink` | Ink | Title (T-title-s) X 96, Y 180, W 888: «[تیتر]» · Label «قبل» (Vazirmatn Bold 32, Mist, right) X 552, Y 290, W 432 · Label «بعد» (same) X 96, Y 290, W 432 · Two cards (Graphite): X 552 and X 96, Y 340, W 432, H 760 · Two square frames: X 568 and X 112, Y 356, W 400, H 728 · Caption (T-caption) X 96, Y 1130, W 888: «[شرح تصویر]». «قبل» sits on the right because Persian reads right to left. |
| 15 | `15 code-ink` | Ink | Title (T-title-s) X 96, Y 180, W 888: «[تیتر]» · Code card: rectangle X 96, Y 300, W 888, H 760, Graphite · Code (T-code) X 136, Y 340, W 808: `[code]` · Caption (T-caption) X 96, Y 1100, W 888: «[شرح تصویر]» |
| 16 | `16 cta-paper` | Paper | Title (T-title) X 96, Y 340, W 888: «[تیتر]» · Body (T-body) X 96, Y 600, W 888: «[متن]» · CTA box: rectangle X 96, Y 900, W 888, H 180, Signal · CTA text (T-cta) X 144, Y 940, W 792: «[دعوت]» · delete the swipe cue and counter |
| 17 | `17 cta-ink` | Ink | Same as page 16, dark colours (the CTA box stays Signal with Ink text) |
| 18 | `18 figure-paper` | Paper | Page 12 on Paper: frame card in Paper with a 2 px Hairline border; caption and source in Stone |

**Spacing rule for posts:** the body starts 40 px below the title's last line, and the subtitle 64 px below the cover title. Claude moves boxes per post when a title runs to more lines; keep the masters at the positions above.

## 5. MASTER · Story (1080 × 1920, 10 pages)

Custom size 1080 × 1920 → name `MASTER · Story`. Instagram covers the top 250 px and bottom 340 px, so all text stays between Y 250 and Y 1580; side margins are 64.

Story sizes: title Vazirmatn Black **96** (line 1.25) · line Vazirmatn Medium **48** (line 1.5) · list Vazirmatn Regular **40**, Stone/Mist · CTA T-cta 40 · kicker mono **28** · handle mono **26**.

| Element (every story page) | X | Y | W | Content |
|---|---|---|---|---|
| Kicker | 64 | 260 | 600 | `// KICKER` |
| Handle | 64 | 1530 | 600 | `@hamidrezafalahi.ir` |

| Page | Name | Background | Elements |
|---|---|---|---|
| 1 | `01 text-paper` | Paper | Title X 64, Y 400, W 952: «[تیتر]» · Line X 64, Y 680, W 952: «[متن]» · List X 64, Y 900, W 952: «[فهرست]» · CTA box: rectangle X 64, Y 1300, W 952, H 150, Signal · CTA text X 112, Y 1340, W 856: «[دعوت]» |
| 2 | `02 question-ink` | Ink | Title X 64, Y 400, W 952: «[تیتر]» · Sticker card: rectangle X 140, Y 760, W 800, H 520, Graphite. The poll, quiz or question sticker goes on top in the Instagram app. |
| 3 | `03 bts-ink` | Ink | Card: rectangle X 64, Y 300, W 952, H 960, Graphite · Image: square frame X 88, Y 324, W 904, H 912 · Line X 64, Y 1300, W 952, Paper: «[متن]» |
| 4 | `04 link-paper` | Paper | Title X 64, Y 400, W 952: «[تیتر]» · Line X 64, Y 700, W 952: «[متن]» · Arrow `↓` (JetBrains Mono Bold 120, Signal, right) X 64, Y 1040, W 952 · leave Y 1200–1450 empty for the link sticker |
| 5–7 | `05 text-paper` … `07 text-paper` | Paper | Exact duplicates of page 1 |
| 8–10 | `08 bts-ink` … `10 bts-ink` | Ink | Exact duplicates of page 3 |

## 6. MASTER · Reel cover (1080 × 1920, 2 pages)

Custom size 1080 × 1920 → name `MASTER · Reel cover`. The profile grid shows Y 240–1680 and the feed may show Y 285–1635, so the title stays inside Y 300–1600.

| Element | X | Y | W | Style | Content |
|---|---|---|---|---|---|
| Kicker | 96 | 640 | 600 | JetBrains Mono Medium 28 | `// KICKER` |
| Title | 96 | 720 | 888 | Vazirmatn Black **110**, line 1.2, right | «[تیتر]» |
| Cursor | after the title | | 20 × 100 | Signal rectangle | |
| Handle | 96 | 1480 | 600 | T-handle | `@hamidrezafalahi.ir` |

Page 1 `01 cover-ink` (Ink background, Paper title). Page 2 `02 cover-paper` (Paper background, Ink title).

## 7. MASTER · Highlights (1080 × 1920, 6 pages)

Instagram crops highlight covers to a small circle, so keep everything inside the centre (X 190–890, Y 610–1310). All pages: Ink background.

| Element | X | Y | W | Style |
|---|---|---|---|---|
| Numeral | 290 | 700 | 500 | JetBrains Mono Bold 160, Signal, centred |
| Label | 190 | 900 | 700 | Vazirmatn ExtraBold 140, Paper, centred |

| Page | Numeral | Label | Highlight title in Instagram |
|---|---|---|---|
| 1 | `01` | «خدمات» | خدمات |
| 2 | `02` | «نمونه‌کار» | نمونه‌کار |
| 3 | `03` | «فرایند» | فرایند همکاری |
| 4 | `04` | «سؤالات» | سؤالات رایج |
| 5 | `05` | «نظرها» | نظر مشتری‌ها |
| 6 | `06` | «درباره» | درباره من |

## 8. BRAND BOARD (1080 × 1350, 1 page)

Custom size 1080 × 1350 → name `BRAND BOARD` → save in `00 Brand`. It's the reference you copy styles from (Canva's free *Copy style* tool).

| Element | Position | Content |
|---|---|---|
| Frame | as §4.1 | Kicker `// BRAND BOARD`, counter `v1 · 2026-11` |
| Title (T-title, 64) | X 96, Y 180, W 888 | «سیستم بصری حمیدرضا فلاحی» with the Signal cursor after it |
| Swatches | 8 squares, 180 × 180; X 96, 332, 568, 804; Y 340 (row 1) and 640 (row 2) | Row 1: Ink, Paper, Signal, Graphite · Row 2: Stone, Mist, Hairline, Proof. Give Paper and Hairline a 2 px Stone border so they stay visible |
| Swatch labels (T-source) | under each square (Y + 196) | `Ink #111315`, … |
| Type specimens | X 96, from Y 900, W 888 | «سایت را مهندسی می‌کنم» (Vazirmatn Black 56) · the font-check line from §1 (Vazirmatn Regular 32) · `// CASE STUDY 01 · 02/07` (T-kicker) · «سایت ویترین کسب‌وکار است» (T-quote, 40) |

## 9. Build order (fastest path)

1. `BRAND BOARD` (sets your document colours and confirms fonts).
2. `MASTER · Carousel`: page 3 → duplicate into pages 1, 2, 4–18 → reorder in grid view so the page numbers match §4.2 → add page titles.
3. `MASTER · Story`: page 1 → pages 2–4 → duplicate pages 1 and 3 for 5–10.
4. `MASTER · Reel cover`, then `MASTER · Highlights`.
5. Optionally lock the rules and backgrounds (Lock is free). **Don't lock text placeholders**: Claude has to edit them.
6. Take screenshots while you build: they are the visuals for IG-S02 (`assets/brand/bts/`).

## 10. Final checks, then hand over to Claude

- [ ] Five designs with the exact names above, all in `01 Masters` (`BRAND BOARD` in `00 Brand`).
- [ ] Page counts: Carousel 18 · Story 10 · Reel cover 2 · Highlights 6.
- [ ] No crown anywhere (use the *Free* filter when searching elements). Export one page of each design as PNG: no watermark, no payment prompt.
- [ ] Persian text right-aligned with 0 letter spacing; half-spaces render correctly on every page.
- [ ] Every placeholder from §3 typed exactly.
- [ ] Font results written in `brand/canva-assets.md`.

Then tell Claude «مسترها آماده است» ("masters are ready"). Claude finds the designs with `search-designs`, records their IDs in `brand/canva-assets.md`, and checks each one with `read-design`: page count, page size and every placeholder present. Anything missing comes back to you as a short list before the first post is built.
