// Suggestions for a 3DMark score objective: small sets of parts, a new platform, or a PC built from nothing.
const BENCH_LABEL = {
  RAM: "More RAM sticks (more channels)",
  GPU: "New GPU",
  "GPU + RAM": "New GPU + RAM sticks",
  "2 GPUs": "Two new GPUs",
  "2 GPUs + RAM": "Two new GPUs + RAM sticks",
  "2nd GPU": "Second GPU (same card)",
  "2nd GPU + RAM": "Second GPU + RAM sticks",
  CPU: "New CPU",
  "CPU + RAM": "New CPU + RAM sticks",
  "CPU + GPU": "New CPU + GPU",
  "CPU + GPU + RAM": "New CPU + GPU + RAM sticks",
  "Motherboard + CPU": "New motherboard + CPU",
  "Motherboard + CPU + RAM": "New motherboard + CPU + RAM sticks",
  OC: "Overclock – no new parts",
};
const XMP_TASK = "Turn on XMP in the BIOS (RAM settings) – needed for the 3DMark score";
function benchSuggestions(job, ctx) {
  const target = benchTarget(job);
  if (!target) return [];
  if (ctx.picked && ctx.picked.length)
    job = { ...job, swaps: [...(job.swaps || []), ...ctx.picked.map((x, i) => ({ id: "pk" + i, ...x }))] }; // ticked in the new-job window
  const build = plannedBuild(job),
    now = benchScore(build),
    n = x => x.toLocaleString();
  const reason = `3DMark score of ${n(target)}`;
  const newBuild = !(job.components || []).length;
  if (now.missing.length && !newBuild)
    return [
      { key: "bench", reason, options: [], hint: `capture PC Stats to get a suggestion (needs ${now.missing.join(", ")})` },
    ];
  if (!now.missing.length && now.off >= target) return [];
  const why = now.missing.length ? `${reason} – new build` : `${reason} – now ${n(now.off)} (XMP off) / ${n(now.on)} (XMP on)`;
  const set = (label, tag, swaps, sc, extras = []) => {
    const parts = swaps.reduce((t, s) => t + (s.price || 0), 0),
      total = parts + extras.reduce((t, e) => t + (e.price || 0), 0);
    return {
      multi: true,
      name: label,
      cat: "3DMark",
      tag,
      swaps,
      extras,
      tasks: sc.off >= target ? [] : [XMP_TASK],
      score: sc.off >= target ? sc.off : sc.on,
      xmp: sc.off < target,
      total,
      price: total,
      count: 1,
      lvl: Math.max(0, ...swaps.map(s => s.lvl || 0)),
      over: !priceOk({ price: total }, ctx.left),
      nParts: swaps.length + extras.filter(e => e.name).length,
    };
  };
  if (now.missing.length) return newBuildBench(job, ctx, target, build, why, set);
  if (now.on >= target)
    return [{ key: "bench", reason: why, cat: "3DMark", options: [set("Turn on XMP – no new parts", "free", [], now)] }];

  // what can change: parts an objective asks for stay
  const locked = new Set(
    compatBuild(job)
      .filter(p => p.req)
      .map(p => p.cat)
  );
  if (cpuIsFixed(job)) locked.add("CPU"); // "Overclock CPU": the customer's CPU stays
  for (const c of ctx.pinned || []) locked.add(c); // combined set: parts an earlier step picked for an objective stay
  const cur = c => build.filter(p => p.cat === c),
    cpu0 = cur("CPU")[0],
    mb0 = cur("Motherboard")[0],
    gpus0 = cur("GPU"),
    ram0 = cur("RAM");
  const mbB = benchOf(mb0.name),
    cpuB = benchOf(cpu0.name),
    stick = Math.min(...ram0.map(r => +(cInfo(r).mhz || 0)).filter(Boolean)),
    sticks = ram0.length;
  const pair0 = gpus0.length > 1 ? pairBench(gpus0[0].name, gpus0[1].name) : null,
    nG = pair0 ? 2 : 1;
  const score = (c, steps, gpu, k) => {
    // c: CPU factors, steps: board RAM steps, gpu: graphics score, k: RAM sticks
    const ch = Math.min(k, c.maxCh || 1),
      off = sysBench(cpuBench(c, ch, Math.min(c.defMem || stick, stick)), gpu),
      on = sysBench(cpuBench(c, ch, xmpSpeed(stick, steps)), gpu);
    return { off, on };
  };
  const sw = (p, old) => ({ cat: p.cat, old: old || "", new: p.name, price: p.price, lvl: p.lvl });
  const withB = (cat, f) =>
    shopParts(cat)
      .map(p => ({ p, b: benchOf(p.name) }))
      .filter(x => x.b && (!f || f(x.p, x.b)));
  // RAM: fill the free channels with the same stick (or the cheapest one like it)
  let ramFill = null;
  if (!locked.has("RAM") && sticks < (cpuB.maxCh || 1)) {
    const r0 = ram0[0],
      same =
        shopParts("RAM").filter(sameAs(r0.name))[0] ||
        shopParts("RAM")
          .filter(p => +cInfo(p).mhz === stick && +cInfo(p).gb === +cInfo(r0).gb)
          .sort((a, b) => a.price - b.price)[0];
    if (same) ramFill = { k: (cpuB.maxCh || 1) - sticks, p: same };
  }
  // …and with the favourite brand's stick (a brand that makes RAM): same size, same speed or faster
  const favRam = ctx.brands.find(b => shopParts("RAM").some(p => brandMatch(p, b)));
  let ramFav = null;
  if (ramFill && favRam && !brandMatch(ramFill.p, favRam)) {
    const r0 = ram0[0],
      p = shopParts("RAM")
        .filter(x => brandMatch(x, favRam) && +cInfo(x).gb === +cInfo(r0).gb && +cInfo(x).mhz >= stick)
        .sort((a, b) => a.price - b.price)[0];
    if (p) ramFav = { k: ramFill.k, p };
  }
  const fillSw = (f = ramFill) => (f ? Array.from({ length: f.k }, () => sw(f.p)) : []);
  // one search; S = null: parts at stock clocks, or { share }: every part that can overclock at that share of its
  // overclock potential (0.15.2)
  const search = S => {
    const cpuF = (b, name, mbName) => (S && canOcCpu(name, mbName) ? { ...b, mhz: ocCpuMhz(name, S.share) } : b),
      gpuF = (stock, oc) => (S && hasUnlock("gpuOC") && oc ? Math.round(stock + S.share * Math.max(0, oc - stock)) : stock),
      cpu0F = cpuF(cpuB, cpu0.name, mb0.name);
    // what to set in the game – one task on the option
    const ocSet = (o, swaps) => {
      const pick = (cat, n0) => swaps.find(x => x.cat === cat)?.new || n0,
        cpu = pick("CPU", cpu0.name),
        gpu = pick("GPU", gpus0[0].name),
        bits = [];
      if (canOcCpu(cpu, pick("Motherboard", mb0.name))) {
        const mhz = ocCpuMhz(cpu, S.share);
        bits.push(`CPU to ${mhz.toLocaleString()} MHz (×${mhz / 100})`);
      }
      const d = hasUnlock("gpuOC") && ocOf(gpu);
      if (d && d.ocCore)
        bits.push(
          `GPU${swaps.filter(x => x.cat === "GPU").length > 1 || nG === 2 ? "s" : ""} core +${ocEst(0, d.ocCore - d.core, S.share)} / memory +${ocEst(0, d.ocMem - d.mem, S.share)} MHz`
        );
      const how =
        S.share >= 1
          ? "its full overclock potential – the only way, needs good cooling"
          : `~${Math.round(S.share * 100)} % of the overclock potential`;
      o.tasks = [...o.tasks, `Overclock for the 3DMark score (${how}): ${bits.join(", ")}`];
      o.oc = S.share;
    };
    const cands = []; // { type, swaps, sc, cost }
    const push = (type, swaps, sc) => {
      if (sc.on >= target) cands.push({ type, swaps, sc, cost: swaps.reduce((t, s) => t + s.price, 0) });
    };
    const both = (type, swaps, c, steps, gpu) => {
      // without and with the RAM channels filled
      push(type, swaps, score(c, steps, gpu, sticks));
      if (ramFill) push(type + " + RAM", [...swaps, ...fillSw()], score(c, steps, gpu, sticks + ramFill.k));
      if (ramFav) push(type + " + RAM", [...swaps, ...fillSw(ramFav)], score(c, steps, gpu, sticks + ramFav.k));
    };
    const g0b = benchOf(gpus0[0].name),
      gNow = pair0 ? gpuF(pair0.two, pair0.ocTwo) : gpuF(g0b.one, g0b.ocOne);
    if (S) push("OC", [], score(cpu0F, mbB.steps, gNow, sticks)); // overclocking alone
    if (ramFill) push("RAM", fillSw(), score(cpu0F, mbB.steps, gNow, sticks + ramFill.k));
    if (ramFav) push("RAM", fillSw(ramFav), score(cpu0F, mbB.steps, gNow, sticks + ramFav.k));
    const gpusNew = locked.has("GPU") ? [] : withB("GPU");
    const gpuSw = g => (nG === 2 ? [sw(g, gpus0[0].name), sw(g, gpus0[1].name)] : [sw(g, gpus0[0].name)]);
    for (const { p: g, b } of gpusNew) {
      both("GPU", gpuSw(g), cpu0F, mbB.steps, nG === 2 ? gpuF(b.two, b.ocTwo) : gpuF(b.one, b.ocOne));
      // (two cards that don't pair: both are replaced – never a 3rd card)
      if (nG === 1 && b.two && cInfo(g).m)
        both("2 GPUs", [sw(g, gpus0[0].name), sw(g, gpus0[1] ? gpus0[1].name : "")], cpu0F, mbB.steps, gpuF(b.two, b.ocTwo));
    }
    if (gpus0.length === 1 && !locked.has("GPU") && benchOf(gpus0[0].name).two && cInfo(gpus0[0]).m) {
      // the cheapest card of the same model (any maker – they pair in the game)
      const same = shopParts("GPU")
        .filter(p => pairBench(gpus0[0].name, p.name))
        .sort((a, b) => a.price - b.price)[0];
      if (same) {
        const pb = pairBench(gpus0[0].name, same.name);
        both("2nd GPU", [sw(same)], cpu0F, mbB.steps, gpuF(pb.two, pb.ocTwo));
      }
    }
    const cpus = locked.has("CPU") ? [] : withB("CPU");
    for (const { p: c, b } of cpus)
      if (sockOk(cInfo(mb0).s, cInfo(c).s)) {
        both("CPU", [sw(c, cpu0.name)], cpuF(b, c.name, mb0.name), mbB.steps, gNow);
        for (const { p: g, b: gb } of gpusNew)
          both(
            "CPU + GPU",
            [sw(c, cpu0.name), ...gpuSw(g)],
            cpuF(b, c.name, mb0.name),
            mbB.steps,
            nG === 2 ? gpuF(gb.two, gb.ocTwo) : gpuF(gb.one, gb.ocOne)
          );
      }
    if (!locked.has("CPU") && !locked.has("Motherboard"))
      for (const { p: m, b: mbN } of withB("Motherboard").filter(x => !needMulti(job) || multiOk(x.p)))
        for (const { p: c, b } of cpus)
          if (sockOk(cInfo(m).s, cInfo(c).s))
            both("Motherboard + CPU", [sw(m, mb0.name), sw(c, cpu0.name)], cpuF(b, c.name, m.name), mbN.steps, gNow);
    cands.sort((a, b) => a.cost - b.cost || b.sc.on - a.sc.on);
    // cheapest that fits (+ the PSU it needs) for each kind of change; inside the budget when possible
    const best = new Map(),
      brandBest = { o: null };
    let checks = 0;
    // a brand set: every new part in a category the brand makes is the brand's (and there is at least one such part) –
    // a RAM-only set with another maker's stick is not (it was tagged ★ before 0.14.8)
    const makes = new Map(),
      brandMakes = cat => {
        if (!makes.has(cat))
          makes.set(
            cat,
            shopParts(cat).some(p => ctx.brands.some(b => brandMatch(p, b)))
          );
        return makes.get(cat);
      };
    const isBrand = c => {
      if (!ctx.brands.length) return false;
      const rel = c.swaps.filter(s => brandMakes(s.cat));
      return (
        rel.length > 0 &&
        rel.every(s => {
          const ix = ixByName(s.new);
          return ix && ctx.brands.some(b => brandMatch(ix, b));
        })
      );
    };
    for (const c of cands) {
      const have = best.get(c.type);
      if (have && !have.over && (!isBrand(c) || brandBest.o)) continue;
      if (++checks > 400) break;
      if (!planFits(job, c.swaps)) continue;
      const psu = psuFor(
        job,
        c.swaps.map(({ cat, old, new: nw }) => ({ cat, old, new: nw })),
        !!S
      );
      if (psu && !psu.name) continue;
      const o = set(BENCH_LABEL[c.type] || c.type, "", c.swaps, c.sc, psu ? [psu] : []);
      if (S) ocSet(o, c.swaps);
      if (isBrand(c) && !brandBest.o && !o.over) brandBest.o = o;
      if (!have || (have.over && !o.over)) best.set(c.type, o);
      if ([...best.values()].filter(x => !x.over).length >= 5 && brandBest.o) break;
    }
    let options = [...best.values()].sort((a, b) => a.over - b.over || a.total - b.total);
    // a set that only adds parts to a cheaper set already shown is no real choice ("2nd GPU + RAM" after "2nd GPU")
    const key = o => o.swaps.map(x => x.cat + ">" + x.new);
    options = options.filter(
      o =>
        !options.some(
          x => x !== o && x.total <= o.total && !x.over && key(x).length < key(o).length && key(x).every(k => key(o).includes(k))
        )
    );
    options = options.filter((o, i) => !o.over || !options.some(x => !x.over)).slice(0, 4);
    options.forEach((o, i) => (o.tag = i === 0 ? "cheapest" : ""));
    const ocTag = S ? (S.share >= 1 ? "full overclock" : `overclocked ~${Math.round(S.share * 100)} %`) : "";
    if (S) options.forEach(o => (o.tag = [ocTag, o.tag].filter(Boolean).join(" · ")));
    if (brandBest.o && !options.some(o => o.swaps.map(s => s.new).join() === brandBest.o.swaps.map(s => s.new).join())) {
      brandBest.o.tag = `★ ${ctx.brands[0]}`;
      options.push(brandBest.o);
    } else if (brandBest.o) {
      const o = options.find(o => o.swaps.map(s => s.new).join() === brandBest.o.swaps.map(s => s.new).join());
      o.tag = (o.tag ? o.tag + " · " : "") + `★ ${ctx.brands[0]}`;
    }
    return options;
  };
  let options = search(null);
  // no small set reaches it: a new platform (0.15.2) – the game never asks for a score that can't be reached
  if (!options.length) options = platformBench(job, ctx, target, why, set, locked);
  // overclocking (Mariusz 2026-11-11) only when an objective asks for an overclock, when no set reaches the score at
  // stock clocks, or when every set that does is over the budget – then cheaper sets overclocked to ~60 % of the
  // potential (the full potential is hard to reach); the full potential only when nothing else does it
  const stuck = !options.length || options.every(o => o.over);
  if ((stuck || ocTargets(job).length) && (hasUnlock("cpuOC") || hasUnlock("gpuOC"))) {
    const cheapest = options.length ? Math.min(...options.map(o => o.total)) : Infinity,
      cheaper = list => list.filter(o => o.total < cheapest && (!options.length || !o.over));
    let oc = cheaper(search({ share: OC_SAFE }));
    if (!oc.length && stuck) oc = cheaper(search({ share: 1 }));
    if (oc.length)
      options = [...oc.slice(0, 2), ...options.map(o => ({ ...o, tag: o.tag.replace(/\bcheapest\b/, "no overclock") }))].slice(
        0,
        4
      );
  }
  return [{ key: "bench", reason: why, cat: "3DMark", options, hint: options.length ? "" : BENCH_REPORT }];
}
// 3DMark sets that need an overclock: this share of each part's overclock potential (Mariusz 2026-11-11: 50–75 % seems
// safe, the full potential is hard to reach)
const OC_SAFE = 0.6;
const canOcCpu = (cpu, board) =>
  hasUnlock("cpuOC") && (compatOf(cpu) || {}).oc === "1" && (compatOf(board) || {}).oc === "1" && !!ocOf(cpu)?.ocMhz;
