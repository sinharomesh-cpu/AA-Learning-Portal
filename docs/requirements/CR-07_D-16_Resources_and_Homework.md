# CR-07 — D-16: Teacher-Shared Resources, Digital Homework and Handwritten Homework

**Version:** 1.1 · 18 Oct 2026 · **Status:** specification (OC-86). **All questions answered:** Q-1, Q-5, Q-9 and the build order by OC-87; Q-2, Q-3, Q-4, Q-6, Q-7, Q-8 and Q-10 by OC-90. Designs HW0–HW9 **approved** (OC-95). Nothing in this document is built yet.
**Source:** owner's "D-16 Business Decision and Functional Requirements" (17 Oct 2026, 23:14 IST), recorded as OC-86.
**Baseline:** FRD v1.1 with CR-01 to CR-06; decision register G1-05 v1.44.

**Labels used in this document:**
- **[Owner]** means the owner's text.
- **[Proposed]** means Claude's proposal, which applies until the owner says otherwise.
- **[Q-n]** refers to a question in section 11; every question now has the owner's decision.

---

## 1. Summary

AA Pro gains one learning workflow across the three roles:

- An approved teacher shares resources with the students linked to them and sets homework.
- The student does the homework on screen, or on paper with a parent uploading it.
- The teacher reviews it and releases marks and feedback.
- The parent can see everything about their own children and does not have to approve each item.

**How this relates to existing decisions:**
- **OC-51 already closed D-16 for visibility:** teacher-shared resources are visible to the teacher, the student and the student's parent. This CR keeps that rule and extends D-16 to assignments, submissions and feedback.
- **Unchanged rules:** teacher–child linking stays exactly as approved (OC-36, OC-41, OC-77(2)). Parent-uploaded textbooks (OC-74, OC-79) stay a separate source, as do future Google Classroom items (master instruction §7).
- **No per-resource parent approval** (owner, §10 of the source).

---

## 2. Functional requirements

Numbering continues the FRD: FR-021 to FR-027.

### FR-021 Teacher-shared resources
| ID | Requirement |
|---|---|
| FR-021.1 | [Owner] An approved teacher can share study notes, worksheets, reference PDFs, exercise instructions and other educational files with one or more students linked to them. |
| FR-021.2 | [Owner] A shared resource appears on the linked student's dashboard straight away, without parent approval. |
| FR-021.3 | [Owner] Students browse resources by subject, chapter and teacher. |
| FR-021.4 | [Owner] Parents see every resource shared with their own children (OC-51). |
| FR-021.5 | [Owner] There is no public sharing and no sharing with unlinked students. Every resource is private to the teacher and the students it was shared with (and their parents). |
| FR-021.6 | [Owner, OC-87 Q-1] A teacher can share only in a subject the parent ticked for that link (OC-41(1)). Example: a maths-only link cannot receive a science sheet. |
| FR-021.7 | [Proposed] The chapter is optional free text typed by the teacher, with no invented chapter names (OC-79 C-6). It is not tied to the parent's textbook chapters, which the teacher may only view (OC-41(5)). |
| FR-021.8 | [Owner, OC-90 Q-4] Uploads from any phone or computer are accepted: PDF, JPEG, PNG, WebP and **HEIC/HEIF** (iPhone photos), up to 20 MB per file, checked by their content and not by their name. Photos, including HEIC, are converted on the server to one viewable format (JPEG, longest side at most 2,400 px), with camera and location data removed, so every viewer sees the same image. A file that cannot be read gets a clear message saying what to try (for example, "take the photo again" or "save as PDF"), never a silent failure. |
| FR-021.9 | [Owner, OC-90 Q-3] **No download restriction.** Anyone allowed to see a file (section 3) can open it and download it. There is no per-file download switch. Everyone else still gets "not found". This does not change OC-41(5), under which teachers can view, but not download, the textbooks a parent uploaded. |
| FR-021.10 | [Proposed] The teacher can edit the title or chapter, stop sharing with one student, or delete the resource. Deleting moves it to an archive for 30 days and then removes it (as for textbooks, OC-74(3)). |

