---
name: carousel
description: Write Instagram carousel posts for Hamidreza Falahi in the brand voice - brief, slide-by-slide Persian copy (7-10 slides), caption, alt text, Canva master-page spec and review notes, saved as a content file in the pipeline. Use for any carousel or multi-image post, «کاروسل»، «اسلاید»، checklists, guides, mistake lists, comparisons, or when turning a topic, idea, project or the old Canva draft into a swipeable post. Also use to revise a carousel after feedback.
---

# Carousel

A carousel earns saves and shares by giving the reader something they can use: a test, a checklist, a decision rule, or proof. Reference implementation: `content/01-drafts/IG-004_carousel_5-website-mistakes.md`.

## Read first

- The slot in the current `calendar/.../month-plan.md` (ID, pillar, persona, topic, CTA)
- `brand/voice-and-tone.md`, `brand/terminology.md`, `brand/visual-identity.md` §3–§7
- `strategy/cta-library.md`, `strategy/hashtag-bank.md`
- Template: `content/templates/carousel.md`. For a case study, start with the `case-study` skill.

## Procedure

1. **Brief.** Fill the five fields: persona, problem (in the persona's words), takeaway, proof, one primary CTA. If you can't name the proof, the post isn't ready. Say so instead of padding.
2. **Arc.** Slide 1 hook → setup or first point → value slides (one idea each) → proof → last slide CTA. 7 slides by default; 10 is about the most people swipe.
3. **Hook slide.** Specific, with tension or a number: «۵ اشتباهی که بی‌سروصدا مشتری را فراری می‌دهد» beats «نکات طراحی سایت». Title of 9 words or fewer, plus a one-line subtitle that promises the payoff.
4. **Value slides.** Title of 8 words or fewer, at most ~35 words of body. Where it fits, end with a «تست:» the reader can do in about a minute. That one move turns advice into something people save.
5. **Proof.** A real screenshot, a sourced number, or a correctly cited public standard. Every number traces to `projects/` or a named standard.
6. **CTA slide.** The same single CTA as the caption.
7. **Caption** with the `persian-caption` skill. **Alt text:** one Persian line per slide describing what is on it.
8. **Design spec.** Map each slide to a `MASTER · Carousel` page number (`brand/visual-identity.md` §7). Use each page number once; the master holds duplicate text pages for exactly that reason. Choose the Paper or Ink theme to keep the grid rhythm.
9. **Review notes.** List every claim Hamidreza must confirm (experience claims, promises such as "I answer every comment") and every open question.
10. **QA** with the `brand-voice-qa` skill (it runs `node tools/voice-lint.mjs`). Fix every error; resolve or explain each warning.
11. **Save** as `content/01-drafts/<ID>_carousel_<slug>.md`, move it to `02-in-review/`, and ask for G2, showing the slides compactly in chat.

## Rules that matter

- Persian first; English only for technical names and terms as listed in `brand/terminology.md`.
- No prices, delivery dates, guarantees, or client names without recorded consent.
- Don't build the design before G2. Copy changes are cheap in Markdown and expensive in Canva.
