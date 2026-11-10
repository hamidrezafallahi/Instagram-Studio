---
name: brand-voice-qa
description: Quality-check any Persian copy for Hamidreza Falahi before it goes to review or to the public - run the Persian typography and banned-phrase linter, then a human-level voice, claims and persona check, and write the findings into the file's review notes. Use before every G2 approval request and whenever the user asks to proofread or edit («ویرایش»، «غلط‌گیری»), asks "does this sound right" or "make it less AI", or wants a caption, slide, script, reply or bio checked, including copy pasted from elsewhere.
---

# Brand voice QA

## 1. Mechanical pass

Run `node tools/voice-lint.mjs <file>`. It catches Arabic yeh and kaf (U+064A, U+0643), kashida, Arabic digits, missing half-spaces (می‌، ها، تر/ترین), Latin punctuation and straight quotes in Persian, missing spaces around «گیومه», Latin digits inside Persian text, banned phrases, and the caption rules (3–5 hashtags, no half-space in a tag, at most 2 emojis and 1 «!», 2,200-character limit, a hook of about 125 characters). For pasted text, save it to a scratch file first and lint that.

- **Errors** get fixed.
- **Warnings** need a decision: fix it, or note in the review notes why it stays (for example, a client's verbatim quote).

## 2. Human pass (what the linter can't judge)

- **Voice:** precise, confident without hype, human, generous (`brand/voice-and-tone.md` §2). Read it aloud: does it sound like Hamidreza explaining, or like a brochure?
- **Claims:** every number has a source and a date; experience claims ("I see this a lot") are flagged for Hamidreza to confirm; no guarantees, prices or dates.
- **Persona fit:** the problem is named the way that persona would say it (`strategy/audience-personas.md`).
- **Structure:** a hook that stands alone, one idea per slide or beat, exactly one CTA, matched to the funnel stage.
- **Terms:** English only where `brand/terminology.md` allows it, explained once for non-technical readers.
- **Consent and privacy:** no client names, data or screenshots beyond the project's recorded consent level.

## 3. Output

Add to the file's `## Review notes`: the lint result (errors, warnings), what you changed, and the open questions for Hamidreza. Update the front matter `lint` field. Only then ask for approval.
