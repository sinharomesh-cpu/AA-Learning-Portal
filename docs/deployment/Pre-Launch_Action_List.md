# AA Pro — Pre-launch action list

**Started:** 20 Oct 2026 (OC-122); PL-02 to PL-04 added 21 Oct 2026 (OC-123, OC-124); PL-05 added 21 Oct 2026 (OC-126) · **Status:** open items to complete before real users are onboarded (production launch). Production deployment itself needs the owner's separate explicit approval.

This list holds actions the owner has deferred to "before launch". Each item names its source decision, what must be checked, and what closes it. Other pre-launch work is still tracked in its own documents.

| ID | Action | Source | What to do before launch | Closes when | Status |
|---|---|---|---|---|---|
| PL-01 | Teacher rate-proposal index (CR-16 AC-75) | OC-122 (owner, 20 Oct 2026, 20:56 IST); CR-16 §20.2, §20.3 | Estimate expected open rate proposals and active teachers. On an isolated, seeded database, re-run `EXPLAIN (ANALYZE, BUFFERS)` and timings for the teacher-side expiry statement and the teacher Enquiries badge count. Decide whether the teacher index is required. If it is, propose `rate_negotiations_teacher_open (teacher_id) WHERE status IN ('pending','countered')` in a separately reviewed migration, with a test that it is used. | The owner either approves and merges the index (then AC-75 is re-verified), or formally accepts the measured cost at the expected launch volume and amends AC-75 | Open — deferred |
| PL-02 | Hosting plan for real use | OC-124 (owner, 21 Oct 2026, 02:01 IST); CR-17 §6.4 | Vercel's free Hobby plan is for "non-commercial, personal use only". Decide the hosting plan for paid lessons with real families, with its cost, and rotate the test secrets | The owner approves a hosting plan in writing, or confirms the use stays non-commercial | Open |
| PL-03 | Video lessons with children | OC-124; CR-17 §6.4, V-3 | Review Zoom's terms (§11.2: "not intended for use by individuals under the age of sixteen"), account eligibility, meeting settings (waiting room, passcode) and child-safety rules with an adviser | The owner approves an approach for real-child lessons | Open |
| PL-04 | Notifications outside the app | OC-123 (4); CR-17 §2.9 | Phase 3A is in-app only as a testing limitation. Decide email and WhatsApp (providers, consent, templates, cost) for launch | The owner decides the channels for launch | Open |
| PL-05 | Reliable 12-month homework deletion | OC-126 (owner, 21 Oct 2026, 16:03 IST); CR-07 OC-90 Q-6; CR-17 §5 | Phase 3A deletes expired homework only when the site is used (page-load clean-up), which cannot guarantee deletion on time. Before launch, provide a reliable scheduled deletion (for example a scheduler on a paid or otherwise approved plan), with monitoring and a test that expired homework and files are removed on time | Scheduled deletion approved, built and tested; cost approved in writing | Open |

**Current measurements (20 Oct 2026, local seeded review database):** teacher-side expiry check 0.3–2 ms at 6,000 open proposals and 3–11 ms at 60,000; teacher Enquiries badge count 8.6 ms at 60,000. With the proposed index, at 60,000 open proposals: 0.08–5.9 ms and 0.55 ms. Index size 440 kB; no measurable write overhead. Results are correct today; only speed changes with volume.

**Not authorised by this list:** migration 0027, schema changes to any database, deployment, or spending beyond ₹0.
