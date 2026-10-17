# AA Pro — Design Implementation Gap Report

**Version:** 1.0 · 17 Oct 2026 · **Prepared by:** Claude.
**Requested by the owner:**
- "Mandatory Correction of UI Implementation to Match My Supplied Designs" (17 Oct 2026, 02:41 IST).
- "Fix the homepage design and sign in page … mode should be both Light/Dark … remove or replace claims" (17 Oct 2026, 12:01 IST).

**Status of this increment:**
- The home page and the sign-in, child sign-in and create-account pages are corrected.
- The signed-in portal screens are audited only, below. They are corrected in later increments.

## 1. Sources inspected

| Source | What it is | SHA-256 (first 12) |
|---|---|---|
| `stitch_aa_pro_learning_portal (5).zip` | Owner's latest ZIP: 25 screens, 4 screenshots, `DESIGN.md` | `c48ae2b6bc7a` |
| Uploaded `code.html` (cosmic home page, "Your Universe of Learning Starts Here") | Owner's chosen theme for the home page. It is not in the ZIP | `0a3d11d234d5` |
| Uploaded `DESIGN.md` "Cosmic Luminary" | Design tokens for that theme (dark cosmic and light study surfaces) | `7b769bf6fb53` |
| Screenshot of "Create an account" (owner message) | Same screen as the ZIP's `aa_pro_create_an_account` | — |
| Earlier ZIPs (8, 9) | Used for consistency, as the owner asked | see `design-reference/ORIGINAL_CHECKSUMS.sha256` |

**How the references were viewed:**
- Each reference page was rendered locally at 1280 px and 390 px. Tailwind was compiled offline and the fonts were local copies.
- The CDN, Google Fonts and the hosted images are blocked from this workspace. Hosted images (the hero planet picture and the teacher photos) therefore show as empty boxes.

**Redacted copies** of the three new references are in `design-reference/zip5-selected/`, together with the Cosmic Luminary `DESIGN.md`:
- identifying terms, person names and hot-linked images are replaced;
- each file's first line records its original checksum.

**What is new in ZIP 5.** Of the 25 screens, 21 are byte-identical to screens in ZIPs 8 and 9. Those were already inventoried in G1-01 and adapted in Phase 1. Only four are new:

| New in ZIP 5 | Use |
|---|---|
| `aa_pro_official_homepage_desktop` | Light home page |
| `aa_pro_responsive_homepage_mobile_tablet_web` | Same home page, responsive |
| `aa_pro_create_an_account` | Create an account (light) |
| `aa_logo_…` (folder name contains personal names; not repeated here) | An "AA" logo tile. **Not used yet**: see question Q-2 |

## 2. Claims removed or replaced (owner rule, 17 Oct 2026)

The references contain claims that AA Pro cannot support yet. They are not shown. Neutral descriptions of intended features are used instead. They return only with evidence and owner approval.

| Reference claim | Where | Replaced with |
|---|---|---|
| "COPPA Compliant", "COPPA & FERPA Certified Framework", "FERPA, COPPA & GDPR-K Certified", "ChildSafe 2.4 Framework" | Hero, safety, footer, create account | Nothing about certification. The approved safety cards are used: teachers approved first, parents in charge, no email or phone for children, books stay in AA Pro |
| "4.9/5.0 Rating From 1,200+ Parents", "4.96/5.0", teacher star ratings and review counts | Hero, teacher cards | Removed (no ratings, OC-79 C11) |
| "10,000+ Completed Lessons", "98% Parent Satisfaction", "100% Vetted & Verified Mentors", "0 Data or Contact Leaks" | Stats strip | Neutral facts: Grades 1–12; 6 subjects; 3 roles; "No child email" (children sign in with a username) |
| "Zero Contact Leak Guarantee", "Zero Public Contact Exposure", "Strict Contact Shield" | Hero, create account, footer, safety | "Parents stay in charge" with what is true today |
| "Top 1% Educators Vetted & Audited", "Accredited", "Certified Tutors", "Background Checked", "ID Verified", "Multi-Tier Educator Auditing" | Hero, teacher cards, create account | "Teachers approved first: checked by the AA Pro team before they see a child" (true: OC-36, OC-38). Teacher card chip "Approval needed" |
| "256-bit Encrypted Portal", "bank-level encryption", "end-to-end encrypted rooms" | Create account, contact form, safety | Removed |
| "Zero Hallucinations", "analyzes every chapter, glossary and exercise" | Textbook section | "Being built" label. Neutral text on what parents will be able to do. The preview is labelled as an illustration of an unbuilt feature |
| Named teachers with photos, prices and "View Availability & Book" | Teacher section | The approved honest empty state (H1/H2). No sample people |
| "Request Free 15-Minute Consultation" form, "under 3 minutes" response, advisory hours | Contact | The approved contact card with the owner-to-provide email placeholder. No form until sending email is approved |
| "Trusted by over 45,000+ families", "© 2025 AA Pro Inc." | Create account, footer | Removed. Footer shows "© AA Pro" (company name for the owner to provide) |
| Search box with grade filter and "Find Teachers" | Hero | "Create an account" and "Find a teacher" buttons. Public teacher search does not exist yet (D9) |

