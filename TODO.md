# PCBS Job Board – ToDo & notes

Working notes for the job board (private – dev repository only).
Live version: see `HANDOVER.md`. What each version changed is in CHANGELOG.md – this list only has what's still to do.

## How this list is used
Process rules are in `HANDOVER.md` (standing rules) and `handover/process.md` (release, code style, tests).
List-specific: nothing is started without Mariusz's go-ahead; done items are removed; after adding an item report the
counts of small fixes / bigger updates; this file is pushed to `todo` after every change.

---

## Small fixes (0)

None open.


## Bigger updates (waiting for the go-ahead)

Notes for later (not tasks yet):
- Overclock "level 3" (highest clock a cooler allows) needs the game's temperature formula – **very low priority**, only if
  Mariusz collects enough readings before 1.0, otherwise drop it. Fit so far (33 readings, 3 parameters) and open questions:
  `notes/oc-temperature.md`.
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