const ocCpuMhz = (cpu, share) => {
  const d = ocOf(cpu);
  return Math.floor(ocEst(d.mhz, d.ocMhz, share) / 100) * 100; // the multiplier on the 100 MHz base clock
};
// the search found nothing – an app bug by the game's rule (every 3DMark objective can be reached at the job's level)
const BENCH_REPORT = "Couldn't find a set that reaches this score – please report this job.";
// 3DMark, when no small set reaches the score: a whole new platform – motherboard + CPU, with the GPU(s) and RAM when
// they may change (parts an objective or an earlier step of the one-tick set picked stay, e.g. the RAM of "Upgrade to
// 128 GB"). The search is the one for a PC built from nothing, on the PC without those parts; the PSU and CPU cooler
// are only replaced when the old ones can't carry / don't fit the new parts.
function platformBench(job, ctx, target, why, set, locked) {
  if (locked.has("CPU") || locked.has("Motherboard")) return [];
  const olds = c =>
    plannedBuild(job)
      .filter(p => p.cat === c)
      .map(p => p.name);
  // the RAM sticks stay when the score can be reached with them (no worse sticks), else they may change too
  for (const ram of locked.has("RAM") ? [false] : [false, true]) {
    const free = ["CPU", "Motherboard", "GPU", "CPU Cooler", "PSU", ...(ram ? ["RAM"] : [])].filter(c => !locked.has(c));
    const bare = {
      ...job,
      components: (job.components || []).filter(p => !free.includes(p.cat)),
      swaps: (job.swaps || []).filter(s => !free.includes(s.cat)),
    };
    const keep = Object.fromEntries(["PSU", "CPU Cooler"].filter(c => free.includes(c)).map(c => [c, olds(c)[0]]));
    const res = newBuildBench(bare, { ...ctx, objCats: new Set() }, target, plannedBuild(bare), why, set, { keep });
    const out = [];
    for (const o of res[0]?.options || []) {
      const q = Object.fromEntries(free.map(c => [c, olds(c)])),
        old = cat => (q[cat] || []).shift() || "";
      const swaps = o.swaps.map(s => ({ ...s, old: old(s.cat) })).filter(s => s.old !== s.new), // a part that stays: no swap
        extras = o.extras.map(e => ({ ...e, old: old(e.cat) }));
      if (q.GPU?.length) continue; // fewer GPUs than now: the old card would stay in the PC
      const total = [...swaps, ...extras].reduce((t, x) => t + (x.price || 0), 0);
      out.push({
        ...o,
        name:
          "New platform for the score: " +
          [...new Set(swaps.map(s => (s.cat === "Motherboard" ? "motherboard" : s.cat)))].join(" + "),
        swaps,
        extras,
        removeOld: q.RAM || [],
        total,
        price: total,
        over: !priceOk({ price: total }, ctx.left),
        nParts: swaps.length + extras.length,
      });
    }
    if (!out.length) continue;
    // story job (the budget only counts when an objective mentions it): going over the budget is fine – said on the option
    const loose = job.story && !budgetInObjectives(jobObjectives(job));
    out.sort((a, b) => a.over - b.over || a.total - b.total);
    out.forEach(
      (o, i) =>
        (o.tag = [i === 0 ? "cheapest" : o.tag, o.over && loose ? "over the budget – story job, the budget doesn't count" : ""]
          .filter(Boolean)
          .join(" · "))
    );
    return out.slice(0, 4);
  }
  return [];
}
// 3DMark for a PC built from nothing: the cheapest CPU + motherboard + RAM (+ GPU) that reach the score – parts already
// planned (an objective's GPU, RAM…) stay – plus the PSU and CPU cooler it needs to run. Search: per category only the
// parts that are the best for their price (a dearer part must score higher), then every mix of them.
function newBuildBench(job, ctx, target, build, why, set, { keep = {} } = {}) {
  const have = c => build.filter(p => p.cat === c),
    WANT = ["GPU", "CPU", "Motherboard", "RAM"];
  const wait = WANT.filter(c => !have(c).length && ctx.objCats && ctx.objCats.has(c));
  if (wait.length)
    return [
      {
        key: "bench",
        reason: why,
        options: [],
        hint: `pick the ${wait.join(" and ")} for its objective first – the 3DMark set is built around it`,
      },
    ];
  const sw = p => ({ cat: p.cat, old: "", new: p.name, price: p.price, lvl: p.lvl });
  const withB = cat =>
    shopParts(cat)
      .map(p => ({ p, b: benchOf(p.name) }))
      .filter(x => x.b);
  const pareto = (list, val) => {
    const out = [];
    let top = -Infinity;
    for (const x of [...list].sort((a, b) => a.p.price - b.p.price || val(b) - val(a)))
      if (val(x) > top) {
        out.push(x);
        top = val(x);
      }
    return out;
  };
  // GPU
  const g0 = have("GPU"),
    g0b = g0.length && benchOf(g0[0].name);
  if (g0.length && !g0b) return [{ key: "bench", reason: why, options: [], hint: `no 3DMark data for ${g0[0].name}` }];
  // one card, or two of the same (SLI / CrossFire) – each list cheapest first, a dearer entry always scores higher
  const gpuLists = g0.length
    ? [[{ p: null, g: (g0.length > 1 && pairBench(g0[0].name, g0[1].name)?.two) || g0b.one, k: 0, cost: 0 }]]
    : [
        pareto(withB("GPU"), x => x.b.one).map(x => ({ p: x.p, g: x.b.one, k: 1, cost: x.p.price })),
        pareto(
          withB("GPU")
            .filter(x => x.b.two && cInfo(x.p).m)
            .map(x => ({ ...x, p: { ...x.p, price: x.p.price * 2 }, one: x.p })),
          x => x.b.two
        ).map(x => ({ p: x.one, g: x.b.two, k: 2, cost: x.one.price * 2 })),
      ];
  // "Install dual graphics cards": only pairs (two of the same card, SLI / CrossFire)
  if (!g0.length && jobObjectives(job).some(o => DUAL_RE.test(o))) gpuLists.splice(0, 1);
  const gpus = gpuLists.flat();
  // CPU
  const c0 = have("CPU")[0],
    c0b = c0 && benchOf(c0.name);
  const cpus = c0
    ? c0b
      ? [{ p: null, b: c0b, s: cInfo(c0).s }]
      : []
    : pareto(withB("CPU"), x => cpuBench(x.b, x.b.maxCh || 1, x.b.defMem || 2133)).map(x => ({ ...x, s: cInfo(x.p).s }));
  // motherboards: per socket, the cheapest for each top RAM speed
  const m0 = have("Motherboard")[0],
    m0b = m0 && benchOf(m0.name);
  const boards = m0
    ? m0b
      ? [{ p: null, b: m0b, s: cInfo(m0).s, slots: +(cInfo(m0).ram || 4) }]
      : []
    : Object.values(
        withB("Motherboard")
          .filter(x => !needMulti(job) || multiOk(x.p)) // "Support for double GPU": SLI / CrossFire boards only
          .reduce((g, x) => {
            (g[cInfo(x.p).s] = g[cInfo(x.p).s] || []).push(x);
            return g;
          }, {})
      )
        .flatMap(list => pareto(list, x => Math.max(...x.b.steps)))
        .map(x => ({ ...x, s: cInfo(x.p).s, slots: +(cInfo(x.p).ram || 4) }));
  // RAM: the sticks already planned, or k sticks – for each k the cheapest per speed
  const r0 = have("RAM"),
    rams = r0.length
      ? [{ k: r0.length, mhz: Math.min(...r0.map(r => +(cInfo(r).mhz || 0))), p: null, cost: 0 }]
      : [1, 2, 4].flatMap(k =>
          pareto(
            shopParts("RAM")
              .map(p => ({ p, mhz: +cInfo(p).mhz }))
              .filter(x => x.mhz),
            x => x.mhz
          ).map(x => ({ k, mhz: x.mhz, p: x.p, cost: x.p.price * k }))
        );
  if (!gpus.length || !cpus.length || !boards.length || !rams.length)
    return [{ key: "bench", reason: why, options: [], hint: "no unlocked parts with 3DMark data for this build" }];
  const cands = [];
  for (const c of cpus)
    for (const m of boards)
      if (sockOk(m.s, c.s))
        for (const r of rams)
          if (r.k <= m.slots) {
            const ch = Math.min(r.k, c.b.maxCh || 1),
              cOff = cpuBench(c.b, ch, Math.min(c.b.defMem || r.mhz, r.mhz)),
              cOn = cpuBench(c.b, ch, xmpSpeed(r.mhz, m.b.steps));
            // for each GPU list: the cheapest card(s) that reach the score with XMP on, and with XMP off
            const need = cs => {
              const d = 1 / target - 0.15 / cs;
              return d > 0 ? 0.85 / d : Infinity;
            };
            for (const list of gpuLists)
              for (const cs of new Set([cOn, cOff])) {
                const g = list.find(
                  x => x.g >= need(cs) - 1 && sysBench(cs, x.g) >= target && (x.k < 2 || !x.p || takesPair(m.p || m0, x.p))
                );
                if (!g) continue;
                const sc = { off: sysBench(cOff, g.g), on: sysBench(cOn, g.g) };
                const swaps = [
                  c.p && sw(c.p),
                  m.p && sw(m.p),
                  ...(r.p ? Array.from({ length: r.k }, () => sw(r.p)) : []),
                  ...(g.p ? Array.from({ length: g.k }, () => sw(g.p)) : []),
                ].filter(Boolean);
                cands.push({ swaps, sc, cost: swaps.reduce((t, s) => t + s.price, 0), nG: g.k });
              }
          }
  cands.sort((a, b) => a.cost - b.cost || b.sc.on - a.sc.on);
  // what it still needs to run: a PSU that carries it and a CPU cooler that fits (cheapest)
  const cheap = {},
    cheapFirst = cat => cheap[cat] || (cheap[cat] = shopParts(cat).sort((a, b) => a.price - b.price)); // fit checks are slow: cheapest first, stop at the first that fits
  const runParts = swaps => {
    const extras = [],
      j2 = withSwaps(job, swaps),
      b2 = plannedBuild(j2),
      w = name => (powerOf(name) || {}).w || 0;
    if (!have("PSU").length) {
      const need = POWER_OTHER + b2.filter(p => p.cat === "CPU" || p.cat === "GPU").reduce((t, p) => t + w(p.name), 0);
      // a new platform (platformBench): the old PSU stays when it carries the new parts and fits
      const own = keep.PSU && { name: keep.PSU, cat: "PSU" };
      if (!own || w(own.name) < need || !fitsBuild(j2, own, "")) {
        const psu = cheapFirst("PSU").find(p => w(p.name) >= need && fitsBuild(j2, p, ""));
        if (!psu) return null;
        extras.push({ cat: "PSU", old: "", name: psu.name, price: psu.price, why: `PSU for ~${need} W` });
      }
    }
    // a CPU block (custom water cooling) cools the CPU just as well as a cooler does
    if (!have("CPU Cooler").length && !build.some(p => p.cat === "Water Cooling" && wcKind(p) === "CPU Block")) {
      const j3 = withSwaps(job, [...swaps, ...extras.map(e => ({ cat: e.cat, old: "", new: e.name }))]),
        own = keep["CPU Cooler"] && { name: keep["CPU Cooler"], cat: "CPU Cooler" };
      if (!own || !fitsBuild(j3, own, "")) {
        const cool = cheapFirst("CPU Cooler").find(p => fitsBuild(j3, p, ""));
        if (!cool) return null;
        extras.push({
          cat: "CPU Cooler",
          old: "",
          name: cool.name,
          price: cool.price,
          why: own ? "CPU cooler for the new socket" : "CPU cooler",
        });
      }
    }
    // a drive to boot from – the cheapest that fits, unless an objective picks it
    if (!have("Storage").length && !(ctx.objCats && ctx.objCats.has("Storage"))) {
      const j4 = withSwaps(job, [...swaps, ...extras.map(e => ({ cat: e.cat, old: "", new: e.name }))]);
      const drive = cheapFirst("Storage").find(p => fitsBuild(j4, p, ""));
      if (drive) extras.push({ cat: "Storage", old: "", name: drive.name, price: drive.price, why: "drive for the OS" });
    }
    // a case it all fits in – the cheapest; with a lights objective one with fan places for the RGB fans still needed
    if (!have("Case").length && !(ctx.objCats && ctx.objCats.has("Case"))) {
      const j5 = withSwaps(job, [...swaps, ...extras.map(e => ({ cat: e.cat, old: "", new: e.name }))]),
        lit = plannedBuild(j5).filter(isRGB).length,
        fanNeed = Math.max(0, lightsWanted(job) - lit),
        places = p => +(cInfo(p).r120 || 0) + +(cInfo(p).r140 || 0),
        fits = p => fitsBuild(j5, p, "");
      const cs = (fanNeed && cheapFirst("Case").find(p => places(p) >= fanNeed && fits(p))) || cheapFirst("Case").find(fits);
      if (!cs) return null;
      extras.push({
        cat: "Case",
        old: "",
        name: cs.name,
        price: cs.price,
        why: fanNeed && places(cs) >= fanNeed ? `case with ${places(cs)} fan places (lights)` : "case",
      });
    }
    return extras;
  };
  // a brand set: every new part in a category the brand makes is the brand's (and there is at least one such part) –
  // a RAM-only set with another maker's stick is not (it was tagged ★ before 0.14.8)
  const makes = new Map(),
    brandMakes = cat => {
      if (!makes.has(cat))
        makes.set(
          cat,
          shopParts(cat).some(p => ctx.brands.some(b => brandMatch(p, b)))
        );
      return makes.get(cat);
    };
  const isBrand = c => {
    if (!ctx.brands.length) return false;
    const rel = c.swaps.filter(s => brandMakes(s.cat));
    return (
      rel.length > 0 &&
      rel.every(s => {
        const ix = ixByName(s.new);
        return ix && ctx.brands.some(b => brandMatch(ix, b));
      })
    );
  };
  const label = c =>
    "Build for the score: " + [...new Set(c.swaps.map(s => (s.cat === "Motherboard" ? "motherboard" : s.cat)))].join(" + ");
  const picks = [];
  let checks = 0;
  const tryPick = (test, tag) => {
    // of the first fitting sets, the cheapest with its PSU + cooler (one GPU before two)
    const ok = [];
    let seen = 0;
    for (const c of cands) {
      if (!test(c) || picks.some(p => p.c === c)) continue;
      if (++checks > 400 || ++seen > 40) break;
      if (!planFits(job, c.swaps)) continue;
      const ex = runParts(c.swaps);
      if (!ex) continue;
      ok.push({ c, o: set(label(c), tag, c.swaps, c.sc, ex) });
      if (ok.length >= 8) break;
    }
    ok.sort((a, b) => a.o.over - b.o.over || a.o.total - b.o.total || a.c.nG - b.c.nG);
    if (ok[0] && !(ok[0].o.over && picks.some(p => !p.o.over))) picks.push(ok[0]);
  };
  tryPick(() => true, "cheapest");
  if (picks.length && picks[0].o.xmp) tryPick(c => c.sc.off >= target, "no XMP needed");
  if (picks.length && picks[0].c.nG === 2) tryPick(c => c.nG === 1, "one GPU");
  if (ctx.brands.length) tryPick(isBrand, `★ ${ctx.brands[0]}`);
  return [
    {
      key: "bench",
      reason: why,
      cat: "3DMark",
      options: picks.map(p => p.o),
      hint: picks.length
        ? ""
        : !cands.length && g0.length
          ? `The ${g0[0].name} can't reach this score with any CPU – pick a stronger GPU.`
          : BENCH_REPORT,
    },
  ];
}
