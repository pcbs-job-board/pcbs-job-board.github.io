/* 📦 PC Bay build – a broken PC bought on PC Bay: fix it, improve it, XMP / overclock, run 3DMark, sell.
   Lives in the jobs list (kind: "flip") so it can sit on T1–T3 or in Open jobs; the window is in flipui.js.
   Resale value (community formula; matches the game: $441 broken → $591 booted → $949 at 4,288 points):
     value = sum of used part values × multiplier + $100 once the PC has booted to the OS
     multiplier = 1.0× at a 3DMark score of 1,000 or less, rising evenly to 3.0× at 10,000 (no more above)
   Used part value = the workbook's sell price = ⅓ of the shop price (rounded). A broken part shows ~10 % of it. */

const FLIP_LEVEL = 9; // PC Bay (js/unlocks.js)
// where the windows are: the screen areas "resale" (Resale Value panel) and "inv" (inventory card grid) – found
// automatically on the first capture, like the email / PC Stats areas (js/areas.js), adjustable in Settings

function usedValue(name) {
  const p = priceOf(name);
  return p == null ? null : Math.round(p / 3);
}
function benchMult(score) {
  return score == null ? 1 : score <= 1000 ? 1 : score >= 10000 ? 3 : 1 + (2 * (score - 1000)) / 9000;
}
function flipValue(partsSum, booted, score) {
  return Math.floor(partsSum * benchMult(score) + (booted ? 100 : 0));
}

