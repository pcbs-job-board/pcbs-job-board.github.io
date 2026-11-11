# PCBS Job Board – handover

Read this first in every new session or thread. It replaces the long first conversation (2026-10 → 2026-11-11).
Then read `TODO.md` (same branch) for what's open, and `CHANGELOG.md` (app) for what each version did.
Last updated: 2026-11-11 · live version **0.15.1** · dev branch in progress: `dev-0.15.2`.

## 1. Who and what

- **Mariusz** (Germany, Europe/Berlin) builds the PCBS Job Board with Claude as a side project. He plays **PC Building
  Simulator 1 on PS5** (base game, no DLC), streamed to his PC with chiaki-ng, and uses the board in Brave/Chrome
  next to it. He is learning Android (Kotlin) for a junior job – his GitHub may be seen by employers, so keep
  everything public clean and professional.
- **The app**: a static web app (no build step, no server) that captures the game screen, reads jobs and parts with a
  text reader (OCR), and helps plan each job: objectives, hidden objectives, part swaps, budget, power, 3DMark,
  overclocking, and PC Bay flips. All player data stays in the browser.
- Live site: https://pcbs-job-board.github.io/ · Steam guide exists (keep its text / screenshots current when asked).

## 2. Repositories and branches

| Where | What | Who sees it |
|---|---|---|
| `pcbs-job-board/pcbs-job-board.github.io` (org repo) | `main` only = the live site (GitHub Pages) | public |
| `mariusz-przeczek/pcbs-job-board-dev` | `dev-X.Y.Z` work branches, `backup-<version>` of each released main, `tests`, `todo` | private |

- `todo` branch: `TODO.md` (open items + process rules) and this file. **Pushed after every change** – Mariusz
  checks it there.
