/* Parts database search, OCR name matching, DLC filter and the autocomplete dropdown.
   Data comes from data/parts-db.js (window.PARTS_DB / PARTS_DLC / PARTS_META). */

// ---- DLC / content packs the user owns ----
const DLCS = window.PARTS_DLC || [];
const DLC_LABEL = Object.fromEntries(DLCS.map(d => [d.key, d.label]));
let dlcOn = Object.assign(Object.fromEntries(DLCS.map(d => [d.key, d.on])), LS.get("pcbs.dlc", {}));
const dlcEnabled = k => !k || !!dlcOn[k];
function setDlc(k, v) { dlcOn[k] = v; LS.set("pcbs.dlc", dlcOn); buildIndex(); }
// game version the user plays (PC/Steam numbering); parts added later are hidden
const VERSIONS = window.PARTS_VERSIONS || [];
const verNum = v => { const [a, b] = String(v || "0").split("."); return (+a || 0) * 1000 + (+b || 0); };
const LATEST = VERSIONS.length ? VERSIONS[VERSIONS.length - 1].v : "";
let gameVersion = LS.get("pcbs.gameVersion", "") || LATEST;
if (!VERSIONS.some(v => v.v === gameVersion)) gameVersion = LATEST;
function setGameVersion(v) { gameVersion = v; LS.set("pcbs.gameVersion", v === LATEST ? "" : v); buildIndex(); }
const versionOk = v => !v || !gameVersion || verNum(v) <= verNum(gameVersion);
const dlcCount = k => Object.values(window.PARTS_DB || {}).reduce((n, rows) => n + rows.filter(r => r[4] === k).length, 0);

// parts the user typed that are not in the database
let partsHistory = LS.get("pcbs.partsHistory", []).map(p => typeof p === "string" ? { name: p, cat: categorize(p) } : p);

const normP = s => String(s).toLowerCase().replace(/[™®�]/g, "").replace(/\bgray\b/g, "grey").replace(/[-_/().,|+!:]/g, " ").replace(/\s+/g, " ").trim();
let INDEX = [];
function buildIndex() {
  INDEX = [];
  const db = window.PARTS_DB || {};
  for (const cat in db) for (const [name, lvl, price, spec, dlc, ver] of db[cat]) {
    if (!dlcEnabled(dlc) || !versionOk(ver)) continue;
    const n = normP(name); INDEX.push({ cat, name, lvl, price, spec, dlc, ver, n, c: n.replace(/ /g, ""), w: n.split(" ") });
  }
  const known = new Set(Object.values(db).flat().map(r => r[0].toLowerCase()));
  for (const h of partsHistory) if (!known.has(h.name.toLowerCase())) { const n = normP(h.name); INDEX.push({ cat: h.cat, name: h.name, hist: true, n, c: n.replace(/ /g, ""), w: n.split(" ") }); }
}
function searchParts(q, cat, limit = 14, brands = []) {
  const toks = normP(q).split(" ").filter(Boolean); if (!toks.length) return [];
  const anyCat = !cat || cat === "Other";
  return INDEX.filter(p => (anyCat || p.cat === cat) && toks.every(t => p.n.includes(t) || p.c.includes(t)))
    .map(p => ({ p, s: toks.reduce((s, t) => s + (p.w.includes(t) ? 4 : p.w.some(w => w.startsWith(t)) ? 2 : 1), 0) * 10 - p.n.length / 8 + (p.hist ? 6 : 0) - (p.dlc ? 3 : 0) + (brands.some(b => brandMatch(p, b)) ? 15 : 0) }))
    .sort((a, b) => b.s - a.s).slice(0, limit).map(x => x.p);
}
// best database match for an OCR'd name (used to clean up PC Stats parts)
function matchPart(name) {
  const t = normP(name).split(" ").filter(w => w.length > 1); if (t.length < 2) return null;
  let best = null, bs = 0;
  for (const p of INDEX) { if (p.hist) continue;
    const hit = t.filter(w => p.w.includes(w)).length; if (hit / t.length < .8) continue;
    const s = hit / t.length * .7 + hit / p.w.length * .3; if (s > bs) { bs = s; best = p; } }
  return best && best.w.length && t.filter(w => best.w.includes(w)).length / best.w.length >= .55 ? best : null;
}
// cables in the database that fit a customer request like "Braided Dark Grey" or "Plain Red"
function cablesFor(want) {
  const t = normP(want).split(" "), plain = t.includes("plain");
  const need = t.filter(w => w !== "plain" && w !== "sleeved");
  return INDEX.filter(p => p.cat === "Cables" && need.every(w => p.w.includes(w)) && (!plain || !/duo|patterned|striped|rainbow/.test(p.n)) && ['duo', 'patterned', 'striped', 'rainbow'].every(w => need.includes(w) || !p.w.includes(w))
    && (need.includes("dark") || !p.w.includes("dark")) && (need.includes("light") || !p.w.includes("light"))).map(p => p.name);
}
// which categories a brand makes (from parts the user has enabled), e.g. NZXT → Case, Motherboard, CPU Cooler…
const BRAND_SEARCH = { NVIDIA: ["geforce", "nvidia"], AMD: ["radeon", "ryzen", "amd"] };
const brandMatch = (p, brand) => (BRAND_SEARCH[brand] || [normP(brand)]).some(t => p.n.startsWith(t + " ") || (BRAND_SEARCH[brand] && p.w.includes(t)));
function brandCategories(brand) { return [...new Set(INDEX.filter(p => !p.hist && brandMatch(p, brand)).map(p => p.cat))]; }
function rememberPart(name, cat) {
  if (!name || Object.values(window.PARTS_DB || {}).some(rows => rows.some(r => r[0].toLowerCase() === name.toLowerCase()))) return;
  partsHistory = [{ name, cat }, ...partsHistory.filter(p => p.name.toLowerCase() !== name.toLowerCase())].slice(0, 400);
  LS.set("pcbs.partsHistory", partsHistory); buildIndex();
}

