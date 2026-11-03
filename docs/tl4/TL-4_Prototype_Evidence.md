# TL-4 prototype: integrity and locking evidence (revision 3 findings)

> **Historical (superseded 2 Nov 2026).** Decisions marked proposed here were later decided by the Product Owner and the specification was signed off by the BA (2 Nov 2026). The current design is `docs/tl4/TL-4_Final_Design.md` and `db/drafts/tl4_lesson_changes.sql`.

**31 Oct 2026.** This document answers the owner's BA review (31 Oct 2026, §4). It is local work only:
- branch `tl4-lesson-changes`, based on `main` `379701a`;
- not pushed, no PR;
- no migration number;
- nothing applied to a shared database.

The prototype SQL is `db/drafts/tl4_lesson_changes.sql`. It sits outside `db/migrations`, so no migration run, gate or checksum ever sees it.

The tests are in `tests/db/tl4Prototype.test.ts`. Each run creates a throw-away database, applies every migration, then the draft.

**Results:**
- prototype tests: 23 of 23 passed;
- full database suite, including them: 60 files, 928 tests, all passed;
- migrations are byte-identical to `main`, and 0034 is still `0f5a393b…07a5`.

## 1. What changed from revision 2

| # | Finding | Change |
|---|---|---|
| R3-1 | **Direction A needed a transition guard** (owner §4.1) | The commit-time check now fires only on an update that **changes** the status or close reason. It checks Direction A only when the row **became** `cancelled`/`rescheduled` in that update, and Direction B only when it **became** `confirmed`. **Regression test:** a later, unrelated update of an already-moved original, and of its confirmed replacement, commits without a new record. **Mutation check:** with the guard removed, that test fails, and only that test fails (22 pass, 1 fails). The guard is therefore necessary and tested |
| R3-2 | **Row-lock order can't be set inside the trigger** | The parent's `UPDATE` of the replacement already holds the replacement's row lock **before** any BEFORE trigger runs. A single `ORDER BY id FOR UPDATE` inside the trigger therefore can't guarantee the order. The application must lock **before** the update, in the TL-3 order: <ol><li>the link `FOR SHARE`;</li><li>`lessons_lock_pair(original, replacement)`;</li><li>the update.</li></ol> `lessons_lock_pair` uses **two separate statements**, lower id first, so the order depends neither on a query plan nor on argument order. The trigger still locks the original itself, so a caller that skips step 2 stays correct, but without the ordering guarantee |
| R3-3 | **The move runs in its own triggers** | Revision 2 edited `lessons_before_insert` and `lessons_before_update`. The prototype instead adds `lessons_before_insert_tl4` and `lessons_before_update_tl4`, which run after the existing ones because PostgreSQL runs BEFORE triggers in name order. Those two shared functions stay **untouched**. TL-4 now overlaps with TU only in the `lessons_status_fields` constraint and `lesson_chapters_before_write`. That function keeps 0034's body byte for byte, with one block added (a test checks this). This reduces the TU and TL-4 shared-function conflict, but **doesn't decide the order** (§6) |
| R3-4 | **Material requests are captured before the original closes** (owner §4.4) | Sequence in §4 below. 0033's trigger is unchanged and still closes the original's open requests |
| R3-5 | **Two new points for you** (§5) | <ul><li>the limit of 5 open requests per lesson during a move;</li><li>requests that name a chapter when the change brings its own chapters</li></ul> |

## 2. Transaction identity: how PostgreSQL makes it hold

- `pg_current_xact_id()` returns the 64-bit transaction id (`xid8`) of the **top-level** transaction. Every savepoint shares that id. The value is never reused or wrapped around in practice.
- **Who can write the record.** The record's insert trigger sets `swap_xid` itself, ignoring anything the caller sends. It accepts the row only if, in the database at that moment:
  - the original is already `cancelled`/`rescheduled`;
  - the named replacement has `replaces_lesson_id` equal to the original;
  - teacher, child and subject match;
  - the replacement is still open (`requested` or `proposed`).

  It reads no session settings. UPDATE and DELETE of a record are refused (tested).
- **The commit-time checks.** They are deferred constraint triggers. PostgreSQL queues them as row events and runs them at COMMIT, inside the same transaction, so `pg_current_xact_id()` there is the swap's own id. Each check re-reads the row's current state rather than trusting `NEW`.
- **`SET CONSTRAINTS ALL IMMEDIATE`.** The events then fire at the end of each statement, including the nested `UPDATE` of the original, which runs before the record exists. So Direction A fails and **the move fails closed**. Tested.

