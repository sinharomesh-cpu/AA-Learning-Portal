# TL-4 (moving a confirmed lesson): final design for technical review

**2 Nov 2026.** This implements the signed-off specification:
- Evidence Pack revisions 4.1 to 4.3;
- BA sign-off, 2 Nov 2026, 22:57 IST;
- PO decisions D1–D4, Q-A, Q-B and R1–R3 (from the earlier BA discussion);
- PO-D5 to PO-D8 (2 Nov 2026, 21:14 IST).

**Files:**
- `db/drafts/tl4_lesson_changes.sql`: the TL-4 SQL. Unnumbered; **0036 is proposed, not approved.** It is outside `db/migrations`, so no migration run sees it.
- `db/drafts/tl4_lesson_changes_rollback.sql`: a single DO block that refuses once any lesson has moved (D4).
- `tests/db/tl4Final.test.ts`: acceptance tests (AC numbers from Evidence Pack 4.3 §8).
- `tests/db/tl4Prototype.test.ts`: integrity, two-way rule, locking and race tests.

**Not edited:** `db/migrations/0033_material_requests.sql` and its checksum (`3be71d01…`, checked by AC-27). No migration file is added, numbered or applied.

## What the SQL does

| Area | Rule | Where |
|---|---|---|
| Starting a change | Same teacher, child and subject. The original must be confirmed, with no outcome. The deadline D = earliest of P + 48 h, R − 2 h, O − 30 min, set at creation; **refused if D ≤ P**, so the original must start more than 30 min after P. R must be 24 h to 28 days from P (PO-D5; 0029/0034's existing horizon). A projected parent check runs here (C-1) | `lessons_before_insert_tl4` |
| The swap | Atomic, in the accepting transaction. The original closes as `cancelled` / `aa_pro` / `rescheduled`. A swap record is stamped with `pg_current_xact_id()`. The replacement gets a new price (0029) | `lessons_before_update_tl4`, `lesson_reschedules` |
| Two-way rule | Checked at commit, from both sides. It also checks that every carried request has exactly one mapping row | `lessons_two_way`, `lesson_reschedules_two_way` |
| Chapters (Q-B) | C1: the original's chapters are copied row for row. C2: the change's own chapters stay active. The original's chapters stay as history | `lessons_before_update_tl4`, `lesson_chapters_before_write` (0034 + one block) |
| Request mapping (Q-B) | **M1:** a description is copied. **M2:** C1 keeps the same position. **M3:** a book chapter is matched by `book_chapter_id`. **M5:** a topic must match exactly, with a single candidate. **M4/M6/M7** are refused (`material_request_unmappable`). **M8:** answered requests are not carried | swap loop |
| Logical identity (Q-A) | `material_requests.logical_request_id`: set to the row's own id; copies inherit it; it never changes; there is at most one open row per logical id (unique partial index). **No inferred merge.** Existing rows are backfilled (a data change at apply time) | `material_requests_before_write_tl4`, `material_requests_one_open_logical` |
| History | Carried originals close as **`carried_forward`** (a new close reason). This is written only when the lesson closed as `rescheduled` in the same transaction | `material_requests_before_write_tl4` |
| Audit | `lesson_reschedule_requests` has one row per carried request: logical id, both request ids, both positions and the kind. The trigger checks that both sides have the same chapter identity. Rows are append-only and written only by the swap | `lesson_reschedule_requests_before_write` |
| Per-lesson limit | At most 5 open requests on the replacement (its own plus carried); otherwise `material_request_limit` | swap, plus 0034's insert rule |
| Per-parent rule (PO-D6 to D8) | For each active parent of the child, independently: `after ≤ max(5, before)`, where before is the existing app count (C-2) and after is before plus the swap's own effect (C-4). Parent advisory locks are taken in parent-id order. TL-2 creation is not capped | `tl4_parent_open_count`, `tl4_parent_rule_check` |

**Order of BEFORE triggers:** the `*_tl4` triggers fire after the 0029/0033/0034 triggers of the same table (name order). 0033's and 0034's functions are unchanged.

## Migration dependencies
- **TL-5 (0035) and RD-1A (0038): independent.** The order-independence harness was re-run with this SQL as the 0036 stand-in: identical catalog hash in both orders, byte-identical `pg_dump`, identical migration records and rollback behaviour.
- **TU (proposed 0037): no SQL exists yet.** Objects TL-4 changes that TU is expected to touch:
  - `lessons_status_fields`;
  - `lessons_close_reason_check`.
  - Possibly `lesson_chapters_before_write`.
- TL-4 no longer replaces any 0033 function, so the earlier 0033-function overlap is gone. TU's planned widening of 0033's lesson-status trigger condition is unaffected.
- **Whichever of TL-4 and TU is numbered second must carry the other's versions of the shared constraints.**

## Gates (not authorised by this design)
- Migration number;
- shared-database apply (including the `logical_request_id` backfill);
- merge after technical review, CI and dependency checks;
- production;
- real-family access.

## Review fixes (folded into #142 on 3 Nov 2026)
**PO decisions of 3 Nov 2026 (received 21:17 IST):** DEF-TL4-07 Option B (F-1) and DEF-TL4-08 Option B (F-5) approved; F-2 confirmed as a move-specific clarification of D-E2E-3 (b): a move's chapters come only from the move itself, and ordinary lesson planning is unchanged. F-4, F-6, F-7 and F-8 are technical fixes that need no business decision. The human technical review stays deferred to the full-portal delivery gate (owner decision); the review below is an AI review.
Independent AI review of the SQL (a separate Claude agent; not a human review). Each fix has a test in `tests/db/tl4ReviewFixes.test.ts` (or `tl4Final.test.ts` for F-5), and each test failed against the reviewed draft.

| Finding | Change |
|---|---|
| F-1 / DEF-TL4-07 | `lessons_before_insert` is replaced with 0034's body plus one predicate, so a move's busy check ignores its own original. 0029's no-overlap constraints still guard the final state. The rollback restores 0034's exact body |
| F-2 | No planned chapter can be added to a move after it is created. A move's chapters are either its own or the original's copied (Q-B), never a mix |
| F-4 | The rollback locks the TL-4 tables before its check, so a change in flight is waited for and then refused |
| F-5 / DEF-TL4-08 | An open move closes as `original_cancelled` when its original is cancelled another way |
| F-6 | An overdue, unswept move is expired before a new move for the same lesson is created |
| F-7 | The swap re-counts each parent after its writes, under the same locks, and checks `after <= max(5, before)` on the real counts. Copies and closures are counted separately |
| F-8 | The swap's chapter-copy exception applies only to a move with no chapters of its own |

F-3, the acceptance lock order (`lessons_lock_times` before `lessons_lock_pair`), is application work in #143.