### FR-022 Digital homework (interactive exercises)
| ID | Requirement |
|---|---|
| FR-022.1 | [Owner] A teacher creates an exercise assignment with a title, subject, chapter, instructions, an optional due date, a scoring setup and optional reference material (FR-021 resources). |
| FR-022.2 | [Owner] Supported question types: multiple choice (one answer), multiple select, fill in the blanks, true/false and matching. |
| FR-022.3 | [Owner, OC-90 Q-2] A **short written answer** type (up to 1,000 characters). It is always marked by the teacher: the answer is part of the submission, and the assignment goes to Under review for the teacher, who gives points and an optional comment for that answer. |
| FR-022.4 | [Owner] The student opens the exercise, answers on screen and submits. |
| FR-022.5 | [Proposed] Answers are saved as the student goes ("In progress"), and the student can leave and come back. Submitting is final unless the teacher asks for a revision. |
| FR-022.6 | [Owner] Automatic marking applies to question types with an answer key. Scoring is set per question in whole points; multiple select gives all-or-nothing points by default, with partial credit as an option; fill in the blanks accepts a list of answers, with an option to ignore capital letters; matching gives one point per correct pair. |
| FR-022.7 | [Owner] Questions that need a person's judgement go to the teacher for review. |
| FR-022.8 | [Owner] The teacher decides when the student sees marks, correct answers and feedback: on release only (the default), or automatically once marked (auto-marked exercises only). |
| FR-022.9 | [Proposed] After publishing, the teacher cannot edit questions once any student has started. They can edit the instructions and due date. |

### FR-023 Handwritten homework
| ID | Requirement |
|---|---|
| FR-023.1 | [Owner] A teacher publishes a handwritten assignment with instructions and an optional due date. |
| FR-023.2 | [Owner] The student does the work on paper. |
| FR-023.3 | [Owner] A parent or authorised guardian (a `guardian_links` parent of that child) uploads a scanned PDF or clear photos against the right child and assignment. |
| FR-023.4 | [Owner, OC-90 Q-4; limits proposed] One submission holds up to 10 files (PDF, JPEG, PNG, WebP or HEIC/HEIF, 20 MB each, 50 MB in total), from any mobile device or computer, using the phone's camera or files. The parent can reorder or remove files until they press Submit. |
| FR-023.5 | [Proposed] Photos are re-encoded on the server, which removes camera and location data (as for teacher photos). PDFs are checked by their content and never run. |
| FR-023.6 | [Owner, OC-90 Q-7] The teacher reviews the work and records marks and **typed feedback** (up to 4,000 characters per student assignment, plus optional comments on each answer). Feedback belongs to that student and assignment, and is given with the status Reviewed, or with Revision required and a note. Voice, audio or video feedback and drawing on submissions are out of scope for the first release. |
| FR-023.7 | [Owner] The student sees feedback once it is released; the parent sees the outcome. |
| FR-023.8 | [Owner] Digital-only exercises never replace handwritten homework; both kinds are available to every teacher. |
| FR-023.9 | [Proposed] Students do not upload; only parents and guardians do. This keeps the master instruction's "students cannot upload". |

### FR-024 Assignment lifecycle
See section 5. [Owner] Statuses: Assigned, In progress, Submitted, Under review, Revision required, Reviewed and Overdue.

### FR-025 Dashboards
See section 6.

### FR-026 Notifications
| ID | Requirement |
|---|---|
| FR-026.1 | [Owner] Parents choose notifications for new assignments, submissions and reviewed work. |
| FR-026.2 | [Proposed] Events are written to the existing email outbox as "queued". Nothing is sent until an email provider is approved (OC-65), and the screens say "queued", never "sent" or "delivered". WhatsApp stays off (not approved). |
| FR-026.3 | [Proposed] Teachers get a daily summary of new submissions, not one email per upload. |

