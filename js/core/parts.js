/* Parts database search, OCR name matching, DLC filter and the autocomplete dropdown.
   Data comes from data/parts-db.js (window.PARTS_DB / PARTS_DLC / PARTS_META). */

// ---- DLC / content packs the user owns ----
const DLCS = window.PARTS_DLC || [];
const DLC_LABEL = Object.fromEntries(DLCS.map(d => [d.key, d.label]));
const dlcOn = Object.assign(Object.fromEntries(DLCS.map(d => [d.key, d.on])), LS.get("pcbs.dlc", {}));
const dlcEnabled = k => !k || !!dlcOn[k];
function setDlc(k, v) {
  dlcOn[k] = v;
  LS.set("pcbs.dlc", dlcOn);
  buildIndex();
}
// game version the user plays (PC/Steam numbering); parts added later are hidden
const VERSIONS = window.PARTS_VERSIONS || [];
const verNum = v => {
  const [a, b] = String(v || "0").split(".");
  return (+a || 0) * 1000 + (+b || 0);
};
const LATEST = VERSIONS.length ? VERSIONS[VERSIONS.length - 1].v : "";
let gameVersion = LS.get("pcbs.gameVersion", "") || LATEST;
if (!VERSIONS.some(v => v.v === gameVersion)) gameVersion = LATEST;
function setGameVersion(v) {
  gameVersion = v;
  LS.set("pcbs.gameVersion", v === LATEST ? "" : v);
  buildIndex();
}
const versionOk = v => !v || !gameVersion || verNum(v) <= verNum(gameVersion);
// the player's career progress: level + % through it (level null = not set → every part is shown)
let career = Object.assign({ level: null, pct: 0 }, LS.get("pcbs.career", {}));
function setCareer(level, pct) {
  const l = parseInt(level, 10),
    p = parseInt(pct, 10);
  career = {
    level: Number.isFinite(l) && l > 0 ? Math.min(99, l) : null,
    pct: Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : 0,
  };
  LS.set("pcbs.career", career);
}
// unlocked at the player's progress? Parts listed at 0–1 % unlock right at the level-up.
// Custom water cooling parts come from their own shop, unlocked at career level 16 (js/core/unlocks.js)
// watercooled GPUs (Custom Water Cooling Shop: "NVIDIA GeForce GTX 1080 | EKWB EK-FC Plexi") – still GPUs, but sold in the
// custom water cooling shop, so they unlock with it (level 16)
function isWaterGPU(p) {
  if (!p || p.cat !== "GPU") return false;
  const ix = p.spec != null ? p : ixByName(p.name);
  return /\bwater\b/i.test((ix && ix.spec) || "") || /\s\|\s/.test(p.name || ""); // " | EKWB …" – not EVGA's "K|NGP|N"
}
const WATER_GPU_TAG = "💧 Watercooled – Custom Water Cooling Shop";
const unlocked = p =>
  career.level == null ||
  (((p.cat !== "Water Cooling" && !isWaterGPU(p)) || typeof hasUnlock !== "function" || hasUnlock("customWC")) &&
    (p.lvl == null ||
      p.lvl < career.level ||
      (p.lvl === career.level && (p.pct == null || p.pct <= 1 ? 0 : p.pct) <= career.pct)));
const dlcCount = k => Object.values(window.PARTS_DB || {}).reduce((n, rows) => n + rows.filter(r => r[4] === k).length, 0);

// parts the user typed that are not in the database
let partsHistory = LS.get("pcbs.partsHistory", []).map(p => (typeof p === "string" ? { name: p, cat: categorize(p) } : p));