The new unit test `LandingPage.test.tsx` fails if any of these claim patterns appears on the home page.

## 3. Screen-by-screen: corrected in this increment

Status key:
- **D** = designed according to the reference;
- **I** = implemented;
- **T** = tested;
- **E** = enabled for users.

### 3.1 Home page (`/`)

| | |
|---|---|
| **Reference** | Cosmic home page (dark), ZIP 5 light home page, ZIP 5 responsive home page |
| **Before** | Board 63 layout: plain blue hero, white sections, no theme switch, no subject section |
| **After** | **Header**: glass header with the reference mark (book in a ring, "AA **Pro**"), the six menu links, a light/dark switch, Sign in and Create an account.<br>**Hero**: "Explore · Learn · Grow" line, large Outfit headline with an accent phrase, a card holding the two main buttons and subject chips, a three-point feature row, and an SVG orbit illustration with the six subjects floating around the AA Pro book. The illustration replaces the reference's hosted image.<br>**Sections**: a facts strip; "Explore your school subjects" (6 cards); "Learn from your child's own textbooks" (being built, with a labelled illustration); Teachers looking for students (approved empty state); Three simple paths; For teachers; Safety and privacy; About (draft); FAQ accordion; Contact; four-column footer |
| **Light / dark** | Dark uses the Cosmic Luminary palette: midnight navy `#0B1026`, electric cyan `#45D6E8`, aurora violet, solar amber. Light uses the approved AA Pro tokens with soft blue and violet glows |
| **Status** | D ✓ · I ✓ · T ✓ · E ✓. The textbook and teacher-listing parts are informational only (feature not built) |
| **Files** | `src/components/landing/LandingPage.tsx`, `OrbitIllustration.tsx`, `TextbookPreview.tsx`, `TeachersSection.tsx`, `src/config/landing.ts`, `src/components/public/*`, `src/styles/public-theme.css` |
| **Still differs from the reference** | Headline keeps the approved wording ("Learning at home with an AI Tutor and real teachers") instead of "Your Universe of Learning Starts Here" (Q-1). No search box (no public search yet). No teacher cards (no listings yet). No consultation form. Body font is Plus Jakarta Sans, not Inter (Q-3). The hero picture is an SVG drawing, not the hosted image (Q-4) |

### 3.2 Sign in (`/sign-in`)

| | |
|---|---|
| **Reference** | No separate sign-in screen in ZIP 5. Built from the "Create an account" reference layout so both pages match |
| **Before** | Blue panel and white card, no site header or footer |
| **After** | Public header and footer. Large card (7 of 12 columns) with the mark and a "Parents and teachers" chip, "Welcome back", parent/teacher choice as cards, email and password, "Forgot password?", a full-width "Sign in →" button, then "New to AA Pro? Create an account" and "Are you a student?" strips. The side column "Who signs in here" has Parents, Teachers, Students and Forgotten password cards (true descriptions only) |
| **Status** | D ✓ · I ✓ · T ✓ · E ✓. Demo-mode sign-in is unchanged in behaviour |
| **Files** | `src/app/sign-in/page.tsx`, `RealSignInForm.tsx`, `DemoSignInForm.tsx` |

### 3.3 Create an account (`/create-account`)

| | |
|---|---|
| **Reference** | ZIP 5 `aa_pro_create_an_account` and the owner's screenshot |
| **Before** | Two plain cards |
| **After** | Reference layout: card with the mark, "Grades 1–12" chip and "Create an account"; role cards with chips ("Family account", "Approval needed"); fields; a "Create account →" pill; "Already have an account? Sign in" strip. Side column "What happens next" with three icon cards and a "Parents stay in charge" box |
| **Status** | D ✓ · I ✓ · T ✓ · E ✓ (real accounts on the test site only) |
| **Files** | `src/app/create-account/page.tsx`, `CreateAccountForm.tsx` |
| **Still differs from the reference** | No "Primary child's grade (optional)" field: grades are set per child after sign-up (data minimisation, M-08). Password hint stays "At least 12 characters" (OC-35), not "Min. 8". The time zone field is kept (needed for scheduling) |

### 3.4 Child sign in (`/sign-in/child`)

| | |
|---|---|
| **Reference** | None in ZIP 5. Matched to the sign-in page so the whole public area is consistent |
| **After** | Public header and footer, "Hello! **Ready to learn?**", the six subject chips, and a large card with the child-sized form, "Forgot your password? Ask your parent" and "Grown-up sign in" |
| **Status** | D (derived) · I ✓ · T ✓ · E ✓ |

### 3.5 Shared changes

- **Light/dark switch:**
  - The choice is kept in the browser only (`localStorage` key `aa-theme`) and applied before first paint, so there is no flash.
  - Without a choice, the device setting decides.
  - It applies to the public pages only. The signed-in portal is unchanged (Q-5).
