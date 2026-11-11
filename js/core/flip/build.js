/* 📦 PC Bay build – a broken PC bought on PC Bay: fix it, improve it, XMP / overclock, run 3DMark, sell.
   Lives in the jobs list (kind: "flip") so it can sit on T1–T3 or in Open jobs; the window is in js/ui/flipui.js.
   Files (js/core/flip/): build.js the build + its state, read.js reading the screenshots, assist.js the build assistant.
   Resale value (community formula; matches the game: $441 broken → $591 booted → $949 at 4,288 points):
     value = sum of used part values × multiplier + $100 once the PC has booted to the OS
     multiplier = 1.0× at a 3DMark score of 1,000 or less, rising evenly to 3.0× at 10,000 (no more above)
   Used part value = the workbook's sell price = ⅓ of the shop price (rounded). A broken part shows ~10 % of it. */
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
