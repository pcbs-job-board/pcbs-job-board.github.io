# PCBS Job Board – ToDo & notes

Working notes for the job board (private – dev repository only).
Live version: **0.13.0** (released 2026-11-04; backups: `backup-0.11.1` … `backup-0.12.3`) (`main` in the public repository `pcbs-job-board/pcbs-job-board.github.io` – remote `origin` of the app checkout points there directly now, site https://pcbs-job-board.github.io/).

## PC Bay build (released in 0.12.0)
Flipping broken PCs bought on PC Bay: fix → optimise → XMP / overclock → 3DMark → sell. Unlocked with PC Bay (level 9).
- Resale value (community formula, matches Mariusz's PC: $441 broken → $591 booted → $949 at 4288 points):
  value = sum of used part values × multiplier + $100 when booted to the OS; multiplier 1.0× at ≤1,000 points rising
  evenly to 3.0× at ≥10,000 (no more above). Used part value = workbook "Sell Price" = ⅓ of the shop price.
  A broken part shows ~10 % of its used value (FSP Hydro G 850: $4 instead of $47) → that's how it's spotted.
  The auction then moves the price up / down a bit (not part of the app).
- Top-bar button 📦 next to Capture job / ＋ (only from level 9, compact). Build = a tile in Open jobs (own look:
  stripe + "📦 PC Bay" badge, start value → now, est. profit), can go on T1–T3. Big step window like the new-job
  window: every change saved, "Save and minimize" on every page, resume any time.
- Step 1 Parts: capture the Resale Value window (several screenshots, PC Stats rules / limits) or type parts.
- Step 2 Fix: broken part(s) + why; replacement typed or from captured inventory (USED first). Broken parts can't be
  reused. Choosing a NEW part warns it loses ~66 % of its value.
- Step 3 Hardware optimisation (optional): inventory alternatives (typed / captured per category); each with
  est. 3DMark score (incl. overclocking where possible) and value; sets need all their parts (CPU + board + cooler).
  Gentle warning for one RAM stick; locked CPU → suggest an unlocked one.
- Step 4 Profit optimisation: boot to OS, XMP, overclock CPU (lv 6) / GPU (lv 13), run 3DMark – live estimate.
  Resets: CPU change → CPU overclock, GPU change → GPU overclock, motherboard → everything, RAM → XMP (not
  confirmed for PCBS – real BIOSes usually drop XMP with new RAM). Any change → 3DMark again.
- Profit = value now − value as bought − price of NEW parts (inventory / used parts count $0).
- Inventory is stored per build (incl. parts taken out of it) and deleted with "Finish build" (asks first).
- 💡 tip on every build: the resale formula in general words.
- Inventory reader: USED / NEW / BROKEN read from the card labels (checked on 9 screenshots, incl. NEW + BROKEN ones).

## 0.14.1 – released 2026-11-06 (backup-0.14.0 made first)
- PC Bay build assistant (js/core/flip.js: flipCheck, flipMoves, flipTry, flipUpgrades, flipPlan, flipApply, flipRemove):
  changes "rm" take a part out (a working one goes back to the inventory); a plan is applied as the difference between
  builds. Greedy plan: the best change again and again – a step toward a sellable PC first (×100,000), then profit.
  Complete PC = case, motherboard, CPU, CPU cooling (or a CPU block), RAM 1–4, GPU 1–2, PSU, storage ≥ 1, no clashes,
  PSU enough (overclocked when it can be). Note: the real PC Bay capture in the tests (be69d2f7) has no drive.
- Profit step: CPU multiplier (100 MHz base clock) + core voltage (linear stock → overclock base, workbook), GPU Tuner
  clocks – oc.js ocSettings.
- Tests: units 173, flipassist.js 13 (new), systems 42, soak, flow, run 431, pcbay 30 – all pass.

## 0.14.0 – released 2026-11-06 (backup-0.13.0 made first): 15 items + the stability check (#16, the special task)
- Done so far: #1 swap tile sizes, #2 changelog window, #3 stale CSS / ?v= fix, #4 scroll up on table, #5 Overclock CPU keeps
  the CPU, #6 dual GPUs keep the board + GPU upgrade = higher score, #7 no cosmetic parts in autofill, #8 coolant colour,
  #9 Reservoir / Radiator / CPU Block types + 💧 watercooled GPUs, #10 one part order + "Any", #11 water cooling fit
  (radiator ↔ case, CPU block ↔ socket, reservoir ↔ case from the shop list: `data/reservoir-cases.csv` on dev-0.14.0,
  159 cases → `tools/reservoir_compat.py`, colour / window variants inherit, 3D collision note on reservoirs).
- Open from #11: re-check NZXT H210i in the game (same list as the H710i before it – may be the stale-list bug).
  Defender Pro and iCUE 5000D / 5000D Airflow are PC-only (not in the console shop) – best guesses, change if a PC
  player reports the real list.
- Bonus (done): "!" on RAM sticks that differ in size / speed (an SSD once became a 32 GB HyperX stick – no screenshot;
  HyperX FURY RGB 960GB reads fine in tests, so the misread itself is not reproduced).
- #12 done: 📖 parts database window (js/partsdb.js). Game part icons: not used (game assets) – category tabs only.
- #13 done: keyboard rework (all 12 proposals; Alt+E / Alt+P confirmed working, kept).
- #14 done: speed + notices. Measured (Chromium slowed 6×): suggestions ≤ ~0.25 s (3DMark new build the slowest),
  board with 10 jobs ~0.1 s, a job card ~15 ms – nothing needed rewriting. The silent waits were the text reader's start /
  first download and reading: now warmed up in the background + "⏳ Starting / Downloading the text reader…", suggestions
  show "⏳ Working out…" and are reused when nothing changed, PC Bay inventory shows the column being read.
  Tests: run.js --cpu N (slower Chromium).
- #15 done: ESLint + Prettier + .editorconfig + package.json (dev only), js/core (logic, no page access) and js/ui (page),
  app.js split by concern, js/config.js kept in place (update check of released versions), CONTRIBUTING.md, CI checks
  (lint, format, parts-db.js up to date). Lint found a real bug: dual-GPU suggestions crashed with a board in the PC.
  Load time unchanged (median, CPU 6× slower). Locally node_modules → /opt/node-tools/node_modules (npm registry blocked).
- #16 done: stability check. New tests: systems.js (manual job, Edit, 13 objective kinds + hidden ones, PC Bay start →
  finish, career level, backup round trip, reload; 40 checks) and soak.js (60 rounds in one page: memory / page size /
  saved data / speed flat). Found + fixed: "2400 MHz" PC Stats line, no suggestion for custom water cooling / "Install an
  SSD" / reachable overclock (now options or a reason for every objective), part fields redraw error. All suites pass
  (units 163, flow 56, run 431 + 11 known, pcbay 30, startup, systems 40, soak). Chromium only – no Firefox here.

## 0.13.0 – released 2026-11-04
- New-job window: job fields (email capture, customer … extra tasks) in `#revJob` under the screenshot (left column,
  also for manual jobs); parts on the right: one field per type (`PART_SLOTS` in js/app.js – Case, Motherboard, CPU,
  CPU Cooling, RAM ≤4, GPU ≤2, PSU, Storage, Other), autofill per category, "(empty)" placeholders, orange "!" when
  the name isn't exactly a database part. The hidden `#fComps` textarea stays the single source for the rest of the app.
  Captured parts the user changes / removes don't come back on the next capture (`rev.dropAuto`).
- ↻ Refresh button on the suggested swaps.
- Tests pass (run 366, flow 44, startup). Screenshots: `scratchpad/newjob-0.13/` (script `scratchpad/newjob.js`).
- Also in it: all four small fixes from 2026-11-04. Next: Mariusz's test, then release (backup-0.12.3 first).

## 0.12.0 – where things are (released 2026-11-03)
All tests pass (run.js 366, flow 44, units 115, pcbay 30, edgetest).
- 3DMark: js/bench.js (Jacob Klein's formula, workbook "bench" column [11]); Status tile; suggestion sets in suggest.js
  benchSuggestions; new builds from nothing: newBuildBench (cheapest CPU + board + RAM (+ GPU, 1 or 2 cards) + PSU + cooler,
  around parts ticked in the new-job window – opts.picked).
- Overclock: js/oc.js (workbook "oc" column [12]); objectives only; 90 % of potential; throttle temps; "overclock later" → PSU.
- Career unlocks: js/unlocks.js (gates cpuOC 6, pcBay 9, gpuOC 13, customWC 16). 💡 Tips: js/hints.js.
- PC Bay build: js/flip.js + js/flipui.js; inventory USED / NEW / BROKEN from the card labels (cardLabels); areas
  "resale" / "inv" found automatically (js/areas.js). Parts marked "not in shop" (menu cases…) are never suggested.

## How this list is used
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
- Before a release: back up the live `main` as `backup-<live version>` here. Then **ask Mariusz before
  merging a dev version into `main`**, merge, and check the live site.
- **Version bump**: `python tools/bump_version.py X.Y.Z` (js/config.js, every `?v=`, `--css-ver`, package.json), then a
  new CHANGELOG.md section by hand.
- Changelog: very short lines, most important change first. Versions are X.Y.Z (X major, Y features, Z fixes).
- Tests: branch `tests` here (`node run.js --app <app checkout>`). Run it on every dev branch before
  asking to release – 0 failed. New screenshots from Mariusz go into `fixtures/` with checked expectations.

---

## Small fixes (1)

1. **Part swaps on the job card: compact, collapsible** (Mariusz, 2026-11-07; js/ui/board.js swap tiles, every job card –
   tables and Open jobs):
   - Ticking a swap collapses its tile to just the checkbox (80 % of its size now) and the name of the part put in;
     unticking expands it back to the normal tile. A smooth animation both ways.
   - A card shows at most 3 unticked swaps; more → a line like "X more part swaps planned – click to show".
   - Ticked swaps are hidden by default and shown with the expand control; when all are ticked: "All planned swaps are
     done" (expand shows them).
   - Selecting another job (click or keyboard ← → ↑ ↓) folds the previous card back to these rules.
   - Keep: drag ⠿ / Alt + ↑ ↓ ordering, ✕ / ✎ on open tiles, the clash / power boxes, keyboard focus on lines
     (U / Space ticks) – the hidden ones must not trap the keyboard.

_0.14.5 released 2026-11-07 (backup-0.14.4 made first): CPU, GPU and RAM overclock at their full potential (OC_SHARE = 1);
"depends a lot on the cooling" notes · new build from nothing: boardIsFixed only with a
customer board, dual objective → pairs only in newBuildBench, case added to the set (fan places for a lights objective),
lights / dual hints point to the set, "Install <colour> cables" → cheapest plain cable set (Cables category).
Not fixed: subject "Aroyal robbery" (text reader merged two words)._

_0.14.4 released 2026-11-07 (backup-0.14.3 made first): "Overclock Unlocked" badge (compat oc=1 CPUs /
boards: inventory rows, This PC now, Profit list) · Profit step starts with the read-only parts list · own overclock
values on the Profit step (f.ocSet {mult, core, mem} → flipOcOpts → flipScore cpuMhz / gpuShare = average of core and
memory progress toward the OC base, capped 1.2; typing redraws around the field – patchAround – so focus stays)._

_0.14.3 released 2026-11-07 (backup-0.14.2 made first): virus hint kept on 3DMark jobs (Conrad had a virus;
DullGirl / FishyC tests updated) · PC Bay inventory as category tabs (only filled categories, newest scan first –
inventory items get `at` (scan time) + `n` (order in the scan); a capture / typed part opens its tab) · Open jobs cards min 370 px (tables left as they are – Mariusz) · filled SVG swap
arrow, indented 10 px · PC Bay "Suggest NEW parts" switch (f.allowNew, off by default: flipAvail + fix-step options skip NEW
parts; manual ＋ Use still allowed)._

_Released in 0.14.2 (2026-11-07, backup-0.14.1 made first):_
customer hints in emails · red parts read as BROKEN · overclock settings (0.05 V, power limit) · USED / NEW on a Mac
capture (labels measured in card widths) · ← / → skipping a tall card. Also found: career bar at ~0 % on a 1512 px
capture wasn't read (finer second look). Note: the TR (Red) cooler in inv_arctic_red.png has no USED label – it's NEW.
Tests: units 175, run 474 + 12 known (4 new emails), pcbay 38 (4 new inventories), nav 2 (new), flow, systems,
flipassist, soak, startup – all pass.

---

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
