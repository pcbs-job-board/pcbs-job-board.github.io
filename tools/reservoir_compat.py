#!/usr/bin/env python3
"""Case ↔ reservoir fit from the Custom Water Cooling Shop's "Reservoir compatibility" page.

Source: data/reservoir-cases.csv  (case, compatible_reservoirs joined with "|", source)
        written down from the game, one case at a time. "NONE" = the game says
        "Custom water cooling not supported".

Writes into the "compat" column (tools/build_db.py reads it):
  water-cooling.csv  reservoirs   ri=<n>          index of the reservoir in RESERVOIRS below
  case.csv           cases        rs=<n>,<n>,…    the reservoirs that fit; rs=- : no custom water cooling at all
and adds the 3D collision note to every reservoir's details.

Variants (Mariusz, 2026-11-05): when a case has several colour versions, or a window / no-window version,
and only one of them is on the list, the others get the same list. A case that is on the list always
keeps its own row. Run after tools/import_xlsx.py (it calls this), then tools/build_db.py.
Usage:  python tools/reservoir_compat.py        (from the repository root; prints the cases with no data)
"""
import csv, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PARTS = ROOT / "data" / "parts"
SRC = ROOT / "data" / "reservoir-cases.csv"
NOTE = "fits the cases the shop lists – the game checks 3D collision live, so it can still hit other parts even in a listed case"

# words that only name a colour, a window / glass panel or an edition of the same case model
VARIANT_WORDS = r"window|tg|dark|light|clear|grill|glass lid|black|white|gray|grey|gunmetal|blackout|titanium|silver|red|blue|green|orange|gold|yellow|purple|pink|sakura|petrol|mystic|wh|limited|edition"
# names the word list can't reduce to their model
ALIAS = {
    "lian li o11d xl-s": "Lian Li O11D XL-X", "lian li o11d xl-w": "Lian Li O11D XL-X",
    "msi mpg sekira 500g": "MSI MPG SEKIRA 500P",
    "nzxt s340 elite hyper beast": "NZXT S340 Elite (Black)",
    "thermaltake core p5 green edition": "Thermaltake Core P5",
}

def model(name):
    k = re.sub(r"\s*\([^)]*\)", " ", name.lower())
    k = re.sub(r"&", " ", k)
    k = re.sub(rf"(\s+[-–]\s*|\s+)({VARIANT_WORDS})\b", " ", k)
    k = re.sub(rf"(\s+[-–]\s*|\s+)({VARIANT_WORDS})\b", " ", k)   # twice: "Black - Window"
    return re.sub(r"\s+", " ", k).strip(" -–")

def read(path):
    with open(path, newline="", encoding="utf-8") as fh:
        rd = csv.DictReader(fh); return rd.fieldnames, list(rd)

def write(path, fields, rows):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields); w.writeheader(); w.writerows(rows)

def set_kv(compat, key, val):
    parts = [x for x in (compat or "").split(";") if x and not x.startswith(key + "=")]
    if val is not None: parts.append(f"{key}={val}")
    return ";".join(parts)

def main(quiet=False):
    wf, wrows = read(PARTS / "water-cooling.csv")
    reservoirs = sorted(r["name"] for r in wrows if r["spec"].lower().startswith("reservoir"))
    idx = {n: str(i) for i, n in enumerate(reservoirs)}
    for r in wrows:
        if r["name"] in idx:
            r["compat"] = set_kv(r["compat"], "ri", idx[r["name"]])
            d = [x for x in (r["details"] or "").split(" · ") if x and not x.startswith("fits the cases the shop lists")]
            r["details"] = " · ".join(d + [NOTE])
    write(PARTS / "water-cooling.csv", wf, wrows)

    listed, problems = {}, []
    with open(SRC, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            names = [x.strip() for x in r["compatible_reservoirs"].split("|") if x.strip()]
            if names == ["NONE"]:
                listed[r["case"]] = "-"; continue
            bad = [x for x in names if x not in idx]
            if bad: problems.append(f"{r['case']}: unknown reservoir {bad}")
            listed[r["case"]] = ",".join(sorted((idx[x] for x in names if x in idx), key=int))

    cf, crows = read(PARTS / "case.csv")
    db = {r["name"] for r in crows}
    problems += [f"listed case not in case.csv: {n}" for n in listed if n not in db]
    bymodel = {}
    for n, v in listed.items(): bymodel.setdefault(model(n), set()).add(v)
    inferred, missing = 0, []
    for r in crows:
        n, val = r["name"], listed.get(r["name"])
        if val is None:
            base = ALIAS.get(n.lower())
            vals = {listed[base]} if base in listed else bymodel.get(model(n), set())
            if len(vals) == 1: val = next(iter(vals)); inferred += 1
            elif len(vals) > 1: problems.append(f"{n}: variants on the list disagree, left without data")
            elif "not in shop" not in r["spec"]: missing.append(n)
        r["compat"] = set_kv(r["compat"], "rs", val)
    write(PARTS / "case.csv", cf, crows)
    if not quiet or problems or missing:
        print(f"reservoirs: {len(reservoirs)} · cases from the list: {sum(1 for n in listed if n in db)} · from a variant: {inferred} · no data: {len(missing)}")
        for p in problems: print("  !", p)
        for m in missing: print("  missing:", m)
    return missing, problems

if __name__ == "__main__":
    main()
