# The game: jobs and story jobs

- **Jobs** arrive by email: sender, subject, labour pay, budget, deadline ("Complete by End of Day 9/19/2018
  (Tomorrow)" – the app can't know the game's day, so it shows the date only), required **level** and **stars**
  (★ glyphs, counted on the screenshot's pixels – the reader can't read them). Objectives: "Diagnose and fix",
  "Replace RAM", "Install X [or better]", "Install dual graphics cards", "Upgrade to 128 GB of RAM", "Upgrade to 4 TB
  of Storage", "3DMark score of N", "Overclock CPU to N MHz", "Install 5 <fan> or better", "Support for double GPU",
  water cooling, lights / cables.
- **Hidden objectives** come from the email wording and must be guessed: "dusty" → clean with compressed air,
  "clicked on something bad" → run the virus scanner, "used parts" / "shiny new" → new parts only, "quickly" →
  urgent, a brand the customer likes → use that brand, cables / coolant colour wishes, parts the customer hints are
  broken ("I rammed the RAM", "cleaned it with the hoover"). Customer **suspects** are often wrong.
- **Story jobs** (career customers, `data/story-jobs.csv`): no hidden objectives, budget only counts when an objective
  mentions it, no star requirement. Matched by sender + subject (a few misread letters allowed); a known sender with
  a new subject = "not in the list yet – report it". Rule: the email address or subject alone marks a story job; the
  signed name only counts together with "no star requirement" or a long email.
- **"X or better"** = by the game's **part ranking** (`rk` in the database). Named maker + model = that exact card;
  a bare chip ("GTX 1080") = any card of it.
- Overclock objective confirmed by screenshot (2026-11-05, "More power!", Level 20): "Overclock CPU to 4125 MHz" +
  "Install custom water cooling for CPU". No GPU overclock objective seen yet.
