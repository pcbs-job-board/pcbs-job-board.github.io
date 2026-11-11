# Process details

- **ToDo use**: when a bigger update starts, every small fix still open goes into it too. An item is removed from
  TODO.md as soon as it's done and ready in a dev branch. Story jobs seen on screenshots go into
  `data/story-jobs.csv` with the next small update (no separate item, no own changelog line).
- **Releases** (only on "release"): batch fixes, about one a day unless something breaks the app.
  1. `python3 tools/bump_version.py X.Y.Z` (js/config.js, every `?v=`, `--css-ver`, package.json).
  2. New CHANGELOG.md section by hand: very short lines, most important first; story jobs as "N new story jobs
     added", reader fixes as "N OCR bugs fixed". Versions X.Y.Z (X major, Y features, Z fixes).
  3. `sh release.sh <app checkout>` from the `tests` branch (checks, backup of live main as `backup-<live version>`, push, waits for GitHub, confirms live version).
  4. Update TODO.md / HANDOVER.md (live version).
- **Code style**: neat file structure, readable code. `js/core` = logic only (runs in Node), `js/ui` = page. Plain
  scripts loaded in `index.html` order, shared top-level names (top-level `const` isn't a vm-context property –
  tests read it with `vm.runInContext("name", c)`). Hooks: `cp <tests>/hooks/* <app>/.git/hooks/` – pre-commit
  formats staged JS / CSS with Prettier (never index.html), runs ESLint, rebuilds parts-db.js when data changed;
  pre-push to `main` refuses a failing Prettier check.
- **Tests (minimal by default, saves Mariusz's usage limit)**: `node quick.js --app <app>` (units + startup + the
  suites the changed files need, one line each) plus a new unit test per fix. No full runs, no screenshot checks
  unless the change is visual; keep outputs short (grep summary lines). New screenshots from Mariusz go into
  `fixtures/` with checked expectations, then `run.js --only <id>`.
- **Reports**: screenshots (game + board). Find the cause in the code, write the item with the job's sender / subject,
  the cause and the planned fix. Ask one question if the game rule is unclear.
- One or two threads at a time – parallel threads use the limit faster.
