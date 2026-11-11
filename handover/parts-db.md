# Parts database

~3,000 parts in `data/parts/*.csv` → `data/parts-db.js` (`tools/build_db.py`). Compat fields: socket `s` (exact
text – "LGA 1151 (Skylake)" ≠ "(Coffee Lake)"), `sli`, `cf`, GPU chip `c`, length `l`, multi-GPU `m`, `oc` (CPU/GPU
stock clocks or overclockable board/CPU), `rk` ranking, `lvl` unlock level, radiator places `r120` / `r140` (also
the fan-place approximation). Watercooled GPUs have " | " in the name (EVGA "K|NGP|N" is not one).
Cables: colours must match the wish **exactly** (1–4 colours); "Duo <colour>" sets are black + that colour
(confirmed in game); the app uses the shop names for duo sets.
Missing parts / story jobs come from the reports sheet (`PCBS_reports_N.xlsx`, sent by Mariusz).
