# PCBS Job Board – ToDo & notes

Working notes for the job board (private – dev repository only).
Live version: **0.11.0** (no dev branch open; backup of 0.10.0: `backup-0.10.0`) (`main` in the public repository `pcbs-job-board/pcbs-job-board.github.io`, site https://pcbs-job-board.github.io/).

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

## Small fixes (3)

Reported by Mariusz while testing 0.11.0 (2026-11-03).

1. **Suggested swaps don't appear after a PC Stats capture in the new-job window.** Seen on the EfficientR
   ("Replace PSU / Replace RAM") and DullGirl ("Upgrade to 16 GB of RAM") jobs: the box keeps saying
   "capture PC Stats to get a … suggestion". It works in a saved job's Parts window.
   Cause: `rebuildParts()` fills the parts box from code, which fires no `input` event, so
   `renderSuggestions()` never runs. Fix: call it at the end of `rebuildParts()`.
2. **The Parts window of a saved job doubles parts.** DullGirl: re-capturing PC Stats from the job card gave
   2 motherboards, 2 GPUs and 2 drives (15 parts instead of about 12). The parts captured in the new-job window
   count as "typed by hand", so they're kept next to the new reading. Fix: save which parts were captured with
   the job and replace those; for jobs saved before the fix, treat all their parts as captured.
3. **Misreads on DullGirl's PC Stats (second capture, 11:26):** "ASUS ROG Strix Z370-G Gaming (Wi-Fi AC)" was
   read as "Z370-E Gaming", and "MSI Radeon RX 580 GAMING X+ 8G" as "GAMING X 8G". The 11:25 capture read both
   correctly. Screenshot (scaled down in the chat): `fixtures-pending/dullgirl_pcstats_1126.png`. Add it to
   the tests and check why the near-identical name won.

Not a bug: Azuka ("I'm a total Intel fanboy") gets no CPU suggestion because the CPU is already an Intel
i7-6700K – nothing to change. Possible extra: show "already Intel ✓" in the suggestions box (ask Mariusz).

---

## Bigger updates (waiting for the go-ahead)

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

