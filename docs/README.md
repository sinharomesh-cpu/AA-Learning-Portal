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

**Redacted copies.** Three documents differ from the owner's private project copies, and only by redaction:
- `AA_Pro_Phase0_Audit_Report.md`, `G1-01_Canonical_Screen_Inventory.md` and `G1-04_Design_Change_and_Accessibility_Log.md`.
- In them, the demo first names, the real school's name, email domain and Zoom subdomain, and two Stitch folder names are replaced with `[redacted]` markers.

**Not yet in the repository.** The approval package (G1-09) and the Phase 1 plan (G1-10) stay in the owner's private project until approved.

## Design (`design/`)
- `design/missing-screens.md`: the design canvas and the per-screen approval record (D-32).
