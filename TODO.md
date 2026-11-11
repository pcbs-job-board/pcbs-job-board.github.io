# PCBS Job Board – ToDo & notes

Working notes for the job board (private – dev repository only).
Live version: **0.15.1** (released 2026-11-10; backup of the version before: `backup-0.15.0`) – `main` in the public
repository `pcbs-job-board/pcbs-job-board.github.io`, site https://pcbs-job-board.github.io/. What each version
changed is in CHANGELOG.md – this list only has what's still to do.

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
- **This list is pushed to the `todo` branch after every change** – Mariusz checks it there. "Don't push"
  means don't push to `main` / live; dev branches, `tests` and `todo` are always kept up to date.
- Before a release: back up the live `main` as `backup-<live version>` here. Then **ask Mariusz before
  merging a dev version into `main`**, merge, and check the live site.
- **Version bump**: `python tools/bump_version.py X.Y.Z` (js/config.js, every `?v=`, `--css-ver`, package.json), then a
  new CHANGELOG.md section by hand.
- Changelog: very short lines, most important change first. Versions are X.Y.Z (X major, Y features, Z fixes).
- Tests: branch `tests` here (`node run.js --app <app checkout>`). Run it on every dev branch before
  asking to release – 0 failed. New screenshots from Mariusz go into `fixtures/` with checked expectations.

---

## Small fixes (3)

