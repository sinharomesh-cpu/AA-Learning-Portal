# AA Pro documentation index

## Requirements
- `requirements/AA_Pro_FRD_v1.1.pdf` is the baseline functional requirements. It is unchanged, and its SHA-256 is in `requirements/CHECKSUMS.sha256`.

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
| `G1-06_Repository_and_Project_Isolation_Plan.md` | Repository rules and the bootstrap plan |
| `G1-07_Design_Review_Round2_Changelog.md` | Design review round 2 changes |
| `G1-08_Owner_Action_Plan.md` | Owner action plan, including the child sign-in specification (D-23a) and branch protection steps |
| `G1-09_Pre-Phase1_Approval_Package.md` | Pre-Phase 1 approval package (approved 14 Oct 2026) |
| `G1-10_Phase1_Implementation_Plan.md` | Phase 1 implementation plan (approved 14 Oct 2026) |

**Redacted copies.** Three documents differ from the owner's private project copies, and only by redaction:
- `AA_Pro_Phase0_Audit_Report.md`, `G1-01_Canonical_Screen_Inventory.md` and `G1-04_Design_Change_and_Accessibility_Log.md`.
- In them, the demo first names, the real school's name, email domain and Zoom subdomain, and two Stitch folder names are replaced with `[redacted]` markers.

## Design (`design/`)
- `design/missing-screens.md`: the design canvas and the per-screen approval record (D-32).

## Phase 1 (`phase1/`)
- `phase1/P1-02_Phase1_Completion_Report.md`: what Phase 1 delivered, with test results and known limitations.
