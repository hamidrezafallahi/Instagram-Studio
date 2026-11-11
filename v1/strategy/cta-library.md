# CTA library

**Rules**
- Exactly one **primary** CTA per post. Education posts may add a soft secondary "save" nudge in the caption.
<!-- lint:off -->
- Invite, never pressure. No «همین حالا»، «فرصت را از دست ندهید»، «عجله کنید».
<!-- lint:on -->
- A DM-keyword CTA is allowed only if Hamidreza will answer every message personally (drafted by Claude, approved before sending). **No auto-DMs.**
- A CTA that promises an asset (checklist, review) is allowed only when the asset exists or the offer is confirmed. **[confirm offers]**

## By funnel stage

### Awareness (education, Reels)
- «این را ذخیره کنید؛ موقع بررسی سایت‌تان به کارتان می‌آید.»
- «برای کسی بفرستید که دارد سایت می‌سازد.»
- «کدام مورد در سایت شما هست؟ شماره‌اش را کامنت کنید.»
- «سؤال فنی دارید؟ کامنت بگذارید؛ در استوری جواب می‌دهم.»

### Consideration (case studies, process)
- «جزئیات کامل این پروژه و نمونه‌کارهای بیشتر: لینک بیو.»
- «اگر فروشگاه شما هم همین مشکل را دارد، کلمهٔ «فروشگاه» را دایرکت کنید تا ببینیم از کجا شروع کنیم.»
- «اگر ثبت‌نام آموزشگاه‌تان هنوز دستی است، «آموزشگاه» را دایرکت کنید.»
- «برای نمایشگاه بعدی سایت یا صفحهٔ معرفی لازم دارید؟ «نمایشگاه» را دایرکت کنید.»
- «کارهایتان روی اکسل و واتس‌اپ می‌چرخد؟ «داشبورد» را دایرکت کنید.»

### Conversion (services)
- «برای یک گفت‌وگوی کوتاه دربارهٔ پروژه‌تان، کلمهٔ «مشاوره» را دایرکت کنید.»
- «اگر می‌خواهید بدانید سایت فعلی‌تان کجا مشتری را از دست می‌دهد، «بررسی» را دایرکت کنید.» **[only if a free site review is offered]**
- «فرم شروع همکاری در لینک بیو است؛ چند سؤال کوتاه که جلسهٔ اول را مفیدتر می‌کند.»

### Connection (personal)
- «شما هم تجربهٔ مشابهی داشته‌اید؟ برایم بنویسید.»
- «اگر سؤالی دربارهٔ کار من دارید، در استوری امروز بپرسید.»

## DM keyword registry

Keywords make attribution possible: inbox triage maps each keyword to the content that used it.

| Keyword | Meaning | Used by | Reply template (`inbox/reply-playbook.md`) |
|---|---|---|---|
| «سایت» | General inquiry from the bio | Bio | R-LEAD-GENERAL |
| «مشاوره» | Wants a consultation | Service posts | R-LEAD-CONSULT |
| «بررسی» | Wants a review of an existing site **[confirm offer]** | Education, service posts | R-LEAD-REVIEW |
| «فروشگاه» | E-commerce project | E-commerce posts | R-LEAD-ECOM |
| «آموزشگاه» | Education project | Education-sector posts | R-LEAD-EDU |
| «نمایشگاه» | Corporate or exhibition project | Corporate posts | R-LEAD-CORP |
| «داشبورد» | Custom web app | Web app posts | R-LEAD-WEBAPP |
| «چک‌لیست» | Wants the checklist asset **[only once the asset exists]** | Education posts | R-ASSET-CHECKLIST |
