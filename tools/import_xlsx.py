#!/usr/bin/env python3
"""Import the community workbook "PCBS1 Parts & Unlock Levels (Base Game Parts).xlsx"
into data/parts/*.csv, then run tools/build_db.py.

Usage:  python tools/import_xlsx.py path/to/workbook.xlsx [--keep-reports]

* The 4 Overclocked Edition cases get dlc = "overclocked", other "Is DLC" = Y cases get
  "promo_cases", parts flagged "HEM" get "hem". "Steam Version" goes to the version column.
* "Level" and "Level %" (how far into that career level the part unlocks) go to
  level / level_pct.
* Rows whose source starts with "report" (added from missing-part reports) are kept
  unless the workbook now contains the same name, so manual additions survive re-imports.

Needs: pip install openpyxl pandas
"""
import sys, csv, pathlib, subprocess
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent.parent
PARTS = ROOT / "data" / "parts"
FIELDS = ["name", "level", "level_pct", "price", "spec", "dlc", "version", "source"]

# paid DLC with its own parts (names checked against the store pages)
OVERCLOCKED = {"NZXT H700i - Extinction Wars", "NZXT H700i - Organ Collector", "NZXT H500 - Re-Animator", "NZXT H500 - Split"}

def s(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()

def sv(v):
    """Steam version cell: keep '1.0' / '1.15' as written (no int conversion)."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    return str(v).strip()

# sheet -> (csv file, spec builder)
SHEETS = {
    "CPUs": ("cpu", lambda r: " ".join(x for x in [s(r.get("Socket")), "OC" if s(r.get("Can Overclock")) == "Y" else ""] if x)),
    "GPUs": ("gpu", lambda r: f"{s(r.get('VRAM (GB)'))}GB" + (" water" if "Water" in s(r.get("Part Type")) else "") if s(r.get("VRAM (GB)")) else ""),
    "Motherboards": ("motherboard", lambda r: f"{s(r.get('CPU Socket'))} {s(r.get('Size'))}".strip()),
    "Memory": ("ram", lambda r: s(r.get("RAM Type"))),
    "Storage": ("storage", lambda r: s(r.get("Type"))),
    "Power Supplies": ("psu", lambda r: " ".join(x for x in [f"{s(r.get('Wattage'))}W" if s(r.get("Wattage")) else "", s(r.get("Type")), s(r.get("Size"))] if x)),
    "Cases": ("case", lambda r: s(r.get("Size"))),
    "CPU Coolers": ("cpu-cooler", lambda r: s(r.get("Type")) or s(r.get("Part Type")).replace("CPU Cooler - ", "")),
    "Case Fans": ("case-fan", lambda r: f"{s(r.get('Size'))}mm" if s(r.get("Size")) else ""),
    "Cables": ("cables", lambda r: " ".join(x for x in [s(r.get("Style")), s(r.get("Material")), s(r.get("Pattern"))] if x)),
    "WC CPU Blocks": ("water-cooling", lambda r: "CPU block"),
    "WC Radiators": ("water-cooling", lambda r: f"Radiator {s(r.get('Size'))}mm x{s(r.get('Slots'))}"),
    "WC Reservoirs": ("water-cooling", lambda r: "Reservoir"),
    "WC Pipes": ("water-cooling", lambda r: f"Pipe {s(r.get('Type'))}".strip()),
    "WC Pipe Connectors": ("water-cooling", lambda r: "Fitting"),
    "WC Coolants": ("water-cooling", lambda r: "Coolant"),
}

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    book = sys.argv[1]
    version = pd.read_excel(book, sheet_name="Notes", header=None).astype(str).to_string()
    ver = "v1.15.3" if "1.15.3" in version else "workbook"
    out = {}
    for sheet, (fn, spec) in SHEETS.items():
        df = pd.read_excel(book, sheet_name=sheet)
        for _, r in df.iterrows():
            r = r.to_dict()
            name = s(r.get("Full Part Name"))
            if not name:
                continue
            dlc = ""
            if s(r.get("HEM")) == "Y":
                dlc = "hem"
            elif name in OVERCLOCKED:
                dlc = "overclocked"
            elif s(r.get("Is DLC")) == "Y":
                dlc = "promo_cases"
            note = "" if s(r.get("In Shop")) == "Y" else "not in shop"
            sp = spec(r)
            out.setdefault(fn, []).append({
                "name": name, "level": s(r.get("Level")), "level_pct": s(r.get("Level %")), "price": s(r.get("Price")),
                "spec": ", ".join(x for x in [sp, note] if x), "dlc": dlc, "version": sv(r.get("Steam Version")), "source": f"xlsx {ver}",
            })
    for fn, rows in out.items():
        path = PARTS / f"{fn}.csv"
        names = {r["name"].lower() for r in rows}
        if path.exists():  # keep rows added from reports
            with open(path, newline="", encoding="utf-8") as fh:
                for r in csv.DictReader(fh):
                    if r.get("source", "").startswith("report") and r["name"].lower() not in names:
                        rows.append(r)
        with open(path, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=FIELDS)
            w.writeheader()
            w.writerows(rows)
        print(f"{path.relative_to(ROOT)}: {len(rows)} rows")
    subprocess.run([sys.executable, str(ROOT / "tools" / "build_db.py")], check=True)

if __name__ == "__main__":
    main()