| Requirement (owner §4.2) | Test |
|---|---|
| A record is created only by the database's swap path | An unrelated confirmed lesson offered as the replacement is refused ("written only by the move itself") |
| The original and the replacement are explicitly linked | `replaces_lesson_id`, unchangeable, plus one record. Tested in the main move test |
| The transaction id is checked at commit | The record's `swap_xid` equals `pg_current_xact_id()` read inside the moving transaction |
| Both directions are enforced | **A:** closing a lesson as moved without a replacement is refused at commit. **B:** with the swap trigger switched off, a confirmed change is refused at commit |
| An unrelated or pre-existing lesson can't satisfy the rule | Both are refused: an unrelated confirmed lesson; a replacement confirmed in an earlier transaction |
| Partial moves fail closed | Four cases, each leaving everything unchanged (original, replacement, record, requests, chapters):<ul><li>failure after the original closes (child overlap);</li><li>a later error in the same transaction;</li><li>rollback to a savepoint;</li><li>`SET CONSTRAINTS IMMEDIATE`</li></ul> |

## 3. Lock order: evidence

Each race test proves the second session **really waited**. Before the first session commits, `pg_stat_activity` shows the second session in a `Lock` wait, and `pg_blocking_pids` names the first.

| Test | Result |
|---|---|
| `lessons_lock_pair` order, with the ids passed **both ways round** | **(a)** Another session holds the higher row: the pair lock waits, and a third session's `NOWAIT` on the **lower** row fails, so the lower row was taken first. **(b)** Another session holds the lower row: the pair lock waits, and a third session can lock the **higher** row, so nothing was taken out of order |
| Move first, cancellation second | The cancellation waits, then updates no rows |
| Cancellation first, move second | The move waits, re-checks, and is refused ("cancelled or changed meanwhile"). The change stays open |
| Two parents accept the same change | The second waits, then finds it already accepted. Exactly one record exists |
| A parent answers a request during the move | See §4 |

The teacher–child link stays first, and the time locks (teacher, then child) are still taken by 0034's code. Neither was changed.

## 4. Material requests: the sequence (Option R, **still proposed**)

Inside `lessons_before_update_tl4`, all in the move's single transaction:
1. Lock and re-check the original.
2. **Capture** the original's **open** requests with `FOR UPDATE`. A parent's answer in flight holds that request row, so the move **waits**. It then re-reads the row and skips it if it has been answered.
3. Close the original. 0033's trigger closes the original's open requests as `no_longer_needed` / `lesson_closed`, which is unchanged.
4. Write the record.
5. Copy the chapters, unless the change brought its own.
6. **Recreate** one open copy per captured request on the replacement, through 0033's normal insert rules, including the limit of 5.

| Owner test (§4.4) | Result |
|---|---|
| Parent answers while the move runs | The move waits for the answer. The answered request stays on the original as `unavailable` and is **not** copied; the other request is copied |
| Move while the request is still open | Exactly one copy per open request. The original's requests close as `lesson_closed`, and answered ones stay as history |
| The move first, then the parent answers the original | The answer waits, then is refused. Exactly one copy exists |
| Failed move | The original's requests stay open, and there are no copies (all four partial-move tests) |
| Existing limits still enforced | A move that would leave more than 5 open requests on the replacement is **refused** and nothing changes (§5, question Q-A) |
| No duplicate notices or audit entries | The database writes **none** during a move: the notification and audit counts are unchanged. Notices are for the TL-4 application to specify |

## 5. Decisions (none treated as approved)

| # | Decision | Status |
|---|---|---|
| 1 | Recreate open material requests on the replacement (R) | **Proposed, awaiting you.** Prototyped as R so that it could be tested |
| 2 | Count changes against the open request and proposal limits | **Proposed, awaiting you.** In the prototype this follows automatically, because a change is an ordinary request or proposal, so 0029 and 0034 count it |
| 3 | Child's schedule shows only the confirmed replacement | **Proposed, awaiting you** (application only) |
| 4 | Forward-fix primary, plus a guarded rollback that refuses after the first move | **Proposed, awaiting you.** Not yet prototyped |
| Q-A (new) | If the replacement already has its own open requests and the copies would take it past 5: (i) refuse the move (prototype), (ii) copy up to 5 and close the rest, or (iii) allow the move to exceed 5 | **Awaiting you.** (i) keeps the limit absolute, but the parent then can't accept until a request closes |
| Q-B (new) | When the change brings its own chapters, a request that names one of the original's chapters can't point at the same chapter on the replacement. The prototype doesn't copy it; it closes with the original. Alternative: copy it as a description, which would mean writing text the teacher didn't write | **Awaiting you.** Recommendation: don't copy |

## 6. Migration numbering and dependencies
- **No number is assigned.** The draft stays in `db/drafts/`.
- **TU:** the remaining overlap is the `lessons_status_fields` constraint (both add branches) and possibly `lesson_chapters_before_write`. Whichever is numbered second must carry the other's branches. **The order isn't decided.** It is to be resolved with the TU design note (T5) before either migration's final SQL.
- **TL-5 (0035):** no shared objects. Its checksums are unchanged (`7ef01a91…`, rollback `9c6bf5c5…`).

## 7. Not done (approval gates)
No push, PR, CI run, restore point, shared-database change, merge or deployment. Final TL-4 SQL waits for decisions 1, 4, Q-A, Q-B and the migration order.
