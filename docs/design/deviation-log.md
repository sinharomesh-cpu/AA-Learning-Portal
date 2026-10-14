# AA Pro — implementation deviation log

Every place where the implementation differs from an approved board (OC-24) or from the Stitch design tokens, with the reason. New entries are added in the pull request that introduces them.

| ID | Where | Approved design / source | Implementation | Reason | Introduced |
|---|---|---|---|---|---|
| DV-01 | All focusable elements | Stitch DESIGN.md has no visible focus style | 3 px `#006194` outline, 2 px offset (`:focus-visible`) | Approved Tokens board (board 2); WCAG 2.4.7 / 2.4.11 | WP-1 |
| DV-02 | Inputs, secondary buttons | Stitch uses `outline-variant` `#BFC7D2` (1.71:1) | `outline` `#707881` (4.48:1) | Approved Tokens board; WCAG 1.4.11 | WP-1 |
| DV-03 | Colour tokens | DESIGN.md front-matter palette | Adds 12 colours used on the approved boards (card border, success/warning fills and borders, error border, human-chip border, primary-panel text, primary hover, disabled text) in `src/styles/token-extensions.json` | The approved boards use them; all text pairs are tested at ≥ 4.5:1 | WP-1 |
| DV-04 | Fonts | Boards load Outfit and Plus Jakarta Sans from Google Fonts | Self-hosted from the OFL-licensed Fontsource packages via `next/font/local` | No third-party font requests from a children's product; same typefaces | WP-1 |
| DV-05 | Pending notes | Boards show amber "Pending D-xx" reviewer notes | `PendingNote` component ("Not decided yet (D-xx): …") in the Phase 1 review build | Keeps undecided rules visible without guessing behaviour (G1-10 §2) | WP-2 |
| DV-06 | Super Admin access-denied page | Board 9 adds "Attempts are recorded in the audit log." | Sentence omitted | The audit log does not exist until Phase 8; no unsupported claims (OC-04) | WP-2 |
| DV-07 | Unavailable actions (e.g. Join) | Boards draw a grey span with `aria-disabled` | A real `<button aria-disabled="true">` that stays focusable and does nothing | Keyboard and screen-reader users can discover the control and its state | WP-2 |
