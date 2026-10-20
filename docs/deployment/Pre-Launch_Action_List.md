# AA Pro — Pre-launch action list

**Started:** 20 Oct 2026 (OC-122) · **Status:** open items to complete before real users are onboarded (production launch). Production deployment itself needs the owner's separate explicit approval.

This list holds actions the owner has deferred to "before launch". Each item names its source decision, what must be checked, and what closes it. Other pre-launch work is still tracked in its own documents.

| ID | Action | Source | What to do before launch | Closes when | Status |
|---|---|---|---|---|---|
| PL-01 | Teacher rate-proposal index (CR-16 AC-75) | OC-122 (owner, 20 Oct 2026, 20:56 IST); CR-16 §20.2, §20.3 | Estimate expected open rate proposals and active teachers. On an isolated, seeded database, re-run `EXPLAIN (ANALYZE, BUFFERS)` and timings for the teacher-side expiry statement and the teacher Enquiries badge count. Decide whether the teacher index is required. If it is, propose `rate_negotiations_teacher_open (teacher_id) WHERE status IN ('pending','countered')` in a separately reviewed migration, with a test that it is used. | The owner either approves and merges the index (then AC-75 is re-verified), or formally accepts the measured cost at the expected launch volume and amends AC-75 | Open — deferred |

**Current measurements (20 Oct 2026, local seeded review database):** teacher-side expiry check 0.3–2 ms at 6,000 open proposals and 3–11 ms at 60,000; teacher Enquiries badge count 8.6 ms at 60,000. With the proposed index, at 60,000 open proposals: 0.08–5.9 ms and 0.55 ms. Index size 440 kB; no measurable write overhead. Results are correct today; only speed changes with volume.

**Not authorised by this list:** migration 0027, schema changes to any database, deployment, or spending beyond ₹0.