### FR-027 Revoking a link
| ID | Requirement |
|---|---|
| FR-027.1 | [Owner] When a parent removes a teacher, or a subject from a teacher, the teacher immediately loses access to that child's submissions, answers, marks and feedback in the affected subjects (OC-41(4)). |
| FR-027.2 | [Owner, OC-87 Q-5] The child and parent keep the child's own records: submitted work, released marks and feedback. The child also keeps resources already shared, marked "From a teacher you no longer work with". The teacher can no longer add to them. |
| FR-027.3 | [Proposed] Unfinished assignments from that teacher move to "Withdrawn" for that child. They are kept as history, but no longer show as due or overdue. |
| FR-027.4 | [Owner, OC-90 Q-6] **Homework is kept for 12 months.** This covers uploaded scans and photos, digital answers, marks, teacher feedback and the status history of each student's assignment. The 12 months count from the student's last submission or, for work never submitted, from the due date (or the publish date if there is no due date). |
| FR-027.5 | [Proposed, OC-90 Q-6] **When the 12 months end:** a daily job deletes those records permanently, including the files in storage. The parent and student see the item as "Removed after 12 months" (title, subject and teacher only). The audit trail keeps only the event type, time and ids, never content. Thirty days before, the parent's homework page lists the items due for removal, and they can download them (FR-021.9). Deleting the child's account removes everything sooner. The teacher's own assignment questions and shared resources are the teacher's content, not the child's homework, and stay until the teacher deletes them. Wider retention (D-28) stays open; until then, test data only. |
| FR-027.6 | [Owner, OC-90 Q-8] **No administrator access to children's homework.** The Super Admin and Admins cannot see submissions, answers, scans, marks or feedback, whatever their permissions. There is no override; one would need a separate approval. Enforced on the server and in the file route, not just by hiding screens. Admins see only counts in aggregate reports. |

---

## 3. Access-control rules (enforced on the server and in database checks)

**Definitions:**
- "Linked" means an active `teacher_student_links` row. "Linked in S" means a linked row whose `subjects` include S.
- Every rule applies to page loads, server actions and the file routes. Ids in the address bar are never trusted on their own.

| Action | Student (child) | Parent | Teacher | Admin / Super Admin |
|---|---|---|---|---|
| See a resource | Only if shared with them | Only if shared with one of their own children | Own resources only | **No** (OC-90 Q-8; no override) |
| Share a resource with a student | No | No | Only with students linked in that subject | No |
| Open or download a file (resource or submission) | Only if shared with them, or their own submission | As for the student, for their own children | Own resources; submissions on their own assignments while linked in that subject | **No** |
| See an assignment | Only if assigned to them | Only if assigned to their own children | Own assignments | No |
| Create or publish an assignment | No | No | Only for students linked in that subject | No |
| Answer a digital exercise | Only their own; only while Assigned, In progress or Revision required | No (the parent can see answers after submission) | No | No |
| Upload handwritten work | No | Only for their own child, and only on that child's assignment, while open | No | No |
| See a submission (answers or files) | Their own | Their own children's | Only while linked in that subject; only their own assignments | No |
| Mark, give feedback, release, ask for a revision | No | No | Only while linked in that subject; own assignments | No |
| See marks and feedback | Only after release | After release; before release: "Waiting for teacher" | Always (author) | **No** |

**Rules for refusals and the audit trail:**
- **Not found, not "forbidden":** any refused request gets the same answer as a missing item, so ids cannot be probed (acceptance 2).
- **What the audit trail records:** share, unshare, publish, submit, upload, mark, release, revision request, withdraw on unlink, and every refused access to someone else's item. Events go into `audit_events` with the actor and the subject, never the file contents.

---

## 4. Data model

New migrations: 0015 for the file store and 0016 for resources and assignments. All new tables follow the existing patterns: uuid keys, `CHECK` constraints, role checks with `require_role`, and timestamps in UTC.

