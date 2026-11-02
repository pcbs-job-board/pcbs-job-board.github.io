# PCBS Job Board – ToDo & notes

Working notes for the job board (private – dev repository only).
Live version: **0.9.1** (dev: `dev-0.10.0` – Tesseract.js 7, waiting for the go-ahead) (`main` in the public repository `pcbs-job-board/pcbs-job-board.github.io`, site https://pcbs-job-board.github.io/).

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

## Small fixes (5)

### Last objective lost when joining two email screenshots
- Reported by Mariusz: Dynabeard (`IT@dynabeard.org`, "Important: Computer required"), top + scrolled
  screenshot. The text reader read all 3 objectives, but "Upgrade to 8 GB of RAM" (the last one) was not
  added. Screenshots are in the tests (`dynabeard_top`, `dynabeard_scrolled`, group "Dynabeard").
- Why build requests: in fix / upgrade emails the orange/red "PC Status … PC Stats" bar follows the
  objectives, so the last objective is never the last line. A build request (PC built from zero) has no such
  bar – after the objectives come only the "Quit / Go to whiteboard" buttons (Mariusz's observation).
- Cause (reproduced): when the "Quit / Go to whiteboard" buttons aren't read, the last objective is the
  scrolled screenshot's last line. `mergeTexts` marks a screenshot's first/last line as "edge" (maybe
  cut off) and, after the last matching line, drops edge lines when both screenshots have extra lines
  there – so a complete, unique line is thrown away.
- Fix: only drop an edge line when the other screenshot has a similar line (a cut-off copy of it);
  keep edge lines nothing else covers. Also end the objectives at "Go to whiteboard" (the build request's
  button). Add a test with the button line missing.

---

### Found by the tests with the real reader (also in the live 0.9.1 – not caused by the upgrade)
Since 0.10.0 the tests use the same tesseract.js as players. Its output is a little different from the old
command-line stand-in, and it shows these (identical on 5.1.1 and 7.0.0; marked "known" in the tests):

### PC Stats: misread model number matched to the wrong part
- `4503a9e0` SilverStone **ST65F-PT** read as "STE5F-PT" → matched ST55F-PT. `506ab405` "AMD Ryzen 5 Quad
  Core 1500" (X cut off at the line end) → matched 1400 instead of 1500X.
- Idea: when the look-alike / one-slip match is ambiguous between parts of the same series, prefer the one
  whose digits agree with the reading (E→6 is not a look-alike; "1500" is a prefix of 1500X, not 1400).

### PC Stats: picture crumbs kept as parts
- `4b889ddb` "[S35] yo" → part "S35"; `f7d01836` half-cut last line "… ion "NNN" → part "ion".
- Idea: a bracketed 2–4 character token, or a single short word on the last (cut) line, is not a part.

### Email: stray "]" in the sender address → no sender, no subject
- `737a8f34` read "TinyAunt@]JulieBrewing.ly" → address not recognised, so subject is lost too.
- Idea: drop stray brackets / pipes next to "@" before looking for the address.

### Objectives: junk after / below the last objective
- `c1f4af87` "Diagnose and fix R"; `df46ed81` button bar read as "[fae se ee ee]" → objective "fae".
- Idea: trailing single capital after a known objective phrase is junk; a line in [brackets] made of
  2–3 letter bits is the button bar.

---

## Bigger updates (waiting for the go-ahead)

### Story job list: compare with the report sheet (planned for 1.0, the final build)
- Small updates already add story jobs seen on screenshots (see the rules at the top).
- For 1.0: compare the entries in `data/story-jobs.csv` with the "Story jobs" tab of the report sheet and
  add / correct what's missing.
- **Waiting for the next small update:** Dynabeard (below).
- Reports arrive in the "PCBS reports" Google Sheet (tabs "Story jobs" / "Missing parts") and as
  "Story Quest Report #N" emails. Add confirmed ones to `data/story-jobs.csv`.
- **Confirmed by Mariusz** (already in the report sheet): `IT@dynabeard.org`, subject "Important: Computer
  required", signed Kinsley Hackett, IT Supervisor – a build request, Req: Level 14, no star requirement.
- Candidate from an older screenshot, **not confirmed yet**: `scottyB@dongermail.com`, subject
  "urgent job!!" (streaming together, no star requirement; probably the streamer story).
- Rule: the email address or subject alone marks a story job. The signed name only counts together with
  "no star requirement" or a long email, because random customers sign with first names too.

### "How to use" window – "?" button at the far right of the top bar
- Requested by Mariusz. A "?" icon as the **right-most** item in the top bar (after ⚙ Settings) opens a
  window with the "How to use it" chapter of the Steam guide.
- Starts with the **banner image** (`00_banner.png`), then the 7 steps + "Tweak it" with the guide's
  screenshots in the same places (04 area setup, 05 new job window, 03 job card, 06 suggestions,
  02 open jobs, 07 rules, 10 settings).
- Text as in the guide, minus what doesn't fit inside the app: drop "Go to https://pcbs-job-board.github.io/.
  A desktop browser (Chrome, Edge, Firefox) works best." (the player is already there); button names must
  match the app.
- Source: guide text + images in `help-assets/` on this branch (copy them into the dev branch, e.g. `img/help/`).
  Images: convert to compressed WebP/JPEG (the PNGs are ~0.2–1.4 MB each) and load them only when the
  window opens. `.gitignore` blocks *.png/*.jpg since 0.9.1 – add `!img/**` or use `git add -f`.
- No keyboard shortcut for this window (opened maybe once); `?` stays the shortcuts key. Close with Esc / ✕,
  scrollable, fits narrow screens. Probably a new feature version (0.10.0) unless it goes into 1.0.

### Missing part reports: also ask for the unlock level %
- The parts database has `level_pct` since 0.9.0, but the report form only asks for the level.
- Needs a form change plus new Apps Script columns (`tools/report-endpoint.gs`, then redeploy as a new
  version). Could count as a small fix, but it's listed here because it needs the Google script redeployed.
