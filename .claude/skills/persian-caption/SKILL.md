---
name: persian-caption
description: Write and polish Persian Instagram captions for Hamidreza Falahi - a standalone hook line, a value body, exactly one CTA from the library and 3-5 targeted hashtags, with correct Persian typography. Use whenever a post needs a caption, or the user asks for «کپشن»، «هشتگ»، a hook, a CTA, a shorter or punchier version, or says copy "sounds like AI". The carousel, reel-script and case-study skills use it too.
---

# Persian caption

## Read first

`brand/voice-and-tone.md` (all of it), `strategy/cta-library.md`, `strategy/hashtag-bank.md`, and the post's brief.

## Structure

1. **Hook line**, about 125 characters at most (what the feed shows before "more"). It has to work alone: the problem, a specific promise, or a surprising fact. No warm-up.
2. **Body.** What the visuals don't fully deliver: the why, a short list with Persian digits, or the story. Short paragraphs with blank lines between them.
3. **One CTA** from the library, matched to the funnel stage. An education post may add a soft "save" line.
4. **Hashtags:** 3–5 from the bank, at the very end, with no half-space inside any tag.

Typical length: education 600–1,200 characters, case study up to ~1,500, Reels 200–600. Instagram's hard limit is 2,200.

## Procedure

1. Write two hook-line options. Put the recommended one in the caption and the other in the review notes for Hamidreza.
2. Use the main search phrase naturally once (Instagram search reads captions), for example «طراحی سایت فروشگاهی».
3. Check: one CTA, at most 2 emojis, at most 1 exclamation mark, no banned phrases, no unsourced numbers.
4. Run `node tools/voice-lint.mjs <file>`. It checks the `## Caption` section for hashtag count, half-spaces in tags, emojis, exclamation marks, total length and hook length.

## Example (IG-004)

> سایت‌تان بازدید دارد ولی پیام و سفارش نه؟ معمولاً مشکل از یکی از این پنج مورد است.

A specific problem and a promise, 85 characters, no hype.