// ---------- reading the screenshots (plain text in, so it can be tested without pictures) ----------
const RESALE_PRICE = /^(.*?)[\s|]*\$\s?(\d[\d,]*)\s*$/;
const cleanName = t =>
  String(t)
    .replace(/^[^A-Za-z0-9(]+/, "")
    .replace(/^[A-Za-z0-9]{0,3}[\][|{}]+\s+/, "") // a category icon read as letters: "mS] Raijintek…"
    .trim(); // icon crumbs: "[=] NZXT…", "® Low-Profile"
// Resale Value panel: "NZXT H210i (Black + White) $40", names wrap onto a 2nd line (the $ can be on either)
function parseResale(lines) {
  lines = lines.map(l => (Array.isArray(l) ? { text: l[0], conf: l[1] } : typeof l === "string" ? { text: l, conf: 100 } : l));
  const out = { total: null, status: "", items: [] };
  let on = false;
  const segs = [];
  for (const { text, conf } of lines) {
    const t = String(text).trim();
    if (!t) continue;
    const tot = t.match(/resale\s+value:?\s*\$\s?(\d[\d,]*)/i);
    if (tot) {
      out.total = +tot[1].replace(/,/g, "");
      on = true;
      continue;
    }
    if (/pc\s+status/i.test(t)) {
      on = false;
      continue;
    }
    if (!on) {
      const st = t.match(/broken part\(?s?\)?|ready to boot|no os|not booted|overheat\w*|diagnose problem|unstable/i);
      if (st && !out.status) out.status = st[0];
      const sc = t.match(/(\d{3,5})\s*$/);
      if (st && sc) out.score = +sc[1]; // the 3DMark circle next to "Ready to boot"
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
    if (s.value != null) {
      items.push({ ...s, pre: [] });
      continue;
    }
    const prev = items[items.length - 1],
      next = segs.slice(i + 1).find(x => x.value != null),
      nextIdx = next ? segs.indexOf(next) : -1;
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
function nameMid(bs) {
  let i = bs.length - 1;
  while (i > 0 && bs[i].y0 - bs[i - 1].y1 < (bs[i].y1 - bs[i].y0) * 0.8) i--;
  return (bs[i].y0 + bs[bs.length - 1].y1) / 2;
}
function parseInventoryColumn(lines) {
  lines = lines.map(l =>
    Array.isArray(l) ? { text: l[0], conf: l[1], bbox: l[2] } : typeof l === "string" ? { text: l, conf: 100 } : l
  );
  const out = [];
  let name = [],
    box = [],
    cur = null;
  // the sell price shown is the used value (⅓ of the shop price) – when the "$" line can't be read, that's used instead;
  // a BROKEN part shows ~10 % of it
  const done = c => {
    const price = c.price ?? usedValue(c.name),
      u = usedValue(c.name);
    out.push({ ...c, price, broken: c.price != null && u != null && u >= 8 && c.price <= u * 0.4 });
  };
  // where the name sits (middle of its lines, in pixels of the column picture) – the USED / BROKEN labels are found from it
  const flush = () => {
    if (!name.length) return;
    const t = name.join(" "),
      bs = box;
    name = [];
    box = [];
    const m = bestPartMatch(t);
    if (m && !m.amb && m.score >= 0.7) {
      if (cur) done(cur);
      cur = { name: m.name, cat: m.cat, price: null, nameY: bs.length ? nameMid(bs) : null };
    }
  };
  for (const { text, conf, bbox } of lines) {
    const t = String(text).trim();
    if (!t) continue;
    // "$65" – sometimes read as "365" / "S65" (the $ taken for a 3, 5, 8 or S): the parts database decides
    const pr = t.match(/\$\s?(\d[\d,]*)/) || (cur && t.match(/(?:auction on|sell)\D{0,3}([358S]?\d{1,4})\s*$/i));
    if (pr) {
      flush();
      if (cur) {
        const raw = pr[1].replace(/,/g, ""),
          u = usedValue(cur.name),
          n = +raw.replace(/^S/, "");
        const alt = /^[358S]\d+$/.test(raw) && !/\$/.test(t) ? +raw.slice(1) : null;
        cur.price = alt != null && u != null && Math.abs(alt - u) < Math.abs(n - u) ? alt : n;
        done(cur);
        cur = null;
      }
      continue;
    }
    if (/^\W{0,2}(auction|pc\s?bay|sell|used|incompatible|broken)\b/i.test(t) || /:/.test(t) || /^[*«»+•·-]/.test(t)) {
      flush();
      continue;
    }
    if (conf < 60) {
      flush();
      continue;
    }
    if (/[A-Za-z]{2}/.test(t) || /\d/.test(t)) {
      name.push(t);
      if (bbox) box.push(bbox);
    }
  }
  flush();
  if (cur) done(cur);
  return out;
}
// USED (dark letters, top right of the card picture) and BROKEN (red letters under it), by colour – measured from the
// part's name in *card widths* (colW), so it fits any capture: a full-screen 16:9 one or a window with a title bar and
// black bars around the game (a 1512 × 948 Mac capture; screen-height units missed the labels there and hit the
// selected card's black frame instead). From the name up: USED at 0.97–1.04 card widths, BROKEN at 0.82–0.89.
// BROKEN must stand out from the rows just above and below it (red text on the picture), so a red fan or a red heatsink
// – red all the way down the picture – doesn't count. A yellow "Property of …" note top left → property (a customer's
// part: can't be used for a PC Bay build). px(x, y) → [r, g, b] (0–1 coords)
function cardLabels(px, colX, colW, nameMidY, W, H) {
  const cw = colW * W,
    // share of the pixels in rows k0..k1 (card widths above the name) and x0..x1 (share of the card width) passing test
    band = (k0, k1, x0, x1, test) => {
      let n = 0,
        t = 0;
      for (let y = nameMidY * H - k1 * cw; y <= nameMidY * H - k0 * cw; y++)
        for (let x = (colX + colW * x0) * W; x < (colX + colW * x1) * W; x++) {
          t++;
          if (test(px(x / W, y / H))) n++;
        }
      return t ? n / t : 0;
    },
    isDark = ([r, g, b]) => (r + g + b) / 3 < 90,
    isRed = ([r, g, b]) => r > 170 && g < 80 && b < 80;
  const dark = band(0.97, 1.04, 0.62, 0.92, isDark),
    red = band(0.82, 0.89, 0.2, 0.8, isRed),
    around = Math.max(band(0.75, 0.81, 0.2, 0.8, isRed), band(0.9, 0.96, 0.2, 0.8, isRed));
  // a yellow sticky note "Property of <customer email>" at the picture's top left: a customer's part, not ours
  const note = band(0.6, 1.12, 0.04, 0.38, ([r, g, b]) => r > 200 && g > 190 && b < 150 && r - b > 80);
  // cards with a note: 0.31–0.61 of the patch yellow, every other card: 0
  // BROKEN: red text on a light grey band – real labels have ≤ 0.01 red just above / below it, a red fan reaching
  // into the band (ARCTIC ONE (Red): 0.195 in it, 0.112 around) has red around it too
  return { used: dark > 0.05, broken: red > 0.1 && around < 0.05, property: note > 0.15, dark, red, around, note };
}
// ---------- the build ----------
const flipUid = () => Math.random().toString(36).slice(2, 9);
function newFlip() {
  return {
    id: flipUid(),
    kind: "flip",
    table: 0,
    created: Date.now(),
    step: 1,
    parts: [],
    startValue: null,
    inv: [],
    changes: [],
    soft: { boot: false, xmp: false, ocCpu: false, ocGpu: false, bench: false },
    score: null,
    tasks: [],
    swaps: [],
    components: [],
    hidden: [],
  };
}
function isFlip(j) {
  return !!j && j.kind === "flip";
}
// broken = worth far less than a working one (the game shows ~10 % of the used value)
function brokenWhy(p) {
  const u = usedValue(p.name);
  // $0 in the Resale Value window = broken, however cheap the part (a working one is worth at least $1)
  if (p.value === 0 && (u == null || u >= 1)) return u ? `worth $0 – a working one is worth $${u}` : "worth $0";
  if (p.value == null || u == null || u < 8) return "";
  return p.value <= u * 0.4 ? `worth $${p.value} – a working one is worth $${u}` : "";
}
function markBroken(f) {
  for (const p of f.parts) if (p.brokenManual == null) p.broken = !!brokenWhy(p);
}
// the PC as it will be: captured parts, broken ones replaced, upgrades applied; [{cat, name, value, from}]
function flipBuild(f) {
  const out = f.parts.map(p => ({
    cat: p.cat,
    name: p.name,
    value: p.broken ? 0 : (p.value ?? usedValue(p.name) ?? 0),
    broken: !!p.broken,
    partId: p.id,
  }));
  for (const c of f.changes) {
    if (c.kind === "rm") {
      const k = out.findIndex(p => p.partId === c.old && !p.changed);
      if (k >= 0) out.splice(k, 1);
      continue;
    }
    const v = usedValue(c.name) ?? 0,
      row = { cat: c.cat, name: c.name, value: v, changed: c.id, isNew: !!c.isNew };
    const k = c.old ? out.findIndex(p => p.partId === c.old && !p.changed) : -1;
    if (k >= 0) out[k] = row;
    else out.push(row);
  }
  return out;
}
// parts taken out by upgrades (working ones) can be used again in this build; broken ones can't
function flipInventory(f) {
  const out = f.inv.map(i => ({ ...i }));
  for (const c of f.changes)
    if ((c.kind === "hw" || c.kind === "rm") && c.old) {
      const p = f.parts.find(x => x.id === c.old);
      if (p && !p.broken) out.push({ id: "out:" + p.id, cat: p.cat, name: p.name, used: true, src: "removed" });
    }
  const taken = new Set(f.changes.map(c => c.invId).filter(Boolean));
  return out.map(i => ({ ...i, taken: taken.has(i.id) || !!i.broken })); // broken parts can't be used
}
const softOk = (f, build) => {
  const cpu = build.find(p => p.cat === "CPU"),
    mb = build.find(p => p.cat === "Motherboard");
  return {
    ocCpu:
      !!cpu &&
      !!ocOf(cpu.name) &&
      (compatOf(cpu.name) || {}).oc !== "0" &&
      !!mb &&
      (compatOf(mb.name) || {}).oc !== "0" &&
      hasUnlock("cpuOC"),
    ocGpu: build.some(p => p.cat === "GPU" && ocOf(p.name)) && hasUnlock("gpuOC"),
  };
};
// estimated 3DMark score of a build with XMP / overclocking (each part's full potential) as asked
function flipScore(build, o = {}) {
  const cpuP = build.find(p => p.cat === "CPU"),
    mbP = build.find(p => p.cat === "Motherboard"),
    gpus = build.filter(p => p.cat === "GPU"),
    ram = build.filter(p => p.cat === "RAM");
  const cpu = cpuP && benchOf(cpuP.name),
    mb = mbP && benchOf(mbP.name),
    g = gpus[0] && benchOf(gpus[0].name);
  const sticks = ram.map(r => +((compatOf(r.name) || {}).mhz || 0)).filter(Boolean);
  if (!cpu || !mb || !g || !sticks.length) return null;
  const pair = gpus.length > 1 ? pairBench(gpus[0].name, gpus[1].name) : null; // same model, any maker
  let gpuS = pair ? pair.two : g.one;
  if (o.ocGpu) {
    const oc = pair ? pair.ocTwo : g.ocOne;
    // o.gpuShare: how far toward the overclock base the player got (from the clocks they set); else the full potential
    if (oc > gpuS) gpuS = Math.round(gpuS + (o.gpuShare ?? OC_SHARE) * (oc - gpuS));
  }
  const stick = Math.min(...sticks),
    ch = Math.min(sticks.length, cpu.maxCh || 1),
    mhz = o.xmp ? xmpSpeed(stick, mb.steps) : Math.min(cpu.defMem || stick, stick);
  // o.cpuMhz: the clock the player set (multiplier × 100); else its full potential
  const cpuMhz = o.ocCpu && ocReach(cpuP.name) ? Math.max(cpu.mhz, o.cpuMhz || ocReach(cpuP.name)) : cpu.mhz;
  return sysBench(cpuBench({ ...cpu, mhz: cpuMhz }, ch, mhz), gpuS);
}
// the overclock the player says they set on the Profit step (f.ocSet: { mult, core, mem }) as flipScore options –
// nothing set → the suggestion (the full potential)
function flipOcOpts(f, build) {
  const o = {},
    set = f.ocSet || {},
    cpu = build.find(p => p.cat === "CPU"),
    gpu = build.find(p => p.cat === "GPU");
  if (set.mult && cpu) o.cpuMhz = set.mult * 100;
  const d = gpu && ocOf(gpu.name);
  if (d && d.core != null && (set.core || set.mem)) {
    const part = (v, a, b) => (v == null || !(b > a) ? null : Math.min(1.2, Math.max(0, (v - a) / (b - a)))),
      sh = [part(set.core, d.core, d.ocCore), part(set.mem, d.mem, d.ocMem)].filter(x => x != null);
    if (sh.length) o.gpuShare = sh.reduce((t, x) => t + x, 0) / sh.length;
  }
  return o;
}
// the gentlest overclock that gets the estimate just above 10,000 – where the score's price multiplier stops (×3.0),
// so more is only heat and risk. Each part's overclock = its share of the way from stock to its full potential;
// spread over both when that's gentler: the pick has the lowest sum of squared shares (CPU 25 % + GPU 25 % = 0.125
// beats either at 50 % = 0.25 – Mariusz's rule – but a CPU at 50 % isn't added just to save the GPU 1 %), then the
// lower CPU share. XMP on. → { none } (stock is enough), { unreachable, best }, or the settings and the score
const ENOUGH_TARGET = 10000,
  ENOUGH_MARGIN = 100; // the estimate is usually within a few points of the game's – a little room
function flipEnough(b, can) {
  const cpu = b.find(p => p.cat === "CPU"),
    gpu = b.find(p => p.cat === "GPU"),
    want = ENOUGH_TARGET + ENOUGH_MARGIN;
  const stock = flipScore(b, { xmp: true });
  if (stock == null) return null;
  if (stock >= want) return { none: true, score: stock };
  const cd = can.ocCpu && cpu && ocOf(cpu.name),
    cs = cd && ocSettings(cpu.name),
    gd = can.ocGpu && gpu && ocOf(gpu.name),
    gr = gd && gd.core != null && ocReach(gpu.name);
  const cpuSteps = [{ mult: null, share: 0 }];
  if (cs && cs.mhz > cd.mhz)
    for (let m = Math.floor(cd.mhz / 100) + 1; m <= cs.mult; m++)
      cpuSteps.push({ mult: m, share: Math.min(1, (m * 100 - cd.mhz) / (cs.mhz - cd.mhz)) });
  const gpuSteps = [0];
  if (gr) for (let g = 1; g <= 100; g++) gpuSteps.push(g / 100);
  let pick = null,
    best = stock;
  for (const c of cpuSteps)
    for (const g of gpuSteps) {
      const sc = flipScore(b, {
        xmp: true,
        ocCpu: !!c.mult,
        cpuMhz: c.mult ? c.mult * 100 : undefined,
        ocGpu: g > 0,
        gpuShare: g,
      });
      if (sc == null) continue;
      best = Math.max(best, sc);
      if (sc < want) continue;
      const cand = { c, g, sc, cost: c.share * c.share + g * g };
      if (!pick || cand.cost < pick.cost - 1e-9 || (Math.abs(cand.cost - pick.cost) < 1e-9 && c.share < pick.c.share))
        pick = cand;
    }
  if (!pick) return { unreachable: true, best };
  const out = { score: pick.sc, cpuShare: pick.c.share, gpuShare: pick.g };
  if (pick.c.mult) {
    const v = ocSettings(cpu.name, pick.c.mult * 100);
    Object.assign(out, { mult: pick.c.mult, mhz: pick.c.mult * 100, volt: v && v.volt });
  }
  if (pick.g > 0) {
    const core = Math.round(gd.core + pick.g * (gr.core - gd.core)),
      mem = Math.round(gd.mem + pick.g * (gr.mem - gd.mem));
    Object.assign(out, { core, mem, dCore: core - gd.core, dMem: mem - gd.mem });
  }
  return out;
}
// everything the window and the tile show
// builds saved by 0.14.7 and older: identical parts joined from several captures could share one id (ticking or
// deleting one hit all of them) – give every repeat its own id
function flipFixIds(f) {
  const seen = new Set();
  let fixed = 0;
  for (const p of f.parts || []) {
    if (seen.has(p.id)) {
      p.id = flipUid();
      fixed++;
    }
    seen.add(p.id);
  }
  return fixed;
}
function flipState(f) {
  const build = flipBuild(f),
    can = softOk(f, build),
    sum = build.reduce((t, p) => t + (p.broken ? 0 : p.value), 0);
  const broken = f.parts.filter(p => p.broken),
    unfixed = broken.filter(p => !f.changes.some(c => c.old === p.id)); // replaced or taken out
  const newCost = f.changes.filter(c => c.isNew).reduce((t, c) => t + (c.price ?? priceOf(c.name) ?? 0), 0);
  const s = f.soft,
    oco = flipOcOpts(f, build),
    plan = { xmp: true, ocCpu: can.ocCpu, ocGpu: can.ocGpu, ...oco };
  const now = flipScore(build, { xmp: s.xmp, ocCpu: s.ocCpu && can.ocCpu, ocGpu: s.ocGpu && can.ocGpu, ...oco });
  const best = flipScore(build, plan); // after XMP + the overclocks this PC can do
  const start = f.startValue ?? f.parts.reduce((t, p) => t + (p.value ?? 0), 0);
  const score = s.bench && f.score ? f.score : null;
  // still broken: worth what the game shows (broken parts at their low value), no estimate yet
  const value = unfixed.length ? f.parts.reduce((t, p) => t + (p.value ?? 0), 0) : flipValue(sum, s.boot, score);
  // a sale estimate only for a PC that can be sold (complete, nothing broken, everything fits)
  const complete = flipCheck(build).ok,
    estValue = unfixed.length || !complete ? null : flipValue(sum, true, best);
  return {
    build,
    can,
    sum,
    broken,
    unfixed,
    newCost,
    now,
    best,
    start,
    value,
    estValue,
    complete,
    profit: unfixed.length || (!complete && !score) ? null : (score ? value : (estValue ?? value)) - start - newCost,
    scored: !!score,
  };
}
// would these swaps fit the build (no clash with the parts put in)?
function flipFits(build, swaps) {
  const job = { components: build.map(p => ({ cat: p.cat, name: p.name })), swaps: [], objectives: [], tasks: [] }; // planFits adds the swaps
  return planFits(job, swaps);
}
// ---------- a complete PC: what PC Bay needs before the Profit step ----------
const FLIP_NEED = [
  { cat: "Case", min: 1, max: 1 },
  { cat: "Motherboard", min: 1, max: 1 },
  { cat: "CPU", min: 1, max: 1 },
  { cat: "CPU Cooler", min: 1, max: 1, label: "CPU cooling" },
  { cat: "RAM", min: 1, max: 4 },
  { cat: "GPU", min: 1, max: 2 },
  { cat: "PSU", min: 1, max: 1 },
  { cat: "Storage", min: 1, max: 99 },
];
const isCooling = p => p.cat === "CPU Cooler" || (p.cat === "Water Cooling" && wcKind(p) === "CPU Block");
const needCount = (b, n) => b.filter(p => !p.broken && (n.cat === "CPU Cooler" ? isCooling(p) : p.cat === n.cat)).length;
// the build as a job where every part is a planned swap – so every clash is reported (a job hides the customer's own)
const flipJobOf = b => ({
  components: [],
  swaps: b.map((p, i) => ({ id: "sg" + i, cat: p.cat, old: "", new: p.name })),
  objectives: [],
  tasks: [],
});
// what still stops the sale: missing / too many parts, broken ones, clashes, a PSU too weak (overclocked when it can be)
function flipCheck(b) {
  const missing = [],
    extra = [];
  for (const n of FLIP_NEED) {
    const k = needCount(b, n);
    if (k < n.min) missing.push(n.label || n.cat);
    else if (k > n.max) extra.push(`${k} × ${n.label || n.cat} (at most ${n.max})`);
  }
  const broken = b.filter(p => p.broken).map(p => p.name);
  const j = flipJobOf(b),
    issues = [...new Set(compatIssues(j, compatBuild(j)).map(i => `${i.part.name}: ${i.msg}`))];
  const pc = powerCheck(j),
    can = softOk(null, b),
    oc = can.ocCpu || can.ocGpu,
    need = pc && pc.psuW != null ? (oc ? pc.oc : pc.stock) : null;
  const power =
    need != null && need > pc.psuW ? `the PSU has ${pc.psuW} W – the PC needs ~${need} W${oc ? " overclocked" : ""}` : "";
  const bad = missing.length + extra.length + broken.length + issues.length + (power ? 1 : 0);
  return { missing, extra, broken, issues, power, bad, ok: !bad };
}
// ---------- step 3: the build assistant (parts from the inventory) ----------
// a build with some parts put in: items [{inv, old}] – old = a row of `b` it replaces (inv null = the row is taken out)
function flipApplyItems(b, items) {
  const out = b.slice(),
    add = [];
  for (const x of items) {
    const row = x.inv ? { cat: x.inv.cat, name: x.inv.name, value: usedValue(x.inv.name) ?? 0, inv: x.inv } : null;
    const k = x.old ? out.indexOf(x.old) : -1;
    if (k >= 0) out[k] = row;
    else if (row) add.push(row);
  }
  return [...out.filter(Boolean), ...add];
}
const flipSum = b => b.reduce((t, p) => t + (p.broken ? 0 : p.value || 0), 0);
// sale value of a build after XMP + the overclocks it can do, minus what its NEW parts from the inventory cost
function flipEval(b) {
  const can = softOk(null, b),
    score = flipScore(b, { xmp: true, ...can }),
    cost = b.filter(p => p.inv && !p.inv.used).reduce((t, p) => t + (p.inv.price ?? priceOf(p.inv.name) ?? 0), 0);
  return { score, value: flipValue(flipSum(b), true, score), cost, check: flipCheck(b) };
}
const byName = list => {
  const m = new Map();
  for (const i of [...list].sort((a, b) => b.used - a.used)) m.set(i.name, [...(m.get(i.name) || []), i]); // used ones first
  return m;
};
// every sensible change of one kind: a part in place of the current one (or into an empty place), RAM / GPU sets of the
// same stick / card, a CPU + motherboard (+ cooler) when the socket changes, more drives / fans
function flipMoves(b, avail) {
  const moves = [],
    cur = cat => b.filter(p => p.cat === cat),
    lab = cat => CAT_LABEL[cat] || cat;
  const one = cat => (cat === "CPU Cooler" ? b.filter(isCooling) : cur(cat))[0] || null;
  for (const cat of ["Case", "Motherboard", "CPU", "CPU Cooler", "PSU"]) {
    const now = one(cat);
    for (const [name, arr] of byName(avail.filter(i => i.cat === cat)))
      if (!now || name !== now.name || now.broken)
        moves.push({ label: `${now ? "" : "Add "}${lab(cat)}: ${name}`, items: [{ inv: arr[0], old: now }] });
  }
  // a CPU for another socket: with a motherboard for it (and a cooler that fits, if the old one doesn't)
  const mb = one("Motherboard"),
    cpuSock = n => (compatOf(n) || {}).s;
  if (mb)
    for (const [cn, ca] of byName(avail.filter(i => i.cat === "CPU")))
      if (!sockOk(cpuSock(mb.name), cpuSock(cn)))
        for (const [bn, ba] of byName(avail.filter(i => i.cat === "Motherboard" && sockOk(cpuSock(i.name), cpuSock(cn))))) {
          const set = [
            { inv: ca[0], old: one("CPU") },
            { inv: ba[0], old: mb },
          ];
          moves.push({ label: `CPU + motherboard: ${cn} + ${bn}`, items: set });
          for (const [kn, ka] of byName(avail.filter(i => i.cat === "CPU Cooler")))
            moves.push({
              label: `CPU + motherboard + cooler: ${cn} + ${bn} + ${kn}`,
              items: [...set, { inv: ka[0], old: one("CPU Cooler") }],
            });
        }
  // RAM (up to 4) and GPUs (up to 2): k of the same stick / card in place of all now, or more of the one in it
  for (const [cat, max] of [
    ["RAM", 4],
    ["GPU", 2],
  ]) {
    const now = cur(cat);
    for (const [name, arr] of byName(avail.filter(i => i.cat === cat))) {
      for (let k = 1; k <= Math.min(arr.length, max); k++) {
        if (now.length === k && now.every(p => p.name === name && !p.broken)) continue;
        const items = now.map((p, n) => ({ inv: arr[n] || null, old: p })).slice(0, Math.max(k, now.length));
        for (let n = now.length; n < k; n++) items.push({ inv: arr[n], old: null });
        const l = k > 1 ? `${k} × ${name}` : name;
        moves.push({ label: now.length ? `${cat}: ${l}` : `Add ${cat}: ${l}`, items: items.slice(0, Math.max(k, now.length)) });
      }
      // more of the same – a 2nd GPU of the same model from any maker pairs too (gpuPair)
      const more =
        cat === "GPU"
          ? now.length === 1 && !now[0].broken && gpuPair(now[0].name, name)
          : now.every(p => p.name === name && !p.broken);
      if (now.length && now.length < max && more)
        for (let k = 1; k <= Math.min(arr.length, max - now.length); k++)
          moves.push({
            label: cat === "GPU" ? `Second GPU: ${name}` : `${k} more RAM stick${k > 1 ? "s" : ""}: ${name}`,
            items: arr.slice(0, k).map(i => ({ inv: i, old: null })),
          });
    }
  }
  // drives and fans: each one more adds its value (if there is room); a drive in place of a cheaper one when there isn't
  for (const cat of ["Storage", "Case Fan"])
    for (const [name, arr] of byName(avail.filter(i => i.cat === cat))) {
      moves.push({ label: `Add ${lab(cat).replace(/s$/, "")}: ${name}`, items: [{ inv: arr[0], old: null }] });
      const low = cur(cat).sort((a, c) => (a.broken ? -1 : 0) - (c.broken ? -1 : 0) || a.value - c.value)[0];
      if (cat === "Storage" && low && (low.broken || (usedValue(name) || 0) > low.value))
        moves.push({ label: `Storage: ${name} instead of ${low.name}`, items: [{ inv: arr[0], old: low }] });
    }
  return moves;
}
// how good a change is: a step toward a PC that can be sold first, then the profit it adds
function flipTry(b, base, m, avail) {
  let b2 = flipApplyItems(b, m.items),
    e = flipEval(b2);
  // a PSU too weak only because of this change → with the PSU from the inventory that carries it
  if (e.check.power && !base.check.power) {
    const psu = () => b2.find(p => p.cat === "PSU") || null;
    let best = null;
    for (const [, arr] of byName(avail.filter(i => i.cat === "PSU" && !m.items.some(x => x.inv === i)))) {
      const b3 = flipApplyItems(b2, [{ inv: arr[0], old: psu() }]),
        e3 = flipEval(b3);
      if (!e3.check.power && (!best || e3.value - e3.cost > best.e.value - best.e.cost))
        best = { b: b3, e: e3, name: arr[0].name };
    }
    if (best) {
      b2 = best.b;
      e = best.e;
      m = { ...m, label: `${m.label} + PSU: ${best.name}` };
    }
  }
  const gain = e.value - e.cost - (base.value - base.cost);
  return {
    ...m,
    build: b2,
    score: e.score,
    value: e.value,
    cost: e.cost,
    gain,
    check: e.check,
    rank: (base.check.bad - e.check.bad) * 1e5 + gain,
  };
}
// the parts the assistant may suggest: free ones; NEW ones only when the build's "Suggest NEW parts" switch is on (off by
// default – a new part keeps only ⅓ of its price in the sale value)
const flipAvail = (f, b) => {
  const used = new Set(b.filter(p => p.inv).map(p => p.inv.id));
  return flipInventory(f).filter(i => !i.taken && !used.has(i.id) && (f.allowNew || i.used));
};
// single changes on the PC as it is now, best first (each with its score and value)
function flipUpgrades(f) {
  const b = flipState(f).build,
    base = flipEval(b),
    avail = flipAvail(f, b);
  const seen = new Set();
  return flipMoves(b, avail)
    .map(m => flipTry(b, base, m, avail))
    .filter(o => o.rank > 0)
    .sort((a, c) => c.rank - a.rank)
    .filter(o => !seen.has(o.label) && seen.add(o.label))
    .map(o => ({
      ...o,
      replaced: b.filter(r => !o.build.includes(r)).map(r => r.name),
      dScore: o.score != null && base.score != null ? o.score - base.score : null,
      isNew: o.build.some(p => p.inv && !p.inv.used),
    }));
}
// what changes from build a to build b, one line per slot: "GPU: GTX 970 → RTX 2060", "Add Storage: …", "Take out …";
// the same change several times (RAM sticks) on one line ("2 × …")
function flipDiff(a, b) {
  const lab = cat => CAT_LABEL[cat] || cat,
    lines = [];
  const cats = [...new Set([...a, ...b].map(p => p.cat))].sort((x, y) => CATS.indexOf(x) - CATS.indexOf(y));
  for (const cat of cats) {
    const gone = a.filter(p => p.cat === cat && !b.includes(p)),
      came = b.filter(p => p.cat === cat && !a.includes(p)),
      n = Math.max(gone.length, came.length);
    for (let i = 0; i < n; i++) {
      const o = gone[i],
        x = came[i];
      lines.push(
        o && x
          ? { cat, old: o.name, oldBroken: !!o.broken, name: x.name, text: `${lab(cat)}: ${o.name} → ${x.name}` }
          : x
            ? { cat, old: "", name: x.name, text: `Add ${lab(cat)}: ${x.name}` }
            : { cat, old: o.name, oldBroken: !!o.broken, name: "", text: `Take out ${lab(cat)}: ${o.name}` }
      );
    }
  }
  const out = [];
  for (const l of lines) {
    const same = out.find(x => x.cat === l.cat && x.old === l.old && x.name === l.name);
    if (same) same.n++;
    else out.push({ ...l, n: 1 });
  }
  return out.map(l =>
    l.n > 1
      ? {
          ...l,
          text: l.old && l.name ? `${lab(l.cat)}: ${l.n} × ${l.old} → ${l.n} × ${l.name}` : l.text.replace(": ", `: ${l.n} × `),
        }
      : l
  );
}
// the best build from the inventory: the best change, again and again, until nothing helps (most profitable PC that sells)
function flipPlan(f) {
  let b = flipState(f).build,
    base = flipEval(b);
  const start = base,
    b0 = b,
    steps = [];
  for (let n = 0; n < 16; n++) {
    const avail = flipAvail(f, b),
      tries = flipMoves(b, avail)
        .map(m => flipTry(b, base, m, avail))
        .filter(o => o.rank > 0.5);
    if (!tries.length) break;
    const best = tries.sort((a, c) => c.rank - a.rank)[0];
    steps.push({ label: best.label, gain: best.gain, score: best.score });
    b = best.build;
    base = flipEval(b);
  }
  // the steps can undo each other (a Vega 56, later an RTX 2060 in its place): look at the end result only. Every part
  // the plan put in goes back to the PC's own part of that kind if that's as good (still works, profit not lower)
  const prof = e => e.value - e.cost;
  for (let again = true, n = 0; again && n < 8; n++) {
    again = false;
    for (const r of b.filter(x => x.inv && !b0.includes(x))) {
      const back = b0.find(o => o.cat === r.cat && !b.includes(o));
      if (!back) continue;
      const b2 = b.map(x => (x === r ? back : x)),
        e2 = flipEval(b2);
      if (e2.check.bad <= base.check.bad && prof(e2) >= prof(base)) {
        b = b2;
        base = e2;
        again = true;
        break;
      }
    }
  }
  return {
    steps,
    changes: flipDiff(b0, b),
    build: b,
    score: base.score,
    value: base.value,
    cost: base.cost,
    gain: base.value - base.cost - (start.value - start.cost),
    check: base.check,
  };
}
// put a planned build into the real one: the parts that differ become changes (in place of a part of the same type)
function flipApply(f, target) {
  const key = r => (r.changed ? "c:" + r.changed : r.partId ? "p:" + r.partId : null);
  const keep = new Set(target.map(key).filter(Boolean)),
    gone = [];
  for (const r of flipBuild(f))
    if (!keep.has(key(r))) {
      if (r.changed) {
        const c = f.changes.find(x => x.id === r.changed);
        f.changes = f.changes.filter(x => x.id !== r.changed);
        if (c && c.old) gone.push(f.parts.find(p => p.id === c.old));
        flipReset(f, r.cat);
      } else gone.push(f.parts.find(p => p.id === r.partId));
    }
  for (const r of target.filter(x => x.inv)) {
    const k = gone.findIndex(p => p && p.cat === r.cat),
      old = k >= 0 ? gone.splice(k, 1)[0] : null;
    flipChange(f, {
      kind: old && old.broken ? "fix" : "hw",
      old: old ? old.id : "",
      oldName: old ? old.name : "",
      cat: r.cat,
      name: r.name,
      invId: r.inv.id,
      isNew: !r.inv.used,
      price: r.inv.used ? null : (r.inv.price ?? priceOf(r.name)),
    });
  }
  for (const p of gone.filter(Boolean)) flipChange(f, { kind: "rm", old: p.id, cat: p.cat, name: p.name });
}
// take one part out of the build (a row of flipBuild)
function flipRemove(f, r) {
  flipApply(
    f,
    flipBuild(f).filter(x => !(x.cat === r.cat && x.name === r.name && (x.changed || x.partId) === (r.changed || r.partId)))
  );
}
// gentle notes for step 3
function flipNotes(f) {
  const st = flipState(f),
    b = st.build,
    n = [];
  const cpu = b.find(p => p.cat === "CPU"),
    ram = b.filter(p => p.cat === "RAM"),
    gpus = b.filter(p => p.cat === "GPU"),
    cpuB = cpu && benchOf(cpu.name);
  // at 10,000 the score's price multiplier is at its maximum (×3.0) – the parts' value still counts
  const high = st.best != null && st.best >= 10000;
  if (ram.length === 1 && (cpuB?.maxCh || 2) > 1)
    n.push(
      high
        ? "Only one RAM stick – a second one adds its value to the price (the score is already high enough)."
        : "Only one RAM stick – a second one (dual channel) raises the 3DMark score, and so the price."
    );
  if (gpus.length === 2 && !gpuPair(gpus[0].name, gpus[1].name))
    n.push(
      "These 2 graphics cards are different models, so they don't pair – the second one adds its value to the price, but nothing to the 3DMark score."
    );
  if (!high && cpu && ((compatOf(cpu.name) || {}).oc === "0" || !ocOf(cpu.name)))
    n.push(`${cpu.name} is locked – an unlocked CPU could be overclocked: a higher score sells for more.`);
  else if (!high && cpu && !st.can.ocCpu && hasUnlock("cpuOC"))
    n.push("The motherboard can't overclock – the CPU stays at its stock speed.");
  if (high)
    n.push(
      "The score already reaches 10,000 – the price multiplier is at its maximum (×3.0); more or better parts still raise the price through their value."
    );
  return n;
}
// ---------- changes (keep the step-4 ticks honest: a new CPU drops the CPU overclock, a new board drops everything…) ----------
function flipChange(f, c) {
  f.changes = f.changes.filter(x => !(x.old && x.old === c.old && x.kind === c.kind));
  f.changes.push({ id: flipUid(), ...c });
  flipReset(f, c.cat);
}
function flipUnchange(f, id) {
  const c = f.changes.find(x => x.id === id);
  f.changes = f.changes.filter(x => x.id !== id);
  if (c) flipReset(f, c.cat);
}
function flipReset(f, cat) {
  const s = f.soft;
  if (cat === "CPU") s.ocCpu = false;
  if (cat === "GPU") s.ocGpu = false;
  if (cat === "RAM") s.xmp = false;
  if (cat === "Motherboard") {
    s.xmp = s.ocCpu = s.ocGpu = false;
  }
  s.bench = false;
  f.score = null;
}
if (typeof module !== "undefined")
  module.exports = {
    parseResale,
    parseInventoryColumn,
    cardLabels,
    benchMult,
    flipValue,
    usedValue,
    newFlip,
    flipState,
    flipBuild,
    flipUpgrades,
    flipPlan,
    flipOcOpts,
    flipApply,
    flipRemove,
    flipCheck,
    flipNotes,
    flipChange,
    flipUnchange,
    markBroken,
    flipFixIds,
    flipDiff,
    flipEnough,
    brokenWhy,
    flipScore,
  };
