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
// the player's career progress: level + % through it (level null = not set → every part is shown)
let career = Object.assign({ level: null, pct: 0 }, LS.get("pcbs.career", {}));
function setCareer(level, pct) {
  const l = parseInt(level, 10), p = parseInt(pct, 10);
  career = { level: Number.isFinite(l) && l > 0 ? Math.min(99, l) : null, pct: Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : 0 };
  LS.set("pcbs.career", career);
}
// unlocked at the player's progress? Parts listed at 0–1 % unlock right at the level-up.
// Custom water cooling parts come from their own shop, unlocked at career level 16 (js/unlocks.js)
// watercooled GPUs (Custom Water Cooling Shop: "NVIDIA GeForce GTX 1080 | EKWB EK-FC Plexi") – still GPUs, but sold in the
// custom water cooling shop, so they unlock with it (level 16)
function isWaterGPU(p) { if (!p || p.cat !== "GPU") return false; const ix = p.spec != null ? p : INDEX.find(x => x.name === p.name); return /\bwater\b/i.test((ix && ix.spec) || "") || /\|/.test(p.name || ""); }
const WATER_GPU_TAG = "💧 Watercooled – Custom Water Cooling Shop";
const unlocked = p => career.level == null || (((p.cat !== "Water Cooling" && !isWaterGPU(p)) || typeof hasUnlock !== "function" || hasUnlock("customWC")) && (p.lvl == null || p.lvl < career.level || (p.lvl === career.level && (p.pct == null || p.pct <= 1 ? 0 : p.pct) <= career.pct)));
const dlcCount = k => Object.values(window.PARTS_DB || {}).reduce((n, rows) => n + rows.filter(r => r[4] === k).length, 0);

// parts the user typed that are not in the database
let partsHistory = LS.get("pcbs.partsHistory", []).map(p => typeof p === "string" ? { name: p, cat: categorize(p) } : p);