// ---- autocomplete dropdown (any input with data-ac) ----
let acEl = null, acInput = null, acItems = [], acSel = 0;
function acCat(inp) { if (inp.dataset.acCat) return inp.dataset.acCat; const f = inp.closest("[data-swapform]"); return f ? f.querySelector('[data-f="cat"]').value : ""; }
function acShow(inp) {
  acInput = inp; const q = inp.value.trim(), cat = acCat(inp);
  if (q.length < 2) { acEl.hidden = true; return; }
  const brands = (inp.closest("[data-brands]")?.dataset.brands || "").split("|").filter(Boolean);
  acItems = searchParts(q, cat, 14, brands); acSel = 0;
  const toks = normP(q).split(" ").filter(Boolean);
  const hl = s => { let h = esc(s); toks.forEach(t => { h = h.replace(new RegExp("(" + reEsc(t) + ")", "ig"), "\u0001$1\u0002"); }); return h.replace(/\u0001/g, "<mark>").replace(/\u0002/g, "</mark>"); };
  const info = p => p.hist ? "typed before" : [p.spec, p.lvl != null ? "Lv " + p.lvl : "", p.price != null ? "$" + p.price : ""].filter(Boolean).join(" · ");
  const leftAttr = inp.closest("[data-left]")?.dataset.left, left = leftAttr == null ? null : +leftAttr;
  const overB = p => left != null && p.price != null && p.price > left;
  acEl.innerHTML = acItems.map((p, i) => `<div data-i="${i}" class="${i ? "" : "sel"} ${overB(p) ? "overb" : ""}" ${overB(p) ? `title="$${p.price - left} over the remaining budget"` : ""}><span>${brands.some(b => brandMatch(p, b)) ? '<em class="fav" title="Customer\'s preferred brand">★</em> ' : ""}${hl(p.name)}${p.dlc ? ` <em class="dlc">${esc(DLC_LABEL[p.dlc] || p.dlc)}</em>` : ""}</span><small>${esc(info(p))}${!cat || cat === "Other" ? " · " + esc(p.cat) : ""}${overB(p) ? ` · <b class="overtag">over budget</b>` : ""}</small></div>`).join("")
    + `<div class="report" data-report>🚩 Can't find it? Report “${esc(q)}” as a missing part</div>`;
  const r = inp.getBoundingClientRect(); const w = Math.max(r.width, 380);
  Object.assign(acEl.style, { left: Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px", top: (r.bottom + 3) + "px", width: w + "px" });
  const host = inp.closest("dialog") || document.body; if (acEl.parentNode !== host) host.append(acEl);
  acEl.hidden = false;
}
function acPick(i) { const p = acItems[i]; if (!p || !acInput) return; acInput.value = p.name; const f = acInput.closest("[data-swapform]"); if (f && p.cat && CATS.includes(p.cat)) f.querySelector('[data-f="cat"]').value = p.cat; acEl.hidden = true; acInput.focus(); }
function initAutocomplete() {
  acEl = $("#ac");
  document.addEventListener("input", e => { if (e.target.matches("[data-ac]")) acShow(e.target); });
  document.addEventListener("focusin", e => { if (e.target.matches("[data-ac]") && !e.target.dataset.noAc && e.target.value.length >= 2) acShow(e.target); });
  document.addEventListener("keydown", e => {
    if (acEl.hidden || e.target !== acInput) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!acItems.length) return; acSel = (acSel + (e.key === "ArrowDown" ? 1 : -1) + acItems.length) % acItems.length; acEl.querySelectorAll("[data-i]").forEach((d, i) => { d.classList.toggle("sel", i === acSel); if (i === acSel) d.scrollIntoView({ block: "nearest" }); }); }
    else if ((e.key === "Enter" || e.key === "Tab") && acItems.length) { e.preventDefault(); e.stopPropagation(); acPick(acSel); }
    else if (e.key === "Escape") { acEl.hidden = true; }
  }, true);
  acEl.addEventListener("mousedown", e => {
    if (e.target.closest("[data-report]")) { e.preventDefault(); const q = acInput.value.trim(), cat = acCat(acInput); acEl.hidden = true; openReport({ name: q, cat }); return; }
    const d = e.target.closest("[data-i]"); if (d) { e.preventDefault(); acPick(+d.dataset.i); }
  });
  document.addEventListener("focusout", e => { if (e.target === acInput) setTimeout(() => { if (document.activeElement !== acInput) acEl.hidden = true; }, 120); });
  window.addEventListener("scroll", () => { if (!acEl.hidden) acEl.hidden = true; }, true);
}

