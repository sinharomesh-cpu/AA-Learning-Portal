# CR-10 — Lesson review for parents: whiteboard replay, teacher summary and (later) video recording

**Version:** 1.0 · 18 Oct 2026 · **Status:** specification only. Nothing is built. Video recording is **Blocked — Owner Budget Approval Required** (OC-91) and blocked by a legal and privacy review.
**Source:** owner request, 18 Oct 2026, 09:22 IST: "Human teacher session should be recorded — use case is recorded session can be checked by parents anytime after the class to know how the session was going, how teacher was studied, how the children did". The owner's answers are recorded as **OC-93**.

## 1. Was recording in scope?

No. It was removed in Phase 0 and several documents say no recording is kept:

| Source | What it says |
|---|---|
| Decision register, Part B **R-03** | "Zoom Enterprise, vanity domain, recording, E2E claim — Removed. Zoom Basic, external launch, no recording." |
| FRD v1.1, FR-016.2 / OD-08 | Raw audio is disabled by default |
| Master instruction §12 | "Avoid collecting or retaining audio recordings unless separately approved and necessary" |
| CR-09 FR-030.6 | "No audio, video or screen recording is made or kept" |

This change request is that separate approval for the **purpose** (parents checking how a teacher lesson went). It does not approve any spending, service or launch.

## 2. Owner decisions (OC-93)

| # | Question | Decision |
|---|---|---|
| 1 | Approach | **Free now, video later.** Now: a step-by-step whiteboard replay and a short written summary from the teacher. Video recording is added later, only after its budget and the legal review are approved |
| 2 | Who may watch a recording | **The parent and the child.** Not the teacher, not admins |
| 3 | How long recordings are kept | **30 days**, then deleted |
| 4 | Consent | **The parent opts in for each child, and the teacher agrees.** "Recording" is shown on screen for the whole lesson |

## 3. Requirements

### FR-032 Free lesson review (can be built now, no cost)

| ID | Requirement |
|---|---|
| FR-032.1 | **Whiteboard replay.** For each human-teacher lesson, the saved lesson notes (CR-09 FR-030) can be played back step by step in the order the marks were made, with play, pause, speed (1×, 2×, 4×) and a time slider. It uses the board operations CR-09 already stores, so nothing new is captured. Each mark shows who made it (teacher or child). |
| FR-032.2 | **Teacher's lesson summary.** After a lesson the teacher is asked to write a short summary in fixed parts: *What we covered*, *How [child] did*, *What to practise next*. Each part is at most 500 characters, typed only. |
| FR-032.3 | The summary can be edited by the teacher for 48 hours after the lesson, then it is locked. Every edit is kept in the audit log. *(48 hours is a proposal — see Q-3.)* |
| FR-032.4 | The parent and the child see the replay and the summary in lesson history, next to the lesson notes. The teacher sees them for their own lessons while still linked. Admins never see them (OC-90 Q-8). Same rules and "not found" refusals as CR-09 FR-031. |
| FR-032.5 | Retention follows the lesson notes: 12 months, then deleted with the same notice (CR-07 FR-027.5). |
| FR-032.6 | AI lessons have no teacher summary. The existing AI session summary rules apply (FR-016, off by default). |

### FR-033 Video recording of human-teacher lessons (blocked)

| ID | Requirement |
|---|---|
| FR-033.1 | **Blocked — Owner Budget Approval Required** (OC-91), and blocked until a legal and privacy review of recording children is complete (see §5). Nothing in FR-033 is built, configured or switched on before both approvals. |
| FR-033.2 | Human-teacher lessons only. AI lessons are never recorded (there is no video, and FR-016.2 keeps raw audio off). |
| FR-033.3 | **Off by default.** A lesson is recorded only when (a) the parent has turned recording on for that child, and (b) the teacher has agreed to recording. Both choices are recorded with the time and can be withdrawn; withdrawing applies to future lessons. |
| FR-033.4 | When a lesson is recorded, "● Recording" is shown to the teacher and the child for the whole lesson, and the child is told in simple words before the lesson starts. |
| FR-033.5 | The parent and the child can watch the recording in lesson history. The teacher, other parents, admins and the Super Admin cannot. Every refusal returns "not found"; the server enforces this. |
| FR-033.6 | Recordings are deleted **30 days** after the lesson. The parent can delete one sooner. Deleting the child's account deletes them at once. |
| FR-033.7 | Recordings are stored privately and played through short-lived links issued only to the parent or child; they are never public or sent by email. |
| FR-033.8 | If recording fails or is not available, the lesson still goes ahead and the parent is told that no recording was made. AA Pro never claims a recording exists unless the stored file is confirmed. |

## 4. Open questions for the owner (not decided)

| # | Question | Recommendation |
|---|---|---|
| Q-1 | If the parent turns recording on but the teacher does not agree, what happens? | The lesson goes ahead unrecorded and the parent sees "This teacher has not agreed to recording" before booking |
| Q-2 | May the parent or child download a recording? | No: watch inside AA Pro only (limits copies of a child's video) |
| Q-3 | Teacher summary: required or optional, and how long can it be edited? | Optional but prompted; editable for 48 hours |
| Q-4 | Should the child's camera be in the recording, or only the teacher, the screen and the audio? | Decide during the legal review |
| Q-5 | How recordings are made (needs budget) | See §6: Zoom paid cloud recording, or the teacher uploads Zoom's free local recording to paid storage |

## 5. Legal and privacy gates (before FR-033 is built)

- India's Digital Personal Data Protection Act 2023 has extra rules for children's personal data, including verifiable parental consent. A video of a child is sensitive. A qualified legal review is needed; this document is not legal advice.
- The teacher's own consent to being recorded, added to the draft Teacher Terms.
- The privacy notice must explain recording, who can watch it, and the 30-day deletion.
- Zoom's own recording notices and terms apply if Zoom records.

## 6. Cost and service options (for the later budget request)

| Option | What it needs | Cost |
|---|---|---|
| A. Zoom cloud recording | A paid Zoom plan (cloud recording is not on the free Basic plan) and Zoom's API to fetch recordings | Paid. Zoom itself is not yet approved (OC-91) |
| B. Teacher uploads Zoom's free local recording | The free Basic plan records to the host's computer; the teacher uploads the file | Recording is free, but storing video needs paid storage: the free database (1 GB) is not suitable for video |
| C. No video | FR-032 only | Free |

A budget request with the service name, monthly and test cost, worst case and spending controls will be presented before anything is chosen (OC-91).

## 7. Conflicts this change resolves

When FR-033 is approved and built, R-03 ("no recording"), master §12 and CR-09 FR-030.6 are updated to say that only consented, human-teacher lesson recordings are kept, for 30 days. Until then they stay as they are. FR-032 does not conflict with any of them: it records nothing new.

## 8. Tests (planned)

- **Access:** parent, child, teacher, other parent, admin against replay, summary and recording.
- **Consent:** no recording unless both parent and teacher agreed; withdrawal stops future recording.
- **Retention:** 30-day deletion of recordings; 12-month deletion of replay and summary.
- **Replay:** order, authorship and speed match the stored operations.
- **Summary:** length limits, edit lock and audit log.

## 9. Designs needed

Boards LR0–LR5 for: the replay player; the teacher's summary form; the parent's recording switch per child; the teacher's consent; the "Recording" indicator; and the parent's lesson review page. They will be drawn after the owner has reviewed HW0–HW9 and WB0–WB5.
