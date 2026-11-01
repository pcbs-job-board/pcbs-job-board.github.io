# Changelog

## 2.2.1
- Cable requests understand all in-game style words (Plastic, Braided, Ribbon, Sleeved, Loose, Tight, Duo): "Those Plastic Yellow cables look really nice" → replace all cables with Plastic Yellow (e.g. Ribbon Plastic Yellow). "I love yellow cables" also counts; "the yellow cable is loose" doesn't.
- New hidden objective: "a cable wouldn't fit so I forced it" → look for a damaged part.
- Open jobs are sorted by in-game deadline, soonest first; jobs without a deadline go last.

## 2.2.0
- **Capture job reads only the email.** For repair jobs, open PC Stats in-game and press **📸 Add PC parts capture** in the review window – as many times as you need (e.g. after scrolling the parts list). New parts are merged, duplicates skipped, and your edits are kept. Tabs switch between the captured screenshots; a pasted screenshot while the window is open counts as a parts capture.
- Brand detection now also reads the next sentence: "Have you heard of FSP? They're meant to be pretty good." → use FSP parts.
- New hidden objectives: "getting a bit hot" → check temps; "random rebooting" / crashes / blue screen → check PSU & temps.
- Stray bullet characters (») are removed from objectives.
- Shorter header labels so the toolbar fits on one line.

## 2.1.2
- Settings → **Game version**: pick the update you play; parts added in later updates disappear from suggestions. Every part now carries the version that added it (from the community workbook, PC/Steam numbering).
- DLC settings now list only DLC that add parts: **Overclocked Edition Content** (4 NZXT cases by Brock Hofer). DLC without parts (workshops, Esports Expansion, Career Power Pack, soundtrack) are listed in a note.
- Promo cases (Bush Flight Simulator, Good Company, Galaxy) and PC-only parts are separate "other part groups".
- App version shown in Settings – click it for this changelog.

## 2.1.1
- Brand preference detection: "I'm a total NZXT fanboy", "MSI parts are the bomb", "Team Group are meant to be good" add a hidden task "Use <brand> parts where possible" listing what that brand makes. Dislikes ("not a fan of Corsair") add "Avoid <brand> parts".
- The customer's preferred brand is starred and listed first in part-swap suggestions for that job.

## 2.1.0
- Parts database rebuilt from the community workbook (game v1.15.3): 2,138 parts in 11 categories, including PSUs, CPU coolers, case fans, cables and water cooling, all with unlock level and price.
- Settings → content packs: switch PC-only parts, NZXT art cases and HEM parts on/off. Enabled packs are tagged in suggestions.
- "Report missing part" (header button or from the suggestion list) opens a pre-filled GitHub issue.
- Cable requests now suggest matching in-game cable sets.
- Project split into separate files; parts data kept as editable CSV.

## 2.0.0
- Three workbenches with one job each, open jobs below in a responsive grid.
- Stop-capture button, cable colour detection, parts autofill.

## 1.0.0
- First version: capture, OCR, hidden objectives, tables, part swaps.
