# App map

Plain scripts in `index.html` order, sharing top-level names; an area with several files has its own folder (0.15.3).

- `js/core/` (logic only, runs in Node):
  - `parser/`: `rules.js` (hidden-objective rules: task + keywords), `pcstats.js` (PC Stats text → parts),
    `hidden.js` (suspects, brands, cables, coolant, `detectHidden`), `merge.js` (joining screenshots),
    `email.js` (email → job, story match).
  - `parts.js` (database index, name matching / OCR slips, line joining, cables; `ixByName` = cached name lookup –
    use it instead of `INDEX.find(p => p.name === …)`), `compat.js` (fit rules), `bench.js` (3DMark, GPU pairs,
    Benchmark check), `oc.js`, `unlocks.js`, `hints.js` (tips: id, when(job, build), text), `util.js`.
  - `suggest/`: `common.js` (shared helpers), `swaps.js` (`suggestSwaps`: suggested swaps per objective, budget fix),
    `plan.js` (`suggestPlan` – one set for the whole job, objectives in work order: named parts → counts / pairs →
    cooling → performance → power → looks; retries other options when one is left out), `cooling.js` (custom loop,
    AIO, overclock), `lights.js`, `score.js` (3DMark sets, new platform, PC from nothing).
  - `flip/` (PC Bay): `build.js` (value, broken parts, state, complete-PC check), `read.js` (Resale Value /
    inventory text), `assist.js` (build assistant, upgrades, NEW parts, changes).
- `js/ui/`: `board/` (`status.js` Status tiles, `tooltip.js` their popup, `cards.js` tables + job cards + job focus,
  `events.js` moving jobs, clicks / keys, drag & drop, toast), `job-window/` (`window.js` New / Edit job, captures;
  `suggestions.js`), `flip/` (PC Bay window: `window.js`, `events.js`, `capture.js`), `ocr.js` (tesseract.js reader
  pool, star counter), `capture.js` / `areas.js` (screen share, finding the email / PC Stats areas), `keys.js`
  (keyboard: Enter = job focus, Esc leaves), `partsdb.js`, `settings.js` (compact status / swaps switches, keyboard,
  DLC), `reports.js` (in-app reports → Google Apps Script → Google Sheet), `state.js`, `backup.js`, `notify.js`,
  `story.js`, `rules.js`, `autocomplete.js`, `start.js`.
- `tests/quick.js` maps both the old flat names and the new folders to their suites.
- Docs in the app repo: `README.md`, `CONTRIBUTING.md`, `DATA_SOURCES.md`, `CHANGELOG.md`.
