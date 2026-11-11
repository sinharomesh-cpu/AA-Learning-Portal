# AA Pro — Roadmap Phase 0 (Housekeeping) Report

**Version:** 1.0 · 11 Nov 2026 · **Decision:** OC-146 · **Branch:** `claude/bold-tesla-4zg5wc` (based on `main` at `379701a`) · **Status:** complete on the branch, awaiting owner review. RP-1 has not started.

## 1. Boundaries followed

Only Markdown documentation was changed. No application source, database migration, configuration, authentication, API or business logic was modified. No package was installed, no migration was run, no environment variable or secret was read or changed, and no hosting, Vercel, Neon or GitHub setting was touched. Nothing was committed, merged or pushed to `main`. Every existing decision and open decision reference is preserved; historical text is kept and out-of-date documents carry a dated status note instead of being rewritten.

## 2. Files changed

| File | Change |
|---|---|
| `README.md` | Status rewritten to the real state (was "Phase 1 in progress, no database"); architecture summary; local setup with a database; design ownership, brand and commercial-scope rules; links to the new documents |
| `docs/README.md` | Full documentation index (previously listed only G1, design and Phase 1) |
| `docs/status/AA_Pro_Project_Status_and_Roadmap.md` | **New.** Architecture, stack, implementation status, environments, integrations, gaps and risks, setup, Roadmap Phases RP-0 … RP-7, future commercial direction |
| `docs/status/RP-0_Housekeeping_Report.md` | **New.** This report |
| `docs/design/Design_Ownership_and_Brand_Guardrails.md` | **New.** Design ownership (OC-145), brand identity and tokens (OC-144), design-change rules |
| `docs/g1/G1-05_Decision_Register.md` | v1.98: OC-143 to OC-146, open decision D-46, change entry, current summary (11 Nov 2026); the 14 Oct summary kept and labelled historical |
| `docs/requirements/CR-07_D-16_Resources_and_Homework.md` | Status note: built (0019, 0027) |
| `docs/requirements/CR-17_Phase3A_Human_Teaching_and_Homework.md` | Status note: built and merged through 0034 |
| `docs/phase2/P2-00_Phase2_Plan.md` | Status note: authorised (OC-40) and built |
| `docs/phase3/P3-00_Phase3_Backlog.md` | Status note: superseded in practice by Phase 3A; open items still open |
| `docs/g1/G1-06_Repository_and_Project_Isolation_Plan.md` | Status note: bootstrap done (OC-25) |
| `docs/g1/G1-08_Owner_Action_Plan.md` | Status note: repository in use; decisions in G1-05 |
| `docs/g1/G1-10_Phase1_Implementation_Plan.md` | Status note: authorised (OC-30) and complete |
| `docs/design/missing-screens.md` | Status note: list stops at canvas version 62; later boards not listed; design ownership |
| `docs/design/deviation-log.md` | Status note: baseline is now the AA Pro boards and tokens (OC-145) |
| `docs/design/AA_Pro_Design_Implementation_Gap_Report.md` | Status note: DV-92 progress; phase label mapping; Stitch not ongoing |
| `docs/deployment/Billable_Dependency_Register.md` | Status note: email sending to the Super Admin only; teacher-pasted Zoom links built; $0 unchanged |

**Deliberately not changed:** `design-reference/**` (read-only by rule); the FRD PDF (baseline, checksummed); the three redacted G1 copies (G1-01, the Phase 0 audit, G1-04), which must stay identical to the owner's private copies apart from redaction; the AI Teacher documents, which already carry OC-89 and OC-91 override banners; `.env.example` and every other configuration file.

## 3. Development phase status (11 Nov 2026)

| Delivery phase (historical numbering) | Status |
|---|---|
| Phase 0 audit, G1 design gate, Phase 1 design system and shells | Complete |
| Phase 2 accounts and permissions (+ CR-12 point 1, CR-13, CR-15 Phase A, CR-16) | Built (0001–0026) |
| Phase 3 / 3A scheduling, human teaching and homework (CR-07, CR-17) | Built through TL-3 (0027–0034); D-45, OD-B, trial lesson open |
| Phase 4 uploads and library | Largely built early; D-17, D-26 open |
| Phase 5 AI classroom | Session rules and fake-provider controller only; blocked on provider eligibility and budget |
| Phase 6 Zoom | Teacher-pasted links only; D-10, PL-03 open |
| Phase 7 notifications | In-app built; email to Super Admin only; WhatsApp not built |
| Phase 8 live readiness / production | Not started |

