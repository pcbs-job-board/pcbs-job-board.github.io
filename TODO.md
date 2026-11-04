# PCBS Job Board – ToDo & notes

Working notes for the job board (private – dev repository only).
Live version: **0.12.2** (released 2026-11-04; backups: `backup-0.11.1`, `backup-0.12.0`, `backup-0.12.1`) (`main` in the public repository `pcbs-job-board/pcbs-job-board.github.io` – remote `origin` of the app checkout points there directly now, site https://pcbs-job-board.github.io/).

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
- Changelog: very short lines, most important change first. Versions are X.Y.Z (X major, Y features, Z fixes).
- Tests: branch `tests` here (`node run.js --app <app checkout>`). Run it on every dev branch before
  asking to release – 0 failed. New screenshots from Mariusz go into `fixtures/` with checked expectations.

---

## Small fixes (0)

_None open. The three from the 0.11.0 test are done in `dev-0.11.1`._

---

## Bigger updates (waiting for the go-ahead)

Notes for later (not tasks yet):
- Overclock "level 3" – the highest clock a given cooler allows – needs the game's temperature formula (not published).
  **Very low priority**: only if Mariusz happens to collect enough readings before 1.0 (~20–30, see the list of what
  each reading needs, sent 2026-11-04); otherwise drop it.
- 💡 Tips live in js/hints.js (id, when(job, build), text) – add new ones there.
- Overclock objectives: Mariusz has had "OC CPU to <MHz>" twice (CPU only – no GPU overclock objective seen yet).
  The parser already reads it; a screenshot for the tests is welcome but not needed.

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
     - Custom story jobs and parts go into the export / import backup (default, not discussed).
- Already in the app: Dynabeard (0.10.0), HRH The Queen (0.12.0).
- **Waiting to be added – no rush, goes in whenever there's a release** (reported 2026-11-03): Giovanna Sciarra, PhD –
  `giovanna@giosci.lab`, subject "A minor setback", signed "Giovanna Sciarra, PhD". Particle accelerator magnet
  quench – parts overheated, PC won't turn on. Objectives: Diagnose and fix; Complete by end of day (tomorrow).
  Labour $150, Budget $600, Req: Level 13, no star requirement.
- Candidate from an older screenshot, **not confirmed yet**: `scottyB@dongermail.com`, subject
  "urgent job!!" (streaming together, no star requirement; probably the streamer story).
- Rule: the email address or subject alone marks a story job. The signed name only counts together with
  "no star requirement" or a long email, because random customers sign with first names too.

### 1.0: re-analyse keyboard shortcuts and navigation (especially inside a job card)
- The card got many new parts since the keyboard design (0.8.x): part details, ⚡ power, ⚠️ clash box →
  Status tiles, swap ⠿ order with Alt + ↑ ↓, ranked suggestions with warnings, swap form selects.
- Walk through every card and window with the keyboard only and write down what is slow, confusing or
  unreachable: line order (`ROW_SEL` in `js/keys.js`), what ← → do on each line, where focus lands after
  an action / re-render, the suggestion list (↑ ↓ / Enter / Esc), Status tiles (focus + delayed popup),
  opening / closing the swap form, deleting a swap, "Current parts", the review window and dialogs.
- Check shortcuts for clashes with the browser / screen readers (Alt + arrows = back / forward in some
  browsers outside a focused control), and that every mouse-only action has a keyboard way.
- Propose the changes to Mariusz first (list), then build, update the shortcuts window and the "How to use it"
  window, and add keyboard checks to the flow test.

### After 1.0: new Steam guide, then the "How to use it" window from it
- The window (? button, `index.html` → `#dlgHelp`, pictures in `img/help/`) is up to date with 0.12.x.
- Once 1.0 is released: rewrite the Steam guide with **one section per system** – e.g. career unlocks, random job,
  story job, 3DMark request, overclock request, PC Bay builds, keyboard navigation… (specifics to be discussed
  with Mariusz first).
- Then update "How to use it" on the website from the same text and pictures (pictures: `scratchpad/guide3.js` –
  real screenshots through the real capture flow; WebP, loaded only when the window opens).
