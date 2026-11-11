/* 📖 Parts database window – every part of a category as a readable table, filtered by name.
   Data: window.PARTS_DB rows [name, lvl, price, spec, dlc, ver, pct, never-in-jobs, details, power, compat, bench, oc]
   (see tools/build_db.py). Water Cooling is split by its spec: Reservoir, Radiator, CPU Block, Pipe, Fitting, Coolant. */
const PDB_TABS = [
  { k: "Case", label: "Case" },
  { k: "Motherboard", label: "Motherboard" },
  { k: "CPU", label: "CPU" },
  { k: "CPU Cooler", label: "CPU Cooling" },
  { k: "RAM", label: "RAM" },
  { k: "GPU", label: "GPU" },
  { k: "PSU", label: "PSU" },
  { k: "Storage", label: "Storage" },
  { k: "Case Fan", label: "Case Fans" },
  { k: "Water Cooling", wc: /^reservoir/i, label: "Reservoir" },
  { k: "Water Cooling", wc: /^radiator/i, label: "Radiator" },
  { k: "Water Cooling", wc: /^cpu block/i, label: "CPU Block" },
  { k: "Water Cooling", wc: /^pipe/i, label: "Pipes" },
  { k: "Water Cooling", wc: /^fitting/i, label: "Connectors" },
  { k: "Water Cooling", wc: /^coolant/i, label: "Coolants" },
  { k: "Cables", label: "Cables" },
];
const pdb = { tab: 0, sort: null, desc: false, all: false, f: {} }; // all = "Show hidden details"; f = filter label → chosen value

