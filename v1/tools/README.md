# Tools

Small Node.js scripts (Node 18+; no dependencies). Run them from the repository root.

| Script | Use | Example |
|---|---|---|
| `dates.mjs` | Gregorian ↔ Jalali dates with Persian weekdays (Asia/Tehran), for calendars | `node tools/dates.mjs 2026-11-21 28` |
| `voice-lint.mjs` | Persian typography, banned phrases and caption rules for a content file; exit code 1 on errors | `node tools/voice-lint.mjs content/01-drafts/IG-004_carousel_5-website-mistakes.md` |
| `voice-lint.config.json` | Banned phrases with suggestions, caption limits (keep in sync with `brand/voice-and-tone.md`) | |
| `content-hash.mjs` | Short hash of a content file's body, recorded with each approval | `node tools/content-hash.mjs content/01-drafts/IG-004_carousel_5-website-mistakes.md` |

The guard hook and its tests live in `.claude/hooks/` (`node .claude/hooks/guard.test.mjs`).
