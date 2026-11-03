# Changelog

Versions follow X.Y.Z – X: major, Y: minor (new features), Z: small fixes.
Within each version, changes are listed from most to least important.

## 0.11.0
- Suggested part swaps in the new-job and PC Stats windows, based on objectives, hints and the PC's parts – unlocked, fitting, cheapest first within budget, with the board / PSU they need.
- New Status row under T1–T3: 💰 budget, ⚡ power and ⚠️ fit as coloured tiles – details pop up on hover or keyboard focus.
- Slimmer top bar: live preview = change screen, ＋ next to Capture job = manual job, ⚙️ icon only.
- Missing-part reports also ask for the unlock level %.
- Fixed: parts named in the objectives didn't count as job requirements on saved jobs.

## 0.10.0
- Text reader updated to Tesseract.js 7 – screenshots are read about 20 % faster.
- Fixed the last objective of build requests lost when joining email screenshots.
- New "How to use it" window – the ? button in the top bar.
- Compatibility check: part suggestions that fit the planned PC come first, the others show why they don't fit.
- Warning box under part swaps when planned parts don't fit together (socket, board size, GPU / PSU / cooler size, SLI / CrossFire, slots, radiators).
- Part swaps can be reordered (drag ⠿ or Alt + ↑ ↓) – higher in the list wins when parts clash; parts named in the objectives win over all.
- Power check: warns when the PSU is too weak for the planned CPU + GPU(s), also when overclocked.
- Part suggestions and swaps show more details: board sizes, GPU length, socket, RAM, cores, watts, SLI/CrossFire, lighting.
- PC Stats: model numbers cut at the line end are matched ("1500" → 1500X).
- PC Stats: an unclear model number is shown as read for checking instead of a guessed part.
- PC Stats: picture crumbs ("S35", "ion") no longer added as parts.
- PC Stats: parts the game never puts in customers' PCs lose close calls to parts it does.
- PC Stats: parts differing only by "+" (GAMING X vs GAMING X+) are told apart.
- Fixed sender and subject lost when a crumb sticks to the address ("TinyAunt@]…").
- Fixed junk after the last objective ("Diagnose and fix R").
- Uses less memory in long sessions.
- Dynabeard ("Important: Computer required") recognised as a story job.

## 0.9.1
- PC Stats: half-cut first line no longer added as a junk or wrong part.
- PC Stats: model numbers with look-alike letters recognised ("ST55F" read as "STSSF").
- Career level found at 0 % and on smaller screenshots.
- Stray letters removed before the subject and objectives ("s3DMark").
- Leftover test images removed from the website.

## 0.9.0
- Email and PC Stats areas are found automatically on the first capture, in a large window where they can be adjusted.
- Much more reliable PC Stats parts list – junk text from the part pictures is filtered out.
- Career level and % in the top bar – part suggestions for swaps only show parts you have unlocked.
- Career level and % are read from the screenshot automatically on every capture.
- Story jobs recognised (known list, or no star requirement / long email): no hidden objectives, budget not binding unless an objective mentions it.
- "📖 Report story job" in the top bar and the new-job window.
- Story job and missing part reports can be sent straight from the app – no account needed.
- Keyword rules are now an easy table: objective, words that add it, words that stop it.
- 🔔 Notifications: new version available (with reload) and a short "What's new" after an update.
- Rules can be switched off, reset one by one, and tested with a "Try it" box.
- Warning when the captured text doesn't look like an email or PC Stats.
- New "Reset all data" in Settings, with a confirmation step.
- Settings reorganised, with on/off switches; Export / Import moved into it.
- "🎯 Adjust areas" replaces Lock / Reset areas; Settings shows the area status with "Set up again".
- Cable, brand and broken-part detection can be switched off.
- More phrases detected for urgent jobs ("Can you get it done quickly?").
- Unlock level % added to the parts database.
- "Report part" removed from the top bar (still in the part suggestions).
- "Show all shortcuts" in Settings opens the shortcuts window.

## 0.8.1
- Fixed email and subject missing when screenshots are taken bottom-first.
- Fixed duplicated objectives from words cut off at the edge of a screenshot.
- Fixed hidden objectives triggered by parts of words (e.g. “led” in “failed”).
- Improved "Customer suspects" – only the part the customer blames is listed.
- Keyboard movement inside a job card: ↑ ↓ lines, ← → items, Space / Enter to tick or press.
- Part suggestions show 5 at a time with a visible scrollbar and a “more” count, and open upwards near the bottom of the page.
- Note in the capture window: English game only, always double-check the results.

## 0.8.0
- Hidden objectives rebuilt from the community hint list.
- Remaining budget shown on each job, with a clear over-budget warning.
- Keyboard shortcuts (on by default, can be turned off in Settings).
- Fixed objectives missed when inbox text is read with the email.
- Urgent jobs get an estimated deadline.
- Part prices shown on swaps and flagged in suggestions when over budget.
- Improved "Customer suspects" detection.
- Cable colour and type detection combined into one hint.
- Choosing the part to replace copies it into "New part", ready to edit.

## 0.7.0
- Long emails can be read from several screenshots.
- PC Stats parts matched to the parts database, with per-category limits.
- Fixed objectives not detected when the email box is larger than the email.
- Fixed duplicated and wrongly categorised parts.
- All parts shown by default, with a note about console editions.
- "Add part replacement" opens with "Other" selected and the name field focused.

## 0.6.1
- Fixed stray OCR text being added to objectives.
- Fixed smoke being detected as dust; smoke now points to a burnt part.
- Detection of parts the customer hints are broken.
- More phrases detected for cleaning and antivirus.
- Saved keyword rules update automatically.

## 0.6.0
- Job cards split into hidden objectives, objectives and found tasks.
- Hidden objectives highlighted, with a counter badge on each card.

## 0.5.1
- Open jobs sorted by deadline.
- Improved cable style and colour detection.
- Detection of forced/damaged parts.

## 0.5.0
- Capture reads the email only; PC parts are added with separate captures.
- New hidden objectives for heat and random reboots.
- Improved brand detection.
- Smaller fixes to objectives and the toolbar.

## 0.4.0
- Game version setting – hides parts from later updates.
- DLC settings reworked (Overclocked Edition, promo cases, PC-only parts).
- App version in Settings, links to this changelog.

## 0.3.1
- Brand preference detection; preferred brands listed first in suggestions.

## 0.3.0
- Parts database with 2,000+ parts, levels and prices.
- Cable suggestions for cable requests.
- Report missing parts via GitHub.
- Content pack settings.
- Project split into separate files.

## 0.2.0
- New layout: three workbenches, open jobs in a grid below.
- Stop capture button, cable colour detection, parts autofill.

## 0.1.0
- First version: capture, OCR, hidden objectives, tables, part swaps.