```
stored_files            -- one private file; shared by resources, attachments and submissions
  id uuid PK, owner_id uuid → accounts, purpose text CHECK IN ('teacher_resource','submission_page'),
  media_type text CHECK IN ('application/pdf','image/png','image/jpeg','image/webp'),
  byte_size int CHECK (byte_size BETWEEN 1 AND 20971520), sha256 bytea,
  storage text CHECK IN ('database','object') , body bytea NULL, object_key text NULL,   -- see Q-9
  created_at, deleted_at NULL

teacher_resources
  id, teacher_id → accounts(teacher), title ≤120, subject (valid_subjects), chapter ≤120 NULL,
  description ≤1000 NULL, file_id → stored_files,            -- no download switch (OC-90 Q-3)
  created_at, updated_at, archived_at NULL

resource_shares          -- who can see a resource
  resource_id → teacher_resources, student_id → accounts(student), shared_at, unshared_at NULL
  UNIQUE (resource_id, student_id) WHERE unshared_at IS NULL
  trigger: an active teacher_student_links row for (teacher, student) with the subject

assignments
  id, teacher_id, kind text CHECK IN ('exercise','handwritten'), title ≤120, subject, chapter NULL,
  instructions ≤4000, due_at timestamptz NULL, release_mode text CHECK IN ('manual','on_marking'),
  status text CHECK IN ('draft','published','closed'), published_at NULL, created_at, updated_at

assignment_resources     -- reference material (FR-022.1)
  assignment_id, resource_id

questions                -- exercises only
  id, assignment_id, position smallint, type text CHECK IN
    ('single_choice','multi_select','fill_blank','true_false','matching','short_answer'),
  prompt ≤1000, data jsonb   -- options / blanks / pairs; validated in code and by CHECK on keys
  answer_key jsonb NULL      -- never sent to the student before release
  points smallint CHECK (points BETWEEN 0 AND 100), partial_credit bool DEFAULT false

assignment_targets       -- one row per student given the assignment; carries the lifecycle
  id, assignment_id, student_id, status text CHECK IN ('assigned','in_progress','submitted',
    'under_review','revision_required','reviewed','withdrawn'),
  revision_count smallint DEFAULT 0, submitted_at NULL, reviewed_at NULL, released_at NULL,
  score numeric NULL, max_score numeric NULL, feedback ≤4000 NULL (typed only, OC-90 Q-7), updated_at,
  submitted_late bool NULL, due_at_when_submitted timestamptz NULL,   -- Late is recorded, auditable (OC-90 Q-10)
  purge_after timestamptz NULL   -- 12 months after the last submission, or after due/publish (OC-90 Q-6)
  UNIQUE (assignment_id, student_id)
  -- "Overdue" is computed (due_at < now AND status IN assigned/in_progress/revision_required), not stored.

answers                  -- exercises; one row per question per attempt
  target_id, question_id, attempt smallint, response jsonb, auto_points numeric NULL,
  teacher_points numeric NULL, teacher_comment ≤1000 NULL, saved_at
  PK (target_id, question_id, attempt)

submission_pages         -- handwritten; one row per uploaded file per attempt
  target_id, attempt smallint, position smallint, file_id → stored_files, uploaded_by → accounts(parent),
  uploaded_at

assignment_events        -- status history (acceptance 11); also mirrored to audit_events
  id, target_id, from_status, to_status, actor_id, at, note ≤500 NULL
```

**Database-level checks**, a second line of defence behind the application:
- a resource can be shared, or an assignment targeted, only to a student linked in that subject;
- only a guardian of the child can upload a submission page;
- answers and pages are accepted only while the target is in an open status;
- `answer_key` is excluded from every query that serves a student.

---

## 5. Assignment lifecycle (per student)

