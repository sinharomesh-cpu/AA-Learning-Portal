# Design reference (read-only)

This folder holds **reference material only**. Nothing here is production code, and nothing here may be edited to "fix" a design. Design changes are made in the AA Pro implementation and recorded in the deviation log.

## What is here

| Item | What it is |
|---|---|
| `stitch-selected/*.redacted.html` | Redacted derivative copies of the 13 selected Google Stitch screens (S1, S9, S11–S21). Selection: `docs/g1/G1-01_Canonical_Screen_Inventory.md`. |
| `stitch-selected/DESIGN.md` | The Stitch design-token specification, unchanged. It contains no personal data. Its original product name is historical; the product brand is AA Pro (OC-01). |
| `ORIGINAL_CHECKSUMS.sha256` | SHA-256 of both original ZIP exports and of every file inside them |
| `ORIGINAL_INVENTORY.md` | Path and size of every original file |

## How the derivatives were made (OC-20)

Each derivative starts from the untouched original, whose SHA-256 is recorded in the file's first-line comment. Only these substitutions were made:

- **Demo children, parent and teacher names** → synthetic names: Kiran, Meera, Dev, Demo Parent, Teacher A. Rao, Teacher B. Iyer, Teacher C. Das, Teacher D. Nair.
- **The demo family surname** → removed.
- **School names and the school location** → "Sample Primary School" / "Sample".
- **Meeting links, meeting IDs and passcodes** → placeholders.
- **Phone numbers** → removed.
- **Hot-linked third-party images** → a neutral inline placeholder.
- **Image descriptions that described a child's appearance** → "Placeholder image".

Layout, classes, colours, copy and brand strings are otherwise unchanged. The files still load fonts and the Tailwind script from public CDNs when opened in a browser, exactly as the originals did.

## What is deliberately excluded

- The original ZIP files and all extracted originals.
- All Stitch screenshots (`screen.png`). They show identifying demo data and cannot be redacted reliably.
- Non-selected screens (S2–S8, S10), which are superseded or reference-only.

Visual baselines for testing come from the owner-approved AA Pro designs, not from these files.