- `tests` branch: the test suites, real game screenshots (`fixtures/`, can't be published), `quick.js`, `release.sh`,
  `hooks/`. Kept as separate worktrees next to the app checkout.
- Commits: `-c user.name="Mariusz Przeczek" -c user.email="przeczek.mariusz@gmail.com"` + the session's attribution
  lines. His email may be in the repos, but **never visible to site users** (e.g. "send by email" must not show it).
- "Don't push" = don't push to **main / live**. Dev branches, `tests` and `todo` are always pushed as work goes.

## 3. Process rules (also in TODO.md "How this list is used")

- **Nothing on the ToDo is started without Mariusz's go-ahead.** Planning messages ("add to ToDo") = notes only.
- After adding a ToDo item: say how many **small fixes** and **bigger updates** are listed. Done items are removed
  (the changelog keeps them) – no release-notes walls in TODO.md.
- Reports come as screenshots (game + board). Find the cause in the code, write the item with the job's sender /
  subject, the cause and the planned fix. Ask one question if the game rule is unclear.
- **Releases only when he says "release"** (or "push it to live"). Batch fixes – about one release a day unless
  something breaks the app. Before release: version bump `python3 tools/bump_version.py X.Y.Z`, then a CHANGELOG
  section by hand – very short lines, most important first; story jobs as "N new story jobs added", reader fixes as
  "N OCR bugs fixed". Then `sh release.sh <app checkout>` (tests branch).
- **Code style**: neat file structure, readable code, `js/core` = logic only (runs in Node), `js/ui` = page. Plain
  scripts loaded in `index.html` order, shared top-level names (top-level `const` isn't a vm-context property – tests
  read it with `vm.runInContext("name", c)`). Must pass GitHub "Checks" (ESLint + Prettier + parts-db up to date).
  **Never run `prettier --write` on index.html.** Install the hooks: `cp <tests>/hooks/* <app>/.git/hooks/`.
- **Tests – minimal by default** (usage limit): `node quick.js --app <app>` (units + startup + the suites the changed
  files need, one line each) plus a new unit test per fix. `--all` / screenshots only when he asks or the change is
  visual. Keep tool output short (grep the summary lines).
- Stop background servers as soon as they're not needed. Nothing legally gray (e.g. no game images in the app).
- Ask before anything hard to undo; ask one short question when a request can be read two ways.

## 4. The game (what the app has to get right)

- **Jobs** arrive by email: sender, subject, labour pay, budget, deadline ("Complete by End of Day 9/19/2018
  (Tomorrow)" – the app can't know the game's day, so it shows the date only), required **level** and **stars**
  (★ glyphs, counted on the screenshot's pixels – the reader can't read them). Objectives: "Diagnose and fix",
  "Replace RAM", "Install X [or better]", "Install dual graphics cards", "Upgrade to 128 GB of RAM", "Upgrade to 4 TB
  of Storage", "3DMark score of N", "Overclock CPU to N MHz", "Install 5 <fan> or better", "Support for double GPU",
  water cooling, lights / cables.
- **Hidden objectives** come from the email wording and must be guessed: "dusty" → clean with compressed air,
  "clicked on something bad" → run the virus scanner, "used parts" / "shiny new" → new parts only, "quickly" →
  urgent, a brand the customer likes → use that brand, cables / coolant colour wishes, parts the customer hints are
  broken ("I rammed the RAM", "cleaned it with the hoover"). Customer **suspects** are often wrong.
- **Story jobs** (career customers, `data/story-jobs.csv`): no hidden objectives, budget only counts when an objective
  mentions it, no star requirement. Matched by sender + subject (a few misread letters allowed); a known sender with
  a new subject = "not in the list yet – report it".
- **"X or better"** = by the game's **part ranking** (`rk` in the database). Named maker + model = that exact card;
  a bare chip ("GTX 1080") = any card of it.
- **3DMark** (`bench.js`): CPU score + GPU score combined; RAM channels / sticks / MHz and XMP matter; two GPUs pair
  (SLI / CrossFire) only when they're the **same GPU model** (any maker; GTX 1080 + 1080 Ti don't pair) on a board
  with SLI / CrossFire – the pair score averages the cards. PC Stats shows the game's "Benchmark: N": the app's score
  matched the game exactly on a checked PC, so it's used to correct misread names (Ti / non-Ti).
  **The game never gives a 3DMark objective that can't be reached at the job's level** – "nothing reaches it" is an
  app bug (open ToDo item).
- **Overclocking** (`oc.js`): CPU multiplier on 100 MHz + voltage (0.05 V steps), GPU core / memory + power limit.
  Temperatures depend on cooler, case and GPU heat – no reliable formula, so the app doesn't promise "safe with this
  cooler"; the parts database plan uses "safe with any cooler, else the midpoint".
- **PC Bay** (`flip.js`, `flipui.js`): buy broken PCs, fix / upgrade, resell. A $0 resale part = broken. Resale value
  multiplier ×1 at 3DMark ≤ 1,000 rising to ×3 at 10,000 (no more above) – hence "gentlest overclock to just above
  10,000". Inventory capture reads the 3 columns, USED / BROKEN labels.
- **Parts**: ~3,000 in `data/parts/*.csv` → `data/parts-db.js` (`tools/build_db.py`). Compat fields: socket `s`
  (exact text – "LGA 1151 (Skylake)" ≠ "(Coffee Lake)"), `sli`, `cf`, GPU chip `c`, length `l`, multi-GPU `m`,
  `oc` (CPU/GPU stock clocks or overclockable board/CPU), `rk` ranking, `lvl` unlock level, radiator places
  `r120` / `r140` (also used as the fan-place approximation). Watercooled GPUs have " | " in the name (EVGA
  "K|NGP|N" is not one). Cables: colours must match the wish **exactly** (1–4 colours); "Duo <colour>" sets are
  black + that colour; the shop names differ from the database for duo sets (open ToDo item).

## 5. The app (where things are)

- `js/core/`: `parser.js` (email + PC Stats text → job, hidden objectives, suspects, story match, joining screenshots),
  `parts.js` (database index, name matching / OCR slips, line joining, cables), `compat.js` (fit rules),
  `bench.js` (3DMark, GPU pairs, Benchmark check), `suggest.js` (suggested swaps per objective + `suggestPlan` – one
  set for the whole job, objectives in work order: named parts → counts / pairs → cooling → performance → power →
  looks; retries other options when one is left out), `oc.js`, `flip.js`, `unlocks.js`, `hints.js`, `util.js`.
- `js/ui/`: `board.js` (workbenches, open jobs, job cards, status tiles, job focus), `job-window*.js` (New / Edit job,
  captures, suggestions), `ocr.js` (tesseract.js reader pool, star counter), `capture.js` / `areas.js` (screen
  share, finding the email / PC Stats areas), `keys.js` (keyboard: Enter = job focus, Esc leaves), `flipui.js`
  (PC Bay window), `partsdb.js`, `settings.js` (compact status / swaps switches, keyboard, DLC), `reports.js`
  (in-app reports → Google Apps Script → Google Sheet; Mariusz sends the sheet as `PCBS_reports_N.xlsx` – add new
  story jobs / parts from it).
- Docs in the app repo: `README.md`, `CONTRIBUTING.md`, `DATA_SOURCES.md`, `CHANGELOG.md`.

## 6. Plans already agreed (details in TODO.md)

- Parts database window (hidden columns, filters, overclock columns), then **1.0**: all reported story jobs / parts
  added, in-app reporting ends (browser-only "my story jobs / my parts"), then a new Steam guide (one section per
  system) and the "How to use it" window from it.

## 7. Threads for the Code project (suggested)

| Thread | Does | Model |
|---|---|---|
| **Main / coordinator** | talks with Mariusz, decides, routes work, keeps TODO.md and this file current | Opus |
| **ToDo notes** | turns a report or idea into a ToDo item (no code changes), reports the counts | Haiku – Sonnet when a cause has to be found in the code |
| **Report triage** | screenshots of a wrong result → finds the cause in the code, writes the item | Sonnet |
| **Data intake** | story jobs / missing parts from screenshots or `PCBS_reports_N.xlsx` → CSVs + a unit test | Sonnet |
| **App work** | ToDo items in a `dev-X.Y.Z` branch, with unit tests, `quick.js`, hooks | Opus (Sonnet for small UI / text fixes) |
| **Reader (OCR)** | text-reading fixes with new `fixtures/` screenshots, `run.js --only` | Opus |
| **Release** | after "release": bump, changelog, `release.sh`, ToDo update | Sonnet |
| **Docs / Steam guide** | guide text, README, "How to use it" | Sonnet |

One or two threads at a time – parallel threads use the limit faster.

## 8. Setting up a new environment

```
git clone https://github.com/mariusz-przeczek/pcbs-job-board-dev app && cd app
git remote rename origin dev && git remote add origin https://github.com/pcbs-job-board/pcbs-job-board.github.io.git
git checkout <dev-X.Y.Z or a new one from origin/main> && npm install
git worktree add ../tests tests && git worktree add ../todo todo
cp ../tests/hooks/* .git/hooks/          # formatting / lint on commit, Prettier check on push to main
cd ../tests && node quick.js --app ../app
```
Playwright + Chromium are needed for the browser suites; the text reader runs from `tests/vendor` (no CDN).
