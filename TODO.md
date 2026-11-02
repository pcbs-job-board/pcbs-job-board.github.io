# PCBS Job Board – ToDo & notes

Working notes for the job board (private – dev repository only).
Live version: **0.10.0** (`main` in the public repository `pcbs-job-board/pcbs-job-board.github.io`, site https://pcbs-job-board.github.io/).

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

_None open. The last five are done in `dev-0.10.0`._

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

### Missing part reports: also ask for the unlock level %
- The parts database has `level_pct` since 0.9.0, but the report form only asks for the level.
- Needs a form change plus new Apps Script columns (`tools/report-endpoint.gs`, then redeploy as a new
  version). Could count as a small fix, but it's listed here because it needs the Google script redeployed.