const normP = s => String(s).toLowerCase().replace(/[™®�]/g, "").replace(/\bgray\b/g, "grey").replace(/[-_/().,|+!:]/g, " ").replace(/\s+/g, " ").trim();
let INDEX = [];
function buildIndex() {
  INDEX = [];
  const db = window.PARTS_DB || {};
  for (const cat in db) for (let [name, lvl, price, spec, dlc, ver, pct, , det] of db[cat]) {
    if (!dlcEnabled(dlc) || !versionOk(ver)) continue;
    if (cat === "GPU" && /\bwater\b/i.test(spec || "")) det = WATER_GPU_TAG + (det ? " · " + det : "");   // recognisable in every list
    const n = normP(name); INDEX.push({ cat, name, lvl, pct, price, spec, det, dlc, ver, noShop: /not in shop/i.test(spec || ""), n, c: n.replace(/ /g, ""), w: n.split(" ") });
  }
  const known = new Set(Object.values(db).flat().map(r => r[0].toLowerCase()));
  for (const h of partsHistory) if (!known.has(h.name.toLowerCase())) { const n = normP(h.name); INDEX.push({ cat: h.cat, name: h.name, hist: true, n, c: n.replace(/ /g, ""), w: n.split(" ") }); }
}
// buyable = only parts unlocked at the player's career progress (parts to buy for a swap);
// searchParts.hidden tells how many matches were left out because of that
// custom water cooling split by what the part is (0.14.0): Reservoir, Radiator, CPU Block (the data keeps "Water Cooling")
const WC_KINDS = [["Reservoir", /^reservoir/i], ["Radiator", /^radiator/i], ["CPU Block", /^cpu block/i]];
function wcKind(p) { const ix = p && (p.spec != null ? p : INDEX.find(x => x.name === p.name)); if (!ix || ix.cat !== "Water Cooling") return null; const k = WC_KINDS.find(([, re]) => re.test(ix.spec || "")); return k ? k[0] : null; }
// one order everywhere (job window fields + swap categories); "Other" = Any part (the swap form's default)
const PART_ORDER = ["Case", "Motherboard", "CPU", "CPU Cooler", "RAM", "GPU", "PSU", "Storage", "Case Fan", "WC:Reservoir", "WC:Radiator", "WC:CPU Block"];
const SWAP_CATS = () => ["Other", ...PART_ORDER];
const CAT_LABEL = { "CPU Cooler": "CPU Cooling", "Case Fan": "Case Fans", Other: "Any" };
const catKey = p => { const k = wcKind(p); return k ? "WC:" + k : p.cat; }, catLabel = k => CAT_LABEL[k] || String(k).replace(/^WC:/, ""), catData = k => /^WC:/.test(k) ? "Water Cooling" : k;
// looks only – cables, and the pipes / fittings / coolants of a custom loop: never offered in the part lists
function cosmeticPart(p) { return p.cat === "Cables" || (p.cat === "Water Cooling" && /^(coolant|fitting|pipe)/i.test(p.spec || "")); }
function searchParts(q, cat, limit = 14, brands = [], buyable = false) {
  const toks = normP(q).split(" ").filter(Boolean); searchParts.hidden = 0; if (!toks.length) return [];
  const anyCat = !cat || cat === "Other";
  const cats = cat && cat.includes("|") ? cat.split("|") : null;   // "Case Fan|Cables|…" – several categories
  const wk = /^WC:/.test(cat || "") ? catLabel(cat) : null;   // "WC:Radiator" – one kind of water cooling part
  const all = INDEX.filter(p => !cosmeticPart(p) && (anyCat || (wk ? wcKind(p) === wk : cats ? cats.includes(p.cat) : p.cat === cat)) && toks.every(t => p.n.includes(t) || p.c.includes(t)));
  const ok = buyable ? all.filter(p => p.hist || unlocked(p)) : all;
  searchParts.hidden = all.length - ok.length;
  return ok
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
  LS.set("pcbs.partsHistory", partsHistory); buildIndex(); VOCAB = null;
}

