#!/usr/bin/env python3
"""Import the community workbook "PCBS1 Parts & Unlock Levels (Base Game Parts).xlsx"
into data/parts/*.csv, then run tools/build_db.py.

Usage:  python tools/import_xlsx.py path/to/workbook.xlsx [--keep-reports]

* The 4 Overclocked Edition cases get dlc = "overclocked", other "Is DLC" = Y cases get
  "promo_cases", parts flagged "HEM" get "hem". "Steam Version" goes to the version column.
* "Level" and "Level %" (how far into that career level the part unlocks) go to
  level / level_pct.
* "details": the facts shown under a part in the suggestions and on part swaps (DETAILS below):
  case board sizes / GPU length / fans, socket, RAM, cores, clock, watts, SLI/CrossFire, lighting.
* "power" (POWER below): CPU / GPU "watts>watts when overclocked to the max", PSU "watts" – for the power check.
* "bench" (BENCH below): 3DMark score inputs – CPU factors, GPU graphics scores, motherboard RAM speed steps.
* "oc" (OCF below): overclocking facts – CPU / GPU / RAM overclock base and maximum clocks.
* "compat" (COMPAT below): what other parts must fit – "key=value;…" (sizes, sockets, slots, lengths, SLI/CrossFire).
* Rows whose source starts with "report" (added from missing-part reports) are kept
  unless the workbook now contains the same name, so manual additions survive re-imports.

Needs: pip install openpyxl pandas
"""
import sys, csv, pathlib, subprocess
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent.parent
PARTS = ROOT / "data" / "parts"
FIELDS = ["name", "level", "level_pct", "price", "spec", "dlc", "version", "jobs", "details", "power", "compat", "bench", "oc", "source"]

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

# ---------- "details" column ----------
BOARD = [("Mini-ITX", "ITX"), ("Micro-ATX", "mATX"), ("S-ATX", "ATX"), ("E-ATX", "E-ATX"), ("XL-ATX", "XL-ATX"), ("SSI-EEB", "EEB")]
def light(r):
    l = s(r.get("Lighting"))
    return {"PurpleBlue": "Purple/Blue"}.get(l, l) + (" lighting" if l and l != "RGB" else "") if l else ""
def socket(x):  # "LGA 1151 (Coffee Lake)" → "LGA 1151 (Coffee Lake)"; kept as the game writes it
    return s(x)
def sockets(lst):  # cooler / water block list → families, short: "AM4 · LGA 1151, 1200, 2066 · TR4, sTRX4"
    have = [x.strip() for x in s(lst).split(",") if x.strip()]
    amd = sorted({x for x in have if x.startswith(("AM", "FM"))}, key=lambda x: (x[:2] != "AM", x))
    lga = []
    for x in have:
        if x.startswith("LGA"):
            n = x.split()[1].replace("-V3", "-3")
            if n not in lga: lga.append(n)
    tr = [x for x in have if x in ("TR4", "sTRX4")]
    parts = [" ".join(amd).replace("FM2 FM2+", "FM2/FM2+")] if amd else []
    if lga: parts.append("LGA " + ", ".join(sorted(lga, key=lambda n: int("".join(c for c in n if c.isdigit())[:4]))))
    if tr: parts.append(", ".join(tr))
    return " · ".join(parts)
def fans(r):  # fans that come with the case: "3× 120 mm + 1× 140 mm fans"
    out = {}
    for i in (1, 2, 3):
        n, m = s(r.get(f"Case Fan Type {i} Count")), s(r.get(f"Case Fan Type {i} Model"))
        if n and n != "0" and m:
            size = "140" if "140" in m else "200" if "200" in m else "120"
            out[size] = out.get(size, 0) + int(float(n))
    return " + ".join(f"{n}× {k} mm" for k, n in sorted(out.items())) + " fans" if out else "no fans"