1. **"Upgrade to 4 TB of Storage" – no suggestion, and the set says "covered"** (Mariusz 2026-11-10, story job
   stu@theirregularcorporation.com "One last upgrade needed for a new game(!)": "3DMark score of 14000", "Upgrade
   to 128 GB of RAM", "Upgrade to 4 TB of Storage", budget $7,000, PC has 1 × Mortoni EZStore 500GB). Causes:
   (a) suggest.js has a rule for "Upgrade to N GB of RAM" but none for "Upgrade to N TB/GB of Storage" – add one
   (total size of all drives ≥ N: add a drive or replace the smallest; cheapest first, free SATA / M.2 places);
   (b) suggestPlan's 0.15.1 line "covered by this set" is added for every objective that got no suggestion – only
   say it when the set really meets it (dual GPU: 2 GPUs in the set; RAM / storage: the planned total), else list
   it as not covered.
2. **3DMark: "No unlocked parts reach this score" with a $7,000 budget** (same job: i7-7700K on a Mortoni H170
   Mtech plus (no SLI), 2 × 8 GB 2400, 1 × MSI GTX 1080 GAMING Z 8G, CORSAIR TX650M – app score 7,000, game 6,980).
   Checked: SLI board + 2 × 1080 Ti alone gives 12,589 with the 7700K (CPU score 5,376 holds it back), so 14,000
   needs a bigger rebuild – a new platform (board + CPU, e.g. Z370 SLI + i7-8700K / 9th gen) + 2 GPUs + PSU (+ the
   RAM the RAM objective already adds). benchSuggestions only tries small sets, so it finds nothing. Fix: when the
   small sets can't reach the score and the budget allows, try whole-platform sets (socket change: board + CPU +
   cooler if it doesn't fit + RAM type if it changes) with 1 or 2 GPUs and a PSU, cheapest that reaches it; and
   in the one-set plan, build it on the RAM / storage the other objectives add.
   Rule (Mariusz 2026-11-10): the game never gives a 3DMark objective that can't be reached at the job's level, so
   "No unlocked parts reach this score" should never be the answer – keep widening the search (more parts changed,
   whole platform, 2 GPUs, overclock) until a set reaches the score and meets the other objectives; inside the
   budget first, but for story jobs (budget only counts when an objective mentions it) go over it if needed and say
   so. If the search still fails, that's an app bug – show "couldn't find a set – please report this job" instead.
3. **Duo cables missing from cable suggestions** (Mariusz 2026-11-10, Cooke.Malcolm@MalcolmAnalytics.gov "please
   help": "I'd love some Plastic White Yellow cables" → hidden task "Change all cables → Plastic White / Plastic
   Yellow", e.g. Loose Plastic White, Ribbon Plastic Yellow). Causes: (a) cablesFor (parts.js) leaves out every duo /
   striped / patterned set unless the wish names that type; (b) the database names the duo sets wrongly – the shop
   (screenshots 2026-11-10) sells "Ribbon Plastic Duo Blue / Cyan / Green / Light Grey / Lime / Orange / Pink /
   Purple / Red / White / Yellow" ($400 each), the database has "Ribbon Plastic Duo Black <colour>"; also "Ribbon
   Plastic Patterned Lime Black Light Grey" (DB: "… Lime Black Grey"). Fix: rename those in cables.csv (keep the old
   names as aliases for saved jobs); offer the duo sets of the asked colour too. Two colours in one wish
   ("Plastic White Yellow") = ONE wish: only sets that have both colours count (Mariusz 2026-11-10) – e.g. Ribbon
   Plastic Striped White Yellow, any duo / striped / patterned set with white and yellow; not plain White / Yellow
   and not "White / Yellow" as two options. Fix detectCables to keep "plastic white yellow" together (label
   "Plastic White Yellow").
   Rule (Mariusz 2026-11-10): the set's colours must be exactly the wished colours – 1 colour asked → only sets
   in that one colour; 2 colours → only 2-colour sets with those two (no 3-colour sets like Patterned Red Yellow
   Black); 3 colours → only sets with exactly those three; etc. The colours are the colour words in the shop name
   (Mariusz: "Duo Yellow" = 1 colour Yellow; "Striped White Yellow" = White + Yellow; "Patterned Red Yellow Black" =
   3). Malcolm's "Plastic White Yellow" at Lv 25 → only Ribbon Plastic Striped White Yellow.
   Exception – duo sets (Mariusz 2026-11-10): "Ribbon Plastic Duo <colour>" are all black + that colour, so their
   colours are Black + <colour> (2), even though the shop name shows one: Duo Red fits a "Black Red" wish, not a
   "Red" one. (Keep this as data – a colours field per cable set – so the name rule doesn't decide it alone.)
   Unknown: would the game accept Duo Red for "Plastic Black Red" as well as Striped Black Red – check in game.
   Must work for 3- and 4-colour wishes too (Mariusz 2026-11-10): detectCables reads any run of 1–4 colour words
   after the type ("Plastic Red Yellow Black", "Ribbon Plastic Red Green White Black") as one wish, and the hidden
   task's examples ("e.g. …") list only the sets with exactly those colours (Patterned Red Yellow Black, Patterned
   Red Green White Black). Cables are only in the hidden task (not in the one-tick set). Unit tests: 1, 2, 3 and 4
   colours.

## Bigger updates (waiting for the go-ahead)

### Parts database window – hidden columns, filters, overclock columns (Mariusz 2026-11-09, planning only)
General:
- A small, unobtrusive switch at the bottom (like "Suggest NEW parts" in PC Bay build): **"Show hidden details"** –
  OFF every time the window opens (not remembered). Off = the columns below hidden; on = everything.
- Show all the remaining columns on one screen (no sideways scrolling) where possible: tighter widths, wrap long cells.
- Filters as drop-down menus (per category, below).
Per category (hide = hidden unless "Show hidden details"):
1. **Case** – hide: Open Bench, Game Version, Random Jobs, Details. Custom water cooling "none – no custom water
   cooling" → just "none". A small (i) next to the number of supported reservoirs – hover = the list of them. DLC
   column → a small ✓ when the part is from a DLC, hover = the DLC's name. Filters: Case type, Board size, Lights.
2. **Motherboard** – hide: Game Version, Details. Filters: Socket, Size, Multi GPU, Overclocking, Lights.
3. **CPU** – hide: Ranking, Game Version, Details. Filters: Socket, Overclock. Overclock column → just Yes / No,
   moved in front of the clock column. Clock column → **Clock and voltage**: Stock (e.g. "Stock: 3900 MHz @ 1.15 V"),
   mid / safe overclock, max overclock (from oc.js: ocOf / ocSettings, voltage on the 0.05 V steps); a CPU that can't
   overclock → stock only. Throttles at → right after Clock and voltage.
4. **CPU Cooling** – hide: Game Version, Random Jobs, Details. Filters: Type, Socket, Lights. Long supported-socket
   lists split into 2 lines.
5. **RAM** – hide: Game Version, Details. Filters: Size, Speed in bands (2000–2499, 2500–2999, …), Lights.
   Mariusz noticed: lights all say "RGB" (= any colour), but some sticks light in one fixed colour (example 2026-11-10:
   Team Group T-Force Night Hawk (Blue / White / Red LED) = one colour; T-Force DARK = no lights). Found: the data is
   right – the details text already says "Blue lighting" / "RGB"; the bug is partsdb.js `["Lights", p => (p.c.lt ?
   "RGB" : "")]`, which shows "RGB" for every lit part. Fix: take the type from the details ("RGB" or "<colour>"),
   and the Lights filter offers RGB / each single colour / none. Single-colour parts in the DB: fans 7, cases 15,
   coolers 7, GPUs 52, boards 1, RAM 40.
6. **GPU** – hide: Ranking, Game Version, Random Jobs, Details. Rename Memory → **VRAM**. Core clock and memory clock:
   stock, mid overclock, max overclock (like the CPU). Filters: Chipset, VRAM, SLI / CrossFire, Lights.
7. **PSU** – hide: Game Version, Details. Filters: Power in bands (250–499, 500–749, …), Type, Format.
8. **Storage** – hide: Game Version, Details. Filters: Type, Lights.
9. **Case fans** – hide: Game Version, Random Jobs, Details. Filters: Size, Lights.
10. **Reservoir** – hide: Game Version, Details. Filter: Lights.
11. **Radiator** – hide: Game Version, Details. Filters: Size, Lights.
12. **CPU Block** – hide: Game Version, Details. Filters: Socket, Lights.
13. **Pipes** – hide: Game Version.  14. **Connector** – hide: Game Version, Details.
15. **Coolants** – hide: Game Version.  16. **Cables** – hide: Game Version.
"Mid / safe overclock" (Mariusz 2026-11-09): best = an overclock that stays under throttle temperature with any
cooler; if that can't be worked out reliably, use the midpoint between stock and max. Don't base it on the
temperature research (case type and GPU heat also affect CPU temps, so that data isn't reliable enough).
Open question: filters combine with the search box (AND).

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
