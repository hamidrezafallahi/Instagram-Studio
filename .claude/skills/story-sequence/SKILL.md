---
name: story-sequence
description: Plan Instagram story sequences (3-6 frames) for Hamidreza Falahi - frame copy, visuals from the story master, a sticker plan (poll, quiz, question, link), highlight placement and post mode (Zernio or manual). Use for «استوری»، «هایلایت»، polls, quizzes, Q&A, behind-the-scenes, teasers for a post, FAQ stories, or story versions of a case study, even when the user only says "something for stories".
---

# Story sequence

Stories build familiarity with people who already follow, and they collect the replies that turn into conversations.

## Read first

- The slot in the month plan; `brand/visual-identity.md` §4 (story safe zones) and §7 (`MASTER · Story`); `strategy/cta-library.md`
- Template: `content/templates/story.md`

## Procedure

1. **Goal and one CTA:** reply, vote, link tap, or DM keyword.
2. **Frames (3–6).** Frame 1 earns the next tap: a question, or a claim the next frame pays off. One short idea per frame, at most ~20 words. The last frame carries the CTA.
3. **Stickers.** Polls, quizzes, question boxes, link stickers and countdowns **cannot be added through the API**. If any frame needs one, set `post_mode: manual`: Claude prepares the frames and the exact sticker text, and Hamidreza posts them in the Instagram app at the slot time. Otherwise `post_mode: zernio`, one story post per frame.
4. **Links** carry UTM tags (`utm_campaign=story-<ID>`). Never put personal data in a URL.
5. **Highlight.** If the sequence is evergreen (services, FAQ, process, about), name the highlight it belongs to (`brand/instagram-profile.md`).
6. **QA** with `brand-voice-qa`, save to `content/01-drafts/<ID>_story_<slug>.md`, and ask for G2.

## Notes

- Light daily stories (a quick screenshot, a repost) don't count toward the mix and are usually posted by Hamidreza directly. If Claude prepares or schedules any story, it still goes through approval.
- Stories disappear after 24 hours. A frame that matters belongs in a highlight.
