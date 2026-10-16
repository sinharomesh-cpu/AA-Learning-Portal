# AA Pro — P2-R2 Textbooks, chapters and the chapter reader: gap analysis and plan

**Version:** 1.1 · 16 Oct 2026 (§9: consolidated owner decisions, OC-79) · **Prepared by:** Claude (business analyst and developer roles) · **Status:** requirements confirmed by the owner; designs awaiting visual review. Nothing in this document is built yet.
**Source:** owner requirements "Existing Textbook and Chapter Functionality: Parent/Student Role Separation" (16 Oct 2026, 14:25 IST) and "Chapter Scrolling" (14:27 IST), and four screenshots of the owner's separate local application.

## 1. What was checked

| Source | What I did | Limits |
|---|---|---|
| Four screenshots of the owner's local application | Listed every visible feature (§2) | I have **not** seen that application's code or data, so I cannot tell which features really work there and which are display only. "A button is visible" is not treated as "it works". |
| AA Pro repository (`main` after PR #35) | Looked for books, chapters, uploads, reader, flashcards, quizzes and storage in pages, server code and database migrations 0001–0007 | — |
| Approved requirements | FRD v1.1 (FR-011, FR-012, FR-014), decision register v1.27, canonical screen inventory (M-14, S17, S18), P2-R1 | — |

**Privacy note.** The screenshots show what look like children's first names, their class and a school name, and "sample textbooks" named after that school. None of these are copied into this document, the code or the tests. AA Pro keeps using made-up data only (D-28 is still open).

## 2. Feature inventory and status in AA Pro

Status key: **Missing** = nothing in AA Pro yet · **Placeholder** = a menu page that says "coming later" · **Blocked** = needs an owner decision or an external service first.

| # | Feature seen in the screenshots | AA Pro today | Status | Notes / conflicts (§4) |
|---|---|---|---|---|
| F-01 | Parent selects one of their children | Parent's children list and child profiles exist (PR #31) | Partly built (selection inside a content flow is missing) | School and class shown on the child card: AA Pro deliberately does not collect the school (C-4) |
| F-02 | Choose subject (6 subjects) | Subject list exists (`maths, science, sst, english, hindi, it`) | Built (data) | Labels: AA Pro uses "SST" and "IT" (approved); screenshots say "Social Studies" and "Information Tech" (C-19) |
| F-03 | Chapter sequence number (Ch 1, Ch 2 …, "Next") | Nothing | Missing | |
| F-04 | Chapter title | Nothing | Missing | Screenshot pre-fills "Chapter 1: Science". OC-63: no invented chapter names, so the parent types it (C-6) |
| F-05 | Upload PDF, PNG or JPG | `/parent/content` is a placeholder | Missing · **Blocked** on storage (C-5) | OC-64: no storage or scanning service until options and prices are approved |
| F-06 | "Pages extracted", "Review / Edit text" | Nothing | Missing · partly **Blocked** | Reading text out of a PDF that already contains text is free and local. Reading text out of photos/screenshots is OCR: **out of the initial release (OC-03)** (C-1, C-14) |
| F-07 | "Process & organise chapters" | Nothing | Missing | Needs a definition: what "processing" does besides counting pages (C-1) |
| F-08 | One-click sample textbooks from a named school ("curriculum preset") | Nothing | **Blocked** | Licensing (D-26) and the identifying-terms rule (C-3) |
| F-09 | Chapter list, "Add chapter" | Nothing | Missing | |
| F-10 | Read full chapter, page x of N, previous/next, jump to page, single page / all pages | Nothing | Missing | Matches FR-011 textbook viewer. **Owner update 14:27 IST: continuous vertical scrolling replaces page-by-page as the main way to read** (C-20) |
| F-11 | Summary & Vocab | Nothing | Missing · **Blocked** if AI-generated | OC-03: "AI study-card generation" is out of the initial release (C-1, C-2) |
| F-12 | Flashcards | Nothing | Missing · **Blocked** if AI-generated | Same as F-11 |
| F-13 | Quiz checkpoint | Nothing | Missing · **Blocked** if AI-generated | Separate from the AI Tutor, which asks no quiz questions in booked lessons (C-8) |
| F-14 | Original PDF | Nothing | Missing | Download rules differ by role (C-10) |
| F-15 | Concept diagram | Nothing | Missing · needs definition | The screenshot's diagram text ("energy levels, formulas" on a place-value chapter) looks generic, not from the book (C-2, C-17) |
| F-16 | Text size (A+) | Nothing | Missing | Simple, no service needed |
| F-17 | Read aloud (speaker icon) | Nothing | Missing | Free option: the browser's own voice. ElevenLabs would cost money (C-13) |
| F-18 | "Book Human (Zoom)" from a chapter | Parent booking pages are demo-only | Missing · **Blocked** | Zoom is Phase 3/7 and D-10 is open (C-7) |
| F-19 | "AI Mode (Lumina 3D)" from a chapter | Student AI booking is demo-only | Missing · **Blocked** | Must be called **AI Tutor**, never "Lumina"; ElevenLabs is Phase 5 (C-7, C-19) |
| F-20 | Delete chapter | Nothing | Missing | Needs retention rules (C-9) |
| F-21 | Student library (own books only) | `/student/library` is a placeholder | Missing | Approved designs S17/S18 exist |
| F-22 | Teacher sees parent's books for ticked subjects, view only (OC-41) | `/teacher/resources` is a placeholder | Missing | Depends on PR2 (parent–teacher linking with subject ticks) |
| F-23 | Share a chapter with an external teacher | Nothing | **Blocked** | OC-64: designs first, then storage/scanning provider approval |

**Summary:** the whole textbook area is **missing** in AA Pro. Only the building blocks around it exist: parent and child accounts, the parent–child link, subjects, roles and server-side access checks.

## 3. Parent, student and teacher access matrix

"Server check" means the database query or file route refuses the request for anyone else, even if they call it directly.

| Action | Parent (own children only) | Student (self only) | Teacher (linked, ticked subjects only) | Admin / Super Admin |
|---|---|---|---|---|
| Choose which child to manage | Yes | No | No | No (OC-21) |
| Add book, upload file | Yes | No | No | No |
| Review / edit extracted text | Yes | No | No | No |
| Add, retitle, reorder, archive chapters | Yes, with confirmation | No | No | No |
| Load sample textbooks | Blocked (C-3) | No | No | No |
| See the list of books and chapters | Yes | Own only | Linked children, ticked subjects (OC-41) | No (OC-21) |
| Read full chapter, move between pages | Yes | Own only | View only (OC-41) | No |
| Summary & Vocab, Flashcards, Quiz | Yes (if approved, C-1) | Own only | View only (to confirm) | No |
| Original PDF | View and download own uploads (proposed) | View in AA Pro only (proposed, C-10) | View only, never download (OC-41) | No |
| Concept diagram | Yes (if defined) | Own only | View only | No |
| Text size, read aloud | Yes | Yes | Yes | — |
| Schedule an AI lesson | Yes | Yes, within parent limits | No | No |
| Book, cancel, reschedule a human-teacher lesson | Yes | No | Own meetings only | No |
| Join a lesson | Yes, where appropriate | Own lessons only | Own meetings | No |
| Invite an external teacher, share a chapter | Yes (OC-61, OC-64; designs first) | No | No | No |
| Parent–child and teacher links | Parent | No | No | Super Admin only for accounts, not content (OC-21) |

## 4. Conflicts and decisions needed

| # | Topic | Conflict | Options | Claude's recommendation |
|---|---|---|---|---|
| C-1 | AI-made summaries, vocabulary, flashcards, quizzes, diagrams and "processing" | **OC-03** puts OCR and AI study-card generation **out of the initial release**. They also need a paid AI service, which needs your approval | (a) **Parent writes them** (or pastes them) and AA Pro displays them: free, no AI. (b) AI drafts them, the parent reviews and publishes: a scope change (CR-06) plus a provider and price decision. (c) Leave the tabs out for now | (a) now; (b) later as CR-06 with prices |
| C-2 | Invented content | The reference app shows text that does not come from the book (generic "key takeaways", a diagram caption about "energy levels" for place value) and the claim "Full Textbook Content Verified" | AA Pro shows only the parent's file, the parent's own text or, if C-1(b) is approved, AI text clearly labelled as AI-made and reviewed | Never label anything "verified" unless a person checked it |
| C-3 | One-click sample textbooks from a named school | Copyright and licensing (D-26); the school name is on the identifying-terms list | (a) No preloaded books; parents upload their own. (b) Made-up demo chapters for the test site only. (c) Licensed books after legal advice | (a) + (b) |
| C-4 | School and class on the child card | AA Pro does not ask for the school (data minimisation, M-08) | Keep it out; or add an optional "class" field | Keep it out |
| C-5 | Where files are stored | No storage or scanning service is approved (OC-64); FR-012 asks for private storage and scanning where feasible | (a) **Test site only:** store files in the existing test database (free, made-up files, small size limit). (b) A storage provider: I research 2–3 with prices for your choice. (c) Wait | (a) to build and test now, (b) researched in parallel; nothing real is stored until you choose |
| C-6 | Chapter title | The reference fills in "Chapter 1: Science" itself | The parent types the title; the sequence number is suggested | Parent types it (OC-63) |
| C-7 | "Book Human (Zoom)" and "AI Mode" buttons in the reader | Zoom and the AI Tutor are later phases | Show the buttons only when those features are real; until then link to the existing booking pages | Hide until real |
| C-8 | Quiz checkpoint | The AI Tutor does not ask quiz questions in booked lessons | Keep quizzes as a separate, self-study tool | Separate, only if C-1 approves them |
| C-9 | Deleting a chapter | Retention rules are not decided (D-28) | (a) Archive: hidden from everyone, restorable for 30 days, then deleted. (b) Delete at once | (a), always with a confirmation step, recorded in the audit log |
| C-10 | Who may download the original PDF | OC-41 forbids teacher downloads; nothing says what children may do | Parents download their own uploads; children and teachers view inside AA Pro only | As stated |
| C-11 | Order of work | You authorised: PR2 parent–teacher linking, then PR3 teacher directory | (a) PR2 and PR3 first, then textbooks. (b) Textbooks first | (a): teacher access to books (OC-41) needs the PR2 links and subject ticks; designs for the reader can be prepared meanwhile |
| C-12 | Designs | Approved boards exist for the content area (M-14) and the student library (S17, S18). The **Add Book flow and the chapter reader with tabs are not drawn** in AA Pro style | Draw them as new boards for your approval before building, keeping the reference layout and AA Pro branding | Boards first |
| C-13 | Read aloud | ElevenLabs voices cost money | Browser's built-in voice (free, works offline, voice quality varies) | Browser voice |
| C-14 | Text from images | OCR is out (OC-03) | Image pages are shown as pictures; text review is only for PDFs that already contain text | As stated |
| C-15 | File limits | Only sharing has a limit (20 MB, OC-64) | 20 MB per file; PDF, PNG, JPG checked by their content, not only by name | 20 MB |
| C-16 | Where books belong | The reference adds a book "for" one child | Each book belongs to the parent and is assigned to one or more of their children (siblings in the same grade can share it) | As stated |
| C-17 | Concept diagram | Not defined | A picture the parent uploads for a chapter, or leave out | Parent-uploaded picture, or leave out |
| C-18 | Reading progress | Not mentioned | Remember the last page each child read ("continue reading") | Yes, last page only |
| C-20 | Continuous scrolling (owner, 16 Oct 14:27 IST) | AA Pro has no chapter reader yet, so there is nothing to change; the reference reader is page-by-page | Build the reader as one continuous vertical scroll of the whole chapter. Keep page markers ("Page 3 of 16") at each original page break and a "go to page" list that scrolls to that marker; no Next/Previous needed. Pages load as they come into view so long chapters stay fast on phones. Original PDF stays a separate tab. Headings, images, tables and diagrams are shown exactly as in the file, because each page is shown as the original page image, with the PDF's text underneath for read-aloud and text size | As described; designs (R2-1) show it before building |
| C-19 | Names | "Lumina 3D", "Social Studies", "Information Tech" | "AI Tutor", "SST", "IT" as approved | Approved names |

## 5. User stories and acceptance criteria

**US-01 Parent adds a chapter.** As a parent, I choose my child, the subject and the chapter number, type the title and upload a PDF, PNG or JPG, so my child can read it in AA Pro.
- Only my own children are offered; a request naming another family's child is refused by the server.
- Files over 20 MB, or whose content is not really PDF/PNG/JPG, are refused with a clear message.
- After upload I see the page count and can review and correct the text of a PDF that has text; I then publish the chapter.
- The chapter keeps its number, title, page order and original file after refresh and after signing in again.

**US-02 Parent organises chapters.** I can add chapters, change titles and numbers, reorder, and archive a chapter after confirming. Archived chapters disappear for my child at once and can be restored for 30 days (C-9).

**US-03 Parent reads.** I can open the same reader as my child for my own children's chapters.

**US-04 Student library.** As a student, I see only my own subjects, books and chapters, in order, with an empty state when nothing is assigned. I can continue where I stopped.

**US-05 Student reads.** I scroll through the whole chapter up and down without Next/Previous buttons (C-20); I can see which original page I am on and jump to a page, change the text size and listen (browser voice). Summary, vocabulary, flashcards and quiz appear only if they exist for that chapter and C-1 allows them.

**US-06 Student restrictions.** I have no upload, edit, reorder, archive, assign, invite or human-booking controls, and the server refuses those actions if they are called directly.

**US-07 No cross-child access.** Nobody can open another child's chapter, page image or file by changing a link; the server answers "not found".

**US-08 Teacher view only (after PR2).** A linked teacher sees the ticked subjects' chapters for that child, view only, with no download.

## 6. Proposed delivery plan (each step a separate pull request with its own scope summary and report)

| Step | Content | Depends on |
|---|---|---|
| R2-0 | Your decisions on §4 | — |
| R2-1 | Design boards: Add Book flow (desktop and phone) and chapter reader (parent and student versions), AA Pro style, for approval | C-12 |
| — | PR2 parent–teacher linking and PR3 teacher directory, as already authorised | (C-11 option a) |
| R2-2 | Database: books, chapters, files, pages, assignments, reading progress; one server access check used by every page, data request and file route; storage on the test database only (C-5a) | R2-0, R2-1 |
| R2-3 | Parent Add Book flow and chapter management (US-01, US-02), with audit entries | R2-2 |
| R2-4 | Shared chapter reader with continuous scrolling (C-20) and student library (US-03 to US-07) | R2-2 |
| R2-5 | Parent-written summary, vocabulary, flashcards, quiz, diagram (only if C-1(a) is approved) | R2-4 |
| R2-6 | Teacher view-only access (US-08, OC-41) | PR2, R2-4 |
| Later | AI-drafted study tools (C-1b), external sharing (OC-64), reader shortcuts to booking, Zoom and AI Tutor | Your approvals and providers |

## 7. Acceptance tests and traceability

| # | Owner's acceptance test | Story | Step | Test type |
|---|---|---|---|---|
| 1 | Parent selects own child and adds a book | US-01 | R2-3 | Database + real browser |
| 2 | Upload and supported processing | US-01 | R2-3 | Database + real browser (made-up PDF and image) |
| 3 | Review/edit extracted text | US-01 | R2-3 | Real browser |
| 4 | Add and organise chapters in sequence | US-02 | R2-3 | Database + real browser |
| 5 | Parent opens the reader | US-03 | R2-4 | Real browser |
| 6 | Student sees only own books | US-04 | R2-4 | Database + real browser |
| 7 | Student reads and uses learning controls | US-05 | R2-4/R2-5 | Real browser + accessibility scan |
| 7a | Continuous scroll through every page on desktop and phone, page markers and "go to page" correct, Original PDF separate | US-05 | R2-4 | Real browser (desktop and phone sizes) |
| 8 | Student cannot upload or change content | US-06 | R2-3 | Database (direct calls) + real browser |
| 9 | Student cannot delete or assign | US-06 | R2-3 | Database (direct calls) |
| 10 | Student cannot create, cancel or reschedule human lessons | US-06 | Phase 3 booking (already a rule) | Database (direct calls) |
| 11 | Student joins only own lessons | — | Phase 3 | Database + real browser |
| 12 | Parent manages classes and invites an external teacher | — | Invitation build (OC-61, designs first) | — |
| 13 | No cross-child access by link, data request or file URL | US-07 | R2-2 onward | Database + real browser |
| 14 | Data survives refresh and a new sign-in | US-01, US-04 | R2-3/R2-4 | Real browser |
| 15 | Empty, invalid, failed upload and refused cases | US-01, US-06 | R2-3/R2-4 | Database + real browser |
| 16 | Everything else still passes | — | Every PR | All 11 CI checks |

Tests 10–12 belong to booking and invitation work that is already planned; they are listed so nothing is lost.

## 8. External dependencies

- **Storage and malware scanning** for real files (C-5b): provider choice and prices, your approval.
- **AI service** only if C-1(b) is chosen: provider choice and prices, your approval.
- **Licensing advice** before any school or publisher textbook is preloaded (C-3, D-26).
- **Zoom** (D-10) and **ElevenLabs** (Phase 5) for the reader's lesson shortcuts.

## 9. Consolidated owner decisions (OC-79, 16 Oct 2026, 19:27 IST)

The owner consolidated all textbook decisions in one message (Parts A, B and E). This section applies them. Earlier decisions in OC-74 stay in force unless amended below.

### 9.1 Status of each item

| Category | Items |
|---|---|
| **Confirmed by the owner** | Parts A1–A5 and A7 (requirements); conflicts C-2 to C-7 in §4 (decisions below); delivery order (Part E) |
| **Designs awaiting visual review** | Boards R1–R6, revised, new boards R7 (review proposed chapters) and R8 (parent and student libraries), and a read-me board (R0) giving each board's role, purpose, key actions, states and next screens. **None is visually approved** |
| **Approved for implementation** | The requirements in §9.2–9.4. The textbook **screens** are built only after the owner approves the boards (OC-74(8), A6). Server-side groundwork before that needs the owner's go-ahead (§9.7) |
| **Still needs separate approval** | Paid storage, malware scanning, OCR or any other external service (A7, C-5); real textbook files or real child data; AI-made study content (A7, C-2); production deployment |

### 9.2 Requirements added or changed

| # | Requirement | Source | Change from OC-74 |
|---|---|---|---|
| T-1 | The parent may upload a **complete textbook PDF** or **one chapter** (PDF, or PNG/JPG photos of pages) | A2 | **New:** OC-74 and R3 covered one chapter at a time |
| T-2 | For a complete PDF, AA Pro **proposes** chapters from the PDF's bookmarks, its contents page, extractable text and reliable chapter headings: title, sequence number and page range. The parent reviews and corrects them before they are saved | A3 | **New** |
| T-3 | Scanned (image-only) PDFs: the original is kept and the parent sets up chapters by hand (page ranges from thumbnails). No OCR | A3, OC-74(4) | Same rule, now with manual page ranges |
| T-4 | A chapter is a **page range of the original file** where possible; the original PDF is never split into copies | A3 | **New** data-model rule |
| T-5 | For a single-chapter upload the parent types the title; the next sequence number is suggested | A3, C-6 | Same as OC-63/OC-74 |
| T-6 | The parent selects **one of their own children and a subject** first; a book or selected chapters can be assigned to one or more of their linked children | A2 | **Changed:** assignment per chapter as well as per book |
| T-7 | The parent confirms they are **authorised to upload and use the material** for the children's education; books stay private to the family | A1 | Wording updated; final wording goes to legal review with the terms |
| T-8 | Reader: continuous vertical scrolling, original PDF page markers, Go to page, separate Original PDF view, text size, browser read-aloud, saved position per student and chapter, desktop and phone | A4 | Same as OC-74(1) |
| T-9 | Page markers show the **PDF page number**; where the printed number differs, the reader says "PDF page"; no page numbers are made up | A4 | Clarified |
| T-10 | Teachers: view only, approved and linked, only subjects both ticked by the parent and approved for the teacher; **no download of the original PDF**; enforced on pages, data requests and file routes | A5 | Same as OC-74(2); uses `teacherMaySee` from PR2 |
| T-11 | 20 MB per file; PDF, PNG, JPG checked by content and signature | A7 | Same |
| T-12 | No AI-made summaries, vocabulary, flashcards, quizzes or diagrams | A7, C-2 | Same; parent-written study tools (OC-74(5)) are unchanged |
| T-13 | Archive with confirmation and 30-day restore; no irreversible deletion without confirmation and the approved retention behaviour | A7 | Same as OC-74(3) |
| T-14 | No school or school-class field on the child profile; grade and curriculum may be collected where needed | A2, C-4 | Same |

### 9.3 Decisions on §4 conflicts C-2 to C-7

| # | Decision (owner) |
|---|---|
| C-2 | Do not invent textbook content. Show only the parent's uploaded material and parent-entered information. Never show "Full Textbook Content Verified" or similar unless a person has done that check. Future AI content needs separate approval, labelling and review |
| C-3 | No preloaded textbooks from a named school. Synthetic, made-up data only for tests and demos. A licensed catalogue needs a separate rights review |
| C-4 | No school or class field on the child profile |
| C-5 | Test with synthetic files only; do not store real textbooks or private family content in the test database. Research 2–3 private-storage options (costs, security, data region, operations) and present them before connecting a paid provider. Never claim malware scanning or secure production storage that is not configured and tested |
| C-6 | The parent enters or confirms the chapter title; the sequence number may be suggested; automatic detection is a proposal for the parent to review |
| C-7 | No non-working booking or AI Tutor controls in the reader. Show them only when genuinely available; until then hide them or link clearly to an existing working page. Use the approved "AI Tutor" name; no Lumina branding |

Note on numbering: these are the textbook conflicts of this document (§4). The marketplace document P2-R3 also has items numbered C-2 to C-7 (§13.6); those are different and remain open.

### 9.4 Data model (proposed, for R2-2)

- `books`: parent owner, subject, title, source type (`whole_pdf`, `chapters`), status.
- `book_files`: one row per uploaded file; original kept unchanged; size, checked type, page count, whether text was found.
- `chapters`: book, sequence number, parent-confirmed title, file, **first and last page in that file**, status (draft, published, archived), archived date; proposal source (`bookmarks`, `contents_page`, `heading`, `manual`).
- `chapter_assignments`: chapter × child (only the parent's own children); a book-level assignment is a shortcut that assigns all its chapters.
- `reading_positions`: student × chapter × last PDF page.
- Every page, data request and file route calls one access check: parent owns it; student has an assignment; teacher passes `teacherMaySee` for the book's subject and never gets the download route.

### 9.5 Technical constraints (not resolved silently)

| # | Constraint | Proposed handling |
|---|---|---|
| TC-1 | **20 MB and whole textbooks.** Many complete textbook PDFs, especially scans, are larger than 20 MB | Keep 20 MB (A7). The error message suggests uploading the book chapter by chapter. Raising the limit would be a new decision |
| TC-2 | **Chapter detection needs a PDF library** that reads bookmarks, page text and headings | Use a free, open-source library (PDF.js, Apache-2.0) on the server; no paid service. Package version confirmed before installing |
| TC-3 | **Detection quality varies.** Contents pages often use printed page numbers that differ from PDF page numbers | Proposals are always shown for review; a page-number offset field lets the parent align printed and PDF numbers; nothing is saved without the parent's confirmation |
| TC-4 | **Test-site storage** in the database is small and only for synthetic files (C-5) | Size cap on the test site; real files wait for the storage decision |
| TC-5 | **"No download" for teachers** can be enforced only for AA Pro's own routes; a person can still photograph a screen | Explained in the teacher terms; pages are served as images with no download route for teachers and students |

### 9.6 Acceptance criteria added

17. A complete PDF with bookmarks shows proposed chapters with titles and page ranges; nothing is saved until the parent confirms; the parent can rename, merge, split, remove and add chapters.
18. A PDF with no bookmarks, contents page or headings shows "No chapters found" and offers manual setup; no titles are invented.
19. A scanned PDF is kept, has no Text view, and its chapters can be set up by page range.
20. Chapters of a whole-book upload read the pages of the original file; no copy of the PDF is created.
21. A chapter assigned to one child is not visible to a sibling who was not assigned it.
22. No page or label says "verified" for textbook content; no AI Tutor or booking control appears in the reader.

### 9.7 Delivery

Boards R0–R8 are presented for visual review. After approval: R2-2 (database and access checks, synthetic files only) → R2-3 (Add a book, chapter review, chapter management) → R2-4 (libraries and reader) → R2-5 (parent-written study tools) → R2-6 (teacher view-only). Each step is a separate pull request with a scope summary first and a report afterwards. Storage options (C-5) are researched in parallel and presented before anything paid is connected.
