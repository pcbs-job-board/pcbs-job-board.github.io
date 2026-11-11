# PCBS Job Board – ToDo & notes

Working notes for the job board (private – dev repository only).
Live version: **0.15.1** (released 2026-11-10; backup of the version before: `backup-0.15.0`) – `main` in the public
repository `pcbs-job-board/pcbs-job-board.github.io`, site https://pcbs-job-board.github.io/. What each version
changed is in CHANGELOG.md – this list only has what's still to do.

## How this list is used
- New session / thread: read `HANDOVER.md` (this branch) first.
- **Nothing is started without Mariusz saying so** – small fixes and bigger updates alike.
- When he starts a bigger update, every small fix still open goes into it too.
- **After adding an item, tell Mariusz how many small fixes and bigger updates are on the list.**
- **Story jobs from screenshots**: a story job seen on a screenshot from Mariusz goes into
  `data/story-jobs.csv` with the next small update (no separate item needed, no changelog line of its own
  required). Waiting to be added are listed under "Story job list" below.
- An item is **removed from this list as soon as it's done and ready in a dev branch**. From then on the
  dev branch's changelog records it.
- All dev branches and backups live in this private repository (`pcbs-job-board-dev`). The public
  repository only gets `main`.
- **This list is pushed to the `todo` branch after every change** – Mariusz checks it there. "Don't push"
  means don't push to `main` / live; dev branches, `tests` and `todo` are always kept up to date.
- **Releases**: only when Mariusz says "release" – then `sh release.sh <app checkout>` from the `tests` branch (checks,
  backup of the live main as `backup-<live version>`, push, waits for GitHub, confirms the live version).
- **Batch releases (Mariusz 2026-11-11)**: fixes are collected in the dev branch and released together (about once a
  day), unless something breaks the app.
- GitHub's "Checks" now also run on every `dev-*` push in this repository (from dev-0.15.2 on) – a red check there is
  fixed before asking to release.
- **Version bump**: `python tools/bump_version.py X.Y.Z` (js/config.js, every `?v=`, `--css-ver`, package.json), then a
  new CHANGELOG.md section by hand.
- Changelog: very short lines, most important change first. Versions are X.Y.Z (X major, Y features, Z fixes).
- **Code style (Mariusz 2026-11-11)**: every update keeps the file structure neat and the code readable, and must
  pass GitHub's "Checks" workflow (ESLint + Prettier `format:check` + parts-db up to date). The app checkout has
  local git hooks for it: pre-commit formats the staged JS / CSS with Prettier (never index.html), runs ESLint and
  rebuilds parts-db.js when data changed; pre-push to `main` refuses a push that fails the Prettier check.
- **Tests – keep them minimal (Mariusz 2026-11-11, to save his usage limit)**: unless he asks for more, run only
  `node quick.js --app <app checkout>` in the `tests` branch – units + startup + the suites the changed files need,
  one line each – plus a new unit test per fix. No full runs, no screenshot checks unless the change is visual,
  short outputs only. `--all` only when he asks. New screenshots from Mariusz go into `fixtures/` with checked
  expectations (then `run.js --only <id>` for just those).

---

## Small fixes (0)

Nothing open. Done in `dev-0.15.2` (not released): storage objective, 3DMark new-platform search + overclock rules,
exact cable colours.
- Rules kept for later work (Mariusz 2026-11-11): "Ribbon Plastic Duo <colour>" sets are black + that colour (confirmed in
  game). The 3DMark search tries overclocking only when an objective asks for an overclock, when no set reaches the score
  at stock, or when every stock set is over the budget – then cheaper sets at ~60 % of the overclock potential (50–75 %
  is safer); the full potential only when nothing else completes the objectives.

## Bigger updates (waiting for the go-ahead)