// ---- PC Stats parts list: closest database match + category limits ----
// order in which the game lists parts in PC Stats, and how many of each a PC can have
const PC_ORDER = ["Case", "Motherboard", "CPU", "CPU Cooler", "PSU", "RAM", "GPU", "Storage", "Case Fan", "Water Cooling"];
const PC_MAX = { Case: 1, Motherboard: 1, CPU: 1, "CPU Cooler": 1, PSU: 1, RAM: 4, GPU: 2 };
let FULL = null; // every part, ignoring DLC/version filters – the customer's PC can contain anything
const trigrams = s => { const t = new Set(), x = "  " + s + " "; for (let i = 0; i < x.length - 2; i++) t.add(x.slice(i, i + 3)); return t; };
const dice = (a, b) => { let c = 0; for (const g of a) if (b.has(g)) c++; return 2 * c / (a.size + b.size); };
function fullIndex() {
  if (FULL) return FULL;
  FULL = [];
  for (const cat in window.PARTS_DB || {}) for (const [name] of window.PARTS_DB[cat]) { const n = normP(name); FULL.push({ cat, name, n, w: n.split(" "), tri: trigrams(n) }); }
  return FULL;
}
// remove prices and other screen text that is not part of the name ("$120", "Sell", "Used")
const cleanOcrPart = s => String(s).replace(/[$£€]\s?[\d,.]+/g, " ").replace(/\b(price|sell|used|new|installed|broken)\b:?/gi, " ").replace(/\s{2,}/g, " ").trim();
function bestPartMatch(raw, onlyCat, min = 0.5) {
  const s = normP(cleanOcrPart(raw)); const w = s.split(" ").filter(x => x.length > 1);
  if (s.replace(/ /g, "").length < 4 || !w.length) return null;
  const tri = trigrams(s); let best = null, bs = 0;
  for (const p of fullIndex()) {
    if (onlyCat && p.cat !== onlyCat) continue;
    const tok = w.filter(x => p.w.includes(x)).length / w.length;
    const sc = 0.6 * dice(tri, p.tri) + 0.4 * tok;
    if (sc > bs) { bs = sc; best = p; }
  }
  return bs >= min ? { name: best.name, cat: best.cat, score: bs } : null;
}
// one screenshot → list of {name, cat}: match each line, fill unknown categories from the list order,
// drop extras beyond the limits (a duplicate Case/CPU/PSU… is an OCR repeat, not a second part)
// join wrapped names ("ASUS ROG Strix RX" + "VEGA64 OC Edition") only when the database agrees
function joinPCStatsLines(lines) {
  const items = []; let cur = null;
  const sc = t => (bestPartMatch(t) || { score: 0 }).score;
  for (const l of lines) {
    if (!cur) { cur = l.text; continue; }
    if (l.branded) { items.push(cur); cur = l.text; continue; }
    const joined = cur + " " + l.text, sj = sc(joined), sCur = sc(cur), sLine = sc(l.text);
    if (sj >= sCur - 0.02 && sj >= sLine) cur = joined; else { items.push(cur); cur = l.text; }
  }
  if (cur) items.push(cur);
  return items.map(name => ({ name }));
}
function resolvePCStats(items) {
  if (typeof items === "string") items = joinPCStatsLines(componentLines(items));
  const out = [], count = {};
  let lastIdx = -1;
  for (const it of items) {
    const m = bestPartMatch(it.name);
    let cat = m ? m.cat : categorize(cleanOcrPart(it.name)), name = m ? m.name : cleanOcrPart(it.name);
    const full = c => PC_MAX[c] && (count[c] || 0) >= PC_MAX[c];
    if (!m && (cat === "Other" || full(cat))) {
      // not recognised: next category in the PC Stats order that still has room
      const cand = PC_ORDER.slice(Math.max(lastIdx, 0)).find(c => !full(c));
      if (cand) cat = cand;
      // category known from the position → a looser match inside that category is good enough
      const m2 = cand && bestPartMatch(it.name, cand, 0.35);
      if (m2) { name = m2.name; }
    }
    if (full(cat)) continue;
    if (m && PC_MAX[cat] === 1 && out.some(o => o.name === name)) continue;
    count[cat] = (count[cat] || 0) + 1; lastIdx = Math.max(lastIdx, PC_ORDER.indexOf(cat));
    out.push({ name, cat, sure: !!m });
  }
  return out;
}
// several screenshots → one list: for every category take the screenshot that shows most of them,
// so the same RAM stick seen on two screenshots is not counted twice
function mergePCStats(lists) {
  const res = [];
  for (const cat of [...PC_ORDER, ...new Set(lists.flat().map(p => p.cat).filter(c => !PC_ORDER.includes(c)))]) {
    let best = [];
    for (const l of lists) { const here = l.filter(p => p.cat === cat); if (here.length > best.length) best = here; }
    res.push(...best.slice(0, PC_MAX[cat] || 99));
  }
  return res;
}

// shop price of a part by its exact name (any DLC / version – it's for budget maths)
let PRICE = null;
function priceOf(name) {
  if (!PRICE) { PRICE = new Map(); for (const cat in window.PARTS_DB || {}) for (const r of window.PARTS_DB[cat]) if (r[2] != null) PRICE.set(r[0].toLowerCase(), r[2]); }
  return PRICE.get(String(name || "").trim().toLowerCase()) ?? null;
}
