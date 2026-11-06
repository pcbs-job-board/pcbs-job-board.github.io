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
const pdb = { tab: 0, sort: null, desc: false };

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
const pdbSocks = v =>
  (v || "")
    .split("|")
    .map(s => s.replace(/^LGA 1151 \((\w+) ?\w*\)$/, "LGA 1151 $1"))
    .join(", ");
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
  if (rs === "-") return "none – no custom water cooling";
  const all = Object.keys(pdbReservoirs()).length,
    ids = rs.split(",");
  return ids.length >= all ? `all ${all}` : `${ids.length} of ${all}`;
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
    ["Reservoirs", p => pdbCaseRes(p.c.rs)],
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
    ["Clock", p => (p.bench[4] ? `${p.bench[4]} MHz` : ""), 1],
    ["Power", p => pdbW(p), 1],
    ["Overclock", p => (p.c.oc === "1" ? (p.oc[0] ? `yes – from ${p.oc[0]} MHz @ ${p.oc[1]} V` : "yes") : pdbYes(p.c.oc))],
    ["Throttles at", p => (p.oc[4] ? `${p.oc[4]} °C` : ""), 1],
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
    ["Memory", p => p.spec.replace(/\s*water$/i, "")],
    ["Cooling", p => (/\bwater\b/i.test(p.spec) || p.name.includes("|") ? "💧 water" : "air")],
    ["Length", p => pdbMm(p.c.l), 1],
    ["Slots", p => p.c.sl || "", 1],
    ["Two GPUs", p => p.c.m || ""],
    ["Power", p => pdbW(p), 1],
    ["3DMark (1 / 2 cards)", p => (p.bench[0] ? `${p.bench[0]}${+p.bench[1] ? " / " + p.bench[1] : ""}` : ""), 1],
    ["Core clock", p => (p.oc[0] ? `${p.oc[0]}–${p.oc[2]} MHz` : "")],
    ["Memory clock", p => (p.oc[3] ? `${p.oc[3]}–${p.oc[5]} MHz` : "")],
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
  ["Lights", p => (p.c.lt ? "RGB" : "")],
  ["DLC", p => (p.dlc ? ((window.PARTS_DLC || []).find(d => d.key === p.dlc) || {}).label || p.dlc : "")],
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

function pdbRows(t) {
  return ((window.PARTS_DB || {})[t.k] || []).map(pdbPart).filter(p => !t.wc || t.wc.test(p.spec));
}
function pdbCols(t, parts) {
  const cols = [...PDB_START, ...(PDB_COLS[t.wc ? t.label : t.k] || [["Type", p => p.spec]]), ...PDB_END];
  return cols.filter((col, i) => i === 0 || parts.some(p => col[1](p) !== "")); // no empty columns
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
  let rows = all.filter(p => q.every(w => w.test(p.name)));
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
    <tbody>${rows.map(p => `<tr>${cols.map((c, i) => `<td${i === 0 ? ' class="pdbname"' : c[0] === "Details" ? ' class="pdbdet"' : ""}>${esc(String(c[1](p)))}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${cols.length}" class="hint">No part matches.</td></tr>`}</tbody>`;
}
function openPartsDb() {
  pdb.tab = 0;
  pdb.sort = null;
  pdb.desc = false;
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
