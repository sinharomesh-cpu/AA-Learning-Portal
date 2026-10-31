# TL-4 (moving a confirmed lesson): SQL design notes, revision 2

**31 Oct 2026, 18:00 IST.** This is a local design document, **not executable implementation.**
- **No migration file exists. No migration number is assigned.**
- **Base:** `main` `379701a`. Branch `tl4-lesson-changes`, local only, never pushed.
- **This revision answers** "Consolidated Development Direction and TL-4 Design Review" (owner, 31 Oct 2026):
  - same-transaction proof (§3);
  - deterministic locking (§4);
  - chapters and material requests (§5);
  - owner decisions (§6);
  - rollback and recovery (§7);
  - numbering and dependencies (§8);
  - tests (§9);
  - what can proceed now (§10).

**How to read it:**
- **[CONFIRMED]** marks an owner-approved requirement.
- **[PROPOSED]** marks my recommendation, which isn't approved.
- **[DECISION]** marks a point waiting for you.

---

## 1. Confirmed requirements
Sources:
- D-TLS-4 option A, approved in principle (30 Oct 2026, 20:25 IST);
- B.1–B.3, approved in principle, with the two-way condition (30 Oct 2026, 22:07 IST);
- the owner's review of 31 Oct 2026, §3.1.

The requirements:
1. **[CONFIRMED]** No separate booking type. A change reuses the TL-3 lesson model:
   - a **parent's change** follows the **request** workflow;
   - a **teacher's change** follows the **proposal** workflow.
2. **[CONFIRMED]** The replacement refers to **exactly one** original confirmed lesson, through `replaces_lesson_id`. **Teacher, child and subject match.**
3. **[CONFIRMED]** At initiation **and** at acceptance, the original is `confirmed`, has **no outcome**, and is **at least 30 minutes away**.
4. **[CONFIRMED]** The replacement starts **at least 24 hours after the change is proposed** and **at most 4 weeks ahead**.
5. **[CONFIRMED]** **No overlap** with another confirmed lesson. **The original is excluded** from that check.
6. **[CONFIRMED]** **Reply deadline** = the earliest of:
   - proposal time + 48 hours;
   - replacement start − 2 hours;
   - original start − 30 minutes.
7. **[CONFIRMED]** Expiry, decline or withdrawal leaves **the original confirmed.**
8. **[CONFIRMED]** **Price:** a **new database-calculated snapshot** for the replacement. The original keeps its price as history.
9. **[CONFIRMED]** The original closes as **`cancelled`**, **`closed_by = 'aa_pro'`**, **`close_reason = 'rescheduled'`**.
10. **[CONFIRMED]** The swap is **atomic.** A partial swap can never commit.
11. **[CONFIRMED]** **Commit-time two-way check, in both directions.** An unrelated confirmed lesson can never satisfy it, and it must not be weakened.
12. **[CONFIRMED]** **Chapter history** stays on the original, and approved chapter information is **copied to the replacement** within the swap.
13. **[CONFIRMED]** Unchanged from TL-3: OC-45, OC-46, D3A-7, D-TLS-10, OC-53, and the child sees confirmed lessons only.

---

## 2. Data model (proposed)
| Object | Purpose |
|---|---|
| `lessons.replaces_lesson_id uuid REFERENCES lessons(id)` | The explicit link. Set only at insert and never changed. NULL for ordinary lessons |
| **`lesson_reschedules`** (new table): `id`, `original_lesson_id` (unique), `replacement_lesson_id` (unique), `swap_xid xid8 NOT NULL`, `swapped_at timestamptz NOT NULL`, `accepted_by uuid` | **The swap record.** One row per completed swap. It is the proof and the history ("Moved from Tue 3 Nov, 5:05 pm") |
| Close reason `rescheduled` | Only on `cancelled` lessons, with `closed_by = 'aa_pro'` and `closed_at ≤ starts_at − 30 minutes` (a new branch of `lessons_status_fields`) |
| Partial unique indexes on `lessons (replaces_lesson_id)`: one for open statuses (`requested`, `proposed`), one for `confirmed` | One open change per lesson; at most one confirmed replacement |
| `lessons_deadline` CHECK | Widened **only** for rows with `replaces_lesson_id`, to `reply_deadline ≤ LEAST(...)`. The trigger sets the exact value (§1.6). Every other row keeps 0029's exact rule |

---

## 3. Same-transaction proof (the integrity mechanism)

