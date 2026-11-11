# Projects: the source of truth for case studies

One folder per real project: `projects/<slug>/project.md` (copy `_template/`) plus redacted screenshots in `assets/screenshots/<slug>/`. The `case-study` skill reads only from here, so a project that isn't here can't appear in content.

## Consent levels

| Level | What can be shown | Evidence needed |
|---|---|---|
| **A: named** | Client name and logo, project link, redacted screenshots, metrics (absolute or relative), verbatim testimonial | The client's written OK (message or email), noted in the project file with its date |
| **B: anonymised** | Industry and size only («یک فروشگاه پوشاک»), screenshots with branding removed, metrics as relative changes unless absolute numbers are allowed | The client's OK to show it anonymously, or a contract that permits portfolio use |
| **C: private** | Nothing identifiable. Lessons may inform general education posts | — |

No consent record means level C.

## Redaction checklist (every screenshot)

- [ ] Customer names, phone numbers, emails, addresses
- [ ] Order IDs, invoice numbers, payment details
- [ ] Confidential prices or revenue (unless the client allowed them)
- [ ] Admin usernames, URLs of private panels, API keys, tokens
- [ ] For level B: client logo, brand name, domain, distinctive product photos

## Metrics rule

Every number needs a before value, an after value, a date range and a source (analytics export, screenshot, client report). If a source is missing, the number stays out of public content.
