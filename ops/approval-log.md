# Approval log

Append-only. One row per approval, recorded from Hamidreza's own chat messages by the `approval-workflow` skill. Never edit or delete past rows; a correction is a new row that references the old one.

Body hash: `node tools/content-hash.mjs <file>` (front matter and change log excluded). Before G4, the file's current hash must equal the hash recorded at G2.

| # | Date-time (Tehran) | ID(s) | Gate | Body hash | Hamidreza's words (verbatim) | What was shown | Recorded by |
|---|---|---|---|---|---|---|---|
| 1 | 2026-11-09 10:25 | IG-002 | G1 + G2 | `a55009086c21` | «Approve all three» | Reply to "Approve the copy for IG-002, IG-S02 and IG-003?", after the drafts were linked and summarised in chat and clicking was stated to record G1 (plan slot) and G2 (copy) | Claude |
| 2 | 2026-11-09 10:25 | IG-S02 | G1 + G2 | `324e273cdbd4` | «Approve all three» | Same message as #1 | Claude |
| 3 | 2026-11-09 10:25 | IG-003 | G1 + G2 | `ff3c4b068fa1` | «Approve all three» | Same message as #1. Covers the fallback copy; case study vs fallback is still decided by ۲۹ آبان (20 Nov) | Claude |

> **Policy note (2026-11-09, zero-spend security patch, recorded by Claude, not an approval):** rows #1–3 recorded «Approve all three». Under the explicit-approval rule (CLAUDE.md §5) those words don't name the IDs or the gate, so the guard does not count them. IG-002, IG-003 and IG-S02 need a fresh G2 in Hamidreza's own words, e.g. «G2 تأیید IG-002 و IG-003 و IG-S02», before any Zernio draft or schedule. The rows stay as they are (append-only).
