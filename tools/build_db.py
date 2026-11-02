#!/usr/bin/env python3
"""Build data/parts-db.js from the CSV files in data/parts/ and data/dlc.csv.

Usage:  python tools/build_db.py          (from the repository root)

Each CSV in data/parts/ has the columns:
    name, level, level_pct, price, spec, dlc, version, jobs, details, power, source
  - name   : exact in-game part name (required)
  - level  : unlock level (number, may be empty)
  - level_pct: how far into that level the part unlocks, 0-100 (may be empty)
  - price  : shop price in $ (number, may be empty)
  - spec   : short info shown in suggestions (socket, VRAM, type...)
  - dlc    : key from data/dlc.csv, empty = base game
  - version: game update (PC/Steam numbering) that added the part, e.g. 1.13
  - jobs   : "no" = the game never puts this part in a random customer's PC
             ("Exclude From Random Jobs"); empty = it can appear
  - details: longer facts shown under the part in suggestions and on swaps
             (board sizes, GPU length, socket, RAM, cores, watts, SLI/CrossFire, lighting...)
  - power  : CPU / GPU "watts>max watts when overclocked", PSU "watts" (power check)
  - source : where the row came from (calculator, wiki, report #12, ...)

The output is a plain <script> file (not JSON) so the app also works when
index.html is opened straight from disk (file://), where fetch() is blocked.
"""
import csv, json, sys, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
PARTS_DIR = ROOT / "data" / "parts"
DLC_FILE = ROOT / "data" / "dlc.csv"
VERSIONS_FILE = ROOT / "data" / "versions.csv"
STORY_FILE = ROOT / "data" / "story-jobs.csv"
OUT = ROOT / "data" / "parts-db.js"

# file name -> category name used inside the app
CATEGORIES = {
    "cpu": "CPU", "cpu-cooler": "CPU Cooler", "motherboard": "Motherboard", "ram": "RAM",
    "gpu": "GPU", "storage": "Storage", "psu": "PSU", "case": "Case", "case-fan": "Case Fan",
    "cables": "Cables", "water-cooling": "Water Cooling",
}

def num(v):
    v = (v or "").strip()
    try:
        return int(float(v)) if v else None
    except ValueError:
        return None

def main():
    errors, warnings = [], []
    dlcs = []
    with open(DLC_FILE, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["key"].strip():
                dlcs.append({"key": r["key"].strip(), "label": r["label"].strip(), "group": (r.get("group") or "dlc").strip(),
                             "on": r.get("default_on", "0").strip() == "1", "note": (r.get("note") or "").strip()})
    versions = []
    with open(VERSIONS_FILE, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["version"].strip():
                versions.append({"v": r["version"].strip(), "label": r["label"].strip()})
    known_versions = {v["v"] for v in versions}
    dlc_keys = {d["key"] for d in dlcs}

    db, seen = {}, {}
    for f in sorted(PARTS_DIR.glob("*.csv")):
        cat = CATEGORIES.get(f.stem)
        if not cat:
            warnings.append(f"{f.name}: unknown file name, skipped (add it to CATEGORIES)")
            continue
        rows = []
        with open(f, newline="", encoding="utf-8") as fh:
            for i, r in enumerate(csv.DictReader(fh), start=2):
                name = (r.get("name") or "").strip()
                if not name:
                    continue
                dlc = (r.get("dlc") or "").strip()
                if dlc and dlc not in dlc_keys:
                    errors.append(f"{f.name}:{i} unknown dlc '{dlc}' (add it to data/dlc.csv)")
                key = (cat, name.lower())
                if key in seen:
                    warnings.append(f"{f.name}:{i} duplicate '{name}' (first seen line {seen[key]})")
                    continue
                seen[key] = i
                ver = ".".join((r.get("version") or "").strip().split(".")[:2])  # 1.10.5 -> 1.10
                if ver and ver not in known_versions:
                    errors.append(f"{f.name}:{i} unknown version '{ver}' (add it to data/versions.csv)")
                row = [name, num(r.get("level")), num(r.get("price")), (r.get("spec") or "").strip(), dlc, ver, num(r.get("level_pct"))]
                # optional extras, only written when there is something: [8] 1 = never in random jobs, [9] details
                nj, det, pw = 1 if (r.get("jobs") or "").strip().lower() == "no" else 0, (r.get("details") or "").strip(), (r.get("power") or "").strip()
                extra = [nj, det, pw]                       # [7] never in random jobs, [8] details, [9] power
                while extra and not extra[-1]:
                    extra.pop()
                row += extra
                rows.append(row)
        rows.sort(key=lambda x: (x[1] if x[1] is not None else 999, x[2] or 0, x[0]))
        db[cat] = rows

    for w in warnings:
        print("warning:", w)
    if errors:
        for e in errors:
            print("ERROR:", e)
        sys.exit(1)

    # story jobs (career story customers) – any of sender name, email or subject marks a job as a story job
    story = []
    if STORY_FILE.exists():
        with open(STORY_FILE, newline="", encoding="utf-8") as fh:
            for i, r in enumerate(csv.DictReader(fh), start=2):
                row = {k: (r.get(k) or "").strip() for k in ("sender_name", "email", "subject", "story", "note")}
                if not (row["sender_name"] or row["email"] or row["subject"]):
                    warnings.append(f"story-jobs.csv:{i} has no sender, email or subject – skipped")
                    continue
                story.append(row)

    meta = {"built": datetime.date.today().isoformat(), "counts": {k: len(v) for k, v in db.items()}}
    js = ("/* GENERATED by tools/build_db.py - do not edit by hand, edit data/parts/*.csv instead.\n"
          "   Row format: [name, unlock level, shop price $, spec, dlc key, game version, unlock level %] */\n"
          f"window.PARTS_META = {json.dumps(meta)};\n"
          f"window.PARTS_DLC = {json.dumps(dlcs, ensure_ascii=False)};\n"
          f"window.PARTS_VERSIONS = {json.dumps(versions, ensure_ascii=False)};\n"
          f"window.PARTS_DB = {json.dumps(db, ensure_ascii=False, separators=(',', ':'))};\n"
          f"window.STORY_JOBS = {json.dumps(story, ensure_ascii=False)};\n")
    OUT.write_text(js, encoding="utf-8")
    total = sum(meta["counts"].values())
    print(f"wrote {OUT.relative_to(ROOT)}: {total} parts", meta["counts"], f"+ {len(story)} story jobs")

if __name__ == "__main__":
    main()