| From | To | Who | When |
|---|---|---|---|
| — | Assigned | Teacher | Publishes the assignment to linked students |
| Assigned | In progress | Student | First saved answer (exercise). Handwritten: the parent's first uploaded file |
| Assigned / In progress | Submitted | Student (exercise) or parent (handwritten) | Presses Submit; needs every required answer, or at least one file |
| Submitted | Reviewed | System | Exercise with only auto-marked questions; released automatically if the release mode is "on marking" |
| Submitted | Under review | Teacher | Opens it for marking (or the system does, when any question needs the teacher, or for handwritten work) |
| Under review | Reviewed | Teacher | Saves marks and feedback |
| Under review / Reviewed | Revision required | Teacher | Asks for corrections with a note; the attempt number goes up; the earlier attempt is kept |
| Revision required | In progress → Submitted | Student or parent | As above, as a new attempt |
| Reviewed | (released) | Teacher | Releases marks and feedback; `released_at` is set. Releasing does not change the status |
| Any open status | Withdrawn | System | The link is removed (FR-027.3) or the teacher withdraws the assignment |

**Rules:**
- **Overdue** is shown, not stored: it is past the due date and still Assigned, In progress or Revision required.
- **Late (OC-90 Q-10):** submitting after the due date is allowed. The submission is marked **Late**, and the submission time and the due date at that moment are stored (`submitted_late`, `due_at_when_submitted`), so a later change to the due date does not rewrite history. Late work goes to the teacher's review queue like any other, with a "Late" chip.
- **Revisions are distinguishable:** a returned assignment shows "Revision required · attempt 2" and the teacher's note. A new assignment shows "Assigned". The difference comes from `revision_count` (acceptance criterion: "distinguishable").
- **Any other transition is refused**, and tests cover every pair.

---

## 6. Dashboard and screen changes

These need designs first, for approval, before building (OC-79: "document sharing: designs first"). The proposed boards are HW1 to HW9.

| Board | Role | Screen | Notes |
|---|---|---|---|
| HW1 | Teacher | Dashboard (S21) | The "Share learning resources" panel and "Recently shared" become real (DV-84 is removed). New "Homework to review" panel: submitted, under review and overdue counts per student card |
| HW2 | Teacher | Resources: upload and share | File, title, subject (linked subjects only), chapter, students (linked in that subject) |
| HW3 | Teacher | Assignment builder | Kind (exercise / handwritten), details, questions (6 types), scoring, release mode, students, preview as student |
| HW4 | Teacher | Review queue and marking | Filters: needs review, overdue, late. Exercise marking per question; handwritten page viewer (zoom, rotate) with a feedback box; release; ask for revision |
| HW5 | Student | Dashboard: "My homework" and "From my teachers" | Child-friendly cards: due date in words, status chip with text, teacher's name; resources by subject → chapter → teacher |
| HW6 | Student | Exercise player | One question per screen on phone, all on desktop; 56 px targets; saves as you go; Submit with confirmation |
| HW7 | Student | Results and feedback | Shown only after release; correct answers shown only if the teacher chose to |
| HW8 | Parent | Family home and child page: homework | Per-child list, status, due dates, "Upload handwritten work", history, released feedback |
| HW9 | Parent | Upload handwritten work | Choose child → assignment (prefilled from the item), add photos or PDF, reorder, check, Submit; clear errors for wrong type or size |

**Status chips always show text** (AX-07):
| Status | Colour |
|---|---|
| Assigned | Neutral |
| In progress | Blue |
| Submitted | Blue |
| Under review | Amber |
| Revision required | Amber |
| Reviewed | Green |
| Overdue | Red |
| Withdrawn | Grey |

**Keeping sources apart (master instruction §7):** every resource card shows its source, "From your teacher" or "Uploaded by your parent". Google Classroom items (Phase 6) will show their own label.

---

## 7. Server contracts (Next.js server actions and file routes)

Every action takes its actor from the session only. Inputs are validated with the same patterns as the existing modules, and results are typed `{ ok: true } | { ok: false; reason }`.

