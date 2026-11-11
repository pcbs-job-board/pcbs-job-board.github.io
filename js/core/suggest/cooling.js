// Suggestions for cooling objectives: custom water cooling loop, AIO, and overclock objectives.
function customLoopSuggestion(job, ctx, reason, cur) {
  const key = "obj:customloop";
  if (!hasUnlock("customWC")) return [{ key, reason, options: [], hint: gateMsg("customWC").replace(/<\/?b>/g, "") + "." }];
  const have = k => cur("Water Cooling").find(p => wcKind(p) === k);
  const kinds = ["CPU Block", "Radiator", "Reservoir"].filter(k => !have(k));
  if (!kinds.length) return [];
  const cooler = cur("CPU Cooler").pop(),
    picked = [];
  let plan = job;
  for (const k of kinds) {
    // the CPU block takes the place of the old CPU cooler
    const replace = k === "CPU Block" && cooler ? cooler.name : "";
    const p = shopParts("Water Cooling")
      .filter(x => wcKind(x) === k)
      .sort((a, b) => a.price - b.price)
      .find(x => fitsBuild(plan, x, replace));
    if (!p) {
      const why =
        k === "Reservoir"
          ? "no unlocked reservoir fits this case (shop list)"
          : k === "Radiator"
            ? "no radiator fits the case's radiator places"
            : "no CPU block for this socket unlocked";
      return [{ key, reason, options: [], hint: `Custom loop: ${why}.` }];
    }
    picked.push({ p, replace });
    plan = withSwaps(plan, [{ cat: "Water Cooling", old: replace, new: p.name }]);
  }
  const [first, ...rest] = picked,
    total = picked.reduce((t, x) => t + (x.p.price || 0), 0);
  return [
    {
      key,
      reason,
      cat: "Water Cooling",
      old: first.replace,
      options: [
        {
          name: first.p.name,
          cat: "Water Cooling",
          price: first.p.price,
          count: 1,
          lvl: Math.max(...picked.map(x => x.p.lvl || 0)) || first.p.lvl,
          det: first.p.det,
          tag: `custom loop: ${picked.map(x => wcKind(x.p)).join(" + ")} · then pipes, fittings and coolant (looks only)`,
          swaps: [{ cat: "Water Cooling", old: first.replace, new: first.p.name }],
          extras: rest.map(x => ({ cat: "Water Cooling", old: "", name: x.p.name, price: x.p.price, why: wcKind(x.p) })),
          total,
          over: !priceOk({ price: total }, ctx.left),
        },
      ],
    },
  ];
}
function aioSuggestion(job, ctx, reason, cur) {
  const old = cur("CPU Cooler").pop();
  if (old && cInfo(old).aio === "1") return [];
  const c = shopParts("CPU Cooler").filter(p => cInfo(p).aio === "1");
  const opts = pickOptions(job, ctx, c, { replace: old?.name || "" });
  return opts.length ? [{ key: "obj:aio", reason, options: opts, cat: "CPU Cooler", old: old?.name || "" }] : [];
}
// an overclock objective: the parts it can't be done with (locked CPU, board that can't overclock, a GPU whose maximum
// clock is under the target) → the cheapest that can; a CPU target above its overclock base → optional CPUs that reach
// it at their overclock base (in budget only). Favourite brand first, as everywhere (pickOptions).
function ocSuggestions(job, ctx, reason, cur) {
  const out = [],
    t = ocTargets({ objectives: [reason] })[0] || { part: "CPU", mhz: null },
    cpu = cur("CPU").pop(),
    board = cur("Motherboard").pop();
  // the player can't overclock this part in the game yet (OCCT at level 6, GPU Tuner at 13) → say so, suggest nothing
  const gate = t.part === "CPU" ? "cpuOC" : t.part === "GPU" ? "gpuOC" : null;
  if (gate && !hasUnlock(gate))
    return [{ key: "obj:oc-locked", reason, options: [], hint: gateMsg(gate).replace(/<\/?b>/g, "") + "." }];
  if (t.part === "CPU") {
    const reach = p => t.mhz == null || (ocReach(p.name) || 0) >= t.mhz; // CPU: its full overclock potential
    const fixed = cpuIsFixed(job); // the customer's own CPU must be overclocked – no CPU swaps
    if (fixed && cpu && (cInfo(cpu).oc === "0" || !ocOf(cpu.name)))
      out.push({
        key: "obj:oc-cpu",
        reason: reason + " – the CPU is locked",
        options: [],
        hint: `This job overclocks the customer's own CPU, and ${cpu.name} is locked. Check the CPU name read from PC Stats – the game doesn't swap it for you.`,
      });
    else if (fixed) {
      /* no CPU suggestions: the board below is all that can be changed */
    } else if (cpu && (cInfo(cpu).oc === "0" || !ocOf(cpu.name))) {
      const c = shopParts("CPU").filter(
        p => cInfo(p).oc === "1" && ocOf(p.name) && sockOk(cInfo(p).s, cInfo(cpu).s) && rk(p) >= rk(cpu) && reach(p)
      );
      const o = pickOptions(job, ctx, c, { replace: cpu.name, base: cpu });
      if (o.length)
        out.push({ key: "obj:oc-cpu", reason: reason + " – the CPU is locked", options: o, cat: "CPU", old: cpu.name });
      else {
        const w = cpuWithBoard(
          job,
          ctx,
          shopParts("CPU").filter(p => cInfo(p).oc === "1" && ocOf(p.name) && rk(p) >= rk(cpu) && reach(p)),
          cpu,
          cur,
          p => cInfo(p).oc === "1"
        );
        if (w.length)
          out.push({
            key: "obj:oc-cpu",
            reason:
              reason +
              (cInfo(board || {}).oc === "0"
                ? " – the CPU is locked and the motherboard can't overclock: an unlocked CPU + a board that can"
                : " – the CPU is locked: an unlocked CPU with the motherboard it needs"),
            options: w,
            cat: "CPU",
            old: cpu.name,
          });
      }
    } else if (cpu && t.mhz && t.mhz > (ocReach(cpu.name) || 0) && t.mhz > (ocOf(cpu.name)?.mhz || 0)) {
      const c = shopParts("CPU").filter(
        p => cInfo(p).oc === "1" && sockOk(cInfo(p).s, cInfo(cpu).s) && reach(p) && rk(p) >= rk(cpu)
      );
      const o = pickOptions(job, ctx, c, { replace: cpu.name, base: cpu }).filter(x => !x.over);
      if (o.length)
        out.push({
          key: "obj:oc-cpu-easier",
          reason: `${reason} – optional: ${t.mhz.toLocaleString()} MHz is above this CPU's full overclock potential (${ocReach(cpu.name).toLocaleString()} MHz); these should reach it`,
          options: o,
          cat: "CPU",
          old: cpu.name,
        });
    }
    if (
      board &&
      cInfo(board).oc === "0" &&
      !out.some(x => x.options.some(o => (o.extras || []).some(e => e.cat === "Motherboard")))
    ) {
      const bc = cInfo(board),
        c = shopParts("Motherboard").filter(p => cInfo(p).oc === "1" && sockOk(cInfo(p).s, bc.s) && cInfo(p).f === bc.f);
      const o = pickOptions(job, ctx, c, { replace: board.name });
      if (o.length)
        out.push({
          key: "obj:oc-board",
          reason: reason + " – the motherboard can't overclock",
          options: o,
          cat: "Motherboard",
          old: board.name,
        });
    }
  } else if (t.part === "GPU" && t.mhz) {
    const gpu = cur("GPU")[0],
      d = gpu && ocOf(gpu.name),
      max = g => (t.mem ? g.maxMem : g.maxCore);
    const est = gpu && ocReach(gpu.name);
    if (gpu && d && t.mhz > (t.mem ? est.mem : est.core)) {
      const c = shopParts("GPU").filter(p => {
        const x = ocReach(p.name);
        return x && (t.mem ? x.mem : x.core) >= t.mhz && rk(p) >= rk(gpu);
      }); // its full overclock potential reaches it, never worse
      const must = t.mhz > max(d),
        o = pickOptions(job, ctx, c, { replace: gpu.name, base: gpu }).filter(x => must || !x.over); // optional ones: in budget only
      if (must || o.length)
        out.push({
          key: must ? "obj:oc-gpu" : "obj:oc-gpu-easier",
          reason: must
            ? `${reason} – this GPU's maximum ${t.mem ? "memory" : "core"} clock is ${max(d).toLocaleString()} MHz`
            : `${reason} – optional: above this GPU's full overclock potential (${(t.mem ? est.mem : est.core).toLocaleString()} MHz)`,
          options: o,
          cat: "GPU",
          old: gpu.name,
          hint: o.length ? "" : "No unlocked GPU reaches that clock.",
        });
    }
  } else if (t.part === "RAM" && t.mhz) {
    const ram = cur("RAM"),
      ds = ram.map(r => ocOf(r.name)).filter(Boolean);
    if (ds.length && t.mhz > Math.min(...ram.map(r => ocReach(r.name) || 0))) {
      const r0 = ram[0],
        c = shopParts("RAM").filter(p => +cInfo(p).mhz >= t.mhz && +cInfo(p).gb >= +(cInfo(r0).gb || 0));
      const o = pickOptions(job, ctx, c, { replace: r0.name, count: ram.length }).filter(x => !x.over);
      if (o.length)
        out.push({
          key: "obj:oc-ram",
          reason: `${reason} – optional: RAM that runs at ${t.mhz.toLocaleString()} MHz with XMP (replaces ${ram.length} stick${ram.length > 1 ? "s" : ""})`,
          options: o,
          cat: "RAM",
          old: r0.name,
        });
    }
  }
  // nothing to change: say so, so the objective isn't left without a word
  if (!out.length && t.mhz && (t.part === "CPU" || t.part === "GPU")) {
    const p = cur(t.part).pop(),
      x = p && ocReach(p.name),
      v = x && (typeof x === "number" ? x : t.mem ? x.mem : x.core);
    if (v)
      return [
        {
          key: "obj:oc-ok",
          reason,
          options: [],
          hint: `Nothing to change – ${p.name} should reach ~${v.toLocaleString()} MHz (its full potential – reaching it depends a lot on the ${t.part === "CPU" ? "CPU cooling" : "cooling and power"} and may not be possible). Overclock it in the game.`,
        },
      ];
  }
  // tell how the parts were picked
  out.forEach(x => {
    if (!/potential/.test(x.reason) && x.key !== "obj:oc-board")
      x.reason += ` · picked on each part's full overclock potential – reaching it depends a lot on the ${t.part === "CPU" ? "CPU cooling" : "cooling and power"} and may not be possible`;
  });
  return out;
}
