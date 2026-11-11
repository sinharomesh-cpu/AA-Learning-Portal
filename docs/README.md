# AA Pro documentation index

**Start here:** `status/AA_Pro_Project_Status_and_Roadmap.md` describes what is actually built, the architecture, gaps, environments and the forward roadmap (Roadmap Phases RP-0 … RP-7). Business rules live in the decision register, `g1/G1-05_Decision_Register.md`, which wins where documents differ.

Many documents below are dated records of a decision or a phase. Where one has become out of date, it carries a dated **status note** at the top and its original text is kept unchanged.

## Status and roadmap (`status/`)
| File | Content |
|---|---|
| `AA_Pro_Project_Status_and_Roadmap.md` | Current architecture, technology stack, implementation status, integrations, environments, gaps and roadmap |
| `RP-0_Housekeeping_Report.md` | Roadmap Phase 0 report: files changed, inconsistencies found and corrected, open items |

## Requirements (`requirements/`)
- `AA_Pro_FRD_v1.1.pdf` is the baseline functional requirements. It is unchanged, and its SHA-256 is in `CHECKSUMS.sha256`.

| Change request | Subject |
|---|---|
| `CR-07_D-16_Resources_and_Homework.md` | Teacher-shared resources, digital and handwritten homework (built) |
| `CR-09_Whiteboard_and_Lesson_Notes.md` | Live whiteboard and lesson notes (specified, not built) |
| `CR-10_Lesson_Review_and_Recording.md` | Lesson review and recording (specified; video blocked on budget and legal review) |
| `CR-11_English_Grammar_and_Dictionary.md` | English grammar and dictionary (specified, not built) |
| `CR-12_Teacher_Acceptance_and_Trial_Lessons.md` | Teacher accepts each child (built); trial lesson (deferred) |
| `CR-13_Teacher_Rate_Negotiation.md` | Rate negotiation, information only, no payments (built) |
| `CR-15_Marketplace_Pricing_Packages_Verification.md` | Hourly lessons, packages, "AA Pro Verified", search (Phase A built) |
| `CR-16_Notifications_and_Action_Badges.md` | In-app notifications and badges (built) |
| `CR-17_Phase3A_Human_Teaching_and_Homework.md` | Phase 3A human teaching and homework (built through TL-3) |

## G1 design and documentation milestone (`g1/`)
| File | Content |
|---|---|
| `AA_Pro_Phase0_Audit_Report.md` | Phase 0 audit of the FRD and the Stitch export |
| `G1-00_Completion_Report.md` | G1 completion report |
| `G1-01_Canonical_Screen_Inventory.md` | Selected design reference for each screen |
| `G1-02_Requirements_Traceability_Matrix.md` | Requirements → screens → components → tests |
| `G1-03_Missing_Screen_Design_Briefs.md` | Briefs for screens Stitch did not provide |
| `G1-04_Design_Change_and_Accessibility_Log.md` | Branding, design and accessibility changes |
| `G1-05_Decision_Register.md` | Owner decisions and open decisions. **This is the authority for business rules.** |
| `G1-06_Repository_and_Project_Isolation_Plan.md` | Repository rules and the bootstrap plan (historical status) |
| `G1-07_Design_Review_Round2_Changelog.md` | Design review round 2 changes |
| `G1-08_Owner_Action_Plan.md` | Owner action plan, including the child sign-in specification (D-23a) and branch protection steps |
| `G1-09_Pre-Phase1_Approval_Package.md` | Pre-Phase 1 approval package (approved 14 Oct 2026) |
| `G1-10_Phase1_Implementation_Plan.md` | Phase 1 implementation plan (approved 14 Oct 2026; complete) |

**Redacted copies.** Three documents differ from the owner's private project copies, and only by redaction:
- `AA_Pro_Phase0_Audit_Report.md`, `G1-01_Canonical_Screen_Inventory.md` and `G1-04_Design_Change_and_Accessibility_Log.md`.
- In them, the demo first names, the real school's name, email domain and Zoom subdomain, and two Stitch folder names are replaced with `[redacted]` markers.

## Phases (`phase1/`, `phase2/`, `phase3/`)
| File | Content |
|---|---|
| `phase1/P1-02_Phase1_Completion_Report.md` | What Phase 1 delivered, with test results and known limitations |
| `phase2/P2-00_Phase2_Plan.md` | Phase 2 plan: sign-in, accounts and permissions (authorised by OC-40; built) |
| `phase2/security-core.md` | Security core notes for Phase 2 |
| `phase2/P2-S0_Repository_Security_Review.md` | Repository security review |
| `phase2/P2-R1_Gap_Analysis.md`, `P2-R2_Content_and_Reader_Gap_Analysis.md`, `P2-R3_Teacher_Discovery_Gap_Analysis.md` | Phase 2 gap analyses |
| `phase2/OC-44-47_Lesson_Rules_Implementation_Report.md` | Lesson rules implementation report |
| `phase3/P3-00_Phase3_Backlog.md` | Phase 3 backlog (superseded in practice by CR-17 Phase 3A; open items still open) |

## Design (`design/`)
| File | Content |
|---|---|
| `Design_Ownership_and_Brand_Guardrails.md` | Design ownership (Claude owns ongoing UI/UX; Stitch was initial design only), brand identity and design-change rules (OC-144, OC-145) |
| `missing-screens.md` | The design canvas and the per-screen approval record (D-32) |
| `deviation-log.md` | Every implementation difference from an approved board, with the reason |
| `AA_Pro_Design_Implementation_Gap_Report.md` | Design implementation gap report |

## AI Teacher (`ai-teacher/`)
Research and plans only; no AI provider is integrated. Provider eligibility for children is a release-blocking dependency (R-AI-1).

| File | Content |
|---|---|
| `AI_Teacher_Provider_Feasibility.md` | Provider options and open decisions OD-1 to OD-12 |
| `AI_Provider_Child_Eligibility_Research.md`, `AI_Provider_Eligibility_and_Legal_Review.md` | Child-eligibility research and legal checklist L-1 to L-10 |
| `AI_Teacher_Implementation_Plan.md` | Implementation plan (blocked on budget) |
| `AI_Teacher_Session_Rules.md` | Session rules (OC-89) |
| `AI_Teacher_Cost_Estimate.md`, `AI_Test_Environment_Cost_Controls.md` | Cost estimate and cost controls |
| `AI_Teacher_PoC_Acceptance_Checklist.md` | Proof-of-concept acceptance checklist |

## Deployment (`deployment/`)
| File | Content |
|---|---|
| `hosted-demo-preview.md` | Sample-data preview on Vercel (OC-34) |
| `test-environment.md` | Password-protected test environment with Neon (OC-57, D3A-19) |
| `Email_Resend_Setup.md` | Resend email setup (OC-133) |
| `Storage_and_Free_Allowance.md` | File storage in the database and the free allowance (OC-96) |
| `Billable_Dependency_Register.md` | $0 budget rules and every billable dependency (OC-91) |
| `Pre-Launch_Action_List.md` | Items to close before real users (PL-01 to PL-05) |

## Legal (`legal/`)
- `AA_Pro_Teacher_Marketplace_Draft_Teacher_Terms.md`: draft teacher terms.