def j(*xs): return " · ".join(x for x in xs if x)
DETAILS = {
    "Cases": lambda r: j("/".join(b for k, b in BOARD if s(r.get(k)) == "Y"), f"GPU ≤ {s(r.get('Max GPU length'))} mm" if s(r.get("Max GPU length")) else "",
                         fans(r), "radiators " + " / ".join(f"{s(r.get(f'Max {z}mm Radiators'))}×{z}" for z in (120, 140) if s(r.get(f"Max {z}mm Radiators")) not in ("", "0")) if any(s(r.get(f"Max {z}mm Radiators")) not in ("", "0") for z in (120, 140)) else "", light(r)),
    "Motherboards": lambda r: j(socket(r.get("CPU Socket")), dict(BOARD).get(s(r.get("Size")), s(r.get("Size"))), f"{s(r.get('RAM Type'))} {s(r.get('Default RAM Speed'))}" + (f"–{s(r.get('Max RAM Speed Step'))} MHz" if s(r.get("Max RAM Speed Step")) else " MHz"),
                                f"{s(r.get('RAM Slots'))} RAM slots" if s(r.get("RAM Slots")) else "", "/".join(x for x, k in (("SLI", "Support SLI"), ("CrossFire", "Support CrossFire")) if s(r.get(k)) == "Y"), light(r)),
    "CPUs": lambda r: j(socket(r.get("Socket")), f"{s(r.get('Cores'))} cores" if s(r.get("Cores")) else "", f"{float(s(r.get('Frequency'))) / 1000:g} GHz" if s(r.get("Frequency")) else "",
                        f"{s(r.get('Wattage'))} W" if s(r.get("Wattage")) else "", "unlocked (OC)" if s(r.get("Can Overclock")) == "Y" else ""),
    "CPU Coolers": lambda r: j(s(r.get("Type")) or s(r.get("Part Type")).replace("CPU Cooler - ", ""), sockets(r.get("CPU Socket List")), light(r)),
    "WC CPU Blocks": lambda r: j("water block", sockets(r.get("CPU Socket List")), light(r)),
    "Memory": lambda r: j(s(r.get("RAM Type")), f"{s(r.get('Size (GB)'))} GB" if s(r.get("Size (GB)")) else "", f"{s(r.get('Frequency'))} MHz" if s(r.get("Frequency")) else "", light(r)),
    "GPUs": lambda r: j(f"{s(r.get('VRAM (GB)'))} GB" if s(r.get("VRAM (GB)")) else "", f"{s(r.get('Length'))} mm" if s(r.get("Length")) else "", f"{s(r.get('Wattage'))} W" if s(r.get("Wattage")) else "",
                        s(r.get("Multi-GPU")), "water-cooled" if "Water" in s(r.get("Part Type")) else "", light(r)),
    "Power Supplies": lambda r: j(f"{s(r.get('Wattage'))} W" if s(r.get("Wattage")) else "", s(r.get("Type")), s(r.get("Size"))),
    "Case Fans": lambda r: j(f"{s(r.get('Size'))} mm" if s(r.get("Size")) else "", light(r)),
    "Storage": lambda r: j(s(r.get("Type")), light(r)),
    "WC Radiators": lambda r: j(light(r)), "WC Reservoirs": lambda r: j(light(r)), "WC Pipe Connectors": lambda r: j(light(r)),
}

# ---------- "power" column ----------
def num(v):
    try: return float(s(v))
    except ValueError: return None
def cpu_power(r):
    # power grows with voltage² × clock; the workbook gives stock voltage / clock and the overclocking
    # reference voltage / clock ("OC Base"), so max OC ≈ W × (V_oc / V)² × (f_oc / f). Locked CPUs can't be overclocked.
    w, v, f, vo, fo = (num(r.get(k)) for k in ("Wattage", "Voltage", "Frequency", "OC Base Voltage", "OC Base Freq"))
    if not w: return ""
    if s(r.get("Can Overclock")) != "Y" or not (v and f and vo and fo): return f"{w:g}"
    return f"{w:g}>{round(w * (vo / v) ** 2 * (fo / f))}"
def gpu_power(r):  # "GPU % Power Increase" = how far the power limit can be raised when overclocking
    w, pct = num(r.get("Wattage")), num(r.get("GPU % Power Increase"))
    return "" if not w else f"{w:g}>{round(w * (1 + (pct or 0) / 100))}"
POWER = {"CPUs": cpu_power, "GPUs": gpu_power, "Power Supplies": lambda r: s(r.get("Wattage"))}

# ---------- "compat" column (key=value;key=value) ----------
BCODE = {"Mini-ITX": "ITX", "Micro-ATX": "mATX", "S-ATX": "ATX", "E-ATX": "EATX", "XL-ATX": "XL", "SSI-EEB": "EEB"}
def kv(**d): return ";".join(f"{k}={v}" for k, v in d.items() if v not in ("", None))
def n(v):
    x = num(v); return "" if x is None else f"{x:g}"
def sock_list(v): return "|".join(x.strip() for x in s(v).split(",") if x.strip())
def rad(size, slots):  # 240 mm in 2 slots → "120x2"
    sz, sl = num(size), num(slots)
    return f"{int(sz / sl)}x{int(sl)}" if sz and sl else ""
def with_light(f):
    return lambda r: ";".join(x for x in (f(r), "lt=1" if s(r.get("Lighting")) else "") if x)