| Roadmap Phase (forward plan) | Status |
|---|---|
| RP-0 Housekeeping | Done on branch, awaiting owner review |
| RP-1 Hardening | Not started; needs approval |
| RP-2 Complete Phase 3A | Not started; needs D-45, OD-B, D-05b, D-24 |
| RP-3 AI Teacher proof of concept | Blocked on provider eligibility, legal checklist, test budget |
| RP-4 Library and lesson tools | Not started |
| RP-5 Launch services | Blocked on budget approvals |
| RP-6 Commercial model | Deferred by the owner (OC-143); D-46 |
| RP-7 Production readiness | Not started; D-28, PL-02 |

## 4. Decision register update (v1.98)

| ID | Summary |
|---|---|
| OC-143 | OC-03 unchanged now; future Academy subscription (first two chapters free; quarterly, half-yearly, yearly) recorded for a later phase after a separate business decision |
| OC-144 | Typography and brand retained: Outfit, Plus Jakarta Sans, Inter; #006194; tokens preserved |
| OC-145 | Claude owns ongoing UI/UX design and frontend; Stitch was initial design only |
| OC-146 | RP-0 approved, documentation only, with the stated boundaries |
| D-46 (open) | Commercial model details for the future subscription, blocking RP-6 only |

## 5. Newly identified gaps and inconsistencies

| # | Finding | Handling |
|---|---|---|
| G-1 | Two phase numbering schemes ("Phase 1" means the completed design-system phase in the docs, and the next step in the owner's new plan) | Forward plan named RP-0 … RP-7 (OC-146). **Owner to confirm the naming** |
| G-2 | The decision register has no approval entries for the merges of migrations 0029–0034 (M1, M2, TL-1 to TL-3) and the TQ-4 fix; they are visible only in Git history and pull requests | Recorded in the CR-17 status note. Owner to say whether retrospective entries should be added |
| G-3 | Register changelog out of order (v1.2 and v1.78 above newer entries) and missing change entries for v1.67–v1.72, v1.79–v1.82, v1.84 | Left as is to preserve history; noted in v1.98 |
| G-4 | Register Part D (A-01, A-06) refers to a `claude/` folder (archived and proposed project instructions) that is not in this repository | Not changed; owner action A-01 still pending |
| G-5 | The FRD (FR-010) and the project instructions still name ElevenLabs and "Next Question", which OC-89 replaced; research found ElevenLabs likely ineligible for children | Not changed (FRD is the checksummed baseline; instructions are the owner's, A-01) |
| G-6 | `docs/design/missing-screens.md` lists boards only up to canvas version 62 | Status note added; completing the list needs the private canvas |
| G-7 | `.env.example` still groups settings by the old phase plan (Phase 4 storage, Phase 5 AI, Phase 6 Zoom) | Configuration file, out of RP-0 scope; candidate for RP-1 |
| G-8 | The applied migration state of the hosted test database could not be verified without database access | Owner can confirm in Neon or from the latest `main` build log |
| G-9 | "First two chapters free" needs a definition of "chapter" (AI Tutor course content vs parents' own books) before any design | Recorded in D-46 |
| G-10 | The three redacted G1 copies still present Stitch as the per-screen design reference | Left unchanged (must match the private copies); OC-145 and the guardrails document supersede them |

## 6. Checks run

- Every new or changed reference to a file, decision ID, migration and pull request was checked against the repository (`git log`, `db/migrations`, the decision register).
- `docs/README.md` was cross-checked so that every file under `docs/` is indexed and every indexed file exists.
- The repository-hygiene script (`scripts/check-repo-hygiene.mjs`) was run locally with a placeholder terms file to check e-mail addresses, meeting links, phone numbers, brand strings and forbidden files. The real identifying-terms list is a CI secret, so the privacy check of record is the CI run.
- Markdown is excluded from Prettier (`.prettierignore`), and no code changed, so lint, type-check, unit, database and end-to-end results are unaffected. They were not run locally because they require installing packages, which RP-0 does not allow.
