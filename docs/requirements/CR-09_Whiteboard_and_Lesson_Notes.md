# CR-09 — Live Whiteboard and Lesson Notes (AI and human-teacher lessons)

**Version:** 1.0 · 18 Oct 2026 · **Status:** specification; designs WB0–WB5 are drawn and awaiting the owner's review. Nothing is built yet.
**Source:** owner request, 18 Oct 2026, 08:59 IST ("whiteboard and live whiteboard notes, lecture notes for both AI and human teacher"), with the owner's answers recorded as **OC-92**.

## 1. Owner decisions (OC-92)

| # | Question | Decision |
|---|---|---|
| 1 | Where the human-lesson whiteboard lives | **AA Pro's own board**, opened next to the Zoom call. It is free and works now. It updates every 1–2 seconds, not instantly |
| 2 | Who writes in a human lesson | **The teacher and the child.** The teacher invites the child to write and can undo or clear the child's marks |
| 3 | AI-written notes | **Allowed in AI lessons only**, labelled "Written by the AI Tutor". The textbook rule OC-74(5) (no AI-made study content in the textbook area) is unchanged |
| 4 | After the lesson | **Saved to lesson history** as read-only "Lesson notes". The child and parent can view and download them; the teacher can, for their own lessons. Kept 12 months, like homework (OC-90 Q-6) |

## 2. Requirements (FR-028 to FR-031)

### FR-028 Live whiteboard: human-teacher lessons
| ID | Requirement |
|---|---|
| FR-028.1 | Each confirmed human lesson (OC-45) has one board. It opens with the lesson's Start/Join window (OC-44: 10 minutes before the start until the end) and is read-only after the end. |
| FR-028.2 | Tools: pen, highlighter, eraser, typed text, line, arrow, rectangle, circle, 6 colours, 3 thicknesses, undo and redo, new page, page list, and clear page (teacher only, with confirmation). |
| FR-028.3 | **The teacher always writes.** The teacher turns "Let [child] write" on or off. The child's ink has its own colour, and the teacher can undo or clear the child's marks. The child cannot clear the teacher's marks. |
| FR-028.4 | Live updates every 1–2 seconds through AA Pro's own server, with no paid real-time service (OC-91). A "Saved · up to date" or "Reconnecting…" status is always visible. Marks drawn while offline are kept and sent when the connection returns. |
| FR-028.5 | Only the lesson's teacher and child can open it while it runs. The child's parent can view the saved notes afterwards (FR-031). No one else, including admins, can open it. |
| FR-028.6 | It works with mouse, finger and stylus (pointer events) on desktop, tablet and phone. On a phone the child sees the board full-width with a smaller toolbar. |
| FR-028.7 | No images, files or links can be put on the board in version 1 (no uploads to moderate). Inserting a page from a shared resource may come later, subject to approval. |

### FR-029 AI-lesson notes
| ID | Requirement |
|---|---|
| FR-029.1 | During an AI lesson (OC-89), the AI Tutor can add short notes to the board: a heading, a key point, a numbered step, a formula, or a worked example. Each note is labelled "Written by the AI Tutor". |
| FR-029.2 | Notes come through a **defined, validated tool interface** (like page navigation, master instruction §6). The server checks each note's type and length (at most 200 characters), applies the same quiz and question check as the session controller, rejects personal data, and limits notes to 30 per lesson. Spoken words never write on the board directly. |
| FR-029.3 | The child can draw and type their own notes on the same board, in their own colour. The AI Tutor never changes the child's marks. |
| FR-029.4 | **Blocked — Owner Budget Approval Required** (OC-91) and blocked by provider eligibility (R-AI-1) for real AI output. Until then it is built and tested with the simulated tutor only. |
| FR-029.5 | AI notes follow the subject and chapter the parent assigned. No AI-made content is added to the textbook or study-tools area (OC-74(5) unchanged). |