// ---- autocomplete dropdown (any input with data-ac) ----
let acEl = null, acInput = null, acItems = [], acSel = 0;
function acCat(inp) { if (inp.dataset.acCat) return inp.dataset.acCat; const f = inp.closest("[data-swapform]"); return f ? f.querySelector('[data-f="cat"]').value : ""; }
function acShow(inp) {
  acInput = inp; const q = inp.value.trim(), cat = acCat(inp);
  if (q.length < 2) { acEl.hidden = true; return; }
  const brands = (inp.closest("[data-brands]")?.dataset.brands || "").split("|").filter(Boolean);
  const buy = !!inp.closest("[data-swapform]"); // a part to buy → only what the player has unlocked
  acItems = searchParts(q, cat, buy ? 30 : 14, brands, buy); acSel = 0;
  // planning a swap: parts that fit the planned PC first, the others with a warning
  const form = inp.closest("[data-swapform]"), job = form && jobs.find(j => j.id === form.dataset.swapform);
  if (job && typeof compatRank === "function") { const o = form.querySelector('[data-f="old"]').value; acItems = compatRank(job, job.components[o]?.name || null, acItems).slice(0, 14); }
  const lockedN = searchParts.hidden;
  const toks = normP(q).split(" ").filter(Boolean);
  const hl = s => { let h = esc(s); toks.forEach(t => { h = h.replace(new RegExp("(" + reEsc(t) + ")", "ig"), "\u0001$1\u0002"); }); return h.replace(/\u0001/g, "<mark>").replace(/\u0002/g, "</mark>"); };
  const info = p => p.hist ? "typed before" : [p.det ? "" : p.spec, p.lvl != null ? "Lv " + p.lvl + (p.pct > 1 ? " · " + p.pct + "%" : "") : "", p.price != null ? "$" + p.price : ""].filter(Boolean).join(" · ");
  const leftAttr = inp.closest("[data-left]")?.dataset.left, left = leftAttr == null ? null : +leftAttr;
  const overB = p => left != null && p.price != null && p.price > left;
  acEl.innerHTML = `<div class="aclist">` + acItems.map((p, i) => `<div data-i="${i}" class="${i ? "" : "sel"} ${overB(p) ? "overb" : ""}" ${overB(p) ? `title="$${p.price - left} over the remaining budget"` : ""}><span>${brands.some(b => brandMatch(p, b)) ? '<em class="fav" title="Customer\'s preferred brand">★</em> ' : ""}${hl(p.name)}${p.dlc ? ` <em class="dlc">${esc(DLC_LABEL[p.dlc] || p.dlc)}</em>` : ""}${p.det ? `<i class="det">${esc(p.det)}</i>` : ""}${p.warn?.length ? `<i class="cwarn">⚠ ${esc(p.warn.join(" · "))}</i>` : ""}</span><small>${esc(info(p))}${!cat || cat === "Other" ? " · " + esc(p.cat) : ""}${overB(p) ? ` · <b class="overtag">over budget</b>` : ""}</small></div>`).join("") + `</div><div class="acmore" data-more hidden></div>`
    + (lockedN ? `<div class="aclocked">🔒 ${lockedN} more need a higher career level (Lv ${career.level}${career.pct ? " · " + career.pct + "%" : ""} – change it in Settings)</div>` : "")
    + `<div class="report" data-report>🚩 Can't find it? Report “${esc(q)}” as a missing part</div>`;
  const host = inp.closest("dialog") || document.body; if (acEl.parentNode !== host) host.append(acEl);
  acEl.hidden = false; acPlace();
}
// show 5 parts at a time (scroll for more) and open upwards when there is no room below
const AC_ROWS = 5;
function acPlace() {
  if (!acInput || acEl.hidden) return;
  const r = acInput.getBoundingClientRect(), w = Math.max(r.width, 380), list = acEl.querySelector(".aclist");
  Object.assign(acEl.style, { left: Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px", width: w + "px", top: "", bottom: "", maxHeight: "" });
  const rows = [...list.children].slice(0, AC_ROWS);
  list.style.maxHeight = rows.length ? rows.reduce((h, d) => h + d.offsetHeight, 0) + 1 + "px" : "";
  const h = acEl.offsetHeight, below = innerHeight - r.bottom - 8, above = r.top - 8;
  const up = h > below && above > below;
  if (up) acEl.style.bottom = (innerHeight - r.top + 3) + "px"; else acEl.style.top = (r.bottom + 3) + "px";
  const room = (up ? above : below) - 3;
  if (h > room) list.style.maxHeight = Math.max(40, room - (h - list.offsetHeight)) + "px"; // tiny window: shrink further
  acEl.classList.toggle("up", up);
  acMore();
}
// "▼ 9 more" line, so it is obvious at once that the list goes on
function acMore() {
  const list = acEl.querySelector(".aclist"), more = acEl.querySelector("[data-more]"); if (!list || !more) return;
  const rows = [...list.children], bottom = list.scrollTop + list.clientHeight;
  const below = rows.filter(d => d.offsetTop + d.offsetHeight / 2 > bottom).length;
  list.classList.toggle("scrolls", list.scrollHeight > list.clientHeight + 1);
  more.hidden = !below; more.textContent = `▼ ${below} more – scroll or use ↓`;
}
function acPick(i) { const p = acItems[i]; if (!p || !acInput) return; acInput.value = p.name; const f = acInput.closest("[data-swapform]"); if (f && p.cat && CATS.includes(p.cat)) f.querySelector('[data-f="cat"]').value = catKey(p); acEl.hidden = true; acInput.focus(); acInput.dispatchEvent(new Event("change", { bubbles: true })); }
function initAutocomplete() {
  acEl = $("#ac");
  document.addEventListener("input", e => { if (e.target.matches("[data-ac]")) acShow(e.target); });
  document.addEventListener("focusin", e => { if (e.target.matches("[data-ac]") && !e.target.dataset.noAc && e.target.value.length >= 2) acShow(e.target); });
  document.addEventListener("keydown", e => {
    if (acEl.hidden || e.target !== acInput) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!acItems.length) return; acSel = (acSel + (e.key === "ArrowDown" ? 1 : -1) + acItems.length) % acItems.length; acEl.querySelectorAll("[data-i]").forEach((d, i) => { d.classList.toggle("sel", i === acSel); if (i === acSel) { const L = d.parentNode; if (d.offsetTop < L.scrollTop) L.scrollTop = d.offsetTop; else if (d.offsetTop + d.offsetHeight > L.scrollTop + L.clientHeight) L.scrollTop = d.offsetTop + d.offsetHeight - L.clientHeight; } acMore(); }); }
    else if ((e.key === "Enter" || e.key === "Tab") && acItems.length) { e.preventDefault(); e.stopPropagation(); acPick(acSel); }
    else if (e.key === "Escape") { acEl.hidden = true; }
  }, true);
  acEl.addEventListener("scroll", acMore, true);
  acEl.addEventListener("mousedown", e => {
    if (e.target.closest("[data-more]")) { e.preventDefault(); const L = acEl.querySelector(".aclist"); L.scrollBy({ top: L.clientHeight - 20, behavior: "smooth" }); return; }
    if (e.target.closest("[data-report]")) { e.preventDefault(); const q = acInput.value.trim(), cat = acCat(acInput); acEl.hidden = true; openReport({ name: q, cat }); return; }
    const d = e.target.closest("[data-i]"); if (d) { e.preventDefault(); acPick(+d.dataset.i); }
  });
  document.addEventListener("focusout", e => { if (e.target === acInput) setTimeout(() => { if (document.activeElement !== acInput) acEl.hidden = true; }, 120); });
  // scrolling the page closes it; scrolling the list itself does not
  window.addEventListener("scroll", e => { if (!acEl.hidden && !acEl.contains(e.target)) acEl.hidden = true; }, true);
  window.addEventListener("resize", acPlace);
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
  for (const cat in window.PARTS_DB || {}) for (const r of window.PARTS_DB[cat]) { const n = normP(r[0]); FULL.push({ cat, name: r[0], n, w: n.split(" "), tri: trigrams(n), noJobs: r[7] === 1 }); }
  return FULL;
}
// remove prices and other screen text that is not part of the name ("$120", "Sell", "Used")
const cleanOcrPart = s => String(s).replace(/[$£€]\s?[\d,.]+/g, " ").replace(/\b(price|sell|used|new|installed|broken)\b:?/gi, " ").replace(/\s{2,}/g, " ").trim();
const NO_JOBS_PENALTY = 0.05;
function bestPartMatch(raw, onlyCat, min = 0.5) {
  const s = normP(cleanOcrPart(raw)); const w = s.split(" ").filter(x => x.length > 1);
  if (s.replace(/ /g, "").length < 4 || !w.length) return null;
  // read perfectly → that part ("GAMING X+ 6G" and "GAMING X 6G" only differ in the "+", so the letters decide first)
  const lc = cleanOcrPart(raw).toLowerCase().replace(/\s+/g, " ").trim(), inCat = p => !onlyCat || p.cat === onlyCat;
  const exact = fullIndex().find(p => inCat(p) && p.name.toLowerCase() === lc) || fullIndex().find(p => inCat(p) && p.n === s);
  if (exact) return { name: exact.name, cat: exact.cat, score: 1, amb: false };
  const tri = trigrams(s); let best = null, bs = 0, sec = null, ss = 0;
  for (const p of fullIndex()) {
    if (onlyCat && p.cat !== onlyCat) continue;
    const tok = w.filter(x => p.w.includes(x)).length / w.length;
    // parts the game never puts in a random customer's PC ("Exclude From Random Jobs") lose close calls –
    // an exact reading still finds them (story customers' PCs are set by hand)
    const sc = 0.6 * dice(tri, p.tri) + 0.4 * tok - (p.noJobs ? NO_JOBS_PENALTY : 0);
    if (sc > bs) { if (best && best.name !== p.name) { sec = best; ss = bs; } bs = sc; best = p; }
    else if (sc > ss && p.name !== best.name) { sec = p; ss = sc; }
  }
  if (bs < min) return null;
  // "amb": another part fits (almost) as well AND the reading has a misread model number that is one slip
  // away from both – "STE5F-PT" could be ST55F-PT or ST65F-PT. A model number that is just missing
  // ("GA-AX370-Gaming" without its "5") is not a reason: that part is still the best guess.
  let amb = false;
  if (sec && bs - ss < 0.02) {
    const v = partVocab(), onlyIn = (a, b) => a.w.filter(x => !b.w.includes(x));
    const da = onlyIn(best, sec), db = onlyIn(sec, best);
    const bad = w.filter(t => /\d/.test(t) && !v.has(t) && da.some(x => near1(t, x)) && db.some(x => near1(t, x)));
    // a look-alike letter decides it: "STS5F" is ST55F (S = 5), "STE5F" stays open (E is no digit look-alike)
    const fitsA = bad.some(t => da.some(x => shape(x) === shape(t))), fitsB = bad.some(t => db.some(x => shape(x) === shape(t)));
    if (fitsB && !fitsA) best = sec; else amb = bad.length > 0 && !fitsA;
  }
  // an incomplete reading (the 2nd line of the name lost, or a letter hidden by the mouse pointer): every word read
  // is in the best part's name but also in another part's – "MSI Radeon RX 580" could be GAMING 8G, GAMING X 8G, X+ 8G…
  if (!amb) {
    // only a tie counts: "GA-AX370-Gaming" is still "Gaming 5" (closer than "Gaming K7")
    const has = p => w.every(t => p.w.includes(t)), sc = p => 0.6 * dice(tri, p.tri);
    if (has(best) && best.w.length > w.length && fullIndex().some(p => p.cat === best.cat && p.name !== best.name && (!p.noJobs || best.noJobs) && has(p) && sc(best) - sc(p) < 0.005)) amb = true;
  }
  return { name: best.name, cat: best.cat, score: bs, amb };
}
// one screenshot → list of {name, cat}: match each line, fill unknown categories from the list order,
// drop extras beyond the limits (a duplicate Case/CPU/PSU… is an OCR repeat, not a second part)
// join wrapped names ("ASUS ROG Strix RX" + "VEGA64 OC Edition") only when the database agrees
function joinPCStatsLines(lines) {
  const items = []; let cur = null;
  const sc = t => (bestPartMatch(t) || { score: 0 }).score;
  for (const l of lines) {
    if (!cur) { if (!l.num) cur = l.text; continue; }
    if (l.branded) { items.push(cur); cur = l.text; continue; }
    if (/^\(/.test(l.text)) { cur += " " + l.text; continue; }   // "(Silver) 16 GB 2800 MHz" continues the name above
    // a bare number ("1500" – the X cut off) only counts as the end of the name above when the database agrees
    if (l.num) { const mj = cur && bestPartMatch(cur + " " + l.text); if (mj && normP(mj.name).split(" ").some(x => x.startsWith(l.text))) cur += " " + l.text; continue; }
    const joined = cur + " " + l.text, sj = sc(joined), sCur = sc(cur), sLine = sc(l.text);
    if (sj >= sCur - 0.02 && sj >= sLine) cur = joined; else { items.push(cur); cur = l.text; }
  }
  if (cur) items.push(cur);
  return items.map(name => ({ name }));
}
// The pictures next to each part in PC Stats are read as junk ("oF ae", "4, pov RA nwt mm) PTO").
// Every word is checked against the words used in real part names (one OCR slip allowed, e.g. "MS!"):
// junk at the start / end of a line is cut off, lines that are mostly junk are dropped.
let VOCAB = null, SHAPES = null;
// model numbers read with letters for look-alike digits: "STSSF" = "ST55F", "B5O" = "850"
const shape = w => w.replace(/[s]/g, "5").replace(/[o]/g, "0").replace(/[il]/g, "1").replace(/[b]/g, "8");
function partVocab() {
  if (VOCAB) return VOCAB;
  VOCAB = new Set(); SHAPES = new Set();
  const names = [...Object.values(window.PARTS_DB || {}).flatMap(rows => rows.map(r => r[0])), ...partsHistory.map(p => p.name)];
  for (const name of names) for (const t of normP(name).split(" ")) if (t.length >= 2) { VOCAB.add(t); if (t.length >= 4 && /\d/.test(t)) SHAPES.add(shape(t)); }
  return VOCAB;
}
const near1 = (a, b) => { // edit distance ≤ 1
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, e = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
  return e + (a.length - i) + (b.length - j) <= 1;
};
function wordOk(tok) {
  const t = normP(tok).replace(/ /g, ""), v = partVocab();
  if (!t) return false;
  if (v.has(t)) return true;
  if (/\d/.test(t) && /[a-z0-9]{3,}/.test(t)) return true;           // model numbers: 1500X, 2370-PRO, i7-8086K
  const parts = normP(tok).split(" ").filter(Boolean);
  if (parts.some(p => p.length >= 4 && SHAPES.has(shape(p))) && parts.every(p => v.has(p) || SHAPES.has(shape(p)))) return true; // "STSSF-PT" = ST55F-PT
  // one OCR slip: words of 4+ letters, or short ones with a symbol in them ("MS!" → MSI) – not "pto" → "pro"
  if (t.length >= 4 || (t.length === 3 && /[^a-z0-9]/.test(t))) for (const w of v) if (w.length >= 3 && near1(t, w)) return true;
  return false;
}
// sizes read with letters for digits: "SOOGB" → 500GB, "1TB", "I6 GB"
const fixSize = t => /^[\dOoSsIl]{1,5}(gb|tb|mhz|mm|w)$/i.test(t) && /\d/.test(t.replace(/[Ss]/g, "5").replace(/[Oo]/g, "0")) ? t.replace(/^[\dOoSsIl]+/, m => m.replace(/[Oo]/g, "0").replace(/[Ss]/g, "5").replace(/[Il]/g, "1")) : t;
function denoisePartLines(lines) {
  const out = [];
  for (const l of lines) {
    // a size ("8 GB", "1 TB") is one word here, never a crumb – it tells the 4 GB and 8 GB versions apart
    // "II" (Delta II, Mk II…) is read as "||" / "ll" / "Il" – a real word of part names, also at the start of a line
    const toks = l.text.replace(/\b(\d{1,4})\s+(GB|TB|MB)\b/gi, "$1\u00a0$2").split(/[ \t\r\n]+/).filter(Boolean).map(fixSize).map(t => /^[|Il]{2}$/.test(t) && partVocab().has("ii") ? "II" : t), good = toks.map(t => /^\d{1,4}\u00a0(gb|tb|mb)$/i.test(t) || wordOk(t));
    // at the ends, 1–2 letter bits ("Se", "a") are picture crumbs even when they happen to be real words
    const edgeOk = i => good[i] && (toks[i] === "II" || !(/^[a-z]{1,2}$/i.test(toks[i].replace(/[^a-z0-9]/gi, ""))));
    let a = 0, z = toks.length - 1;
    while (a <= z && !edgeOk(a)) a++;
    // …except a capital model letter / suffix right after a real word ("Phantom Gaming D", "RX580 8G OC") – it can decide
    // between two parts; a lone "I" / "l" is too often a bar of the picture
    const capEnd = i => i > a && good[i - 1] && /^([A-HJ-KM-Z]|[A-Z]{2})$/.test(toks[i]) && (toks[i].length === 1 || partVocab().has(toks[i].toLowerCase()));
    while (z >= a && !edgeOk(z) && !/^\(?[a-z]+\)$/i.test(toks[z]) && !/^logo\)?$/i.test(toks[z])) z--;
    if (z + 1 < toks.length && capEnd(z + 1) && !(z + 2 < toks.length && capEnd(z + 2))) z++;
    if (a > z) continue;
    const keep = toks.slice(a, z + 1), kg = good.slice(a, z + 1), n = kg.filter(Boolean).length;
    if (n / keep.length < 0.6) continue;
    // a line of bare numbers ("109°)") is picture noise; a wrapped model number like "1500X" mixes letters and digits.
    // One 3–5 digit number may still be a wrapped model number with its last letter lost ("1500") – the joining decides
    if (!keep.some(t => /[a-z]{2,}/i.test(t) || (/\d/.test(t) && /[a-z]/i.test(t)))) {
      const num = (l.text.match(/\b\d{3,5}\b/g) || []);
      if (num.length === 1) out.push({ ...l, text: num[0], num: true });
      continue;
    }
    out.push({ ...l, text: keep.join(" ").replace(/\u00a0/g, " ") });
  }
  return out;
}
// one word, a word that isn't part of any part name, or odd symbols ("1/-GUGBOK") → probably a cut-off / misread line
const weakPartLine = t => { const w = String(t).split(/\s+/).filter(Boolean); return w.length < 2 || w.some(x => /[^\w().+-]/.test(x) || !wordOk(x)); };
function resolvePCStats(items) {
  if (typeof items === "string") items = joinPCStatsLines(denoisePartLines(componentLines(items)));
  const out = [], count = {};
  let lastIdx = -1;
  for (const it of items) {
    let m = bestPartMatch(it.name);
    let loose = false;
    // a lone short word nothing matches ("S35", "ion") is a crumb of a picture or of a half-cut line
    if (!m && !/\s/.test(it.name.trim()) && it.name.replace(/[^a-z0-9]/gi, "").length < 6) continue;
    // two parts fit equally well → don't guess: keep what was read, marked for checking
    const amb = m && m.amb ? m : null; if (amb) m = null;
    // the top of a scrolled list is often a half-cut line ("supe", "Intel COFe 1/-GUGBOK", "ama Carbon"):
    // before the first recognised part, a weak unrecognised line is dropped instead of guessed
    if (!out.some(o => o.sure) && (m ? m.score < 0.8 && !/\s/.test(it.name.trim()) : weakPartLine(it.name))) continue;
    let cat = m ? m.cat : amb ? amb.cat : categorize(cleanOcrPart(it.name)), name = m ? m.name : cleanOcrPart(it.name);
    const full = c => PC_MAX[c] && (count[c] || 0) >= PC_MAX[c];
    if (!m && !amb && (cat === "Other" || full(cat))) {
      // not recognised: next category in the PC Stats order that still has room
      const cand = PC_ORDER.slice(Math.max(lastIdx, 0)).find(c => !full(c));
      if (cand) cat = cand;
      // category known from the position → a looser match inside that category is good enough
      const m2 = cand && bestPartMatch(it.name, cand, 0.35);
      if (m2) { name = m2.name; loose = true; }
    }
    if (full(cat)) continue;
    if (m && PC_MAX[cat] === 1 && out.some(o => o.name === name)) continue;
    count[cat] = (count[cat] || 0) + 1; lastIdx = Math.max(lastIdx, PC_ORDER.indexOf(cat));
    if (loose && !out.some(o => o.sure)) continue;
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
// longer facts for a part (board sizes, socket, RAM, watts, SLI/CrossFire, lighting…) – shown on swaps
let DETAILS = null;
function detailsOf(name) {
  if (!DETAILS) { DETAILS = new Map(); for (const cat in window.PARTS_DB || {}) for (const r of window.PARTS_DB[cat]) DETAILS.set(r[0].toLowerCase(), (cat === "GPU" && /\bwater\b/i.test(r[3] || "") ? WATER_GPU_TAG + " · " : "") + (r[8] || r[3] || "")); }
  return DETAILS.get(String(name || "").trim().toLowerCase()) || "";
}
// ---------- power check ----------
// watts for a part: CPU / GPU { w: stock, oc: overclocked to the max }, PSU { w } – from the parts database
// ("power" column), a PSU not in it by the watts in its name ("… 650W")
let POWER = null;
function powerOf(name) {
  if (!POWER) { POWER = new Map(); for (const cat in window.PARTS_DB || {}) for (const r of window.PARTS_DB[cat]) if (r[9]) { const [w, oc] = String(r[9]).split(">").map(Number); POWER.set(r[0].toLowerCase(), { w, oc: oc || w }); } }
  const key = String(name || "").trim().toLowerCase(), p = POWER.get(key);
  if (p) return p;
  const m = key.match(/(\d{3,4})\s?w\b/); return m ? { w: +m[1], oc: +m[1] } : null;
}
const POWER_OTHER = 50;   // everything except CPU and GPUs (board, RAM, drives, fans, pump…) – rule of thumb 40–50 W
// the PC as it will be when the job is done: current parts with the planned swaps applied
function plannedBuild(j) {
  const b = (j.components || []).map(c => ({ cat: c.cat, name: c.name }));
  for (const s of j.swaps || []) {
    const i = s.old ? b.findIndex(c => !c.swapped && c.name.toLowerCase() === s.old.toLowerCase()) : -1;
    // category as chosen; left on "Other" → from the parts database, else the replaced part's
    const db = fullIndex().find(p => p.name.toLowerCase() === String(s.new).trim().toLowerCase());
    const cat = s.cat && s.cat !== "Other" ? s.cat : db ? db.cat : i >= 0 ? b[i].cat : s.cat;
    if (i >= 0) b[i] = { cat, name: s.new, swapped: true };
    else b.push({ cat, name: s.new, swapped: true });
  }
  return b;
}
// null when there is no PSU yet; otherwise what the CPU + GPU(s) + the rest need, stock and overclocked
function powerCheck(j) {
  const b = plannedBuild(j), psu = b.filter(c => c.cat === "PSU").pop();
  if (!psu) return null;
  const P = powerOf(psu.name), cpu = b.filter(c => c.cat === "CPU").pop(), gpus = b.filter(c => c.cat === "GPU");
  const parts = [cpu, ...gpus].filter(Boolean).map(c => ({ ...c, p: powerOf(c.name) }));
  const need = k => POWER_OTHER + parts.reduce((t, c) => t + (c.p ? c.p[k] : 0), 0);
  // overclocked watts count only when an OBJECTIVE asks for an overclock; "I'll overclock it later" in the email → ocLater
  const ocWanted = /\b(overclock\w*|oc)\b/i.test(jobObjectives(j).join(" ")), ocLater = !ocWanted && !!j.ocLater;
  return { psu: psu.name, psuW: P ? P.w : null, cpu, gpus, parts, stock: need("w"), oc: need("oc"), ocWanted, ocLater, unknown: parts.filter(c => !c.p).map(c => c.name) };
}
function priceOf(name) {
  if (!PRICE) { PRICE = new Map(); for (const cat in window.PARTS_DB || {}) for (const r of window.PARTS_DB[cat]) if (r[2] != null) PRICE.set(r[0].toLowerCase(), r[2]); }
  return PRICE.get(String(name || "").trim().toLowerCase()) ?? null;
}
