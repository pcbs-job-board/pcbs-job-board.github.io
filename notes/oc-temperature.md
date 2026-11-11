# Overclock temperature research (level 3)

Moved from TODO.md 2026-11-11 – read only when working on overclock level 3 / cooler temperatures.

- Overclock "level 3" – the highest clock a given cooler allows – needs the game's temperature formula (not published).
  **Very low priority**: only if Mariusz happens to collect enough readings before 1.0 (~20–30, see the list of what
  each reading needs, sent 2026-11-04); otherwise drop it.
  Test sheet sent 2026-11-07 (PCBS-CPU-overclock-temperature-tests.xlsx, script: scratchpad octest/make.py): bench =
  Silent Base 600 (Orange) + 2 Pure Wings 2, ASUS TUF Z370-PRO GAMING (to buy), 2 × HyperX Predator 2933, GTX 1060 X 6G
  stock, ET650-G, VP4100. A: i3-8350K × 7 coolers (40–100 CFM) × ×40/1.20, ×45/1.40, ×50/1.55 = 21; B (optional, buy
  i5-8600K) × 3 coolers × ×43/1.30, ×48/1.50 = 6; C: i3 + Freezer 34 ×45/1.40 in Antec P8, Kolink Ethereal, FSP CMT510
  Plus, Silent Base without fans = 4; D: repeat coolers = 2. (i7-8700K is in the PC Bay build for sale; ATC700 169 mm
  fits no case; Freezer 33 TR has no LGA 1151.)
  RESULTS (2026-11-07, 33 readings, tests branch fixtures/pending/oc-temperature-tests-results.xlsx, fit:
  tools-oc-temperature-fit.py): OCCT max CPU temp = 0.8035 × stock W × (1 + 0.6354 × x) × (1 − 0.001203 × cooler CFM)
  × case factor; x = (f − stock f) / (OC base f − stock f). 3 parameters, 20 readings, max error 0.2 °C; predicts
  every throttled reading (>100 °C). Cooler: only airflow counts (same CFM → same temp, any size). Case factor vs
  Silent Base + 2 Pure Wings: no fans 1.017, FSP CMT510 Plus + 4 fans 1.009, Antec P8 + 3 Heat Away 1.039, Kolink
  Ethereal + 1 fan 1.058 (one reading each – not a rule yet). Only 2 CPUs (Intel, same OC base 5000); voltage and
  clock moved together, so which one drives it isn't settled (clock fits better: rms 0.09 vs 0.14 °C).
  Part 2 sheet sent 2026-11-07 (24 tests, octest/make2.py): E clock vs voltage (i3 + DELOS), I edge check of
  "highest multiplier" (i3 Engine 27 ×46/×47, DELOS ×48/×49), H case vs fans (no fans in Antec / Kolink / FSP; one
  Pure Wings at a time), F i5-9600K (OC base 5200 / 1.75), G Ryzen 5 2600 on GIGABYTE B450 AORUS M (65 W, 95 °C).
  Predictions for both ideas (clock / voltage) are in the sheet.
  GPU heat (Mariusz 2026-11-08, certain): the GPU's temperature affects the CPU's – at least when both are air cooled.
  Every reading so far had the same stock GTX 1060 GAMING X 6G, so its heat is hidden in the 0.8035 factor and the case
  factors – the formula only holds for that GPU. Needs readings with the same CPU + cooler + clock and only the GPU
  changed (e.g. GTX 1050 / 1060 / 1080 Ti, stock vs overclocked, air vs water-cooled GPU) before level 3 can be used
  on other PCs. Part 2 also keeps the 1060 – don't change it there.
