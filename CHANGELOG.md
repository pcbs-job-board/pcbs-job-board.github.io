# Changelog

Versions follow X.Y.Z – X: major, Y: minor (new features), Z: small fixes.
Within each version, changes are listed from most to least important.

## 0.14.9
- PC Bay Profit step: the gentlest overclock that just reaches 10,000 – one click to use it.
- Two graphics cards of the same model from different makers count as a pair.
- PC Bay notes at 10,000 corrected: more or better parts still raise the price.
- Brand fan + "diagnose and fix": suggests the customer's own part again, not a planned one.
- Hidden objectives: a note that they're guesses and might not be required.
- A known story customer's new email no longer shows another job's story.
- 4 OCR bugs fixed.
- 3 new story jobs added.

## 0.14.8
- PC Bay: "Best build" lists the end result, one line per slot (old → new) – no more steps that replace each other.
- PC Bay Profit step: replaced parts shown red → new parts green (BROKEN tag on broken ones).
- PC Bay: a $0 part in the Resale Value window is marked broken.
- Fixed: identical PC Bay parts (3 × the same fan) – ticking or deleting one hit all of them.
- RAM suggestions use the favourite brand (hidden objective); ★ only on that brand's parts.
- Single changes say which part they replace.
- 1 new story job added.

## 0.14.7
- Fixed: planning a part for a slot that already has a planned swap (or editing a swap) still counted the old part's price and power – falsely "over budget" / PSU too weak; the new part now takes its place.
- PC Bay inventory capture reads its 3 columns at once – about 3× faster on most computers.
- 1 OCR bug fixed.

