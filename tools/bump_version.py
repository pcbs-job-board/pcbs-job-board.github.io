#!/usr/bin/env python3
"""Set the app version everywhere it is written:  python tools/bump_version.py 0.9.1

- js/config.js       version: "…"   (shown in Settings, used by the update check)
- index.html         ?v=… on the local scripts and the stylesheet, so browsers load the new files
                     straight after a release instead of old cached copies
"""
import re, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
if len(sys.argv) != 2 or not re.fullmatch(r"\d+\.\d+\.\d+", sys.argv[1]):
    sys.exit(__doc__)
v = sys.argv[1]
cfg = ROOT / "js" / "config.js"
cfg.write_text(re.sub(r'version:\s*"[^"]*"', f'version: "{v}"', cfg.read_text(encoding="utf-8")), encoding="utf-8")
idx = ROOT / "index.html"
idx.write_text(re.sub(r'(\.(?:js|css))\?v=[\w.]+', rf"\1?v={v}", idx.read_text(encoding="utf-8")), encoding="utf-8")
print("version set to", v)