// one row → a readable part object
function pdbPart(r) {
  const c = {};
  for (const kv of String(r[10] || "").split(";")) {
    const i = kv.indexOf("=");
    if (i > 0) c[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return {
    name: r[0],
    lvl: r[1],
    price: r[2],
    spec: r[3] || "",
    dlc: r[4] || "",
    ver: r[5] || "",
    pct: r[6],
    nj: r[7] === 1,
    det: r[8] || "",
    pw: String(r[9] || ""),
    c,
    bench: String(r[11] || "").split(","),
    oc: String(r[12] || "").split(","),
  };
}
const pdbNum = v => (v === "" || v == null || isNaN(+v) ? null : +v);
const pdbW = p => {
  const [a, b] = p.pw.split(">");
  return a ? (b ? `${a} W (OC ${b} W)` : `${a} W`) : "";
};
const pdbMm = v => (v ? `${v} mm` : "");
const pdbYes = v => (v === "1" ? "yes" : v === "0" ? "no" : "");
// long socket lists go on two lines
const pdbSocks = v => {
  const l = (v || "")
    .split("|")
    .filter(Boolean)
    .map(s => s.replace(/^LGA 1151 \((\w+) ?\w*\)$/, "LGA 1151 $1"));
  const n = l.length > 3 ? Math.ceil(l.length / 2) : l.length;
  return l.slice(0, n).join(", ") + (l.length > n ? ",\n" + l.slice(n).join(", ") : "");
};
// lights: "RGB" (any colour), a single colour ("Blue", "Purple/Blue", "Mixed") – read from the details text – or none
const pdbLights = p => (p.c.lt ? (p.det.match(/(?:^|· )([^·]*?) lighting(?: ·|$)/) || [])[1] || "RGB" : "");
const pdbGB = v => (!v ? "" : +v >= 1000 ? `${+v / 1000} TB` : `${v} GB`);
let PDB_RES = null; // reservoir number → name (for the case column)
function pdbReservoirs() {
  if (!PDB_RES) {
    PDB_RES = {};
    for (const r of (window.PARTS_DB || {})["Water Cooling"] || []) {
      const p = pdbPart(r);
      if (p.c.ri != null) PDB_RES[p.c.ri] = p.name;
    }
  }
  return PDB_RES;
}
// a case's reservoirs: "all 11", "none" or "6 – up to EKWB EK-XRES 140 Revo D5" (the lists go by reservoir height)
function pdbCaseRes(rs) {
  if (!rs) return "";
  if (rs === "-") return "none";
  const all = Object.keys(pdbReservoirs()).length,
    ids = rs.split(",");
  return ids.length >= all ? `all ${all}` : `${ids.length} of ${all}`;
}
// CPU: "Stock / Mid / Max" clock and voltage – mid = the multiplier below the midpoint of stock and the full potential
function pdbCpuClocks(p) {
  const d = ocOf(p.name);
  if (!d) return p.bench[4] ? `Stock: ${p.bench[4]} MHz` : "";
  const stock = `Stock: ${d.mhz} MHz @ ${d.v} V`;
  if (p.c.oc !== "1") return stock;
  const mid = ocSettings(p.name, Math.floor((d.mhz + ocReach(p.name)) / 200) * 100),
    max = ocSettings(p.name),
    line = (t, s) => `${t}: ${s.mhz} MHz${s.volt ? ` @ ${s.volt.toFixed(2)} V` : ""}`;
  return [stock, mid.mhz > d.mhz && mid.mhz < max.mhz && line("Mid", mid), line("Max", max)].filter(Boolean).join("\n");
}
// GPU: "Stock / Mid / Max" for the core (i = 0) or the memory clock (i = 3); max = the full overclock potential
function pdbGpuClocks(p, i) {
  const o = p.oc.map(Number),
    stock = o[i],
    max = o[i + 1];
  if (!stock) return "";
  const mid = Math.round((stock + max) / 2);
  return [`Stock: ${stock} MHz`, max > stock && `Mid: ${mid} MHz`, max > stock && `Max: ${max} MHz`].filter(Boolean).join("\n");
}
const pdbCasesFor = ri => {
  let n = 0;
  for (const r of (window.PARTS_DB || {}).Case || []) {
    const p = pdbPart(r);
    if (p.c.rs && p.c.rs !== "-" && p.c.rs.split(",").includes(ri)) n++;
  }
  return n;
};

// columns per tab: [label, value(part), sort: 1 = by the first number in the value, or a function giving the number]
const PDB_COLS = {
  Case: [
    ["Type", p => p.spec],
    ["Boards", p => (p.c.b || "").replace(/,/g, ", ")],
    ["PSU", p => [(p.c.p || "").replace(/,/g, "/"), p.c.pl && `≤ ${p.c.pl} mm`].filter(Boolean).join(" ")],
    ["Max GPU", p => pdbMm(p.c.g), 1],
    ["Max cooler", p => pdbMm(p.c.h), 1],
    [
      "Radiators",
      p =>
        [+p.c.r120 && `${p.c.r120}×120`, +p.c.r140 && `${p.c.r140}×140`].filter(Boolean).join(" / ") ||
        (p.c.r120 === "0" ? "none" : ""),
    ],
    [
      "Reservoirs",
      p => pdbCaseRes(p.c.rs),
      0,
      p => {
        const t = pdbCaseRes(p.c.rs),
          res = pdbReservoirs(),
          tip = (p.c.rs && p.c.rs !== "-" ? p.c.rs.split(",") : []).map(i => res[i]).filter(Boolean);
        return esc(t) + (tip.length ? ` <span class="pdbi" tabindex="0" title="${esc(tip.join("\n"))}">ⓘ</span>` : "");
      },
    ],
    ["Open bench", p => (p.c.open ? "yes" : "")],
  ],
  Motherboard: [
    ["Socket", p => p.c.s || ""],
    ["Size", p => BOARD_NAME_PDB[p.c.f] || p.c.f || ""],
    ["RAM slots", p => p.c.ram || "", 1],
    [
      "RAM speeds",
      p => {
        const s = p.bench.filter(Boolean);
        return s.length ? `${s[0].split("|")[0]}–${s[0].split("|").pop()} MHz` : "";
      },
    ],
    ["M.2", p => p.c.m2 || "", 1],
    ["SATA", p => p.c.sata || "", 1],
    [
      "Two GPUs",
      p =>
        [p.c.sli === "1" && "SLI", p.c.cf === "1" && "CrossFire"].filter(Boolean).join(" / ") +
        (p.c.ds ? ` (≤ ${p.c.ds}-slot)` : ""),
    ],
    ["Overclocking", p => pdbYes(p.c.oc)],
  ],
  CPU: [
    ["Socket", p => p.c.s || ""],
    ["Overclock", p => (p.c.oc === "1" ? "Yes" : "No")],
    ["Clock and voltage", pdbCpuClocks, 1],
    ["Throttles at", p => (p.oc[4] ? `${p.oc[4]} °C` : ""), 1],
    ["Power", p => pdbW(p), 1],
    ["RAM channels", p => p.bench[5] || "", 1],
    ["Default RAM", p => (p.bench[6] ? `${p.bench[6]} MHz` : ""), 1],
    ["Ranking", p => p.c.rk || "", 1],
  ],
  "CPU Cooler": [
    ["Type", p => (p.c.aio ? "Liquid (AIO)" : "Air")],
    ["Sockets", p => pdbSocks(p.c.ss)],
    ["Height", p => pdbMm(p.c.h), 1],
    ["Radiator", p => (p.c.r ? p.c.r.replace("x", " mm × ") : "")],
    ["Air flow", p => p.c.af || "", 1],
  ],
  RAM: [
    ["Type", p => p.spec],
    ["Size", p => pdbGB(p.c.gb), p => pdbNum(p.c.gb)],
    ["Speed", p => (p.c.mhz ? `${p.c.mhz} MHz` : ""), 1],
    ["Overclock", p => (p.oc[1] ? `from ${p.oc[1]} MHz @ ${p.oc[2]} V` : "")],
  ],
  GPU: [
    ["Chipset", p => p.c.c || ""],
    ["VRAM", p => p.spec.replace(/\s*water$/i, "")],
    ["Cooling", p => (/\bwater\b/i.test(p.spec) || p.name.includes("|") ? "💧 water" : "air")],
    ["Length", p => pdbMm(p.c.l), 1],
    ["Slots", p => p.c.sl || "", 1],
    ["Two GPUs", p => p.c.m || ""],
    ["Power", p => pdbW(p), 1],
    ["3DMark (1 / 2 cards)", p => (p.bench[0] ? `${p.bench[0]}${+p.bench[1] ? " / " + p.bench[1] : ""}` : ""), 1],
    ["Core clock", p => pdbGpuClocks(p, 0), 1],
    ["Memory clock", p => pdbGpuClocks(p, 3), 1],
    ["Throttles at", p => (p.oc[6] ? `${p.oc[6]} °C` : ""), 1],
    ["Ranking", p => p.c.rk || "", 1],
  ],
  PSU: [
    ["Power", p => pdbW(p), 1],
    ["Type", p => p.spec.replace(/^\d+W\s*/i, "").replace(/\s*(ATX|SFX)$/, "")],
    ["Format", p => p.c.f || ""],
    ["Length", p => pdbMm(p.c.l), 1],
  ],
  Storage: [
    ["Type", p => ({ 1: "HDD", 2: "SSD", 3: "M.2" })[p.c.k] || p.spec],
    ["Size", p => pdbGB(p.c.gb), p => pdbNum(p.c.gb)],
    ["Speed", p => (p.c.sp ? `${p.c.sp} MB/s` : ""), 1],
  ],
  "Case Fan": [
    ["Size", p => pdbMm(p.c.z), 1],
    ["Air flow", p => p.c.af || "", 1],
  ],
  Reservoir: [["Fits", p => (p.c.ri != null ? `${pdbCasesFor(p.c.ri)} cases` : ""), 1]],
  Radiator: [
    ["Size", p => (p.c.r ? p.c.r.replace("x", " mm × ") : "")],
    ["Air flow", p => p.c.af || "", 1],
  ],
  "CPU Block": [["Sockets", p => pdbSocks(p.c.ss)]],
};
const BOARD_NAME_PDB = { ITX: "Mini-ITX", mATX: "Micro-ATX", ATX: "ATX", EATX: "E-ATX", XL: "XL-ATX", EEB: "SSI-EEB" };
const pdbDlc = p => ((window.PARTS_DLC || []).find(d => d.key === p.dlc) || {}).label || p.dlc;
const PDB_START = [
  ["Part", p => p.name],
  [
    "Unlock",
    p => (p.lvl == null ? "" : `Lv ${p.lvl}${p.pct > 1 ? ` · ${p.pct}%` : ""}`),
    p => (p.lvl == null ? null : p.lvl + (p.pct || 0) / 1000),
  ],
  ["Price", p => (p.price == null ? "" : `$${p.price}`), 1],
];
const PDB_END = [
  ["Lights", pdbLights],
  // a small ✓ for a DLC part – hover shows the DLC's name
  ["DLC", p => (p.dlc ? "✓" : ""), 0, p => (p.dlc ? `<span title="${esc(pdbDlc(p))}">✓</span>` : "")],
  ["Game version", p => p.ver],
  ["Random jobs", p => (p.nj ? "never" : "")],
  [
    "Details",
    p =>
      p.det
        .split(" · ")
        .filter(x => !x.startsWith("fits the cases the shop lists"))
        .join(" · "),
  ],
];

// columns hidden until "Show hidden details" is on (by tab label)
const PDB_HIDE = {
  Case: ["Open bench", "Game version", "Random jobs", "Details"],
  Motherboard: ["Game version", "Details"],
  CPU: ["Ranking", "Game version", "Details"],
  "CPU Cooling": ["Game version", "Random jobs", "Details"],
  RAM: ["Game version", "Details"],
  GPU: ["Ranking", "Game version", "Random jobs", "Details"],
  PSU: ["Game version", "Details"],
  Storage: ["Game version", "Details"],
  "Case Fans": ["Game version", "Random jobs", "Details"],
  Reservoir: ["Game version", "Details"],
  Radiator: ["Game version", "Details"],
  "CPU Block": ["Game version", "Details"],
  Pipes: ["Game version"],
  Connectors: ["Game version", "Details"],
  Coolants: ["Game version"],
  Cables: ["Game version"],
};
// drop-down filters per tab: [label, values(part) → a string or a list, order?] – the options come from the data;
// order = a list of values to put first, or a compare function
const pdbBand = (n, w, unit) => (n ? `${Math.floor(n / w) * w}–${Math.floor(n / w) * w + w - 1} ${unit}` : "");
const pdbLightsF = ["Lights", p => pdbLights(p) || "None", (a, b) => pdbLightRank(a).localeCompare(pdbLightRank(b))];
const pdbLightRank = v => (v === "RGB" ? "0" : v === "None" ? "2" : "1" + v);
const pdbSocketList = p =>
  (p.c.ss || "")
    .split("|")
    .filter(Boolean)
    .map(s => pdbSocks(s));
const PDB_FILTERS = {
  Case: [
    ["Case type", p => p.spec.replace(/,.*$/, ""), ["Micro", "Cube", "Open Frame", "Mid Tower", "Full Tower", "Super Tower"]],
    [
      "Board size",
      p =>
        (p.c.b || "")
          .split(",")
          .filter(Boolean)
          .map(b => BOARD_NAME_PDB[b] || b),
      Object.values(BOARD_NAME_PDB),
    ],
    pdbLightsF,
  ],
  Motherboard: [
    ["Socket", p => p.c.s || ""],
    ["Size", p => BOARD_NAME_PDB[p.c.f] || p.c.f || "", Object.values(BOARD_NAME_PDB)],
    ["Multi GPU", p => [p.c.sli === "1" && "SLI", p.c.cf === "1" && "CrossFire"].filter(Boolean).concat([]) || [], null],
    ["Overclocking", p => (p.c.oc === "1" ? "Yes" : "No")],
    pdbLightsF,
  ],
  CPU: [
    ["Socket", p => p.c.s || ""],
    ["Overclock", p => (p.c.oc === "1" ? "Yes" : "No")],
  ],
  "CPU Cooling": [["Type", p => (p.c.aio ? "Liquid (AIO)" : "Air")], ["Socket", pdbSocketList], pdbLightsF],
  RAM: [
    [
      "Size",
      p => pdbGB(p.c.gb),
      (a, b) =>
        pdbNum(a.replace(/\D+/g, "")) * (/TB/.test(a) ? 1000 : 1) - pdbNum(b.replace(/\D+/g, "")) * (/TB/.test(b) ? 1000 : 1),
    ],
    ["Speed", p => pdbBand(+p.c.mhz, 500, "MHz")],
    pdbLightsF,
  ],
  GPU: [
    ["Chipset", p => p.c.c || ""],
    ["VRAM", p => p.spec.replace(/\s*water$/i, "").replace(/(\d)GB/, "$1 GB")],
    ["SLI / CrossFire", p => p.c.m || "None"],
    pdbLightsF,
  ],
  PSU: [
    ["Power", p => pdbBand(parseInt(p.pw), 250, "W")],
    ["Type", p => p.spec.replace(/^\d+W\s*/i, "").replace(/\s*(ATX|SFX)$/, "")],
    ["Format", p => p.c.f || ""],
  ],
  Storage: [["Type", p => ({ 1: "HDD", 2: "SSD", 3: "M.2" })[p.c.k] || p.spec], pdbLightsF],
  "Case Fans": [["Size", p => pdbMm(p.c.z)], pdbLightsF],
  Reservoir: [pdbLightsF],
  Radiator: [["Size", p => (p.c.r ? p.c.r.replace(/x.*/, " mm") : "")], pdbLightsF],
  "CPU Block": [["Socket", pdbSocketList], pdbLightsF],
};
const pdbList = v => (Array.isArray(v) ? v : [v]).filter(Boolean);
function pdbFilterOptions(defs, all) {
  return defs.map(([label, f, order]) => {
    const vals = [...new Set(all.flatMap(p => pdbList(f(p))))];
    const rank = v => (Array.isArray(order) ? order.indexOf(v) : -1);
    vals.sort(
      typeof order === "function"
        ? order
        : (a, b) => (rank(a) < 0 ? 99 : rank(a)) - (rank(b) < 0 ? 99 : rank(b)) || a.localeCompare(b, "en", { numeric: true })
    );
    return { label, vals };
  });
}

function pdbRows(t) {
  return ((window.PARTS_DB || {})[t.k] || []).map(pdbPart).filter(p => !t.wc || t.wc.test(p.spec));
}
function pdbCols(t, parts) {
  const cols = [...PDB_START, ...(PDB_COLS[t.wc ? t.label : t.k] || [["Type", p => p.spec]]), ...PDB_END],
    hide = pdb.all ? [] : PDB_HIDE[t.label] || [];
  return cols.filter((col, i) => i === 0 || (!hide.includes(col[0]) && parts.some(p => col[1](p) !== ""))); // no empty columns
}
function renderPartsDb() {
  const t = PDB_TABS[pdb.tab],
    all = pdbRows(t);
  // every typed word must start a word of the name ("1080 ti" → not "1080 Founders Edition")
  const q = $("#pdbFilter")
    .value.trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => new RegExp("(^|[^a-z0-9])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  $("#pdbTabs").innerHTML = PDB_TABS.map(
    (x, i) =>
      `<button class="pdbtab${i === pdb.tab ? " on" : ""}" data-pdbtab="${i}" aria-pressed="${i === pdb.tab}">${esc(x.label)}</button>`
  ).join("");
  const cols = pdbCols(t, all);
  const fdefs = PDB_FILTERS[t.label] || [],
    opts = pdbFilterOptions(fdefs, all);
  $("#pdbFilters").innerHTML = opts
    .map(
      ({ label, vals }) =>
        `<label class="pdbf">${esc(label)} <select data-pdbf="${esc(label)}"><option value="">All</option>${vals.map(v => `<option${pdb.f[label] === v ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`
    )
    .join("");
  let rows = all.filter(
    p => q.every(w => w.test(p.name)) && fdefs.every(([label, f]) => !pdb.f[label] || pdbList(f(p)).includes(pdb.f[label]))
  );
  if (pdb.sort != null && cols[pdb.sort]) {
    const [, f, numeric] = cols[pdb.sort],
      key = p => {
        if (typeof numeric === "function") return numeric(p) ?? -1;
        const v = f(p);
        if (!numeric) return String(v).toLowerCase();
        const m = String(v).match(/\d+(\.\d+)?/);
        return m ? +m[0] : -1;
      };
    rows = rows
      .map(p => [key(p), p])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) * (pdb.desc ? -1 : 1))
      .map(x => x[1]);
  }
  $("#pdbCount").textContent = `${rows.length} of ${all.length} parts`;
  $("#pdbNote").textContent =
    t.label === "Reservoir" || t.k === "Case"
      ? "Reservoirs: the cases the game's shop lists for each one. The game also checks 3D collision live, so a listed reservoir can still hit other parts in a listed case."
      : "";
  $("#pdbTable").innerHTML =
    `<thead><tr>${cols.map((c, i) => `<th data-pdbsort="${i}" class="${pdb.sort === i ? (pdb.desc ? "sd" : "sa") : ""}" title="Sort by ${esc(c[0])}">${esc(c[0])}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(p => `<tr>${cols.map((c, i) => `<td${i === 0 ? ' class="pdbname"' : c[0] === "Details" ? ' class="pdbdet"' : ""}>${c[3] ? c[3](p) : esc(String(c[1](p))).replace(/\n/g, "<br>")}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${cols.length}" class="hint">No part matches.</td></tr>`}</tbody>`;
}
function openPartsDb() {
  pdb.tab = 0;
  pdb.sort = null;
  pdb.desc = false;
  pdb.all = false; // "Show hidden details" starts off every time
  pdb.f = {};
  $("#pdbAll").checked = false;
  $("#pdbFilter").value = "";
  renderPartsDb();
  $("#dlgPartsDb").showModal();
  $("#pdbWrap").scrollTo(0, 0);
  $("#pdbFilter").focus();
}
$("#btnPartsDb").onclick = openPartsDb;
$("#pdbFilter").addEventListener("input", () => {
  renderPartsDb();
  $("#pdbWrap").scrollTo(0, 0);
});
$("#pdbTabs").addEventListener("click", e => {
  const b = e.target.closest("[data-pdbtab]");
  if (!b) return;
  pdb.tab = +b.dataset.pdbtab;
  pdb.f = {};
  pdb.sort = null;
  pdb.desc = false;
  renderPartsDb();
  $("#pdbWrap").scrollTo(0, 0);
});
$("#pdbTable").addEventListener("click", e => {
  const h = e.target.closest("[data-pdbsort]");
  if (!h) return;
  const i = +h.dataset.pdbsort;
  pdb.desc = pdb.sort === i ? !pdb.desc : false;
  pdb.sort = i;
  renderPartsDb();
});
$("#pdbFilters").addEventListener("change", e => {
  const s = e.target.closest("[data-pdbf]");
  if (!s) return;
  pdb.f[s.dataset.pdbf] = s.value;
  renderPartsDb();
  $("#pdbWrap").scrollTo(0, 0);
});
$("#pdbAll").addEventListener("change", e => {
  pdb.all = e.target.checked;
  renderPartsDb();
});
