# 3DMark, overclocking, PC Bay

- **3DMark** (`bench.js`): CPU score + GPU score combined; RAM channels / sticks / MHz and XMP matter; two GPUs pair
  (SLI / CrossFire) only when they're the **same GPU model** (any maker; GTX 1080 + 1080 Ti don't pair) on a board
  with SLI / CrossFire – the pair score averages the cards. PC Stats shows the game's "Benchmark: N": the app's score
  matched the game exactly on a checked PC, so it's used to correct misread names (Ti / non-Ti).
  **The game never gives a 3DMark objective that can't be reached at the job's level** – "nothing reaches it" is an app bug.
- **Overclock for 3DMark** (Mariusz, 0.15.2): the search tries overclocking only when an objective asks for an
  overclock, when no set reaches the score at stock, or when every stock set is over the budget – then cheaper sets at
  ~60 % of the overclock potential (50–75 % is safer); the full potential only when nothing else completes the objectives.
- **Overclocking** (`oc.js`): CPU multiplier on 100 MHz + voltage (0.05 V steps), GPU core / memory + power limit.
  Temperatures depend on cooler, case and GPU heat – no reliable formula (research: `notes/oc-temperature.md`), so
  the app doesn't promise "safe with this cooler"; the parts database plan uses "safe with any cooler, else the midpoint".
- **PC Bay** (`flip.js`, `flipui.js`): buy broken PCs, fix / upgrade, resell. A $0 resale part = broken. Resale value
  multiplier ×1 at 3DMark ≤ 1,000 rising to ×3 at 10,000 (no more above) – hence "gentlest overclock to just above
  10,000". Inventory capture reads the 3 columns, USED / BROKEN labels.