### 3.1 Why not `now()` equality
`now()` is the transaction's **start** timestamp. Two different transactions that start in the same microsecond return the same value. A value can also be **written** by a caller: `confirmed_at` is set by the trigger, but a migration bug, or a replica-mode fixture, could still produce equal timestamps without one transaction. Equality of timestamps is therefore **evidence, not proof.** I agree with your correction.

### 3.2 Proposed mechanism: a swap record stamped with the transaction id
1. **The swap is done only by the database,** inside `lessons_before_update`, when a change row moves to `confirmed`. In that step the trigger:
   - locks the original (`FOR UPDATE`) and re-checks it (§1.3);
   - updates the original to `cancelled` / `aa_pro` / `rescheduled`;
   - inserts **one** `lesson_reschedules` row with `swap_xid := pg_current_xact_id()`.
2. **`lesson_reschedules` refuses every write except this path.** Its BEFORE INSERT trigger checks that, inside the current transaction:
   - `replacement.replaces_lesson_id = original_lesson_id`, and teacher, child and subject match;
   - the original is **already** `cancelled` / `rescheduled` (the trigger closes it just before writing the record);
   - the replacement is still open (`requested` or `proposed`), the state it has while its own BEFORE UPDATE runs.
   
   The check uses **database state only, never a session setting**, because a caller can set any session setting (`set_config`). A record written any other way still has to pass the deferred two-way check (point 3). The real swap path also writes a record, so a forged one would make the real swap fail on `UNIQUE`; there's nothing to gain.
   
   UPDATE and DELETE are refused, except when the lesson itself is deleted (ON DELETE CASCADE), as for 0032–0035.
3. **The deferred two-way rule.** A `CONSTRAINT TRIGGER … AFTER UPDATE ON lessons DEFERRABLE INITIALLY DEFERRED FOR EACH ROW` fires at commit for every lesson row updated in the transaction. It **re-reads the row's committed-to-be state** (not `NEW`, which may be stale if the row changed twice).
   - **Direction A:** if the row is `cancelled` with reason `rescheduled`, there must be **exactly one** `lesson_reschedules` row with `original_lesson_id` = this row and **`swap_xid = pg_current_xact_id()`**. Its replacement must be `confirmed`, have `replaces_lesson_id` = this row, and match teacher, child and subject.
   - **Direction B:** if the row is `confirmed` with `replaces_lesson_id` set, there must be **exactly one** `lesson_reschedules` row with `replacement_lesson_id` = this row and **`swap_xid = pg_current_xact_id()`**. Its original must be `cancelled` / `rescheduled`, and teacher, child and subject must match.
   - **Direction B is checked only when the row's status changed in this transaction,** so later edits of a confirmed replacement (for example recording its outcome) don't re-run it. This uses a transition-table check of OLD vs NEW status in a statement-level companion trigger, or a row trigger `WHEN (OLD.status IS DISTINCT FROM NEW.status)`.
   - A second, smaller deferred trigger on `lesson_reschedules` inserts repeats both directions from the record's side.
4. **Why this is proof, not evidence:**
   - `pg_current_xact_id()` returns the **top-level** transaction id (64-bit, epoch-extended `xid8`, no wraparound in practice) of the transaction that is running the check.
   - A record carries it only if it was written in this very transaction.
   - The record can only be written by the swap path, and it names both lessons explicitly.

### 3.3 What it rules out
| Attempt | Why it fails |
|---|---|
| Close a lesson as `rescheduled` without a replacement | Direction A: no record with this transaction's id |
| Confirm a change row without closing its original | Direction B: no record, or the original isn't `rescheduled` |
| **An unrelated confirmed lesson** (same teacher and child, no link) | It has no `replaces_lesson_id` = the original, and no record names it. The record's insert check refuses it |
| **A pre-existing replacement** (confirmed in an earlier transaction) offered as this swap's replacement | Its record, if any, has another transaction's `swap_xid`. A new record for it is refused by `UNIQUE (replacement_lesson_id)` |
| An original closed for **another reason** | Direction B: the original isn't `rescheduled` |
| A **second replacement** for one original | `UNIQUE (original_lesson_id)` and the confirmed-replacement unique index |
| A partial swap rolled back to a savepoint | Undoing the savepoint removes the record and both updates together. Nothing half-done remains |

### 3.4 PostgreSQL limitations, stated
- **`SET CONSTRAINTS … IMMEDIATE`** makes the check run early. A caller doing that mid-swap gets a refusal: it **fails closed**, never open.
- **`session_replication_role = replica`** (superuser-only) disables triggers. That is true of every AA Pro rule. Test fixtures use it deliberately; the application never does.
- **Prepared transactions (2PC)** aren't used by AA Pro. Under 2PC, the check runs at PREPARE, which is still correct.
- **`pg_current_xact_id()`** assigns a transaction id if there isn't one. That is harmless, because the swap writes rows and therefore has one anyway.

