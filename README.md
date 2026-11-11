# PCBS Job Board

A job manager for **PC Building Simulator** (1). Capture a customer email from your screen, and the board reads it, lists the objectives, spots *hidden* objectives ("it's a bit dusty" → compressed air, "weird pop-ups" → antivirus, "I like braided dark grey" → new cables), and tracks your three workbenches.

**Use it:** open **https://pcbs-job-board.github.io/**, or download it and open `index.html` in Chrome/Edge.

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
A static web app – plain HTML, CSS and JavaScript, **no build step**. The scripts are loaded in a fixed order by
`index.html` (so the page also works opened straight from disk) and share their top-level names.
```
index.html                     the page: top bar, board, windows (dialogs), script order
css/style.css                  all styles (colour tokens at the top)
js/config.js                   version + report settings (stays here: released versions check it for updates)
js/core/                       the logic – no page access, also run by the tests in Node
  util.js                        localStorage helper, small shared helpers
  parser/                        email / PC Stats text → job fields
    rules.js · hidden.js           hidden-objective rules; suspects, brands, cables, coolant
    pcstats.js · email.js          PC Stats → parts; email → job, story jobs
    merge.js                       joining several screenshots of one email
  parts.js                       parts index, DLC / version / career filters, search, PC Stats matching, prices, power
  compat.js                      which parts fit together (sockets, sizes, radiators, reservoirs…)
  unlocks.js                     what each career level unlocks
  bench.js · oc.js               3DMark score, overclocking checks
  hints.js                       💡 tips per job
  suggest/                       suggested part swaps
    common.js · swaps.js           shared helpers; the swaps per objective
    plan.js                        one set of parts for the whole job
    cooling.js · lights.js         water cooling / AIO / overclock; parts with lights
    score.js                       3DMark sets (small sets, new platform, PC from nothing)
  flip/                          PC Bay builds
    build.js · assist.js           value, broken parts, state; the build assistant (upgrades, NEW parts)
    read.js                        Resale Value / inventory screenshot text
js/ui/                         the page – windows, board, capture
  state.js                       saved jobs, rules, screen areas
  board/                         the board
    status.js · tooltip.js         Status tiles, their details popup
    cards.js · events.js           tables + job cards + job focus; moving jobs, clicks, drag & drop, Undo notices
  capture.js · ocr.js            screen sharing, paste / drop, the text reader (Tesseract.js)
  job-window/                    new-job / Edit window (window.js) and its suggested swaps (suggestions.js)
  autocomplete.js                part name dropdown
  flip/                          📦 PC Bay window and tile (window.js), its clicks (events.js), screenshots (capture.js)
  areas.js                       finds the email / PC Stats / PC Bay windows on screenshots, area set-up
  settings.js · backup.js · reports.js · rules.js · partsdb.js · story.js · notify.js · keys.js
  start.js                       start-up (runs last of the board scripts)
data/parts/*.csv               parts list – one file per category (source of truth)
data/dlc.csv · versions.csv    DLC / part groups, game versions shown in Settings
data/story-jobs.csv            known career story jobs (sender, email, subject)
data/reservoir-cases.csv       which reservoirs fit which case (from the game's shop)
data/parts-db.js               GENERATED from the CSVs – don't edit by hand
tools/build_db.py              CSV → data/parts-db.js
tools/import_xlsx.py           community workbook → CSVs (then reservoir_compat.py, build_db.py)
tools/reservoir_compat.py      data/reservoir-cases.csv → case / reservoir fit data
tools/bump_version.py          sets the version everywhere it is written
tools/report-endpoint.gs       Google Apps Script that receives reports (Sheet + email)
.github/                       issue forms; workflows: parts database rebuild, code checks
```
Working on the code: see [CONTRIBUTING.md](CONTRIBUTING.md).

## Adding / fixing parts
1. Edit the right CSV in `data/parts/` (columns described at the top of `tools/build_db.py`; the usual ones: `name, level, level_pct, price, spec, dlc, version, source` – `level_pct` is how far into that career level the part unlocks). For a reported part, put `report #<issue number>` in `source`.
2. Commit. The **Build parts database** workflow regenerates `data/parts-db.js` automatically (or run `python tools/build_db.py` yourself).
3. Close the issue.

New content pack: add a row to `data/dlc.csv` and use its `key` in the `dlc` column.

## Adding story jobs
Career story customers (long emails, no star requirement, no hidden objectives) are listed in `data/story-jobs.csv` – columns `sender_name, email, subject, story, note, source`. Any one of sender email or subject marks a job as a story job; the name only counts when the email also looks like a story job (random customers sign with first names too). Reports arrive through the report inbox (below) or as GitHub issues labelled `story-job`.

## Report inbox (no account needed for players)
`tools/report-endpoint.gs` is a small Google Apps Script: it adds every story job / missing part report to a Google Sheet and emails the owner "Story Quest Report #N" / "Missing Part Report #N". The set-up steps are at the top of the file; put the web app URL in `js/config.js` → `reportEndpoint`. The owner's email address is never part of the website. Commit the CSV and the workflow rebuilds `data/parts-db.js`.

Updating from a newer community workbook:
```
pip install pandas openpyxl
python tools/import_xlsx.py "PCBS1 Parts & Unlock Levels ... .xlsx"
```
Rows that came from reports are kept.

## Hosting on GitHub Pages
Settings → Pages → *Deploy from a branch* → `main` / `(root)`. The site appears at `https://<user>.github.io/<repo>/` (or at `https://<user>.github.io/` when the repository is named `<user>.github.io` – the live site: **https://pcbs-job-board.github.io/**). Missing-part reports then go to this repository's Issues automatically.

## Credits
See [DATA_SOURCES.md](DATA_SOURCES.md). Fan-made tool, not affiliated with the game's developers or publishers. Code: MIT license.
