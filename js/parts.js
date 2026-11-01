/* Parts database search, OCR name matching, DLC filter and the autocomplete dropdown.
   Data comes from data/parts-db.js (window.PARTS_DB / PARTS_DLC / PARTS_META). */

// ---- DLC / content packs the user owns ----
const DLCS = window.PARTS_DLC || [];
const DLC_LABEL = Object.fromEntries(DLCS.map(d => [d.key, d.label]));
let dlcOn = Object.assign(Object.fromEntries(DLCS.map(d => [d.key, d.on])), LS.get("pcbs.dlc", {}));
const dlcEnabled = k => !k || !!dlcOn[k];
function setDlc(k, v) { dlcOn[k] = v; LS.set("pcbs.dlc", dlcOn); buildIndex(); }
const dlcCount = k => Object.values(window.PARTS_DB || {}).reduce((n, rows) => n + rows.filter(r => r[4] === k).length, 0);

// parts the user typed that are not in the database
let partsHistory = LS.get("pcbs.partsHistory", []).map(p => typeof p === "string" ? { name: p, cat: categorize(p) } : p);

const normP = s => String(s).toLowerCase().replace(/[™®�]/g, "").replace(/\bgray\b/g, "grey").replace(/[-_/().,|+!:]/g, " ").replace(/\s+/g, " ").trim();
let INDEX = [];
function buildIndex() {
  INDEX = [];
  const db = window.PARTS_DB || {};
  for (const cat in db) for (const [name, lvl, price, spec, dlc] of db[cat]) {
    if (!dlcEnabled(dlc)) continue;
    const n = normP(name); INDEX.push({ cat, name, lvl, price, spec, dlc, n, c: n.replace(/ /g, ""), w: n.split(" ") });
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
  return INDEX.filter(p => p.cat === "Cables" && need.every(w => p.w.includes(w)) && (!plain || !/duo|patterned|striped|rainbow/.test(p.n))
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
  acEl.innerHTML = acItems.map((p, i) => `<div data-i="${i}" class="${i ? "" : "sel"}"><span>${brands.some(b => brandMatch(p, b)) ? '<em class="fav" title="Customer\'s preferred brand">★</em> ' : ""}${hl(p.name)}${p.dlc ? ` <em class="dlc">${esc(DLC_LABEL[p.dlc] || p.dlc)}</em>` : ""}</span><small>${esc(info(p))}${!cat || cat === "Other" ? " · " + esc(p.cat) : ""}</small></div>`).join("")
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
  document.addEventListener("focusin", e => { if (e.target.matches("[data-ac]") && e.target.value.length >= 2) acShow(e.target); });
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
