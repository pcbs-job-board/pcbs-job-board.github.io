# PCBS Job Board – ToDo & notes

Working notes for the job board (private – dev repository only).
Live version: **0.9.0** (`main` in the public repository `pcbs-job-board`).

## How this list is used
- **Small fixes**: once there are **5 or more**, they're done together in a new hot-fix dev branch (`dev-X.Y.Z`).
- **Bigger updates**: only started when Mariusz asks for them. A bigger update also takes in every
  small fix still open, even if there are fewer than 5.
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

## Small fixes (0 / 5)

_None open. The last five are done in `dev-0.9.1` (waiting for the go-ahead to release)._

---

## Bigger updates (waiting for the go-ahead)

### Story job list: fill it from reports
- Reports arrive in the "PCBS reports" Google Sheet (tabs "Story jobs" / "Missing parts") and as
  "Story Quest Report #N" emails. Add confirmed ones to `data/story-jobs.csv`.
- Candidate from an older screenshot, **not confirmed yet**: `scottyB@dongermail.com`, subject
  "urgent job!!" (streaming together, no star requirement; probably the streamer story).
- Rule: the email address or subject alone marks a story job. The signed name only counts together with
  "no star requirement" or a long email, because random customers sign with first names too.

### Missing part reports: also ask for the unlock level %
- The parts database has `level_pct` since 0.9.0, but the report form only asks for the level.
- Needs a form change plus new Apps Script columns (`tools/report-endpoint.gs`, then redeploy as a new
  version). Could count as a small fix, but it's listed here because it needs the Google script redeployed.