| Module / route | Function | Who | Main refusals |
|---|---|---|---|
| `server/teacherResources.ts` | `uploadResource(teacher, file, meta)` | Teacher | not_allowed, type, too_big, subject_not_linked |
| | `shareResource(teacher, resourceId, studentIds[])` / `unshareResource` | Teacher | not_found, not_linked |
| | `listResourcesForStudent(student)` / `listResourcesForParent(parent, childId)` / `listOwnResources(teacher)` | As named | not_found |
| `server/assignments.ts` | `saveAssignmentDraft`, `publishAssignment(teacher, id, studentIds[])`, `withdrawAssignment` | Teacher | invalid, not_linked, already_started |
| | `getAssignmentForStudent(student, targetId)` (never includes answer keys) | Student, parent (read) | not_found |
| | `saveAnswers(student, targetId, answers)` / `submitExercise(student, targetId)` | Student | closed, incomplete |
| | `uploadSubmissionPage(parent, targetId, file)` / `removeSubmissionPage` / `submitHandwritten(parent, targetId)` | Parent / guardian | not_guardian, closed, type, too_big, too_many |
| | `markTarget(teacher, targetId, marks, feedback)` / `releaseResults` / `requestRevision(teacher, targetId, note)` | Teacher | not_linked, bad_transition |
| | `listReviewQueue(teacher)` / `listHomeworkForStudent` / `listHomeworkForParent` | As named | — |
| `app/files/[id]/route.ts` | `GET` streams a stored file after `mayReadFile(viewer, fileId)` | Any signed-in viewer | 404 for everything not allowed; `Cache-Control: private, no-store`; `Content-Disposition: inline` with a separate "Download" link that sets `attachment` for any allowed viewer (OC-90 Q-3); admins always get 404 (Q-8); `X-Content-Type-Options: nosniff` |

**Rate limits** reuse `rate_events`: uploads per teacher and per parent per day.

---

## 8. Acceptance criteria (owner's 12, mapped to tests)

| # | Criterion | Test (section 9) |
|---|---|---|
| 1 | A teacher shares a resource with a linked student, who sees it without parent approval | T-R1, E-1 |
| 2 | An unlinked student cannot reach the resource by changing a URL or id | T-R3, T-F1, E-2 |
| 3 | A teacher publishes a multiple-choice assignment; a linked student answers and submits it | T-A1, E-3 |
| 4 | Supported questions are marked automatically | T-M1 to T-M6 |
| 5 | The teacher manually reviews answers that cannot be marked automatically | T-M7, E-4 |
| 6 | A parent uploads scanned handwritten work against the right child and item | T-H1, T-H2, E-5 |
| 7 | The teacher reviews the upload and gives feedback | T-H4, E-5 |
| 8 | The student sees feedback only once it is released | T-V1, T-V2, E-6 |
| 9 | Parents monitor without supervising each activity | T-P1, E-7 |
| 10 | Revoking a link stops later access by the teacher | T-L1 to T-L3, E-8 |
| 11 | Status, submission history and review times are kept correctly | T-S1 to T-S3 |
| 12 | All access rules are verified by backend security tests | T-X matrix |

---

## 9. Test scenarios

All tests use synthetic accounts and small generated files only.

**Database and server tests (`tests/db`):**
- **Resources (T-R):**
  - T-R1: share to a linked student → the student and their parent see it.
  - T-R2: share in a subject not ticked on the link → refused.
  - T-R3: an unlinked student, another family's parent, another teacher or an admin → "not found".
  - T-R4: unshare → gone at once.
  - T-R5: archive → hidden; purged after 30 days.
- **File route (T-F):**
  - T-F1: every non-allowed viewer gets 404 with an identical body.
  - T-F2: no-store headers.
  - T-F3: every allowed viewer can download; every other viewer, including the Super Admin and Admins with every permission, gets 404 (OC-90 Q-3, Q-8).
  - T-F4: a mislabelled file (wrong signature) is refused at upload.
  - T-F5: EXIF location removed from photos.
  - T-F6: HEIC/HEIF, JPEG, PNG, WebP and PDF are accepted from phone-style uploads; HEIC is converted to a viewable JPEG; over-size or unreadable files get the right message (OC-90 Q-4).
- **Assignments (T-A):**
  - T-A1: publish → one target per student, status Assigned.
  - T-A2: publish to an unlinked student → refused.
  - T-A3: a student never receives `answer_key` before release (snapshot of the payload).
  - T-A4: editing questions after a start → refused.
