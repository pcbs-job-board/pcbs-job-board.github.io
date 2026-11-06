# Working on PCBS Job Board

The app is a static page: no framework, no bundler, no build step. Open `index.html` (or run a local server) and it works.

## Setup
```
npm install            # development tools only: ESLint + Prettier (the app itself needs nothing)
npm run serve          # http://localhost:8000 – screen sharing needs http(s), not file://
```
Python 3 is used for the data tools (`pip install pandas openpyxl` only for the workbook import).

## Code layout and rules
- **`js/core/`** – logic only: no `document`, no windows, no events. Everything here can run in Node (the tests do).
- **`js/ui/`** – the page: windows, the board, capture, keyboard.
- Plain scripts, loaded in the order written in `index.html`; top-level names are shared between files. Top-level
  code may only use what an *earlier* script defines – anything else goes inside a function.
- `js/config.js` stays in `js/`: released versions fetch it to find out about updates.
- One concern per file. A file that grows past ~700 lines is a sign to split it.
- Comments say *why* (game rules, edge cases); names say *what*.
- Player data stays in the browser (`localStorage` via `LS`). Nothing personal is ever sent anywhere.

## Style and checks
```
npm run lint           # ESLint – must be clean (no errors, no warnings)
npm run format         # Prettier – one formatting for js/ and css/
npm run format:check
```
CI (`.github/workflows/checks.yml`) runs both, plus checks that `data/parts-db.js` matches the CSVs.

## Speed
- Anything that can take noticeable time shows a "⏳ working on it" line and keeps the page usable
  (the text reader's start-up, reading screenshots, suggested swaps).
- Work that doesn't change is not repeated (suggested swaps are reused until their inputs change; lookups are indexed once).
- Measure before and after a change with the CPU slowed down (Chrome DevTools → Performance → CPU 4–6× slowdown).

## Data
- Parts: edit `data/parts/*.csv`, then `npm run db` (CI also rebuilds it on push).
- New workbook version: `python tools/import_xlsx.py "<workbook>.xlsx"` (keeps reported rows, re-applies the reservoir lists).
- Case ↔ reservoir lists: `data/reservoir-cases.csv` → `python tools/reservoir_compat.py`.

## Releasing a version
1. Keep the live version: push `main` to the private repository as `backup-<live version>`.
2. `python tools/bump_version.py X.Y.Z` – sets `js/config.js`, every `?v=` in `index.html`, `--css-ver` in
   `css/style.css` and `package.json`.
3. Add the `## X.Y.Z` section to `CHANGELOG.md` – very short lines, most important first, one line per system.
4. Lint, tests, then push to `main` (GitHub Pages publishes it; players get the "new version" notice).

## Tests
The automated tests (real game screenshots, the whole app in a browser, the rules) live in the private development
repository, because the screenshots can't be published. Run them before every release.