- **Secondary buttons and text fields** now use the `surface-container-lowest` token instead of plain white. This is the same white in light mode, so the portal looks the same. It lets them follow dark mode on public pages.

## 4. Screen-by-screen: signed-in portal (audit only, not changed in this increment)

These ZIP 5 screens are the same files as in ZIPs 8 and 9. Phase 1 implemented them as AA Pro adaptations (G1-01 canonical selection; DV-01 to DV-60 deviations). The owner's concern that the implementation "does not look sufficiently appealing" also applies to them. The gaps are summarised here; each needs before/after screenshots in its own increment.

| ZIP 5 screen | AA Pro screen (route) | Main visual gaps to correct | Files | Priority |
|---|---|---|---|---|
| `student_dashboard_my_learning_space`, `aa_pro_student_dashboard_mobile` (S1/S9) | Student home (`/student`) | Hero greeting card with illustration and streak, larger subject tiles with icons, richer "Up next" card, rounded-xl cards, playful colour per subject | `src/app/student/page.tsx`, `src/components/SubjectCard.tsx`, `SessionRow.tsx` | 1 |
| `parent_dashboard_family_learning_hub` (S19) | Family home (`/parent`) | Child switcher pills with avatars, overview cards with icons, "This week" timeline, quick actions grid | `src/app/parent/page.tsx`, `src/components/shell/*` | 1 |
| `teacher_dashboard_schedule_hub` (S21) | Teacher home (`/teacher`) | Today timeline, student cards, availability summary | `src/app/teacher/page.tsx` | 2 |
| `student_schedule_…calendar_view`, `class_schedule_1/2` (S11, S12) | AI booking and schedule | Week calendar look, slot chips, side summary | `src/app/student/book-ai/*`, `src/components/booking/*` | 2 |
| `book_a_class_1/2` (S13, S14) | AI booking wizard | Step header styling, subject cards with icons, slot grid | `src/components/booking/*` | 2 |
| `ai_classroom_1/2` (S15, S16) | AI classroom (Phase 4) | Whole screen: viewer plus tutor panel. **Functionality not built**; design only, controls disabled | `src/app/student/classroom/*` | 3 |
| `learning_library_1/2` (S17, S18) | Library | Approved textbook boards R0–R8 supersede parts; reader not built | (Textbook PRs R2-3, R2-4) | 3 |
| `child_dashboard_*`, `multi_child_*` | Parent/child views | Superseded by S19 and the multi-child decisions (G1-01); reference only | — | 4 |
| `parent_mode_book_human_teacher` (S20) | Book a human teacher (Phase 3) | Booking not built; design only | — | 4 |

The portal shell (sidebar, top bar) uses the approved light tokens. Dark mode for the portal is not requested yet (Q-5).

## 5. Tests and checks run for this increment

| Check | Result |
|---|---|
| Typecheck, lint, Prettier, privacy-and-brand check | Pass |
| Unit tests | 18 files, 157 tests pass. New: `ThemeToggle.test.tsx` (2); in `LandingPage.test.tsx`, the claim-free test (1); existing home page tests updated |
| Demo browser tests, desktop and phone (`playwright test`) | 104 pass. New: dark-mode test opening `/`, `/sign-in`, `/sign-in/child` and `/create-account`, with an accessibility scan, a no-sideways-scroll check and theme persistence |
| Real-account browser tests (`accounts.spec.ts`, `children.spec.ts`) | 28 pass (sign-in, create account, confirmation, child sign-in flows unchanged) |
| Dark palette contrast (computed) | Body text 10.9:1 to 17:1, secondary text at least 7.9:1, cyan button text 9.2:1, chips at least 8.3:1 |

Before and after screenshots, desktop 1280 px and phone 390 px, light and dark, are attached to the owner report. They come from a local run with synthetic data only.

## 6. Questions for the owner (smallest decision each)

| # | Question | Default used until you decide |
|---|---|---|
| Q-1 | Hero headline: keep the approved "Learning at home with an AI Tutor and real teachers", or use the reference's "Your Universe of Learning Starts Here"? | Approved wording kept |
| Q-2 | ZIP 5 contains an "AA" logo tile. Should it become the official AA Pro mark (header, favicon) in place of the book-in-a-ring mark from the cosmic page? | Book-in-a-ring mark from the cosmic reference |
| Q-3 | Body font: Cosmic Luminary names Inter; the app and the light references use Plus Jakarta Sans. Switch? | Plus Jakarta Sans (one font family across public and portal) |
| Q-4 | The reference hero uses a hosted planet image. If you want that exact picture, please attach the image file with permission to use it | SVG orbit drawing |
| Q-5 | Should the signed-in portal also get the light/dark switch? | Public pages only |
| Q-6 | Default when a visitor has never chosen: follow the device setting (current) or always start dark like the cosmic reference? | Follow the device setting |

## 7. Recommended next increments

1. Student home (S1/S9) and family home (S19) visual correction, with before/after screenshots.
2. Teacher home (S21) and the AI booking and schedule screens (S11–S14).
3. Design-only versions of the AI classroom and textbook screens, with controls disabled until their phases are built.
