# CR-11 — English Grammar and Dictionary on the child dashboard

**Version:** 1.0 · 18 Oct 2026 · **Status:** feasibility done, plan agreed; designs to be drawn next. Nothing is built.
**Source:** owner request, 18 Oct 2026, 11:05 IST: "Child Dashboard should be English Grammar and English Dictionary — help students to build grammar skills and build vocabulary — if any English word students want to understand that should explain properly with sentence. Check the feasibility first then make a plan; if any cost is incurred let me know before build." The owner's answers are recorded as **OC-94**.

## 1. Feasibility result

**Feasible at $0.** Every part chosen runs on AA Pro's own server and database, with no paid service, API key or AI model at run time (OC-91).

| Need | Chosen approach | Cost |
|---|---|---|
| Word meanings | **Open English WordNet** (CC BY 4.0, derived from Princeton WordNet; commercial use allowed with a credit line), imported into AA Pro | Free |
| Child-friendly explanation and example sentence | A **core list of about 3,000 school words**, drafted by Claude during development and **checked by a human** before release | Free (no run-time AI) |
| Pronunciation | The browser's built-in read-aloud (already used in the reader) | Free |
| Grammar lessons and practice | Original AA Pro lessons by level, drafted by Claude, **checked by a human**; practice marked automatically against fixed answers | Free |
| Vocabulary practice | Word of the Day, "My words" and flashcards, built in AA Pro | Free |

### Options rejected

