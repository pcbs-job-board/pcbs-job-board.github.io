/* 📦 PC Bay build – a broken PC bought on PC Bay: fix it, improve it, XMP / overclock, run 3DMark, sell.
   Lives in the jobs list (kind: "flip") so it can sit on T1–T3 or in Open jobs; the window is in flipui.js.
   Resale value (community formula; matches the game: $441 broken → $591 booted → $949 at 4,288 points):
     value = sum of used part values × multiplier + $100 once the PC has booted to the OS
     multiplier = 1.0× at a 3DMark score of 1,000 or less, rising evenly to 3.0× at 10,000 (no more above)
   Used part value = the workbook's sell price = ⅓ of the shop price (rounded). A broken part shows ~10 % of it. */

const FLIP_LEVEL = 9;   // PC Bay (js/unlocks.js)
// where the windows are: the screen areas "resale" (Resale Value panel) and "inv" (inventory card grid) – found
// automatically on the first capture, like the email / PC Stats areas (js/areas.js), adjustable in Settings

function usedValue(name) { const p = priceOf(name); return p == null ? null : Math.round(p / 3); }
function benchMult(score) { return score == null ? 1 : score <= 1000 ? 1 : score >= 10000 ? 3 : 1 + 2 * (score - 1000) / 9000; }
function flipValue(partsSum, booted, score) { return Math.floor(partsSum * benchMult(score) + (booted ? 100 : 0)); }

