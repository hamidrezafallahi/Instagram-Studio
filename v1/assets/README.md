# Assets

| Folder | Contents | Naming |
|---|---|---|
| `brand/` | Headshots, workspace photos, wordmark, highlight cover exports | `headshot_2026-11.jpg`, `wordmark_ink.png` |
| `screenshots/<project-slug>/` | Real project screenshots, **redacted** before saving here | `<slug>_<page>_<desktop\|mobile>_<YYYYMMDD>.png` |
| `exports/<content-ID>/` | Final Canva exports, ready to host on Zernio | `IG-004_s01.png`, `IG-S01_f01.png`, `IG-002_cover.png`, `IG-002_reel.mp4` |

## Rules

- Screenshots: capture at 2× and crop to the area that matters. Apply the redaction checklist in `projects/README.md` **before** the file lands here.
- Never store client credentials, database dumps or private documents in this repository.
- Only approved, redacted files are uploaded to Zernio or Canva. Zernio media URLs are public links.
- `exports/` is git-ignored by default (regenerable from Canva, and large).