const normP = s =>
  String(s)
    .toLowerCase()
    .replace(/[™®�]/g, "")
    .replace(/\bgray\b/g, "grey")
    .replace(/([a-z])\|(?=[a-z])/g, "$1i") // "K|NGP|N" (EVGA's stylised KINGPIN) = "kingpin", as the reader sees it
    .replace(/[-_/().,|+!:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
let INDEX = [];
function buildIndex() {
  INDEX = [];
  const db = window.PARTS_DB || {};
  for (const cat in db)
    for (let [name, lvl, price, spec, dlc, ver, pct, , det] of db[cat]) {
      if (!dlcEnabled(dlc) || !versionOk(ver)) continue;
      if (cat === "GPU" && /\bwater\b/i.test(spec || "")) det = WATER_GPU_TAG + (det ? " · " + det : ""); // recognisable in every list
      const n = normP(name);
      INDEX.push({
        cat,
        name,
        lvl,
        pct,
        price,
        spec,
        det,
        dlc,
        ver,
        noShop: /not in shop/i.test(spec || ""),
        n,
        c: n.replace(/ /g, ""),
        w: n.split(" "),
      });
    }
  const known = new Set(
    Object.values(db)
      .flat()
      .map(r => r[0].toLowerCase())
  );
  for (const h of partsHistory)
    if (!known.has(h.name.toLowerCase())) {
      const n = normP(h.name);
      INDEX.push({ cat: h.cat, name: h.name, hist: true, n, c: n.replace(/ /g, ""), w: n.split(" ") });
    }
}
// name → part, the first one with that name (what INDEX.find(p => p.name === name) gives, without going through the
// whole list each time); made again whenever INDEX is rebuilt or grows
const firstBy = (list, key) => {
  const m = new Map();
  for (const p of list) {
    const k = key(p);
    if (!m.has(k)) m.set(k, p);
  }
  return m;
};
let ixNames = { list: null, len: 0, map: null };
function ixByName(name) {
  if (ixNames.list !== INDEX || ixNames.len !== INDEX.length)
    ixNames = { list: INDEX, len: INDEX.length, map: firstBy(INDEX, p => p.name) };
  return ixNames.map.get(name);
}
// buyable = only parts unlocked at the player's career progress (parts to buy for a swap);
// searchParts.hidden tells how many matches were left out because of that
// custom water cooling split by what the part is (0.14.0): Reservoir, Radiator, CPU Block (the data keeps "Water Cooling")
const WC_KINDS = [
  ["Reservoir", /^reservoir/i],
  ["Radiator", /^radiator/i],
  ["CPU Block", /^cpu block/i],
];
function wcKind(p) {
  const ix = p && (p.spec != null ? p : ixByName(p.name));
  if (!ix || ix.cat !== "Water Cooling") return null;
  const k = WC_KINDS.find(([, re]) => re.test(ix.spec || ""));
  return k ? k[0] : null;
}
// one order everywhere (job window fields + swap categories); "Other" = Any part (the swap form's default)
const PART_ORDER = [
  "Case",
  "Motherboard",
  "CPU",
  "CPU Cooler",
  "RAM",
  "GPU",
  "PSU",
  "Storage",
  "Case Fan",
  "WC:Reservoir",
  "WC:Radiator",
  "WC:CPU Block",
];
const SWAP_CATS = () => ["Other", ...PART_ORDER];
const CAT_LABEL = { "CPU Cooler": "CPU Cooling", "Case Fan": "Case Fans", Other: "Any" };
const catKey = p => {
    const k = wcKind(p);
    return k ? "WC:" + k : p.cat;
  },
  catLabel = k => CAT_LABEL[k] || String(k).replace(/^WC:/, ""),
  catData = k => (/^WC:/.test(k) ? "Water Cooling" : k);
// looks only – cables, and the pipes / fittings / coolants of a custom loop: never offered in the part lists
function cosmeticPart(p) {
  return p.cat === "Cables" || (p.cat === "Water Cooling" && /^(coolant|fitting|pipe)/i.test(p.spec || ""));
}
function searchParts(q, cat, limit = 14, brands = [], buyable = false) {
  const toks = normP(q).split(" ").filter(Boolean);
  searchParts.hidden = 0;
  if (!toks.length) return [];
  const anyCat = !cat || cat === "Other";
  const cats = cat && cat.includes("|") ? cat.split("|") : null; // "Case Fan|Cables|…" – several categories
  const wk = /^WC:/.test(cat || "") ? catLabel(cat) : null; // "WC:Radiator" – one kind of water cooling part
  const all = INDEX.filter(
    p =>
      !cosmeticPart(p) &&
      (anyCat || (wk ? wcKind(p) === wk : cats ? cats.includes(p.cat) : p.cat === cat)) &&
      toks.every(t => p.n.includes(t) || p.c.includes(t))
  );
  const ok = buyable ? all.filter(p => p.hist || unlocked(p)) : all;
  searchParts.hidden = all.length - ok.length;
  return ok
    .map(p => ({
      p,
      s:
        toks.reduce((s, t) => s + (p.w.includes(t) ? 4 : p.w.some(w => w.startsWith(t)) ? 2 : 1), 0) * 10 -
        p.n.length / 8 +
        (p.hist ? 6 : 0) -
        (p.dlc ? 3 : 0) +
        (brands.some(b => brandMatch(p, b)) ? 15 : 0),
    }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(x => x.p);
}
// cables: the colour words of a shop name, e.g. "Ribbon Plastic Striped White Yellow" → white, yellow (0.15.2)
const CABLE_COLOURS = [
  "dark grey",
  "light grey",
  "black",
  "blue",
  "cyan",
  "green",
  "grey",
  "lime",
  "orange",
  "pink",
  "purple",
  "red",
  "white",
  "yellow",
  "rainbow",
];
const CABLE_KINDS = ["duo", "patterned", "striped"];
function colourWords(t) {
  const out = [];
  let rest = " " + normP(t) + " ";
  for (const c of CABLE_COLOURS) // longest first ("light grey" before "grey"), each colour once
    if (rest.includes(" " + c + " ")) {
      out.push(c);
      rest = rest.replace(" " + c + " ", " ");
    }
  return out;
}
// a cable set's colours: the data's col= field (duo sets are black + the colour in their name), else the name's colours
function cableColours(p) {
  const col = (compatOf(p.name) || {}).col;
  return col ? col.split("|").map(normP) : colourWords(p.name);
}
// shop names before 0.15.2 (saved jobs may still have them)
const CABLE_RENAMED = {
  "ribbon plastic patterned lime black grey": "Ribbon Plastic Patterned Lime Black Light Grey",
  ...Object.fromEntries(
    ["Blue", "Cyan", "Green", "Light Grey", "Lime", "Orange", "Pink", "Purple", "Red", "White", "Yellow"].map(c => [
      "ribbon plastic duo black " + c.toLowerCase(),
      "Ribbon Plastic Duo " + c,
    ])
  ),
};
const renamedPart = name =>
  CABLE_RENAMED[
    String(name || "")
      .trim()
      .toLowerCase()
  ] || name;
// cables in the database that fit a customer request like "Braided Dark Grey", "Plain Red" or "Plastic White Yellow":
// the type words must be in the name and the set's colours must be EXACTLY the wished ones (Mariusz 2026-11-10) –
// 1 colour → sets in that one colour, 2 → 2-colour sets with those two, … (a duo set counts as black + its colour)
function cablesFor(want) {
  const t = normP(want).split(" "),
    plain = t.includes("plain"),
    cols = colourWords(want),
    kinds = t.filter(w => CABLE_KINDS.includes(w));
  const types = t.filter(
    w => w && !["plain", "sleeved", ...CABLE_KINDS].includes(w) && !cols.some(c => c.split(" ").includes(w))
  );
  const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  return INDEX.filter(p => {
    if (p.cat !== "Cables" || !types.every(w => p.w.includes(w)) || !kinds.every(w => p.w.includes(w))) return false;
    const fancy = CABLE_KINDS.some(w => p.w.includes(w));
    if (plain && fancy) return false;
    if (!cols.length) return !fancy || kinds.length > 0; // type only: plain sets, unless a pattern is named
    return same(cols, kinds.includes("duo") ? colourWords(p.name) : cableColours(p));
  })
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0) || (a.lvl ?? 0) - (b.lvl ?? 0))
    .map(p => p.name);
}
// the hidden task's examples for one wish: sets the player can buy first (cheapest), at most 2
function cableExamples(want) {
  const all = cablesFor(want).map(n => INDEX.find(p => p.cat === "Cables" && p.name === n));
  return [...all.filter(unlocked), ...all.filter(p => !unlocked(p))].slice(0, 2).map(p => p.name);
}
// which categories a brand makes (from parts the user has enabled), e.g. NZXT → Case, Motherboard, CPU Cooler…
const BRAND_SEARCH = { NVIDIA: ["geforce", "nvidia"], AMD: ["radeon", "ryzen", "amd"] };
const brandMatch = (p, brand) =>
  (BRAND_SEARCH[brand] || [normP(brand)]).some(t => p.n.startsWith(t + " ") || (BRAND_SEARCH[brand] && p.w.includes(t)));
function brandCategories(brand) {
  return [...new Set(INDEX.filter(p => !p.hist && brandMatch(p, brand)).map(p => p.cat))];
}
function rememberPart(name, cat) {
  if (!name || Object.values(window.PARTS_DB || {}).some(rows => rows.some(r => r[0].toLowerCase() === name.toLowerCase())))
    return;
  partsHistory = [{ name, cat }, ...partsHistory.filter(p => p.name.toLowerCase() !== name.toLowerCase())].slice(0, 400);
  LS.set("pcbs.partsHistory", partsHistory);
  buildIndex();
  VOCAB = null;
}

// ---- PC Stats parts list: closest database match + category limits ----
// order in which the game lists parts in PC Stats, and how many of each a PC can have
const PC_ORDER = ["Case", "Motherboard", "CPU", "CPU Cooler", "PSU", "RAM", "GPU", "Storage", "Case Fan", "Water Cooling"];
const PC_MAX = { Case: 1, Motherboard: 1, CPU: 1, "CPU Cooler": 1, PSU: 1, RAM: 4, GPU: 2 };
let FULL = null; // every part, ignoring DLC/version filters – the customer's PC can contain anything
const trigrams = s => {
  const t = new Set(),
    x = "  " + s + " ";
  for (let i = 0; i < x.length - 2; i++) t.add(x.slice(i, i + 3));
  return t;
};
const dice = (a, b) => {
  let c = 0;
  for (const g of a) if (b.has(g)) c++;
  return (2 * c) / (a.size + b.size);
};
// the same lookups on every part: lower-case name → the first part with it, and normalised name (n) → every part with it
let fullNames = { list: null, lower: null, byN: null };
function fullLookup() {
  const all = fullIndex();
  if (fullNames.list !== all) {
    const byN = new Map(),
      byLower = new Map();
    for (const p of all) {
      const k = p.name.toLowerCase();
      if (!byLower.has(k)) byLower.set(k, []);
      byLower.get(k).push(p);
      if (!byN.has(p.n)) byN.set(p.n, []);
      byN.get(p.n).push(p);
    }
    fullNames = { list: all, lower: byLower, byN };
  }
  return fullNames;
}
function fullIndex() {
  if (FULL) return FULL;
  FULL = [];
  for (const cat in window.PARTS_DB || {})
    for (const r of window.PARTS_DB[cat]) {
      const n = normP(r[0]);
      FULL.push({ cat, name: r[0], n, w: n.split(" "), tri: trigrams(n), noJobs: r[7] === 1 });
    }
  return FULL;
}
// remove prices and other screen text that is not part of the name ("$120", "Sell", "Used")
const cleanOcrPart = s =>
  String(s)
    .replace(/[$£€]\s?[\d,.]+/g, " ")
    .replace(/\b(price|sell|used|new|installed|broken)\b:?/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
const NO_JOBS_PENALTY = 0.05;
function bestPartMatch(raw, onlyCat, min = 0.5) {
  const s = normP(cleanOcrPart(raw));
  const w = s.split(" ").filter(x => x.length > 1);
  if (s.replace(/ /g, "").length < 4 || !w.length) return null;
  // read perfectly → that part ("GAMING X+ 6G" and "GAMING X 6G" only differ in the "+", so the letters decide first)
  const lc = cleanOcrPart(raw).toLowerCase().replace(/\s+/g, " ").trim(),
    inCat = p => !onlyCat || p.cat === onlyCat;
  const L = fullLookup(),
    exact = (L.lower.get(lc) || []).find(inCat) || (L.byN.get(s) || []).find(inCat);
  if (exact) return { name: exact.name, cat: exact.cat, score: 1, amb: false };
  // "I" read as 1 / l / | on its own in a model name ("X470-1 Gaming" = X470-I, not the X470-F): exact that way → it
  // …also glued onto the number when the hyphen was lost too ("Z3701 Gaming" = Z370-I)
  const alt = s.replace(/(^| )[1l|](?= |$)/g, "$1i").replace(/(\d)[1l](?= |$)/g, "$1 i");
  if (alt !== s) {
    const ex2 = (L.byN.get(alt) || []).find(inCat);
    if (ex2) return { name: ex2.name, cat: ex2.cat, score: 0.99, amb: false };
  }
  const tri = trigrams(s);
  let best = null,
    bs = 0,
    sec = null,
    ss = 0;
  for (const p of fullIndex()) {
    if (onlyCat && p.cat !== onlyCat) continue;
    const tok = w.filter(x => p.w.includes(x)).length / w.length;
    // parts the game never puts in a random customer's PC ("Exclude From Random Jobs") lose close calls –
    // an exact reading still finds them (story customers' PCs are set by hand)
    const sc = 0.6 * dice(tri, p.tri) + 0.4 * tok - (p.noJobs ? NO_JOBS_PENALTY : 0);
    if (sc > bs) {
      if (best && best.name !== p.name) {
        sec = best;
        ss = bs;
      }
      bs = sc;
      best = p;
    } else if (sc > ss && p.name !== best.name) {
      sec = p;
      ss = sc;
    }
  }
  if (bs < min) return null;
  // "amb": another part fits (almost) as well AND the reading has a misread model number that is one slip
  // away from both – "STE5F-PT" could be ST55F-PT or ST65F-PT. A model number that is just missing
  // ("GA-AX370-Gaming" without its "5") is not a reason: that part is still the best guess.
  let amb = false;
  if (sec && bs - ss < 0.02) {
    const v = partVocab(),
      onlyIn = (a, b) => a.w.filter(x => !b.w.includes(x));
    const da = onlyIn(best, sec),
      db = onlyIn(sec, best);
    const bad = w.filter(t => /\d/.test(t) && !v.has(t) && da.some(x => near1(t, x)) && db.some(x => near1(t, x)));
    // a look-alike letter decides it: "STS5F" is ST55F (S = 5), "STE5F" stays open (E is no digit look-alike)
    const fitsA = bad.some(t => da.some(x => shape(x) === shape(t))),
      fitsB = bad.some(t => db.some(x => shape(x) === shape(t)));
    if (fitsB && !fitsA) best = sec;
    else amb = bad.length > 0 && !fitsA;
  }
  // an incomplete reading (the 2nd line of the name lost, or a letter hidden by the mouse pointer): every word read
  // is in the best part's name but also in another part's – "MSI Radeon RX 580" could be GAMING 8G, GAMING X 8G, X+ 8G…
  if (!amb) {
    // only a tie counts: "GA-AX370-Gaming" is still "Gaming 5" (closer than "Gaming K7")
    const has = p => w.every(t => p.w.includes(t)),
      sc = p => 0.6 * dice(tri, p.tri);
    if (
      has(best) &&
      best.w.length > w.length &&
      fullIndex().some(
        p => p.cat === best.cat && p.name !== best.name && (!p.noJobs || best.noJobs) && has(p) && sc(best) - sc(p) < 0.005
      )
    )
      amb = true;
  }
  return { name: best.name, cat: best.cat, score: bs, amb };
}
// one screenshot → list of {name, cat}: match each line, fill unknown categories from the list order,
// drop extras beyond the limits (a duplicate Case/CPU/PSU… is an OCR repeat, not a second part)
// join wrapped names ("ASUS ROG Strix RX" + "VEGA64 OC Edition") only when the database agrees
let ALL_NAMES = null; // [name, normP(name)] of every part in the database
const allNames = () =>
  ALL_NAMES || (ALL_NAMES = Object.values(window.PARTS_DB || {}).flatMap(rows => rows.map(r => [r[0], normP(r[0])])));
// a run of words found as whole words in some part name ("rock 3" in "be quiet shadow rock 3")
const inSomeName = phrase => {
  const p = " " + normP(phrase) + " ";
  return p.trim().length > 0 && allNames().some(([, n]) => (" " + n + " ").includes(p));
};
function extendName(cur, line) {
  const base = normP(cur),
    w = normP(line).replace(/ /g, "");
  if (!base || w.length < 3) return null;
  let best = null,
    bd = Infinity,
    tie = false,
    head = Infinity;
  const dist = (a, b) => Math.min(editDist(a, b), editDist(shape(a), shape(b))); // B / 8, O / 0 read for each other
  for (const [name, n] of allNames()) {
    if (!n.startsWith(base + " ")) continue;
    const rest = n.slice(base.length + 1).replace(/ /g, ""),
      d = dist(rest, w);
    if (rest.length > w.length) head = Math.min(head, dist(rest.slice(0, w.length), w));
    if (d < bd) {
      bd = d;
      best = name;
      tie = false;
    } else if (d === bd) tie = true;
  }
  // two names fit equally well ("ASUS ROG Strix Z370-" + "Gaming" = Z370-E or Z370-I Gaming, the "I" lost) → don't guess
  // the line is the middle of a longer name ("GIGABYTE AORUS" / "GeForce GTX 1080 Xtreme" / "Edition 8G") rather than
  // a whole other one with slips (RTX 2080 XTREME 8G) → the next line still decides
  return best && !tie && head >= bd && bd <= Math.max(1, Math.floor(w.length / 4)) ? best : null;
}
function joinPCStatsLines(lines) {
  const items = [];
  let cur = null;
  const sc = t => (bestPartMatch(t) || { score: 0 }).score;
  for (const l of lines) {
    if (!cur) {
      if (!l.num) cur = l.text;
      continue;
    }
    if (l.branded) {
      items.push(cur);
      cur = l.text;
      continue;
    }
    if (/^\(/.test(l.text)) {
      cur += " " + l.text;
      continue;
    } // "(Silver) 16 GB 2800 MHz" continues the name above
    // a bare number ("1500" – the X cut off) only counts as the end of the name above when the database agrees
    if (l.num) {
      const mj = cur && bestPartMatch(cur + " " + l.text);
      if (
        mj &&
        normP(mj.name)
          .split(" ")
          .some(x => x.startsWith(l.text))
      )
        cur += " " + l.text;
      continue;
    }
    // a database name that is the name above + this line, the line read with a slip or two ("DFL Radeon R9 290" /
    // "GRBTOR" = …R9 290 GR8TOR – the name above alone already looks like the R9 290 GR8)
    const ext = extendName(cur, l.text);
    if (ext) {
      cur = ext;
      continue;
    }
    const joined = cur + " " + l.text,
      sj = sc(joined),
      sCur = sc(cur),
      sLine = sc(l.text);
    if (sj >= sCur - 0.02 && sj >= sLine) cur = joined;
    else {
      items.push(cur);
      cur = l.text;
    }
  }
  if (cur) items.push(cur);
  return items.map(name => ({ name }));
}
// The pictures next to each part in PC Stats are read as junk ("oF ae", "4, pov RA nwt mm) PTO").
// Every word is checked against the words used in real part names (one OCR slip allowed, e.g. "MS!"):
// junk at the start / end of a line is cut off, lines that are mostly junk are dropped.
let VOCAB = null,
  SHAPES = null;
// model numbers read with letters for look-alike digits: "STSSF" = "ST55F", "B5O" = "850"
const shape = w => w.replace(/[s]/g, "5").replace(/[o]/g, "0").replace(/[il]/g, "1").replace(/[b]/g, "8");
function partVocab() {
  if (VOCAB) return VOCAB;
  VOCAB = new Set();
  SHAPES = new Set();
  const names = [...Object.values(window.PARTS_DB || {}).flatMap(rows => rows.map(r => r[0])), ...partsHistory.map(p => p.name)];
  for (const name of names)
    for (const t of normP(name).split(" "))
      if (t.length >= 2) {
        VOCAB.add(t);
        if (t.length >= 4 && /\d/.test(t)) SHAPES.add(shape(t));
      }
  return VOCAB;
}
const near1 = (a, b) => {
  // edit distance ≤ 1
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0,
    j = 0,
    e = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++e > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return e + (a.length - i) + (b.length - j) <= 1;
};
function wordOk(tok) {
  const t = normP(tok).replace(/ /g, ""),
    v = partVocab();
  if (!t) return false;
  if (v.has(t)) return true;
  if (/\d/.test(t) && /[a-z0-9]{3,}/.test(t)) return true; // model numbers: 1500X, 2370-PRO, i7-8086K
  const parts = normP(tok).split(" ").filter(Boolean);
  if (parts.some(p => p.length >= 4 && SHAPES.has(shape(p))) && parts.every(p => v.has(p) || SHAPES.has(shape(p)))) return true; // "STSSF-PT" = ST55F-PT
  // one OCR slip: words of 4+ letters, or short ones with a symbol in them ("MS!" → MSI) – not "pto" → "pro"
  if (t.length >= 4 || (t.length === 3 && /[^a-z0-9]/.test(t))) for (const w of v) if (w.length >= 3 && near1(t, w)) return true;
  return false;
}
// sizes read with letters for digits: "SOOGB" → 500GB, "1TB", "I6 GB"
const fixSize = t =>
  /^[\dOoSsIl]{1,5}(gb|tb|mhz|mm|w)$/i.test(t) && /\d/.test(t.replace(/[Ss]/g, "5").replace(/[Oo]/g, "0"))
    ? t.replace(/^[\dOoSsIl]+/, m => m.replace(/[Oo]/g, "0").replace(/[Ss]/g, "5").replace(/[Il]/g, "1"))
    : t;
function denoisePartLines(lines) {
  const out = [];
  for (const l of lines) {
    // a size ("8 GB", "1 TB") is one word here, never a crumb – it tells the 4 GB and 8 GB versions apart
    // "II" (Delta II, Mk II…) is read as "||" / "ll" / "Il" – a real word of part names, also at the start of a line
    const toks = l.text
        .replace(/\b(\d{1,4})\s+(GB|TB|MB)\b/gi, "$1\u00a0$2")
        .split(/[ \t\r\n]+/)
        .filter(Boolean)
        .map(fixSize)
        .map(t => (/^[|Il]{2}$/.test(t) && partVocab().has("ii") ? "II" : t)),
      good = toks.map(t => /^\d{1,4}\u00a0(gb|tb|mb)$/i.test(t) || wordOk(t));
    // at the ends, 1–2 letter bits ("Se", "a") are picture crumbs even when they happen to be real words
    // …except model words that tell two parts apart ("Ti AMP Extreme" – the 2nd line of "ZOTAC GeForce GTX 1080 Ti AMP
    // Extreme"; without it the 1080 is a different card) when a real word follows
    const MODEL2 = /^(Ti|TI|XT|OC|GT|RX)$/;
    const edgeOk = i =>
      good[i] &&
      (toks[i] === "II" || (MODEL2.test(toks[i]) && good[i + 1]) || !/^[a-z]{1,2}$/i.test(toks[i].replace(/[^a-z0-9]/gi, "")));
    let a = 0,
      z = toks.length - 1;
    // a line that starts with a brand starts right there – short brand words ("be quiet!", "In Win", "WD") are no crumbs
    const brandStart = i => i === 0 && l.branded && good[0];
    while (a <= z && !edgeOk(a) && !brandStart(a)) a++;
    // …except a capital model letter / suffix right after a real word ("Phantom Gaming D", "RX580 8G OC") – it can decide
    // between two parts; a lone "I" / "l" is too often a bar of the picture
    const capEnd = i =>
      i > a &&
      good[i - 1] &&
      /^([A-HJ-KM-Z]|[A-Z]{2})$/.test(toks[i]) &&
      (toks[i].length === 1 || partVocab().has(toks[i].toLowerCase()));
    while (z >= a && !edgeOk(z) && !/^\(?[a-z]+\)$/i.test(toks[z]) && !/^logo\)?$/i.test(toks[z])) z--;
    if (z + 1 < toks.length && capEnd(z + 1) && !(z + 2 < toks.length && capEnd(z + 2))) z++;
    // …and a one-digit model number at the very end when a part name has it right after the word before
    // ("be quiet! Shadow Rock 3", "Dark Rock 4") – without it every Shadow Rock fits the same
    else if (z + 1 < toks.length && z >= a && /^\d$/.test(toks[z + 1]) && good[z] && inSomeName(toks[z] + " " + toks[z + 1])) {
      z++;
      good[z] = true;
    }
    if (a > z) continue;
    const keep = toks.slice(a, z + 1),
      kg = good.slice(a, z + 1),
      n = kg.filter(Boolean).length;
    if (n / keep.length < 0.6) continue;
    // a line of bare numbers ("109°)") is picture noise; a wrapped model number like "1500X" mixes letters and digits.
    // One 3–5 digit number may still be a wrapped model number with its last letter lost ("1500") – the joining decides
    if (!keep.some(t => /[a-z]{2,}/i.test(t) || (/\d/.test(t) && /[a-z]/i.test(t)))) {
      const num = l.text.match(/\b\d{3,5}\b/g) || [];
      if (num.length === 1) out.push({ ...l, text: num[0], num: true });
      continue;
    }
    out.push({ ...l, text: keep.join(" ").replace(/\u00a0/g, " ") });
  }
  return out;
}
// one word, a word that isn't part of any part name, or odd symbols ("1/-GUGBOK") → probably a cut-off / misread line
const weakPartLine = t => {
  const w = String(t).split(/\s+/).filter(Boolean);
  return w.length < 2 || w.some(x => /[^\w().+-]/.test(x) || !wordOk(x));
};
const specOnly = t => {
  const w = String(t)
    .replace(/[-–|]+\s*$/, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return w.length > 0 && w.every(x => /^[\d.,]+([gt]b|mhz|w)?$/i.test(x) || /^([gt]b|mhz|w)$/i.test(x));
};
function resolvePCStats(items) {
  if (typeof items === "string") items = joinPCStatsLines(denoisePartLines(componentLines(items)));
  const out = [],
    count = {};
  let lastIdx = -1;
  for (const it of items) {
    // only sizes / speeds left ("2400 MHz", "8 GB", "450") – the rest of a name cut off at the top of a scrolled list
    if (specOnly(it.name)) continue;
    let m = bestPartMatch(it.name);
    let loose = false;
    // a lone short word nothing matches ("S35", "ion") is a crumb of a picture or of a half-cut line
    if (!m && !/\s/.test(it.name.trim()) && it.name.replace(/[^a-z0-9]/gi, "").length < 6) continue;
    // two parts fit equally well → don't guess: keep what was read, marked for checking
    const amb = m && m.amb ? m : null;
    if (amb) m = null;
    // the top of a scrolled list is often a half-cut line ("supe", "Intel COFe 1/-GUGBOK", "ama Carbon"):
    // before the first recognised part, a weak unrecognised line is dropped instead of guessed
    if (!out.some(o => o.sure) && (m ? m.score < 0.8 && !/\s/.test(it.name.trim()) : weakPartLine(it.name))) continue;
    let cat = m ? m.cat : amb ? amb.cat : categorize(cleanOcrPart(it.name)),
      name = m ? m.name : cleanOcrPart(it.name);
    const full = c => PC_MAX[c] && (count[c] || 0) >= PC_MAX[c];
    if (!m && !amb && (cat === "Other" || full(cat))) {
      // not recognised: next category in the PC Stats order that still has room
      const cand = PC_ORDER.slice(Math.max(lastIdx, 0)).find(c => !full(c));
      if (cand) cat = cand;
      // category known from the position → a looser match inside that category is good enough
      const m2 = cand && bestPartMatch(it.name, cand, 0.35);
      if (m2) {
        name = m2.name;
        loose = true;
      }
    }
    if (full(cat)) continue;
    if (m && PC_MAX[cat] === 1 && out.some(o => o.name === name)) continue;
    count[cat] = (count[cat] || 0) + 1;
    lastIdx = Math.max(lastIdx, PC_ORDER.indexOf(cat));
    if (loose && !out.some(o => o.sure)) continue;
    out.push({ name, cat, sure: !!m });
  }
  return out;
}
// several screenshots → one list: for every category take the screenshot that shows most of them,
// so the same RAM stick seen on two screenshots is not counted twice
function mergePCStats(lists) {
  const res = [];
  for (const cat of [
    ...PC_ORDER,
    ...new Set(
      lists
        .flat()
        .map(p => p.cat)
        .filter(c => !PC_ORDER.includes(c))
    ),
  ]) {
    let best = [];
    for (const l of lists) {
      const here = l.filter(p => p.cat === cat);
      if (here.length > best.length) best = here;
    }
    res.push(...best.slice(0, PC_MAX[cat] || 99));
  }
  return res;
}

// shop price of a part by its exact name (any DLC / version – it's for budget maths)
let PRICE = null;
// longer facts for a part (board sizes, socket, RAM, watts, SLI/CrossFire, lighting…) – shown on swaps
let DETAILS = null;
function detailsOf(name) {
  if (!DETAILS) {
    DETAILS = new Map();
    for (const cat in window.PARTS_DB || {})
      for (const r of window.PARTS_DB[cat])
        DETAILS.set(
          r[0].toLowerCase(),
          (cat === "GPU" && /\bwater\b/i.test(r[3] || "") ? WATER_GPU_TAG + " · " : "") + (r[8] || r[3] || "")
        );
  }
  return (
    DETAILS.get(
      String(name || "")
        .trim()
        .toLowerCase()
    ) || ""
  );
}
// ---------- power check ----------
// watts for a part: CPU / GPU { w: stock, oc: overclocked to the max }, PSU { w } – from the parts database
// ("power" column), a PSU not in it by the watts in its name ("… 650W")
let POWER = null;
function powerOf(name) {
  if (!POWER) {
    POWER = new Map();
    for (const cat in window.PARTS_DB || {})
      for (const r of window.PARTS_DB[cat])
        if (r[9]) {
          const [w, oc] = String(r[9]).split(">").map(Number);
          POWER.set(r[0].toLowerCase(), { w, oc: oc || w });
        }
  }
  const key = String(name || "")
      .trim()
      .toLowerCase(),
    p = POWER.get(key);
  if (p) return p;
  const m = key.match(/(\d{3,4})\s?w\b/);
  return m ? { w: +m[1], oc: +m[1] } : null;
}
const POWER_OTHER = 50; // everything except CPU and GPUs (board, RAM, drives, fans, pump…) – rule of thumb 40–50 W
// the PC as it will be when the job is done: current parts with the planned swaps applied
function plannedBuild(j) {
  const b = (j.components || []).map(c => ({ cat: c.cat, name: c.name }));
  for (const s of j.swaps || []) {
    const i = s.old ? b.findIndex(c => !c.swapped && c.name.toLowerCase() === s.old.toLowerCase()) : -1;
    // category as chosen; left on "Other" → from the parts database, else the replaced part's
    const db = (fullLookup().lower.get(String(s.new).trim().toLowerCase()) || [])[0];
    const cat = s.cat && s.cat !== "Other" ? s.cat : db ? db.cat : i >= 0 ? b[i].cat : s.cat;
    if (i >= 0) b[i] = { cat, name: s.new, swapped: true };
    else b.push({ cat, name: s.new, swapped: true });
  }
  return b;
}
// planning a swap for a slot that already has a planned swap: the earlier swap drops out and the new one takes its
// place (it replaces what the earlier one replaced) – so the earlier part's price and watts no longer count.
// `add`: the new swaps ({cat, old, new}); returns the swaps of the plan and the ones that dropped out
const lowName = x =>
  String(x || "")
    .trim()
    .toLowerCase();
function replaceSwaps(swaps, add) {
  const keep = [...(swaps || [])],
    out = [],
    dropped = [];
  for (const a of add || []) {
    const o = lowName(a.old);
    let k = o ? keep.findIndex(s => lowName(s.new) === o) : -1; // old = a part an earlier swap puts in
    if (k < 0 && o) k = keep.findIndex(s => lowName(s.old) === o); // old = a customer's part an earlier swap replaces
    if (k < 0) {
      out.push(a);
      continue;
    }
    const [s] = keep.splice(k, 1);
    dropped.push(s);
    out.push({ ...a, old: s.old || "" });
  }
  return { swaps: [...keep, ...out], dropped };
}
// what the swaps that a new swap of `old` would take the place of cost (they are no longer bought)
const swapCost = s => (s.price ?? priceOf(s.new)) || 0;
const refundFor = (j, olds) =>
  replaceSwaps(
    j.swaps,
    olds.filter(Boolean).map(old => ({ old, new: "" }))
  ).dropped.reduce((t, s) => t + swapCost(s), 0);
// null when there is no PSU yet; otherwise what the CPU + GPU(s) + the rest need, stock and overclocked
function powerCheck(j) {
  const b = plannedBuild(j),
    psu = b.filter(c => c.cat === "PSU").pop();
  if (!psu) return null;
  const P = powerOf(psu.name),
    cpu = b.filter(c => c.cat === "CPU").pop(),
    gpus = b.filter(c => c.cat === "GPU");
  const parts = [cpu, ...gpus].filter(Boolean).map(c => ({ ...c, p: powerOf(c.name) }));
  const need = k => POWER_OTHER + parts.reduce((t, c) => t + (c.p ? c.p[k] : 0), 0);
  // overclocked watts count only when an OBJECTIVE asks for an overclock; "I'll overclock it later" in the email → ocLater
  const ocWanted = /\b(overclock\w*|oc)\b/i.test(jobObjectives(j).join(" ")),
    ocLater = !ocWanted && !!j.ocLater;
  return {
    psu: psu.name,
    psuW: P ? P.w : null,
    cpu,
    gpus,
    parts,
    stock: need("w"),
    oc: need("oc"),
    ocWanted,
    ocLater,
    unknown: parts.filter(c => !c.p).map(c => c.name),
  };
}
function priceOf(name) {
  if (!PRICE) {
    PRICE = new Map();
    for (const cat in window.PARTS_DB || {})
      for (const r of window.PARTS_DB[cat]) if (r[2] != null) PRICE.set(r[0].toLowerCase(), r[2]);
  }
  return (
    PRICE.get(
      String(renamedPart(name) || "")
        .trim()
        .toLowerCase()
    ) ?? null
  );
}
