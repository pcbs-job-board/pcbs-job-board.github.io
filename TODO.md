# PCBS Job Board – ToDo & notes

Working notes for the job board (private – dev repository only).
Live version: **0.11.1** (no dev branch open; backup of 0.11.0: `backup-0.11.0`) (`main` in the public repository `pcbs-job-board/pcbs-job-board.github.io`, site https://pcbs-job-board.github.io/).

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

### 3DMark score: estimate, Status tile + suggestions for "3DMark score of N" (agreed – waiting for the go-ahead)
Formula found in Jacob Klein's PCBS HTML Calculator (v1.15.3); all inputs are columns of our parts workbook
(CPUs: CoreClockMultiplier, MemChannelsMultiplier, MemClockMultiplier, FinalAdjustment, Frequency,
Max Memory Channels, Default Memory Speed; GPUs: Single / Double GPU Graphics Score (+ GT1/GT2 values for OC);
Motherboards: RAM Speed Steps). Our 126 CPUs, 316 GPUs and 145 motherboards all have the data.
- CPU score = floor((coreMul × MHz + chanMul × channels + memMul × RAM MHz + adjust) × 298),
  channels = min(RAM sticks, CPU's max channels)
- GPU score = the GPU's single / double graphics score
- System = floor(1 / (0.85 / GPU + 0.15 / CPU))
- RAM MHz: XMP off = the CPU's default memory speed; XMP on = highest motherboard step ≤ the stick's MHz.
- Checked against the game: Azuka 4327 and DullGirl 4730 match the PC Stats "Benchmark" exactly (XMP off).
  EfficientR (broken PSU + RAM) shows 2859, the formula gives 2892 – broken parts probably change it.
Agreed with Mariusz (2026-11-03):
- Status row order: 💰 Budget, ⚡ Power, 3DMark, ⚠️ Fit. The 3DMark tile only shows when an objective asks for a
  3DMark score AND the parts it needs are known (CPU, GPU, RAM, motherboard). Popup: score XMP off / on vs target.
- Tile icon: an original orange-on-white benchmark icon (not a copy of the 3DMark logo).
- Customer PCs always come with XMP off; whether XMP changes the score depends on the RAM speed and the
  motherboard's speed steps – show both numbers, suggest "Turn on XMP" when that alone is enough.
- Suggestions: cheapest upgrades that reach the score, in budget – RAM stick for dual channel, GPU, two GPUs,
  CPU, CPU + GPU, motherboard + CPU. Unlocked, fitting, PSU checked. Respect a favourite brand.
- A 3DMark suggestion often changes several parts: make it obvious that ticking it adds ALL its parts
  (one box per combination, the parts listed under it, "adds N parts", new score shown).
- Overclocking formulas are there too (GPU GT1/GT2, CPU MHz) – later, not in this update.

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
  - STATUS row: 💰 ⚡ ⚠️ tiles, colours, details on hover / keyboard focus (0.11.0)
  - slimmer top bar: screen box (live preview = change screen, red ■ = stop), Capture job + ＋ manual job, icon-only ⚙️ (0.11.0)
- Add anything 1.0 brings. New screenshots where they help (compressed WebP, loaded only when the window opens).
  Check every button name against the app.

