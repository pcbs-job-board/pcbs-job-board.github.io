# App map

- `js/core/`: `parser.js` (email + PC Stats text → job, hidden objectives, suspects, story match, joining screenshots),
  `parts.js` (database index, name matching / OCR slips, line joining, cables), `compat.js` (fit rules),
  `bench.js` (3DMark, GPU pairs, Benchmark check), `suggest.js` (suggested swaps per objective + `suggestPlan` – one
  set for the whole job, objectives in work order: named parts → counts / pairs → cooling → performance → power →
  looks; retries other options when one is left out), `oc.js`, `flip.js`, `unlocks.js`, `hints.js` (tips: id,
  when(job, build), text), `util.js`.
- `js/ui/`: `board.js` (workbenches, open jobs, job cards, status tiles, job focus), `job-window*.js` (New / Edit job,
  captures, suggestions), `ocr.js` (tesseract.js reader pool, star counter), `capture.js` / `areas.js` (screen
  share, finding the email / PC Stats areas), `keys.js` (keyboard: Enter = job focus, Esc leaves), `flipui.js`
  (PC Bay window), `partsdb.js`, `settings.js` (compact status / swaps switches, keyboard, DLC), `reports.js`
  (in-app reports → Google Apps Script → Google Sheet).
- Docs in the app repo: `README.md`, `CONTRIBUTING.md`, `DATA_SOURCES.md`, `CHANGELOG.md`.
