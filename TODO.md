# PCBS Job Board – ToDo & notes

Working notes for the job board (private – dev repository only).
Live version: **0.12.0** (released 2026-11-03; backup of 0.11.1: `backup-0.11.1`) (`main` in the public repository `pcbs-job-board/pcbs-job-board.github.io`, site https://pcbs-job-board.github.io/).

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
- Overclock "level 3" – the highest clock a given cooler allows – needs the game's temperature formula (not published;
  could be fitted from ~20–30 in-game readings: CPU, cooler, voltage, MHz, °C, with / without case fans).
- 💡 Tips live in js/hints.js (id, when(job, build), text) – add new ones there.
- PC Bay unlocks at career level 9 – the gate `pcBay` is ready in js/unlocks.js for the coming system.
- Mariusz plans a non-job system (part of the 0.12.0 line) that uses both the 3DMark and the overclock formulas.
- Overclock objective wording seen so far only on Steam ("OC CPU to 4000MHz", "OC GPU to 2133MHz") – check against a
  real screenshot when one comes in.

### Story job list: compare with the report sheet (planned for 1.0, the final build)
- Small updates already add story jobs seen on screenshots (see the rules at the top).
- For 1.0: compare the entries in `data/story-jobs.csv` with the "Story jobs" tab of the report sheet and
  add / correct what's missing.
- Reports arrive in the "PCBS reports" Google Sheet (tabs "Story jobs" / "Missing parts") and as
  "Story Quest Report #N" emails. Add confirmed ones to `data/story-jobs.csv`.
- Added in 0.10.0: Dynabeard – `IT@dynabeard.org`, subject "Important: Computer
  required", signed Kinsley Hackett, IT Supervisor – a build request, Req: Level 14, no star requirement.
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

### 1.0: bring the "How to use it" window up to date
- The window (? button, `index.html` → `#dlgHelp`, pictures in `img/help/`) was written from the Steam guide
  before the later 0.10.0 features. For 1.0, add the important functions added since then, up to and including
  everything released in 1.0. From 0.10.0 so far:
  - part details in the suggestions and on swaps (board sizes, GPU length, socket, RAM, watts, SLI/CrossFire, lighting)
  - ⚡ power check (shows once a PSU is planned; overclocking)
  - compatibility: fitting parts first in the suggestions, warning box under part swaps, swap order decides
    who wins (drag ⠿ / Alt + ↑ ↓), parts named in the objectives win over all
  - unclear PC Stats model numbers shown as read, for checking
  - 💡 suggested swaps in the new-job / PC Stats windows (0.11.0)
  - Overclock tile + suggestions for overclock objectives; "plans to overclock" PSU check (0.12.0)
  - 3DMark tile + suggested part sets for "3DMark score of N" (0.12.0)
  - STATUS row: 💰 ⚡ ⚠️ tiles, colours, details on hover / keyboard focus (0.11.0)
  - slimmer top bar: screen box (live preview = change screen, red ■ = stop), Capture job + ＋ manual job, icon-only ⚙️ (0.11.0)
- Add anything 1.0 brings. New screenshots where they help (compressed WebP, loaded only when the window opens).
  Check every button name against the app.

