# Voice and tone

> Persian-first, with English technical terms. Professional, confident, technically accurate, human and conversational. **No generic AI marketing language.**
> The mechanical rules below are checked by `node tools/voice-lint.mjs <file>`; the banned-phrase list lives in `tools/voice-lint.config.json`. Keep both in sync.

## 1. The voice in one sentence

A senior engineer explaining a business problem to a smart owner over coffee: calm, specific, honest about trade-offs, and always one step closer to a decision.

## 2. Four traits

<!-- lint:off -->

| Trait | Means | Do | Don't |
|---|---|---|---|
| **Precise** (دقیق) | Exact terms, real numbers, named tools | «اگر LCP صفحه بیشتر از ۲٫۵ ثانیه باشد، گوگل سرعتش را «خوب» حساب نمی‌کند.» | «سایت شما خیلی کند است و مشتری‌ها فرار می‌کنند.» |
| **Confident, not loud** (با اعتمادبه‌نفس، بی‌اغراق) | States what works and what doesn't, without superlatives | «برای فروشگاهی با ۲۰ محصول، WooCommerce کافی است؛ اختصاصی‌نویسی هزینهٔ اضافه است.» | «بهترین و حرفه‌ای‌ترین سایت‌ها را می‌سازیم!» |
| **Human** (انسانی) | First person, real moments, real mistakes | «در اولین فروشگاهی که ساختم، مرحلهٔ پرداخت را دست‌کم گرفتم. این چیزی است که یاد گرفتم.» | «تیم متخصص و مجرب ما در خدمت شماست.» |
| **Generous** (سخاوتمند) | Gives a usable test, checklist or decision rule in every post | «تست ۵ ثانیه: صفحهٔ اول را ۵ ثانیه به یک غریبه نشان بدهید…» | Teasing value and hiding it behind a DM |

<!-- lint:on -->

## 3. Register by format

| Format | Register | Notes |
|---|---|---|
| Carousel slides | Standard written Persian, very short | One idea per slide, at most ~35 words |
| Captions | Semi-formal, flowing | Standard grammar, conversational rhythm; no bureaucratic words |
| Reels voiceover | Light spoken Persian | «بیاید ببینیم چرا…» is fine; slang is not |
| Stories | Spoken, warmer, still respectful | Short lines, questions to the audience |
| DMs and comment replies | Polite, short, personal | Always «شما»; answer first, then one question |

Address the reader as **«شما»**. Write as **«من»**. «ما» only for "me and the client" or a real, named collaborator.

## 4. Sentence craft

- Lead with the reader's problem or the surprising fact, never with a warm-up.
- One idea per sentence. Aim for 20 words or fewer.
- Concrete nouns, active verbs, real numbers. «سفارش‌های دایرکتی» beats «فرایندهای فروش».
<!-- lint:off -->
- Prefer plain verbs to bureaucratic ones: «است» not «می‌باشد», «کردن» not «نمودن», «برای» not «جهت», «شد» not «گردید».
<!-- lint:on -->
- End every piece with exactly **one** primary call to action from `strategy/cta-library.md`.

## 5. Persian typography (checked by the linter)

<!-- lint:off -->
- Persian letters only: «ی» and «ک», never Arabic «ي» / «ك».
<!-- lint:on -->
- Half-space (ZWNJ, U+200C) where Persian needs it: می‌شود، نمی‌خواهم، کسب‌وکار، وب‌سایت، پروژه‌ها، سریع‌تر، طراحی‌شده.
- Persian digits in Persian text: ۱۴۰۵، ۲٫۵ ثانیه، ۴۰٪. Latin digits only in code, URLs, version numbers and mono design labels (`02/07`).
- Persian punctuation: «،» «؛» «؟» and «گیومه». No space before punctuation, one space after.
<!-- lint:off -->
- Never stretch words with kashida «ـ», and never justify Persian text in Canva. Align right.
<!-- lint:on -->
- Hashtags never contain a half-space (it breaks the tag): `#کسب_و_کار`, not `#کسب‌وکار`.
- Mixed Persian/English lines: check the rendering. Avoid starting or ending a Persian line with an English term in designs; English terms keep their original casing (Next.js, SEO, API).

## 6. English technical terms

Keep the Latin spelling for product, framework and protocol names and established acronyms (React, Next.js, WordPress, API, SEO in technical context, Core Web Vitals). Use the established Persian word for general concepts (سرعت بارگذاری، درگاه پرداخت، سازگار با موبایل). For a non-technical audience, explain an English term the first time it appears in a post. Full list: `brand/terminology.md`.