COMPAT = {
    "Cases": lambda r: kv(b=",".join(c for k, c in BCODE.items() if s(r.get(k)) == "Y"), p=",".join(x for x in ("ATX", "SFX") if s(r.get(f"PSU {x}")) == "Y"),
                          pl=n(r.get("Max PSU length")), g=n(r.get("Max GPU length")), h=n(r.get("Max CPU Fan Height")), r120=n(r.get("Max 120mm Radiators")), r140=n(r.get("Max 140mm Radiators")),
                          open="1" if s(r.get("Is Open Bench")) == "Y" else ""),
    "Motherboards": lambda r: kv(s=s(r.get("CPU Socket")), f=BCODE.get(s(r.get("Size")), s(r.get("Size"))), ram=n(r.get("RAM Slots")), m2=n(r.get("M.2 Slots")), sata=n(r.get("SATA Slots Usable")),
                                 sli="1" if s(r.get("Support SLI")) == "Y" else "", cf="1" if s(r.get("Support CrossFire")) == "Y" else "", ds=n(r.get("Dual GPU Max Slot Size")), oc="1" if s(r.get("Can Overclock")) == "Y" else "0"),
    "CPUs": lambda r: kv(s=s(r.get("Socket")), oc="1" if s(r.get("Can Overclock")) == "Y" else "0", rk=n(r.get("Part Ranking Score"))),
    "CPU Coolers": lambda r: kv(aio="1" if "Liquid" in s(r.get("Type")) else "", ss=sock_list(r.get("CPU Socket List")), h=n(r.get("Height")) if "Air" in s(r.get("Type")) else "", r=rad(r.get("Size"), r.get("Slots")) if "Liquid" in s(r.get("Type")) else ""),
    "WC CPU Blocks": lambda r: kv(ss=sock_list(r.get("CPU Socket List"))),
    "WC Radiators": lambda r: kv(r=rad(r.get("Size"), r.get("Slots"))),
    "GPUs": lambda r: kv(l=n(r.get("Length")), m=s(r.get("Multi-GPU")), c=s(r.get("Chipset")), sl=n(r.get("Slot Size")), rk=n(r.get("Part Ranking Score"))),
    "Power Supplies": lambda r: kv(f=s(r.get("Size")), l=n(r.get("Length"))),
    "Storage": lambda r: kv(t="m2" if s(r.get("Type")) == "M.2" else "sata", k={"HDD": "1", "SSD": "2", "M.2": "3"}.get(s(r.get("Type")), ""), gb=n(r.get("Size (GB)")), sp=n(r.get("Transfer Speed (MB/s)"))),
    "Memory": lambda r: kv(gb=n(r.get("Size (GB)")), mhz=n(r.get("Frequency"))),
    "Case Fans": lambda r: kv(z=n(r.get("Size"))),
}

COMPAT = {k: with_light(v) for k, v in COMPAT.items()}
for sh in ("WC Radiators", "WC Reservoirs", "WC Pipe Connectors"):
    COMPAT.setdefault(sh, with_light(lambda r: ""))

# ---- 3DMark score inputs (formula as in Jacob Klein's PCBS HTML Calculator) ----
# CPU "clock factor,channel factor,memory factor,adjustment,MHz,max RAM channels,default RAM MHz"
# GPU "graphics score with one card,with two cards"    motherboard "RAM speed steps" (MHz, "|" between)
def g(v):
    x = s(v)
    try: return repr(float(x)).rstrip("0").rstrip(".") if "." in x else x
    except ValueError: return x
BENCH = {
    "CPUs": lambda r: ",".join(g(r.get(k)) for k in ("CoreClockMultiplier", "MemChannelsMultiplier", "MemClockMultiplier", "FinalAdjustment", "Frequency", "Max Memory Channels", "Default Memory Speed")) if s(r.get("CoreClockMultiplier")) else "",
    "GPUs": lambda r: ",".join(g(r.get(k)) for k in ("Single GPU Graphics Score", "Double GPU Graphics Score")) if s(r.get("Single GPU Graphics Score")) else "",
    "Motherboards": lambda r: "|".join(x.strip() for x in s(r.get("RAM Speed Steps")).split(",") if x.strip()),
}

# ---- overclocking facts ----
# CPU "OC base MHz,OC base V,stock MHz,stock V,throttle °C" (only for CPUs that can overclock)
# GPU "base core,OC base core,max core,base mem,OC base mem,max mem" (MHz)   RAM "MHz,OC base MHz,OC base V"
OCF = {
    "CPUs": lambda r: ",".join(g(r.get(k)) for k in ("OC Base Freq", "OC Base Voltage", "Frequency", "Voltage", "Thermal Throttling")) if s(r.get("Can Overclock")) == "Y" and s(r.get("OC Base Freq")) else "",
    "GPUs": lambda r: ",".join(g(r.get(k)) for k in ("Base Core Freq", "OC Base Core Freq", "Max Core Freq", "Base Mem Freq", "OC Base Mem Freq", "Max Mem Freq")) if s(r.get("Max Core Freq")) else "",
    "Memory": lambda r: ",".join(g(r.get(k)) for k in ("Frequency", "OC Base Freq", "OC Base Voltage")) if s(r.get("OC Base Freq")) else "",
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
                "spec": ", ".join(x for x in [sp, note] if x), "dlc": dlc, "version": sv(r.get("Steam Version")), "jobs": "no" if s(r.get("Exclude From Random Jobs")) == "Y" else "", "details": DETAILS.get(sheet, lambda r: "")(r), "power": POWER.get(sheet, lambda r: "")(r), "compat": COMPAT.get(sheet, lambda r: "")(r), "bench": BENCH.get(sheet, lambda r: "")(r), "oc": OCF.get(sheet, lambda r: "")(r), "source": f"xlsx {ver}",
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
