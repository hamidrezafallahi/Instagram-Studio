# Inbox

Comments, DMs and mentions are triaged with the `inbox-triage` skill. Claude reads, categorises and drafts. **Hamidreza approves every reply before it is sent.**

| File | Purpose |
|---|---|
| `reply-playbook.md` | Reply templates (Persian) per category and DM keyword |
| `triage/YYYY-MM-DD.md` | Daily triage log: items, categories, lead scores, numbered reply drafts, send status |

## Service levels

| Priority | Categories | Target |
|---|---|---|
| P1 | `lead-hot`, `lead-warm`, `client-existing` | Triaged the same day; reply sent within 1 business day of approval |
| P2 | `question-technical`, `criticism` | Within 1 business day |
| P3 | `feedback-positive`, `collab-partnership`, `job-student`, `other` | Within 2 business days |

Instagram DMs can be answered through the API only within 24 hours of the person's last message. After that, Hamidreza replies personally in the Instagram app.

## Privacy

Triage logs contain handles and message excerpts. They are git-ignored by default; keep the folder private and delete an entry if the person asks.