### FR-030 Saving and lesson notes
| ID | Requirement |
|---|---|
| FR-030.1 | At the end of a lesson the board is saved automatically as "Lesson notes": every page in a vector format, which keeps the drawings sharp, plus the typed text. |
| FR-030.2 | Lesson notes appear in the child's history (S-16), the parent's session history and the teacher's lesson detail (own lessons only, while the teacher is still linked; OC-87 Q-5). |
| FR-030.3 | Anyone who can see the notes can download them, as a PDF or images, made on AA Pro's own server with free open-source software (OC-90 Q-3, OC-91). |
| FR-030.4 | **Retention:** 12 months after the lesson, then deleted, with the same notice and "Removed after 12 months" label as homework (CR-07 FR-027.5). Deleting the child's account removes them sooner. |
| FR-030.5 | Admins never see lesson notes (consistent with OC-90 Q-8). |
| FR-030.6 | No audio, video or screen recording is made or kept (master instruction §12). A whiteboard replay and consented video recording of human lessons are covered by CR-10 (OC-93); video stays blocked until approved. |

### FR-031 Access summary
| Action | Child | Parent | Teacher | Admin |
|---|---|---|---|---|
| Open a live human-lesson board | Own lesson, in the window | No | Own lesson, in the window | No |
| Write on it | When the teacher allows | No | Yes | No |
| Open a live AI-lesson board | Own session only | No | No | No |
| See and download saved lesson notes | Own | Own children | Own lessons, while linked | No |

Every refusal returns "not found" (the CR-07 rule). The server enforces all of this; hiding a button is not enough.

## 3. Technical approach (free, OC-91)

- **Drawing:** AA Pro's own small canvas component (pointer events, vector strokes). A lightweight own build keeps the bundle small and needs no licence.
  - Excalidraw (MIT licence) is a possible free alternative.
  - **tldraw is excluded**, because its production use needs a paid licence.
- **Storage:** each change is an append-only operation (stroke, text, erase, clear, undo), stored in AA Pro's own database (`board_ops`, `boards`). Pages are rebuilt from the operations; at the end, a snapshot is stored for the saved notes.
- **Sync:** short polling every 1–2 seconds, with a cursor on the last operation seen, plus batched sending. No WebSocket service is needed.
  - **Limit:** the Neon free plan has 100 compute-hours a month. Polling keeps the database awake during lessons, which is fine for testing but needs checking before real use. Moving to a paid real-time service would need a budget request.
- **Size limits:** 20 pages per board and 5,000 operations per page. Each operation is at most 8 KB, and points are thinned on the client.
- **The AI tool:** `add_board_note({kind, text})`. It is validated on the server, written as the AI Tutor and rate-limited.

## 4. Tests (planned)

- **Access matrix:** every role against live and saved boards, including the outside-window and unlinked cases.
- **Writing permission:** the child can't write unless allowed, and can't clear or undo the teacher's marks; the teacher can undo or clear the child's marks.
- **Ordering and sync:** concurrent strokes from two users; offline marks sent later; the cursor never skips or repeats an operation.
- **Size limits:** operations, pages and size refused when exceeded.
- **AI note validation:** type, length, quiz wording, personal data, 30-note limit, labelling; the simulated tutor only.
- **Saved notes:** a snapshot at the end; read-only afterwards; download; 12-month removal; the teacher loses access after unlinking while the child keeps the notes.
- **Accessibility:** typed notes readable by screen readers; every tool reachable by keyboard; 44 px touch targets.

## 5. Dependencies and order

| Area | Depends on |
|---|---|
| The human-lesson board | Real teacher lessons (Phase 3). It can be built and demonstrated now with sample lessons |
| AI notes | The AI classroom page with the simulated tutor. Real AI notes are blocked by R-AI-1 and the budget (OC-91) |
| Download as PDF | A free open-source PDF library, with its licence checked in its PR |

**Suggested order:** after the homework build (CR-07 H-1 to H-5), or in parallel once the boards are approved.