## 7. Claims and proof

- Every number needs a source and a date (project file, analytics export, public standard). If it isn't in `projects/` or `analytics/`, it doesn't go in a post.
- General claims are softened honestly: «معمولاً»، «در بیشتر پروژه‌هایی که دیده‌ام» (only if true).
- No guarantees, rankings, "best", "cheapest", "100%" unless a written, real guarantee exists.
- Public standards are fine when cited correctly (for example, Google's Core Web Vitals: LCP of 2.5 s or less is "good").
- Testimonials are quoted verbatim, with the client's permission recorded.

## 8. Emojis, punctuation, hashtags

- Captions: at most 2 functional emojis (→ ✓ 📌). None inside designs.
- At most one exclamation mark per caption. Zero is usually better.
- 3–5 targeted hashtags at the end of the caption (`strategy/hashtag-bank.md`). Never in the design.

## 9. Banned phrases (main list)

Full machine-readable list with suggested fixes: `tools/voice-lint.config.json`.

<!-- lint:off -->

| Banned | Why | Instead |
|---|---|---|
| «در دنیای امروز»، «در عصر دیجیتال»، «دنیای پررقابت» | Empty AI-style opener | Open with the reader's specific problem |
| «کسب‌وکارتان را متحول کنید»، «به سطح بعدی ببرید»، «تحول دیجیتال» | Vague promise | A specific, measurable outcome |
| «بی‌نظیر»، «رویایی»، «انقلابی»، «جادویی»، «شگفت‌انگیز» | Hype | The number, the screenshot, the fact |
| «بهترین طراح/سایت/راهکار»، «ارزان‌ترین»، «تضمینی» | Unprovable, cheapens the brand | Proof, or say nothing |
| «فرصت را از دست ندهید»، «همین حالا اقدام کنید»، «عجله کنید» | Pressure tactics | A low-friction CTA with a reason |
| «تیم متخصص و مجرب ما»، «راهکارهای جامع و یکپارچه» | Faceless agency voice | «من» plus the concrete experience |
| «می‌باشد»، «اینجانب»، «نمودن»، «جهت»، «گردید» | Bureaucratic | «است»، «من»، «کردن»، «برای»، «شد» |
| unlock, elevate, seamless, game-changer, cutting-edge, leverage, next level | English AI clichés | Plain words |

<!-- lint:on -->

## 10. Rewrites: generic → brand voice

**Example 1, education post opener**
<!-- lint:off -->
- ✗ «در دنیای پررقابت امروز، داشتن یک وب‌سایت حرفه‌ای برای هر کسب‌وکاری ضروری است.»
<!-- lint:on -->
- ✓ «سایت‌تان بازدید دارد ولی پیام و سفارش نه؟ معمولاً مشکل از یکی از این پنج جای سایت است.»

**Example 2, case study result**
<!-- lint:off -->
- ✗ «با سایت ما فروش خود را چند برابر کنید!»
<!-- lint:on -->
- ✓ «در پروژهٔ [نام پروژه]، زمان بارگذاری صفحهٔ محصول از [X] به [Y] ثانیه رسید. اثرش روی سفارش‌ها را در اسلاید آخر با عدد واقعی گذاشته‌ام.» (numbers only from the project file)

**Example 3, service intro for education**
<!-- lint:off -->
- ✗ «ارائهٔ راهکارهای نوآورانه و یکپارچه برای تحول دیجیتال آموزشگاه شما»
<!-- lint:on -->
- ✓ «اگر ثبت‌نام آموزشگاه‌تان هنوز تلفنی یا در واتس‌اپ انجام می‌شود، یک فرم ثبت‌نام و پرداخت آنلاین معمولاً هر ترم چند روز کار دستی را کم می‌کند.»

**Example 4, CTA**
<!-- lint:off -->
- ✗ «همین حالا با ما تماس بگیرید و فرصت را از دست ندهید!»
<!-- lint:on -->
- ✓ «اگر می‌خواهید بدانید سایت فعلی‌تان کجا مشتری را از دست می‌دهد، کلمهٔ «بررسی» را دایرکت کنید.»

## 11. Final QA before review (G2)

- [ ] `node tools/voice-lint.mjs <file>` shows 0 errors; every warning resolved or justified in the file's review notes.
- [ ] The first line works alone as a hook (about 125 characters show before "more").
- [ ] One persona, one problem, one primary CTA.
- [ ] Every number has a source and date; nothing invented.
- [ ] Read aloud: does it sound like Hamidreza talking, not a brochure?
- [ ] English terms are needed and correctly cased; explained once for non-technical readers.