Notes for later (not tasks yet):
- Overclock "level 3" – the highest clock a given cooler allows – needs the game's temperature formula (not published).
  **Very low priority**: only if Mariusz happens to collect enough readings before 1.0 (~20–30, see the list of what
  each reading needs, sent 2026-11-04); otherwise drop it.
  Test sheet sent 2026-11-07 (PCBS-CPU-overclock-temperature-tests.xlsx, script: scratchpad octest/make.py): bench =
  Silent Base 600 (Orange) + 2 Pure Wings 2, ASUS TUF Z370-PRO GAMING (to buy), 2 × HyperX Predator 2933, GTX 1060 X 6G
  stock, ET650-G, VP4100. A: i3-8350K × 7 coolers (40–100 CFM) × ×40/1.20, ×45/1.40, ×50/1.55 = 21; B (optional, buy
  i5-8600K) × 3 coolers × ×43/1.30, ×48/1.50 = 6; C: i3 + Freezer 34 ×45/1.40 in Antec P8, Kolink Ethereal, FSP CMT510
  Plus, Silent Base without fans = 4; D: repeat coolers = 2. (i7-8700K is in the PC Bay build for sale; ATC700 169 mm
  fits no case; Freezer 33 TR has no LGA 1151.)
  RESULTS (2026-11-07, 33 readings, tests branch fixtures/pending/oc-temperature-tests-results.xlsx, fit:
  tools-oc-temperature-fit.py): OCCT max CPU temp = 0.8035 × stock W × (1 + 0.6354 × x) × (1 − 0.001203 × cooler CFM)
  × case factor; x = (f − stock f) / (OC base f − stock f). 3 parameters, 20 readings, max error 0.2 °C; predicts
  every throttled reading (>100 °C). Cooler: only airflow counts (same CFM → same temp, any size). Case factor vs
  Silent Base + 2 Pure Wings: no fans 1.017, FSP CMT510 Plus + 4 fans 1.009, Antec P8 + 3 Heat Away 1.039, Kolink
  Ethereal + 1 fan 1.058 (one reading each – not a rule yet). Only 2 CPUs (Intel, same OC base 5000); voltage and
  clock moved together, so which one drives it isn't settled (clock fits better: rms 0.09 vs 0.14 °C).
  Part 2 sheet sent 2026-11-07 (24 tests, octest/make2.py): E clock vs voltage (i3 + DELOS), I edge check of
  "highest multiplier" (i3 Engine 27 ×46/×47, DELOS ×48/×49), H case vs fans (no fans in Antec / Kolink / FSP; one
  Pure Wings at a time), F i5-9600K (OC base 5200 / 1.75), G Ryzen 5 2600 on GIGABYTE B450 AORUS M (65 W, 95 °C).
  Predictions for both ideas (clock / voltage) are in the sheet.
  GPU heat (Mariusz 2026-11-08, certain): the GPU's temperature affects the CPU's – at least when both are air cooled.
  Every reading so far had the same stock GTX 1060 GAMING X 6G, so its heat is hidden in the 0.8035 factor and the case
  factors – the formula only holds for that GPU. Needs readings with the same CPU + cooler + clock and only the GPU
  changed (e.g. GTX 1050 / 1060 / 1080 Ti, stock vs overclocked, air vs water-cooled GPU) before level 3 can be used
  on other PCs. Part 2 also keeps the 1060 – don't change it there.
- 💡 Tips live in js/hints.js (id, when(job, build), text) – add new ones there.
- Overclock objectives: **confirmed by screenshot** (2026-11-05, AccurateUncle@UncleLaboratory.org, "More power!",
  Req: Level 20): "Overclock CPU to 4125 MHz" + "Install custom water cooling for CPU" + Complete by. The parser and
  the Overclock tile read it correctly (target 4125 MHz). Screenshot: tests branch `fixtures/pending/oc_cpu_4125.png`.
  No GPU overclock objective seen yet. "Install custom water cooling for CPU" is suggested since 0.14.0.

### 1.0: story jobs + missing parts from the report sheet, then local "my story jobs / my parts"
1. Story jobs: compare `data/story-jobs.csv` with the "Story jobs" tab of the "PCBS reports" Google Sheet (and the
   "Story Quest Report #N" emails) and add / correct what's missing. Missing parts: same with the "Missing parts" tab.
2. After that, reporting ends:
   - The 📖 Report story job button is **removed from the top bar**.
   - Neither form sends anything to Mariusz's email / spreadsheet any more (Apps Script no longer used by the app).
   - "Report story job" becomes something like **"Treat future jobs from this sender as a story job"** and
     "Report missing part" becomes something like **"Save custom part"** – saved in the user's browser and used
     alongside the built-in story job list / parts database.
   - Agreed with Mariusz 2026-11-04:
     - **Custom story job** – recognised by the sender's email address first; if the address isn't known, by the
       subject. When a job looks like a story job (no star requirement) but neither sender nor subject has been read
       yet, ask the user to scroll up in the email and capture again.
     - **Custom part** – first category + name, then the details that category needs (e.g. CPU: socket, clock,
       overclock data…). Two check boxes:
       1. "Show in the autofill list" – ticked by default, works even when details are missing.
       2. "Use in suggested swaps / builds from nothing" – unticked by default and **disabled until every detail is
          filled in** (say so next to it). Uses the same "available in shop" flag as the built-in parts (not in shop
          = never suggested).
     - Custom story jobs and parts go into the export / import backup (confirmed by Mariusz).
- Already in the app: Dynabeard (0.10.0), HRH The Queen (0.12.0).
- Added in 0.12.3: Giovanna Sciarra, PhD – `giovanna@giosci.lab`, "A minor setback" (Diagnose and fix, Req: Level 13).
- Candidate from an older screenshot, **not confirmed yet**: `scottyB@dongermail.com`, subject
  "urgent job!!" (streaming together, no star requirement; probably the streamer story).
- Rule: the email address or subject alone marks a story job. The signed name only counts together with
  "no star requirement" or a long email, because random customers sign with first names too.

### After 1.0: new Steam guide, then the "How to use it" window from it
- The window (? button, `index.html` → `#dlgHelp`, pictures in `img/help/`) is up to date with 0.12.x.
- Once 1.0 is released: rewrite the Steam guide with **one section per system** – e.g. career unlocks, random job,
  story job, 3DMark request, overclock request, PC Bay builds, keyboard navigation… (specifics to be discussed
  with Mariusz first).
- Then update "How to use it" on the website from the same text and pictures (pictures: `scratchpad/guide3.js` –
  real screenshots through the real capture flow; WebP, loaded only when the window opens).
