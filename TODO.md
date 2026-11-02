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

## Small fixes (5 / 5)

### Remove stray test screenshots from the public repository
- `ac_bottom.png`, `ac_bottom2.png`, `kb_ac.png` were committed by mistake in 0.8.1 (test pictures of the
  part suggestions with a dummy test job). They're harmless but clutter `main`.
- Fix: delete them, and add `*.png` to `.gitignore` in the repository root, so test pictures can't
  slip in again. The app has no PNG files of its own.

### Stray letters before an objective or subject
- Found by the tests: "s3DMark score of 6161" (`28a8728a`, Mac screenshot) and subject
  "eA Computer has gone crazy?!" (`4f09c68d`, low-resolution copy).
- Picture crumbs in front of the text. Idea: in `parseEmail`, drop a leading 1–2 letter fragment glued to a
  word that starts with a digit / capital ("s3DMark" → "3DMark"), and a leading 1–2 letter token before the
  subject ("eA Computer…") – only when the rest still makes sense, e.g. a known word follows.

### Career bar not found on smaller (Mac) screenshots
- `6e805ccf` (Lisa, 1512×948, level 14, bar almost empty) → no career read.
- Likely: the bar is only a few pixels tall at that size, and with the bar almost empty there is very little
  green. Check `findLevelBar` (minimum green run length `W * 0.012`, the track walk). Also allow an empty bar
  (0 %): find the bar by its track + outline when there's no green at all.

### PC Stats: the half-cut first line becomes a junk or wrong part
- Scrolled PC Stats screenshots start with a line cut in half: "Intel COFe 1/-GUGBOK" (`473e0e73`), "supe" +
  "MSI MPG Z590 CARBON EK X" from the cut "Carbon" line (`671159d3`).
- The whole list is right after joining (the groups pass), but a single screenshot shows junk.
- Idea: drop the first component line when it sits at the very top edge of the box and doesn't match a
  part well, as `mergeTexts` already does for email screenshots.

### PC Stats: a part missed on one screenshot
- `b81ddb6b` (Imran, top of list): SilverStone ST55F-PT missing. It's found on the next screenshot, so the
  joined list is right. Check why that line is dropped (probably `denoisePartLines` or the joining of lines).

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