- **Marking (T-M):**
  - T-M1 to T-M5: each auto type, including partial credit, case-insensitive blanks and matching pairs.
  - T-M6: score totals.
  - T-M7: short answer → Under review; the teacher's points and comment are added and released with the rest (OC-90 Q-2).
- **Handwritten (T-H):**
  - T-H1: a guardian uploads for their own child → In progress.
  - T-H2: another parent, the student, or the wrong child's assignment → refused.
  - T-H3: limits on file count and size.
  - T-H4: the teacher views the pages and marks.
- **Visibility (T-V):**
  - T-V1: before release, the student sees "Waiting for teacher" and the payload carries no marks.
  - T-V2: after release, everything is visible.
  - T-V3: correct answers stay hidden if the teacher chose so.
- **Lifecycle (T-S):**
  - T-S1: every allowed transition succeeds; every other pair is refused (full matrix).
  - T-S2: revision keeps attempt 1 and shows attempt 2.
  - T-S3: overdue is computed from the teacher's due date in UTC and shown in local time.
  - T-S4: a late submission is accepted, marked Late, keeps its timestamp and due date, and appears in the review queue; changing the due date afterwards does not change it (OC-90 Q-10).
  - T-S5: feedback is typed only; both Reviewed and Revision required carry it (OC-90 Q-7).
- **Retention (T-RET, OC-90 Q-6):**
  - T-RET1: records past `purge_after` are deleted with their files; the item shows "Removed after 12 months".
  - T-RET2: records inside 12 months are untouched.
  - T-RET3: the audit trail keeps no content.
- **Links (T-L):**
  - T-L1: removing the link → the teacher loses submissions at once.
  - T-L2: removing one subject → only that subject is affected.
  - T-L3: open targets → Withdrawn; the child keeps released feedback.
- **Concurrency (T-C):**
  - T-C1: two submits at once → one Submitted.
  - T-C2: mark versus revision race → one wins, with a clear error for the other.
- **Parents (T-P):**
  - T-P1: the parent dashboard lists every assignment and resource for their own children only, across all teachers.
- **Audit (T-X):** every row of the section 3 table has a test that tries each role and checks the result and the audit event.

**Browser tests (`tests/real`, real accounts):**
- E-1 to E-8 walk the owner's acceptance criteria end to end.
- They are teacher → student → parent flows, in light and dark, on desktop and phone.
- Each runs an axe accessibility check and a keyboard pass.

---

## 10. Conflicts and gaps found (not decided silently)

| # | Topic | What already exists | What this request says | Smallest resolution |
|---|---|---|---|---|
| K-1 | **File storage** | C-5 (OC-79): synthetic files only; storage options and prices are presented before any paid provider. Only teacher photos (≤200 KB) are approved for AA Pro's database (OC-85) | Teachers upload resources; parents upload scans and photos (megabytes each) | **Resolved (OC-87 Q-9):** build a shared private file store now. Files go in AA Pro's own database for the test environment, behind one storage interface, so a provider can be swapped in later. Before real use, Claude presents 2–3 storage options with prices for approval. The same store also unblocks textbook uploads (OC-79). |
| K-2 | **Subject scope** | OC-41: a teacher acts only within the subjects the parent ticked for that child | "Students linked to them", with no subject limit stated | **Resolved (OC-87 Q-1):** sharing and assignments only in the linked subjects (FR-021.6) |
| K-3 | **Download** | OC-41(5): teachers view parents' books and cannot download them | OC-90 Q-3: no download restriction for authorised users | **Resolved:** no restriction for teacher resources and homework files. OC-41(5) still applies only to parent-uploaded textbooks viewed by teachers |
| K-4 | **Retention** | D-28 (data retention) and D-24 (summaries) are still open | OC-90 Q-6: 12 months for homework | **Resolved for homework** (FR-027.4, FR-027.5); D-28 stays open for everything else |
| K-5 | **After unlinking** | OC-41(4): access ends at once for the teacher | "Access to that child's resources and learning records must be removed" | **Resolved (OC-87 Q-5):** the teacher loses access; the child and parent keep the child's own records and already-shared resources |
| K-6 | **Notifications** | OC-65: real email is disabled; WhatsApp is not approved | "Receive configurable notifications" | Queued only, with honest wording (FR-026.2) |
| K-7 | **Designs first** | OC-79 / P2 plan: document sharing needs designs approved before building | Implementation requested | Boards HW1 to HW9 for approval first; the back end can be built in parallel |
| K-8 | **Teacher dashboard copy** | The dashboard (PR-T1) said "Not decided yet (D-16)" | D-16 was closed by OC-51 and is now extended | Fixed in this PR: the panel now says sharing arrives with CR-07 |
| K-9 | **Quizzes** | The AI Teacher feasibility proposes "no quizzes" for the **AI** tutor's Q&A | Teachers set exercises | No conflict: the rule applies to the AI tutor only. Teacher homework is allowed |
| K-10 | **Student uploads** | Master instruction: students cannot upload | Parents upload handwritten work | No conflict: only parents and guardians upload (FR-023.9) |