// ---------- reading the screenshots (plain text in, so it can be tested without pictures) ----------
const RESALE_PRICE = /^(.*?)[\s|]*\$\s?(\d[\d,]*)\s*$/;
const cleanName = t => String(t).replace(/^[^A-Za-z0-9(]+/, "").trim();   // icon crumbs: "[=] NZXT…", "® Low-Profile"
// Resale Value panel: "NZXT H210i (Black + White) $40", names wrap onto a 2nd line (the $ can be on either)
function parseResale(lines) {
  lines = lines.map(l => Array.isArray(l) ? { text: l[0], conf: l[1] } : typeof l === "string" ? { text: l, conf: 100 } : l);
  const out = { total: null, status: "", items: [] };
  let on = false; const segs = [];
  for (const { text, conf } of lines) {
    const t = String(text).trim(); if (!t) continue;
    const tot = t.match(/resale\s+value:?\s*\$\s?(\d[\d,]*)/i); if (tot) { out.total = +tot[1].replace(/,/g, ""); on = true; continue; }
    if (/pc\s+status/i.test(t)) { on = false; continue; }
    if (!on) {
      const st = t.match(/broken part\(?s?\)?|ready to boot|no os|not booted|overheat\w*|diagnose problem|unstable/i); if (st && !out.status) out.status = st[0];
      const sc = t.match(/(\d{3,5})\s*$/); if (st && sc) out.score = +sc[1];   // the 3DMark circle next to "Ready to boot"
      continue;
    }
    const m = t.match(RESALE_PRICE);
    if (m) segs.push({ name: cleanName(m[1]), value: +m[2].replace(/,/g, "") });
    else if (conf >= 50 && /[A-Za-z0-9]{2}/.test(t)) segs.push({ name: cleanName(t), value: null });
  }
  // a line without a price belongs to the item above (name wrapped) or below (price on its 2nd line) – the parts database decides
  const sc = t => (bestPartMatch(t) || { score: 0 }).score;
  const items = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.value != null) { items.push({ ...s, pre: [] }); continue; }
    const prev = items[items.length - 1], next = segs.slice(i + 1).find(x => x.value != null), nextIdx = next ? segs.indexOf(next) : -1;
    const gainPrev = prev ? sc(prev.name + " " + s.name) - sc(prev.name) : -1;
    const gainNext = next && nextIdx === i + 1 ? sc(s.name + " " + next.name) - sc(next.name) : -1;
    if (gainNext > gainPrev && gainNext > 0) next.name = s.name + " " + next.name;
    else if (prev && gainPrev > -0.02) prev.name += " " + s.name;
  }
  for (const it of items) {
    const m = bestPartMatch(it.name);
    if (m && !m.amb && m.score >= 0.6) out.items.push({ name: m.name, cat: m.cat, value: it.value, sure: true });
    else if (it.name.length > 3) out.items.push({ name: it.name, cat: categorize(it.name), value: it.value, sure: false });
  }
  return out;
}
// Inventory (one card column): name (1–2 lines) → feature bullets → "$218" (with "Auction on PC Bay" / "Sell")
// middle of the name: its lines from the last one up, while they follow each other (a red INCOMPATIBLE label above is left out)
function nameMid(bs) { let i = bs.length - 1; while (i > 0 && bs[i].y0 - bs[i - 1].y1 < (bs[i].y1 - bs[i].y0) * 0.8) i--; return (bs[i].y0 + bs[bs.length - 1].y1) / 2; }
function parseInventoryColumn(lines) {
  lines = lines.map(l => Array.isArray(l) ? { text: l[0], conf: l[1], bbox: l[2] } : typeof l === "string" ? { text: l, conf: 100 } : l);
  const out = []; let name = [], box = [], cur = null;
  // the sell price shown is the used value (⅓ of the shop price) – when the "$" line can't be read, that's used instead;
  // a BROKEN part shows ~10 % of it
  const done = c => { const price = c.price ?? usedValue(c.name), u = usedValue(c.name); out.push({ ...c, price, broken: c.price != null && u != null && u >= 8 && c.price <= u * 0.4 }); };
  // where the name sits (middle of its lines, in pixels of the column picture) – the USED / BROKEN labels are found from it
  const flush = () => { if (!name.length) return; const t = name.join(" "), bs = box; name = []; box = []; const m = bestPartMatch(t); if (m && !m.amb && m.score >= 0.7) { if (cur) done(cur); cur = { name: m.name, cat: m.cat, price: null, nameY: bs.length ? nameMid(bs) : null }; } };
  for (const { text, conf, bbox } of lines) {
    const t = String(text).trim(); if (!t) continue;
    // "$65" – sometimes read as "365" / "S65" (the $ taken for a 3, 5, 8 or S): the parts database decides
    const pr = t.match(/\$\s?(\d[\d,]*)/) || (cur && t.match(/(?:auction on|sell)\D{0,3}([358S]?\d{1,4})\s*$/i));
    if (pr) {
      flush();
      if (cur) {
        const raw = pr[1].replace(/,/g, ""), u = usedValue(cur.name), n = +raw.replace(/^S/, "");
        const alt = /^[358S]\d+$/.test(raw) && !/\$/.test(t) ? +raw.slice(1) : null;
        cur.price = alt != null && u != null && Math.abs(alt - u) < Math.abs(n - u) ? alt : n; done(cur); cur = null;
      }
      continue;
    }
    if (/^\W{0,2}(auction|pc\s?bay|sell|used|incompatible|broken)\b/i.test(t) || /:/.test(t) || /^[*«»+•·-]/.test(t)) { flush(); continue; }
    if (conf < 60) { flush(); continue; }
    if (/[A-Za-z]{2}/.test(t) || /\d/.test(t)) { name.push(t); if (bbox) box.push(bbox); }
  }
  flush(); if (cur) done(cur);
  return out;
}
// USED (dark letters, top right of the card picture) and BROKEN (red letters under it) – by colour, from where the
// name is: the picture's top is ~0.30 of the screen height above the middle of the name. px(x, y) → [r, g, b] (0–1 coords)
function cardLabels(px, colX, colW, nameMidY, W, H) {
  const top = nameMidY - 0.30, cnt = (x0, x1, y0, y1, test) => { let n = 0, t = 0; for (let y = y0; y < y1; y += 1 / H) for (let x = x0; x < x1; x += 1 / W) { t++; if (test(px(x, y))) n++; } return t ? n / t : 0; };
  const dark = cnt(colX + colW * 0.62, colX + colW * 0.97, top + 0.004, top + 0.04, ([r, g, b]) => (r + g + b) / 3 < 90);
  const red = cnt(colX + colW * 0.2, colX + colW * 0.8, top + 0.04, top + 0.1, ([r, g, b]) => r > 170 && g < 80 && b < 80);
  return { used: dark > 0.05, broken: red > 0.035, dark, red };
}
// a whole inventory screenshot (browser): the 3 card columns of the "inv" area → [{name, cat, price, used, broken}]
async function readInventory(img, grid, onStep) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height, fc = document.createElement("canvas"); fc.width = W; fc.height = H;
  const fg = fc.getContext("2d", { willReadFrequently: true }); fg.drawImage(img, 0, 0); const pd = fg.getImageData(0, 0, W, H).data;
  const px = (x, y) => { const i = (Math.min(H - 1, Math.max(0, Math.round(y * H))) * W + Math.min(W - 1, Math.max(0, Math.round(x * W)))) * 4; return [pd[i], pd[i + 1], pd[i + 2]]; };
  const items = [];
  const cols = invColumns(grid);
  for (const [ci, b] of cols.entries()) {
    if (onStep) onStep(ci + 1, cols.length);
    const c = cropCanvas(img, b), got = parseInventoryColumn((await readText(c)).lines);
    for (const it of got) {
      if (it.nameY != null) { const L = cardLabels(px, b.x, b.w, b.y + it.nameY / c.height * b.h, W, H); it.used = L.used; it.broken = L.broken;
        // not broken but the price reads far too low → misread, the used value it must be
        const u = usedValue(it.name); if (!it.broken && u != null && it.price <= u * 0.4) it.price = u; } else it.used = true;
      items.push(it);
    }
  }
  return items;
}
// ---------- the build ----------
const flipUid = () => Math.random().toString(36).slice(2, 9);
function newFlip() {
  return { id: flipUid(), kind: "flip", table: 0, created: Date.now(), step: 1, parts: [], startValue: null, inv: [], changes: [],
    soft: { boot: false, xmp: false, ocCpu: false, ocGpu: false, bench: false }, score: null, tasks: [], swaps: [], components: [], hidden: [] };
}
function isFlip(j) { return !!j && j.kind === "flip"; }
// broken = worth far less than a working one (the game shows ~10 % of the used value)
function brokenWhy(p) {
  const u = usedValue(p.name); if (p.value == null || u == null || u < 8) return "";
  return p.value <= u * 0.4 ? `worth $${p.value} – a working one is worth $${u}` : "";
}
function markBroken(f) { for (const p of f.parts) if (p.brokenManual == null) p.broken = !!brokenWhy(p); }
// the PC as it will be: captured parts, broken ones replaced, upgrades applied; [{cat, name, value, from}]
function flipBuild(f) {
  const out = f.parts.map(p => ({ cat: p.cat, name: p.name, value: p.broken ? 0 : p.value ?? usedValue(p.name) ?? 0, broken: !!p.broken, partId: p.id }));
  for (const c of f.changes) {
    const v = usedValue(c.name) ?? 0, row = { cat: c.cat, name: c.name, value: v, changed: c.id, isNew: !!c.isNew };
    const k = c.old ? out.findIndex(p => p.partId === c.old && !p.changed) : -1;
    if (k >= 0) out[k] = row; else out.push(row);
  }
  return out;
}
// parts taken out by upgrades (working ones) can be used again in this build; broken ones can't
function flipInventory(f) {
  const out = f.inv.map(i => ({ ...i }));
  for (const c of f.changes) if (c.kind === "hw" && c.old) { const p = f.parts.find(x => x.id === c.old); if (p && !p.broken) out.push({ id: "out:" + p.id, cat: p.cat, name: p.name, used: true, src: "removed" }); }
  const taken = new Set(f.changes.map(c => c.invId).filter(Boolean));
  return out.map(i => ({ ...i, taken: taken.has(i.id) || !!i.broken }));   // broken parts can't be used
}
const softOk = (f, build) => {
  const cpu = build.find(p => p.cat === "CPU"), mb = build.find(p => p.cat === "Motherboard");
  return { ocCpu: !!cpu && !!ocOf(cpu.name) && (compatOf(cpu.name) || {}).oc !== "0" && !!mb && (compatOf(mb.name) || {}).oc !== "0" && hasUnlock("cpuOC"),
    ocGpu: build.some(p => p.cat === "GPU" && ocOf(p.name)) && hasUnlock("gpuOC") };
};
// estimated 3DMark score of a build with XMP / overclocking (90 % of the potential) as asked
function flipScore(build, o = {}) {
  const cpuP = build.find(p => p.cat === "CPU"), mbP = build.find(p => p.cat === "Motherboard"), gpus = build.filter(p => p.cat === "GPU"), ram = build.filter(p => p.cat === "RAM");
  const cpu = cpuP && benchOf(cpuP.name), mb = mbP && benchOf(mbP.name), g = gpus[0] && benchOf(gpus[0].name);
  const sticks = ram.map(r => +((compatOf(r.name) || {}).mhz || 0)).filter(Boolean);
  if (!cpu || !mb || !g || !sticks.length) return null;
  const two = gpus.length > 1 && gpus[1].name === gpus[0].name && g.two;
  let gpuS = two ? g.two : g.one;
  if (o.ocGpu) { const oc = two ? g.ocTwo : g.ocOne; if (oc > gpuS) gpuS = Math.round(gpuS + OC_SHARE * (oc - gpuS)); }
  const stick = Math.min(...sticks), ch = Math.min(sticks.length, cpu.maxCh || 1), mhz = o.xmp ? xmpSpeed(stick, mb.steps) : Math.min(cpu.defMem || stick, stick);
  const cpuMhz = o.ocCpu && ocReach(cpuP.name) ? ocReach(cpuP.name) : cpu.mhz;
  return sysBench(cpuBench({ ...cpu, mhz: cpuMhz }, ch, mhz), gpuS);
}
// everything the window and the tile show
function flipState(f) {
  const build = flipBuild(f), can = softOk(f, build), sum = build.reduce((t, p) => t + (p.broken ? 0 : p.value), 0);
  const broken = f.parts.filter(p => p.broken), unfixed = broken.filter(p => !f.changes.some(c => c.kind === "fix" && c.old === p.id));
  const newCost = f.changes.filter(c => c.isNew).reduce((t, c) => t + (c.price ?? priceOf(c.name) ?? 0), 0);
  const s = f.soft, plan = { xmp: true, ocCpu: can.ocCpu, ocGpu: can.ocGpu };
  const now = flipScore(build, { xmp: s.xmp, ocCpu: s.ocCpu && can.ocCpu, ocGpu: s.ocGpu && can.ocGpu });
  const best = flipScore(build, plan);   // after XMP + the overclocks this PC can do
  const start = f.startValue ?? f.parts.reduce((t, p) => t + (p.value ?? 0), 0);
  const score = s.bench && f.score ? f.score : null;
  // still broken: worth what the game shows (broken parts at their low value), no estimate yet
  const value = unfixed.length ? f.parts.reduce((t, p) => t + (p.value ?? 0), 0) : flipValue(sum, s.boot, score);
  const estValue = unfixed.length ? null : flipValue(sum, true, best);
  return { build, can, sum, broken, unfixed, newCost, now, best, start, value, estValue, profit: unfixed.length ? null : (score ? value : estValue ?? value) - start - newCost, scored: !!score };
}
// ---------- step 3: upgrades from the inventory (each with its score and value) ----------
function flipFits(build, swaps) {
  const job = { components: build.map(p => ({ cat: p.cat, name: p.name })), swaps: [], objectives: [], tasks: [] };   // planFits adds the swaps
  return planFits(job, swaps);
}
function flipUpgrades(f) {
  const st = flipState(f); if (!st.best) return [];
  const build = st.build, inv = flipInventory(f).filter(i => !i.taken);
  const cur = cat => build.filter(p => p.cat === cat), val = (b, sc) => flipValue(b.reduce((t, p) => t + (p.broken ? 0 : p.value), 0), true, sc);
  const base = val(build, st.best), out = [];
  const tryIt = (label, items) => {   // items: [{inv, old (build row or null)}]
    const swaps = items.map(x => ({ cat: x.inv.cat, old: x.old ? x.old.name : "", new: x.inv.name }));
    if (!flipFits(build, swaps)) return;
    const b2 = build.map(p => ({ ...p })); for (const x of items) { const row = { cat: x.inv.cat, name: x.inv.name, value: usedValue(x.inv.name) ?? 0 }; const k = x.old ? b2.indexOf(b2.find(p => p.name === x.old.name && p.cat === x.old.cat)) : -1; if (k >= 0) b2[k] = row; else b2.push(row); }
    const can2 = { ocCpu: softOk(f, b2).ocCpu, ocGpu: softOk(f, b2).ocGpu }, sc = flipScore(b2, { xmp: true, ...can2 }); if (!sc) return;
    const cost = items.filter(x => !x.inv.used).reduce((t, x) => t + (x.inv.price ?? priceOf(x.inv.name) ?? 0), 0);
    const gain = val(b2, sc) - cost - base;
    // overclocked watts vs the PSU (the build will be overclocked for the sale)
    const pc = powerCheck({ components: b2.map(p => ({ cat: p.cat, name: p.name })), swaps: [], objectives: [], tasks: [] }), psuLow = pc && pc.psuW != null && pc.oc > pc.psuW ? pc.oc : 0;
    if (out.some(o => o.label === label)) return;
    out.push({ label, items, score: sc, dScore: sc - st.best, value: val(b2, sc), gain, cost, isNew: items.some(x => !x.inv.used), psuLow });
  };
  for (const i of inv.filter(i => i.cat === "GPU")) {
    const g = cur("GPU");
    if (g.length && i.name !== g[0].name) tryIt(`GPU: ${i.name}`, [{ inv: i, old: g[0] }]);
    if (g.length === 1 && i.name === g[0].name) tryIt(`Second GPU: ${i.name}`, [{ inv: i, old: null }]);
  }
  for (const i of inv.filter(i => i.cat === "CPU")) {
    const c = cur("CPU")[0]; if (!c || i.name === c.name) continue;
    if (sockOk((compatOf(cur("Motherboard")[0]?.name) || {}).s, (compatOf(i.name) || {}).s)) tryIt(`CPU: ${i.name}`, [{ inv: i, old: c }]);
    else for (const b of inv.filter(b => b.cat === "Motherboard" && sockOk((compatOf(b.name) || {}).s, (compatOf(i.name) || {}).s))) {
      const set = [{ inv: i, old: c }, { inv: b, old: cur("Motherboard")[0] }];
      if (flipFits(build, set.map(x => ({ cat: x.inv.cat, old: x.old?.name || "", new: x.inv.name })))) tryIt(`CPU + motherboard: ${i.name} + ${b.name}`, set);
      else for (const k of inv.filter(k => k.cat === "CPU Cooler")) tryIt(`CPU + motherboard + cooler: ${i.name} + ${b.name} + ${k.name}`, [...set, { inv: k, old: cur("CPU Cooler")[0] || null }]);
    }
  }
  const sticks = cur("RAM"), cpuB = benchOf(cur("CPU")[0]?.name), free = (cpuB?.maxCh || 2) - sticks.length, rams = inv.filter(i => i.cat === "RAM");
  // the fastest sticks first (the slowest stick sets the speed), then the most valuable
  const best = [...rams].sort((a, b) => (+(compatOf(b.name) || {}).mhz || 0) - (+(compatOf(a.name) || {}).mhz || 0) || (usedValue(b.name) || 0) - (usedValue(a.name) || 0)).slice(0, free);
  if (free > 0 && best.length) tryIt(`More RAM: ${best.map(r => r.name).join(" + ")}`, best.map(r => ({ inv: r, old: null })));
  for (const b of inv.filter(i => i.cat === "Motherboard")) { const m = cur("Motherboard")[0]; if (m && b.name !== m.name && sockOk((compatOf(b.name) || {}).s, (compatOf(cur("CPU")[0]?.name) || {}).s)) tryIt(`Motherboard: ${b.name}`, [{ inv: b, old: m }]); }
  return out.filter(o => o.dScore > 0 || o.gain > 0).sort((a, b) => b.gain - a.gain);
}
// gentle notes for step 3
function flipNotes(f) {
  const st = flipState(f), b = st.build, n = [];
  const cpu = b.find(p => p.cat === "CPU"), ram = b.filter(p => p.cat === "RAM"), cpuB = cpu && benchOf(cpu.name);
  if (ram.length === 1 && (cpuB?.maxCh || 2) > 1) n.push("Only one RAM stick – a second one (dual channel) raises the 3DMark score, and so the price.");
  if (cpu && ((compatOf(cpu.name) || {}).oc === "0" || !ocOf(cpu.name))) n.push(`${cpu.name} is locked – an unlocked CPU could be overclocked: a higher score sells for more.`);
  else if (cpu && !st.can.ocCpu && hasUnlock("cpuOC")) n.push("The motherboard can't overclock – the CPU stays at its stock speed.");
  if (st.best != null && st.best >= 10000) n.push("The score already reaches 10,000 – more performance won't raise the price.");
  return n;
}
// ---------- changes (keep the step-4 ticks honest: a new CPU drops the CPU overclock, a new board drops everything…) ----------
function flipChange(f, c) {
  f.changes = f.changes.filter(x => !(x.old && x.old === c.old && x.kind === c.kind));
  f.changes.push({ id: flipUid(), ...c }); flipReset(f, c.cat);
}
function flipUnchange(f, id) { const c = f.changes.find(x => x.id === id); f.changes = f.changes.filter(x => x.id !== id); if (c) flipReset(f, c.cat); }
function flipReset(f, cat) {
  const s = f.soft;
  if (cat === "CPU") s.ocCpu = false;
  if (cat === "GPU") s.ocGpu = false;
  if (cat === "RAM") s.xmp = false;
  if (cat === "Motherboard") { s.xmp = s.ocCpu = s.ocGpu = false; }
  s.bench = false; f.score = null;
}
if (typeof module !== "undefined") module.exports = { parseResale, parseInventoryColumn, cardLabels, benchMult, flipValue, usedValue, newFlip, flipState, flipBuild, flipUpgrades, flipNotes, flipChange, flipUnchange, markBroken, brokenWhy, flipScore };