## 0.14.6
- Job cards: ticked part swaps shrink to a checkbox and the part's name and fold away; at most 3 open swaps show, the rest behind "X more part swaps planned".
- PC Bay build: inventory parts with a yellow "Property of …" note (a customer's) are left out – they can't go into a build.
- 4 new story jobs added.

## 0.14.5
- Fixed: a PC built from nothing got no 3DMark build when the job also asks for dual graphics cards; the build now uses two of the same card and includes a case.
- Suggestions: cable colour objectives ("Install Purple cables") suggest the cheapest cable set; lights on a new build are planned on the build's case.
- Overclocking: CPUs, GPUs and RAM suggested at their full overclock potential (was 90 %) – reaching it depends a lot on the cooling and may not be possible.

## 0.14.4
- PC Bay build, Profit step: enter the overclock you actually reached (CPU multiplier, GPU clocks) – 3DMark, sale and profit estimates update as you type; the PC's parts listed at the top.
- PC Bay build: 3DMark and sale figures marked as rough estimates (the game's can differ slightly).
- PC Bay build: "Overclock Unlocked" badge on CPUs and motherboards that can overclock (inventory and part lists).

## 0.14.3
- PC Bay build: "Suggest NEW parts" switch (off by default) – suggestions use only USED inventory parts unless it's on.
- Open jobs cards keep a readable width (~370–460 px) in wide windows; a thicker, filled arrow on part swap tiles.
- PC Bay build: inventory in category tabs (only categories you have), newest scans at the top; a capture opens its category.
- Emails: a slow PC ("not as quick as it used to be") now always adds the virus scan, also on 3DMark jobs – as the keyword tester shows.

## 0.14.2
- 3 OCR bugs fixed.
- Emails: 4 new hints (3 for broken parts, 1 for cleaning).
- Overclock settings: core voltage on the game's 0.05 V steps, GPU power limit (+20 % / +50 %); multiplier and voltage on the job's overclock tile too.
- Fixed: ← / → skipped a tall job card next to shorter ones.

## 0.14.1
- PC Bay build, Hardware step: a build assistant – "Best build from your inventory" (the most profitable PC that works, one click), single changes that also fill empty places (RAM pairs, GPUs, drives …), ↻ Refresh.
- PC Bay build: put parts in (＋ Use) and take them out (✕) freely in steps 2–3; inventory grouped by category.
- PC Bay build: the Profit step opens only for a complete PC that works (case, motherboard, CPU, CPU cooling, 1–4 RAM, 1–2 GPUs, PSU, storage, everything fits, enough power) – the window says what's missing; no sale estimate before that.
- PC Bay build, Profit step: overclock settings to type in – CPU multiplier and core voltage, GPU Tuner core / memory clocks.

## 0.14.0
- Faster and clearer while it works: the text reader starts in the background (job / PC Bay window opened, screen connected, or right after the page loads for players who captured before), and says so when a capture has to wait for it (first time: downloads a few MB). Suggested swaps show "⏳ Working out…" and aren't worked out again when nothing changed. PC Bay inventory capture shows which column it is reading.
- Keyboard: the arrows skip the ✕ buttons – Delete removes a line instead, and every removal (task, objective, swap) can be undone. Inside a card the job keys (1 2 3 0, H, N, R, E, P, D) wait until Esc, so a stray key can't move the job. Enter goes to the first unfinished line, Esc closes a details popup first, an open swap form survives the board being redrawn, the Edit window opens on its first field. New keys: B parts database, U career unlocks, L changelog, P = Edit + capture PC Stats; E / Enter open a PC Bay build.
- 📖 Parts database: every part by category (case, motherboard … cables) in a sortable table with all its facts, filtered by name.
- Suggested swaps for every objective, or a line saying why there are none: "Install custom water cooling for CPU" → a CPU block, radiator and reservoir that fit, in one tick; "Install an SSD / HDD / M.2" → the cheapest drive of that kind; an overclock the parts already reach → "nothing to change".
- Water cooling fit checks: reservoirs against the case (the game's shop list, all colour / window versions), cases without custom water cooling, radiators against the case's radiator places, CPU blocks against the socket (also before a motherboard is known). The game also checks 3D collision live, so a listed reservoir can still clash with other parts.
- One part order everywhere (job window + swap categories): Case, Motherboard, CPU, CPU Cooling, RAM, GPU, PSU, Storage, Case Fans, Reservoir, Radiator, CPU Block. The swap category "Other" is now "Any".
- Custom water cooling has its own part types: Reservoir, Radiator and CPU Block – as fields in the job window and in the swap categories.
- Watercooled GPUs are marked 💧, unlock with the Custom Water Cooling Shop, and are suggested for "water cooling for the GPU" objectives.
- New hidden objective: coolant colour ("blue coolant" → fill the loop with Blue coolant, e.g. Blue Clear Coolant) – can be switched off in the rules.
- Job window: RAM sticks that differ in size or speed get a "!" – another part may have been read as RAM.
- Looks-only parts (cables, and the pipes, fittings and coolants of custom water cooling) are no longer offered when typing a part; "Cables" is gone from the swap categories.
- "Install dual graphics cards" jobs keep the customer's motherboard: GPU pairs that fit it come first, no board swaps are suggested (unless an objective asks for a new board).
- A GPU "upgrade" means a higher 3DMark score than the old card (the ranking only decides when there is no score).
- "Overclock CPU" jobs keep the customer's own CPU: no CPU swaps are suggested (unless an objective also asks to replace / upgrade it), and a CPU swap turns the Overclock tile red.
- Putting a job on a table scrolls the page up to the workbenches.
- Fixed: after an update the page could keep an old style sheet (wrong looks) – it's now reloaded automatically, and old "?v=" addresses are cleaned up.
- Fixed: a rare error when a part field was changed while the part fields were being redrawn.
- Fixed: "Install dual graphics cards" jobs showed no suggested swaps at all when the PC had a motherboard.
- 1 OCR bug fixed.
- Code reorganised for easier work on it (logic and page parts in separate folders, automatic code checks) – no change in how it works or how fast it loads.
- 📜 The changelog opens right in the app (Settings → version, and the "what's new" notice) instead of on GitHub.
- Part swap tiles: tidier sizes – ✕ / ✎ and the price box match the checkbox.

## 0.13.0
- New-job window: job details under the screenshot, parts on the right – one field per part type with autofill, "!" on parts not found in the database.
- One Edit window per job (✎ Edit): details, objectives, tasks and parts in the same layout – replaces the ✎ and 📸 Parts windows.
- Suggested swaps can be worked out again (↻ Refresh).
- Replacement coolers and fans are never weaker than the old part (air flow from the parts workbook).
- 2 OCR bugs fixed.
- Fixed: GPU pairs are only suggested with a motherboard that has room for both cards (added to the price when needed).

## 0.12.3
- Builds from nothing now include a drive, and "Install Parts with Lights: N coloured" suggests the RGB parts it needs.
- "Upgrade Graphics Card" + "Install dual graphics cards" suggests pairs of cards that can run together.
- Part swaps: new tile layout, and they can be edited (✎) instead of removed and added again.
- Capture buttons in the new-job window show their shortcuts (Alt+E / Alt+P).
- Builds from nothing are worked out much faster.
- 1 new story job added.

## 0.12.2
- "How to use it" updated: suggested swaps, 3DMark, overclock, tips, career unlocks and PC Bay builds.
- 1 OCR bug fixed.

## 0.12.1
- Fixed: a saved PC Bay build stopped the page from loading; the 📦 button only showed after re-entering the level; unlocks list called PC Bay "coming later".

## 0.12.0
- 📦 PC Bay builds (level 9+): capture the broken PC and your inventory, fix and upgrade it, see the expected sale price and profit.
- 3DMark helper: score tile (XMP off / on) and the cheapest part sets to reach the target – also for PCs built from nothing.
- Overclock helper: whether the objective can be reached, the clock and temperature to expect, and a PSU that can carry it.
- 💡 Tips on job cards – small reminders like thermal paste, XMP or the leak test.
- Career unlocks list by level; help for overclocking and custom water cooling waits until the game unlocks it.
- 1 new story job added.
- Fixed: water cooling suggested because of a favourite brand; "or better" cases not sold in the shop; virus hint on 3DMark jobs; overclocking read from tasks.

## 0.11.1
- Suggested swaps now appear right after a PC Stats capture in the new-job window.
- Re-capturing PC Stats from a job card adds to the parts read before instead of doubling them.
- "Diagnose and fix" + a favourite brand ("total Intel fanboy") suggests their part of that brand again.
- Skylake CPUs and Kaby Lake motherboards count as fitting each other (as in the game).
- 3 OCR bugs fixed.

## 0.11.0
- Suggested part swaps in the new-job and PC Stats windows, based on objectives, hints and the PC's parts – unlocked, fitting, cheapest first within budget, with the board / PSU they need.
- New Status row under T1–T3: 💰 budget, ⚡ power and ⚠️ fit as coloured tiles – details pop up on hover or keyboard focus.
- Slimmer top bar: live preview = change screen, ＋ next to Capture job = manual job, ⚙️ icon only.
- Missing-part reports also ask for the unlock level %.
- Fixed: parts named in the objectives didn't count as job requirements on saved jobs.

## 0.10.0
- Text reader updated to Tesseract.js 7 – screenshots are read about 20 % faster.
- New "How to use it" window – the ? button in the top bar.
- Compatibility check: part suggestions that fit the planned PC come first, the others show why they don't fit.
- Warning box under part swaps when planned parts don't fit together (socket, board size, GPU / PSU / cooler size, SLI / CrossFire, slots, radiators).
- Part swaps can be reordered (drag ⠿ or Alt + ↑ ↓) – higher in the list wins when parts clash; parts named in the objectives win over all.
- Power check: warns when the PSU is too weak for the planned CPU + GPU(s), also when overclocked.
- Part suggestions and swaps show more details: board sizes, GPU length, socket, RAM, cores, watts, SLI/CrossFire, lighting.
- 8 OCR bugs fixed.
- Uses less memory in long sessions.
- 1 new story job added.

## 0.9.1
- 4 OCR bugs fixed.
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
- 2 OCR bugs fixed.
- Fixed hidden objectives triggered by parts of words (e.g. “led” in “failed”).
- Improved "Customer suspects" – only the part the customer blames is listed.
- Keyboard movement inside a job card: ↑ ↓ lines, ← → items, Space / Enter to tick or press.
- Part suggestions show 5 at a time with a visible scrollbar and a “more” count, and open upwards near the bottom of the page.
- Note in the capture window: English game only, always double-check the results.

## 0.8.0
- Hidden objectives rebuilt from the community hint list.
- Remaining budget shown on each job, with a clear over-budget warning.
- Keyboard shortcuts (on by default, can be turned off in Settings).
- 1 OCR bug fixed.
- Urgent jobs get an estimated deadline.
- Part prices shown on swaps and flagged in suggestions when over budget.
- Improved "Customer suspects" detection.
- Cable colour and type detection combined into one hint.
- Choosing the part to replace copies it into "New part", ready to edit.

## 0.7.0
- Long emails can be read from several screenshots.
- PC Stats parts matched to the parts database, with per-category limits.
- 2 OCR bugs fixed.
- All parts shown by default, with a note about console editions.
- "Add part replacement" opens with "Other" selected and the name field focused.

## 0.6.1
- 1 OCR bug fixed.
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