## 11. Owner decisions on the questions (none left open)

| Q | Question | Decision |
|---|---|---|
| Q-1 | May a teacher share and set homework only in the subjects the parent ticked? | **Yes, ticked subjects only** (OC-87) |
| Q-2 | A short written-answer type? | **Approved:** marked by the teacher, part of the submission and review (OC-90) |
| Q-3 | Download of teacher resources and homework files? | **No restriction for authorised users;** no per-file switch; access control unchanged (OC-90) |
| Q-4 | iPhone HEIC and other phone uploads? | **Accept uploads from any mobile device, including HEIC;** convert on the server (OC-90) |
| Q-5 | What the child keeps after unlinking | **Their own records** and resources already shared; the teacher loses access (OC-87) |
| Q-6 | Retention | **12 months;** expiry rule in FR-027.5 (OC-90) |
| Q-7 | Feedback format | **Typed only** for the first release (OC-90) |
| Q-8 | Admin access to children's homework | **None,** enforced on the server, no override (OC-90) |
| Q-9 | Storage | **AA Pro's database for testing;** provider with prices before real use (OC-87) |
| Q-10 | Late submissions | **Allowed, marked Late,** times kept (OC-90) |

**Implementation note for Q-4:** the image library AA Pro already uses (sharp) may not decode HEIC, because the HEIC format uses a separately licensed video codec. PR H-1 will check this first. If sharp cannot decode it, H-1 will add a HEIC decoder with a compatible licence, or convert HEIC to JPEG in the parent's browser before upload. Any new dependency and its licence will be reported in that PR.

## 12. Delivery plan (after confirmation)

> **OC-91 (budget $0):** H-0 to H-5 use no paid service. Files go in the existing database on Neon's free plan (1 GB per project: enough for small synthetic test files, not for real use). Notifications stay queued. Object storage for real use, and real email, are **Blocked — Owner Budget Approval Required**. Any HEIC decoder must be free open-source software with a compatible licence.

Each step is one pull request with its own tests. Only synthetic data is used; nothing paid; nothing goes to production.

| PR | Content |
|---|---|
| H-0 | Boards HW0 to HW9 (designs for approval), drawn 18 Oct 2026 on the design canvas page "Homework & shared resources" (named HW to avoid clashing with homepage boards H1, H2) |
| H-1 | Private file store (`stored_files`, the file route, type and size checks, photo re-encoding). It also serves textbooks later |
| H-2 | Teacher resources: share, unshare, archive, plus the student and parent views |
| H-3 | Assignments and the lifecycle engine, exercises with auto-marking, and the student player |
| H-4 | Handwritten homework: parent upload, teacher review, release and revision |
| H-5 | Dashboards (HW1, HW5, HW8), queued notifications and the unlink behaviour |

The marketplace step D4b (contact exchange, Report, payments question, shortlist) is still pending. Claude proposes building H-1 to H-5 first, because the owner has now described this as an end-to-end learning workflow; D4b follows unless the owner prefers otherwise.
