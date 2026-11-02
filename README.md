# PCBS Job Board

A job manager for **PC Building Simulator** (1). Capture a customer email from your screen, and the board reads it, lists the objectives, spots *hidden* objectives ("it's a bit dusty" → compressed air, "weird pop-ups" → antivirus, "I like braided dark grey" → new cables), and tracks your three workbenches.

**Use it:** open the GitHub Pages link of this repository, or download it and open `index.html` in Chrome/Edge.

> Works with the **English** version of the game only. Text is read automatically (OCR), so mistakes can happen – always double-check what it found.

## Features
- 📸 Capture screen 1 (screen sharing, works with PS Remote Play / chiaki-ng), or paste/drop a screenshot
- OCR of the job email, plus one or more captures of the **PC Stats** parts list (runs in your browser with Tesseract.js)
- Hidden-objective detection with editable keyword rules, cable colour requests and brand preferences ("total NZXT fanboy")
- Three workbenches (one job each) + open-jobs queue, drag & drop
- Part swaps with autofill from 2,000+ in-game parts (level and price shown)
- Settings for game version (hides parts from later updates) and Overclocked Edition DLC
- 🚩 Report missing parts → GitHub issue
- ⌨ Keyboard shortcuts – press `?` in the app for the list

## Privacy
Everything you create — jobs, rules, settings — is stored **only in your browser** (`localStorage`). Nothing is sent to GitHub or anywhere else. Screen captures are processed locally and never uploaded. The only network requests are loading the page, the parts list, and the OCR engine. Use **Settings → Export / Import backup** for backups or to move to another browser.

## Repository layout
```
index.html                 the app
css/style.css
js/config.js               repo for reports (auto-detected on GitHub Pages), version
js/util.js                 shared helpers
js/parser.js               email / PC Stats text parsing, hidden-objective rules
js/parts.js                parts search, DLC filter, autocomplete
js/app.js                  board, capture, OCR review, settings, reports
js/rules.js                hidden-objective rules window
js/areas.js                finds the email / PC Stats windows, screen-area set-up
js/notify.js               🔔 update notifications (new version / what's new)
js/keys.js                 keyboard shortcuts
data/parts/*.csv           parts list – one file per category (source of truth)
data/dlc.csv               DLC / part groups (key, label, group, default on/off)
data/versions.csv          game versions shown in Settings
data/parts-db.js           GENERATED from the CSVs – don't edit by hand
tools/build_db.py          CSV → data/parts-db.js
tools/import_xlsx.py       community workbook → CSVs
tools/bump_version.py      sets the version in js/config.js and the ?v= tags in index.html
.github/ISSUE_TEMPLATE/    missing-part and bug report forms
.github/workflows/         rebuilds parts-db.js when CSVs change
```

## Adding / fixing parts
1. Edit the right CSV in `data/parts/` (columns: `name, level, level_pct, price, spec, dlc, version, source` – `level_pct` is how far into that career level the part unlocks). For a reported part, put `report #<issue number>` in `source`.
2. Commit. The **Build parts database** workflow regenerates `data/parts-db.js` automatically (or run `python tools/build_db.py` yourself).
3. Close the issue.

New content pack: add a row to `data/dlc.csv` and use its `key` in the `dlc` column.

Updating from a newer community workbook:
```
pip install pandas openpyxl
python tools/import_xlsx.py "PCBS1 Parts & Unlock Levels ... .xlsx"
```
Rows that came from reports are kept.

## Hosting on GitHub Pages
Settings → Pages → *Deploy from a branch* → `main` / `(root)`. The site appears at `https://<user>.github.io/<repo>/`. Missing-part reports then go to this repository's Issues automatically.

## Credits
See [DATA_SOURCES.md](DATA_SOURCES.md). Fan-made tool, not affiliated with the game's developers or publishers. Code: MIT license.