---

## 4. Deterministic locking

### 4.1 Existing order (0034 and TL-3, merged)
In every acceptance transaction:
1. the **teacher–child link row** (`lockLinkFirst`, `FOR SHARE`);
2. the **lesson row** (`lockLesson`, `FOR UPDATE`);
3. the **time locks** (`lessons_lock_times`: teacher, then child, transaction advisory locks, re-entrant);
4. **confirm**: 0029's no-overlap exclusion constraints;
5. after commit, the cleanup of overlapping requests and proposals (option A, `SKIP LOCKED`, 2 s wait).

### 4.2 The TL-4 sequence
The same order, extended **without** changing any existing path:

| Step | Lock | Notes |
|---|---|---|
| 1 | Link row (`FOR SHARE`) | Unchanged. The same link for both rows, because teacher and child match |
| 2 | **Both lesson rows, in ascending `id` order** (`FOR UPDATE`), in one statement: `SELECT … WHERE id IN (original, replacement) ORDER BY id FOR UPDATE` | Deterministic. Two transactions that lock any subset of these rows always lock them in the same order |
| 3 | Re-check after the locks are held: the replacement is open and before its deadline; the original is confirmed, has no outcome and is at least 30 minutes away | No **stale-state acceptance**: every decision uses rows that can no longer change underneath |
| 4 | Time locks (teacher, then child) | Taken by the trigger, as in 0034 |
| 5 | Close the original (the trigger's nested update finds the row already locked: no new wait), write the record, confirm the replacement | The exclusion constraints then see the original as cancelled |
| 6 | Commit: the deferred two-way check; then the option-A cleanup | Unchanged |

The trigger **also** locks the original `FOR UPDATE` itself, so a caller that skipped step 2 is still safe. It just loses the ordering guarantee, and with it a possible 40P01, which `retrying()` already handles.

### 4.3 Interaction with competing actions
| Competing action | Its locks | Outcome |
|---|---|---|
| **Cancelling the original** (parent or teacher) | Link → original row | Whichever locks the original first wins. If cancellation wins, the swap's re-check finds the original cancelled and refuses ("the lesson was cancelled"); the change then closes. If the swap wins, cancellation finds the original already `cancelled` (`rescheduled`) and refuses. **No cycle:** both take the link first and the original next |
| **Another acceptance overlapping the new time** | Link → its own row → time locks | Both wait on the same time locks (teacher, then child), as TQ-4 proved. The second one gets "time no longer free" (exclusion constraint or cleanup) |
| **Two parents accepting the same teacher change** | Link → the same rows | The second waits on the row lock, then sees the change already confirmed: "closed" |
| **Acceptance against withdrawal** | Withdrawal locks the replacement row only | Whichever locks it first wins. No cycle: the withdrawal never waits on the original |
| **Expiry, TL-5 and other sweeps** | `FOR UPDATE SKIP LOCKED` (`lessons_expire_overdue`, TL-5's correction sweep, cleanup) | They skip rows a swap holds and never wait, so there is no deadlock. Once committed, the change is no longer `requested` or `proposed`, so expiry can't touch it |
| **Link removal (OC-53)** | Link (`FOR UPDATE`) → lessons | Same order. The swap's link re-check runs after the link lock |

**Deadlock handling:** the consistent order removes the known cycles. Any remaining 40P01, which Postgres detects and resolves by aborting one transaction, is retried by `retrying()`. The race tests must show each competing transaction **really waited** (`pg_stat_activity` lock wait), or the test fails.

---

## 5. Chapters and material requests (exact specification; open requests need a decision)

### 5.1 Chapters [CONFIRMED rule; mechanism PROPOSED]
**At the swap, inside the same transaction:**
- **Every `lesson_chapters` row of the original is copied** to the replacement:
  - same `position`, `source` (`requested` or `planned`), `book_chapter_id`, `topic`, `label` and `intent`;
  - `created_at` = now.
- **The original's rows stay unchanged** as history.
- **New narrow path:** a copied chapter row is accepted only when a `lesson_reschedules` record exists for this replacement with **`swap_xid = pg_current_xact_id()`** (that is, inside the swap's own transaction), and the row matches one of the original's chapter rows exactly. It uses database state only, not a session setting. 0032 and 0034's rules stay byte for byte, as sub-blocks, as done in 0034.
- **Labels are copied unchanged** (sub-point 5). The teacher's view of whether a chapter is still shared is computed when shown, as today.
- **If the change itself carried chapters** (a teacher's change with planned chapters, or a parent's change with requested chapters), those already belong to the replacement, so the original's are **not** copied: no mixing. **[PROPOSED]**; this sits under decision 1's wider question of what to carry over. I'll confirm it with you alongside decision 1.

### 5.2 Open material requests [DECISION 1]
**Option R (recreate; my recommendation):**
- **Each open material request** on the original gets a new row on the replacement:
  - same `raised_by`, `lesson_position`, `description` and `note`;
  - `status = 'open'`, `created_at = now()`.
- **The original's request** is closed by 0033's existing trigger as `no_longer_needed` / `lesson_closed`.
- **Answered requests** (`shared`, `unavailable`) **stay on the original only.**
- **The 5-open limit** per lesson (TL2-3) is checked as usual. It can't be exceeded, because the counts match.
- **Audit:** one `LESSON_RESCHEDULED` audit entry lists the copied request ids.
- **Notices:** the application sends **no** "no longer needed" notice for requests closed by a swap, and **no** new "material requested" notice for the copies. Families get one "lesson moved" notice instead. *To be specified with the TL-4 application.*

**Option C (close only):**
- **Open requests close** with the original.
- **The teacher asks again** on the new lesson if still needed.
- **It's simpler,** but the family may lose a request they were about to answer.

**Duplicate and retry risks (Option R):**
- The copy runs only inside the swap, and the swap runs once per original (`UNIQUE` on the record), so a retried transaction re-runs everything or nothing. **No duplicates.**
- The request ids differ; the family sees the request "carried over" on the new lesson.
- **A parent answering the original's request while the swap runs:** the answer locks the request row. The 0033 close trigger and the copy then see the final state, so an answered request is not copied. *A race test covers it.*

---

## 6. Owner decisions (none treated as approved)
| # | Decision | Options | My recommendation | Consequence |
|---|---|---|---|---|
| **1** | Open material requests at a swap | R: recreate on the replacement / C: close; the teacher asks again | **R** | R keeps the family's to-do; it needs the copy rule and notice suppression (§5.2). C is simpler; a request may be lost |
| **2** | Do changes count towards the open limits (10 requests per parent; 10 proposals per teacher and child)? | Yes / No | **Yes** | No new loophole. A busy family with 10 open requests can't propose a change until one closes |
| **3** | Child's schedule after a move | Show only the confirmed replacement; hide the cancelled original / show both | **Show only the replacement** (today cancelled lessons aren't shown to children) | No new child screen work. The parent and teacher see "Moved from …" |
| **4** | Recovery approach (§7) | D: forward-fix plus restore point, no rollback script / G: guarded rollback script | **G-refusing** (§7.2) **plus D** as the primary path | Gives a tested, safe pre-use rollback without ever destroying move history |

**These materially affect the SQL:**
- **Decisions 1 and 4** change what the migration contains. I won't write final migration SQL for those parts until you decide.
- **Decisions 2 and 3** don't change the schema. Decision 2 is one condition in the insert trigger; decision 3 is application-only.

---

## 7. Rollback and recovery (reconciling the two approaches)

### 7.1 Forward-fix and recovery (TL3-6 Option D style)
- **If a defect is found after release:**
  1. Stop using the feature (a server switch hides "Change time").
  2. Write a reviewed forward migration.
  3. Apply it with your approval.
- **Last resort:** restore the database to a pre-TL-4 restore point (a Neon branch), under the existing procedure.
- **Effect:** **all data since the restore point is lost,** not only TL-4 data.

### 7.2 Guarded rollback alternatives
- **G-refusing:** a script that removes TL-4's objects **only while no lesson has been moved.**
  - It refuses if `lesson_reschedules` has any row, or any lesson has `replaces_lesson_id` set or `close_reason = 'rescheduled'`.
  - **Nothing is ever lost.** It's useful just after release, before first use.
  - After first use it refuses, and recovery falls back to forward-fix.
- **G-destructive:** a script that also deletes move history: it un-links replacements and turns `rescheduled` originals into…? There is **no faithful way** to undo a completed swap without inventing state. The original was really cancelled, and the replacement really confirmed. **Not recommended:** it would falsify history.

### 7.3 Data-loss and audit implications
| Approach | TL-4 history | Other data | Audit trail |
|---|---|---|---|
| D (forward-fix) | Kept | Kept | Kept |
| D + restore point | Lost after the restore point | **Everything** after the restore point is lost | Lost after the restore point |
| G-refusing | Never removed (refuses instead) | Kept | Kept |
| G-destructive | Falsified or lost | Kept | Inconsistent with audit entries |

### 7.4 Recommendation and testing
- **Recommendation:** D as the primary approach, **plus** a G-refusing script.
- **Tests either way:**
  - G-refusing succeeds on a database with no moves and returns the schema exactly to its pre-TL-4 state (catalog comparison, as for 0035);
  - it **refuses, changing nothing,** once a move exists;
  - forward-fix readiness: the feature switch hides the action, with an application test.
- **[DECISION 4]**

---

## 8. Migration numbering and interactions
- **No number is assigned** (`main` has 0001–0034). The draft is kept **separate** (`db/drafts/`, outside `db/migrations`) until you confirm the order.
  - Tests load it through the test harness's migration directory option.
  - No history or checksum changes.
- **TL-5 (0035, pending approval):**
  - **no shared objects to edit:** TL-5 reads `lessons` and adds its own tables;
  - **interaction:** an original closed as `rescheduled` has no outcome, so it never gets chapter states; the replacement is an ordinary confirmed lesson;
  - **independent order:** either can go first.
- **TU (pending):**
  - **conflict:** both TL-4 and TU **replace `lessons_before_insert` and `lessons_before_update`**, and both widen `lessons_status_fields`. Whichever is numbered **second** must carry the first one's version of those functions;
  - **rules:** a suspended original can't be moved (it isn't `confirmed`); suspending a teacher closes open changes as "teacher unavailable", like other open items;
  - **the order matters** for how the shared functions are written. **[DECISION: migration order]**.
- **Recommendation:** **TU before TL-4.** TU is a real-family prerequisite, and TL-4 then builds on TU's statuses. TL-5 is independent. **Not decided.**

---

## 9. Test plan (to run on throw-away databases once the design decisions permit)
**Integrity:**
- failure **after the original closes**;
- failure **after the replacement confirms**;
- in both cases, **the original stays confirmed and related data is unchanged** (chapters, requests, meeting link, reminders, notices).

**Two-way rule rejections:**
- a `rescheduled` original with no replacement;
- a replacement confirmed without its original closed;
- an **unrelated** confirmed lesson as substitute;
- an original closed for **another reason**;
- a **second** replacement;
- a **pre-existing** replacement;
- `SET CONSTRAINTS IMMEDIATE` mid-swap fails closed.

**Races (each proving the second party waited):**
- swap against cancellation of the original;
- swap against another overlapping acceptance;
- two parents accepting;
- accept against withdraw;
- swap against expiry, TL-5 and cleanup sweeps;
- swap against a link removal;
- a parent answering a material request during the swap (Option R).

**Boundaries:**
- the original's 30-minute cut-off, at initiation and at acceptance;
- the replacement's 24-hour and 4-week limits;
- **each of the three** deadline terms being the earliest.

**Price:** a new snapshot; the original keeps its price; a changed listing between review and send is refused.

**Regression:** the full existing suite, including the TL-3 and 0029 tests, unchanged.

**Recovery:** per decision 4 (§7.4).

---

## 10. Can proceed now, with decisions pending (local only)
| Task | Why it's safe now | Deliverable |
|---|---|---|
| T1: test harness for TL-4 (fixtures for a confirmed original plus open changes; race helpers with lock-wait proof) | Independent of every decision | `tests/db/` helpers |
| T2: **prototype of the integrity mechanism** (`replaces_lesson_id`, `lesson_reschedules`, the swap in the trigger, the deferred two-way check) as a **local draft** in `db/drafts/`, unnumbered, with the §9 integrity and two-way tests | Decisions 1–4 don't change this core; your confirmed requirements define it | Draft SQL plus passing tests, to show the mechanism works before final SQL |
| T3: the locking and race tests against the T2 prototype | Same | Test evidence |
| T4: TL-5 local rebase onto `main`, with checksums verified unchanged | Housekeeping you authorised | Rebased local branch and test results |
| T5: TU design note (interactions with TL-3, TL-4 and TL-5; OC-53 and OC-154) | Approved scope, design only | Note |
| T6: AI Classroom $0 design and the parts buildable now | Approved scope | Design, then local implementation of A parts |

**Waits for decisions:** final TL-4 migration SQL (decisions 1 and 4, and the order), and the copy rule for material requests.