| Option | Why not |
|---|---|
| Merriam-Webster API (has children's dictionaries) | The free key is non-commercial only and limited to 1,000 queries a day; commercial use needs a paid licence. A costed request may be brought later if wanted |
| "Free Dictionary API" sites | No service guarantee; the data's origin and licence are unclear |
| AI explaining any word live | Paid model (OC-91), provider eligibility (R-AI-1), and OC-03 / OC-74(5) |
| Checking a child's free writing for grammar (LanguageTool) | The free public API forbids automated use and would send the child's writing to a third party; self-hosting needs a paid server |

## 2. Owner decisions (OC-94)

| # | Question | Decision |
|---|---|---|
| 1 | Dictionary source | **Open English WordNet**, free, kept on AA Pro's server, child-safety filtered |
| 2 | Simple explanations and example sentences | **Claude drafts, a human checks**, for a core list of about 3,000 school words |
| 3 | Grammar lessons | **Claude drafts, a human checks**: original AA Pro lessons and practice |
| 4 | Grammar topic list | **General levels**: Beginner, Intermediate, Advanced; not tied to a school board |

**Conflict recorded, not silently resolved:** OC-03 puts "AI study-card generation" out of the initial release, and OC-74(5) / OC-79 say "no AI-made study content". Decisions 2 and 3 are a **specific, limited exception** chosen by the owner: the content is drafted once during development (not generated live), is **reviewed and approved by a human before release**, and every entry stores who approved it and when. Content not yet approved is never shown to children. OC-03 and OC-74(5) stay in force everywhere else, including the textbook and study-tools area.

## 3. Requirements (FR-034 to FR-037)

### FR-034 Dictionary
| ID | Requirement |
|---|---|
| FR-034.1 | The child types a word (or taps a word in the book reader, later) and sees: the word, its word class (noun, verb …), a simple meaning and an example sentence for core words, then the full WordNet meanings under "More meanings". |
| FR-034.2 | Spelling help: if the word is not found, "Did you mean …?" suggestions from the word list. Word forms are matched (running → run, children → child). |
| FR-034.3 | A "Hear it" button uses the browser's read-aloud. No audio is recorded or sent anywhere. |
| FR-034.4 | **Child safety:** offensive, adult and slur meanings are removed at import using a reviewed block list; blocked words show "This word is not in the AA Pro dictionary". The block list is checked by the human reviewer. |
| FR-034.5 | Look-ups happen on AA Pro's server only. No word typed by a child is sent to a third party. Individual look-ups are not stored; only words the child saves (FR-036). |
| FR-034.6 | The credit "Contains data from Open English WordNet, CC BY 4.0" is shown on the dictionary page and listed in THIRD_PARTY_NOTICES. |

### FR-035 Grammar
| ID | Requirement |
|---|---|
| FR-035.1 | Lessons are grouped in three levels: Beginner, Intermediate, Advanced. Each lesson has a short explanation, examples, and 5–10 practice questions. |
| FR-035.2 | Question types: choose the answer, fill the blank (fixed accepted answers), and correct the sentence (choose the right version). Marking is automatic, with an explanation shown after each answer. No free-writing checking. |
| FR-035.3 | The child's progress per lesson (done, score) is saved. The child can retry. |
| FR-035.4 | Lessons are not tied to a school board or chapter names, so no curriculum content is invented (topic names are general grammar terms). |

### FR-036 Vocabulary building
| ID | Requirement |
|---|---|
| FR-036.1 | **Word of the Day** from the approved core list, suited to the child's level. |
| FR-036.2 | **My words:** the child saves words; they can be removed at any time. |
| FR-036.3 | **Flashcards** for saved words, with "I know it / Still learning", which shows hard words more often. |

### FR-037 Content review, access and data
| ID | Requirement |
|---|---|
| FR-037.1 | Every Claude-drafted entry and lesson has status Draft → Approved; only Approved content is shown. The approver's account and time are stored. |
| FR-037.2 | Children use it from their dashboard. Parents can see their child's grammar progress and number of saved words; **whether parents see the saved words themselves is to be confirmed on the design boards**. Teachers and admins see no child data here. |
| FR-037.3 | Progress and saved words are deleted when the child's account is deleted. |

## 4. Open items (not decided)

| # | Item | Proposal |
|---|---|---|
| Q-1 | Who is the human reviewer, and how is review done? | The owner or a named teacher, through a simple review screen (approve / edit / reject) |
| Q-2 | Source of the 3,000-word core list | Choose an openly licensed word-frequency or school word list; licence checked and reported before use |
| Q-3 | Where it sits on the child dashboard (the phone bar already has 6 tabs) | An "English" card on Home plus a page reached from it; shown on the design boards |
| Q-4 | Can a parent see the list of saved words? | Shown as an option on the boards |

## 5. Plan

| Step | Work | Cost |
|---|---|---|
| E-0 | Design boards **EG0–EG5**: dashboard card, dictionary search and word page, grammar levels and lesson, practice and results, My words and flashcards, reviewer screen | $0 |
| E-1 | Import Open English WordNet; measure its size against the free database limit first (or ship it as static data files); child-safety filter; search, spelling help and word forms | $0 |
| E-2 | Core word list: draft simple meanings and examples; reviewer screen; only approved entries shown | $0 |
| E-3 | Grammar levels, lessons and auto-marked practice; progress | $0 |
| E-4 | Word of the Day, My words, flashcards; parent progress view | $0 |
| E-5 | Tests and accessibility checks | $0 |

Each step is a separate pull request with all CI checks. If any step turns out to need something paid, it stops and is marked **Blocked — Owner Budget Approval Required**.

## 6. Tests (planned)

- Look-up: exact word, word forms, misspelling, not found, blocked word.
- Child safety: no blocked meaning appears in any search result.
- Only Approved entries and lessons are visible; Draft content never reaches a child.
- Practice marking for each question type; progress saved per child.
- Access: a child sees only their own progress and words; a parent only their own children's; teachers and admins nothing.
- No outbound network call during look-ups.
- Accessibility: keyboard use, screen-reader labels, 44 px touch targets, readable for primary-school children.

## Sources

- Open English WordNet licence (CC BY 4.0): https://en-word.net/
- Merriam-Webster API terms (non-commercial, 1,000 queries/day): https://dictionaryapi.com/info/terms-of-service
- LanguageTool public API limits and conditions: https://dev.languagetool.org/public-http-api
