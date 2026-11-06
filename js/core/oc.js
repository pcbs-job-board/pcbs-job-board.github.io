/* Overclocking helper for jobs – only when an OBJECTIVE asks for an overclock ("OC CPU to 4000MHz", "Overclock the GPU…").
   A mention in the email body ("I'll overclock it later") only feeds the PSU check (see suggest.js, "overclock later").
   Level 1 – certain: can it overclock at all (unlocked CPU + a motherboard that can overclock), is the target inside the
             part's hard limit (GPU core / memory maximum), overclocked watts vs the PSU.
   Level 2 – an estimate: players rarely get a part to its full overclock potential, so we count on 90 % of it:
             reachable ≈ stock + 0.9 × (overclock base − stock), the overclock base being the part's overclock clock in the
             parts workbook. Parts are judged and picked on that; the game's temperature formula isn't known, so real
             results depend on cooling / power. Watts are still counted at the full overclock.
   Temperatures: each part's throttle temperature from the workbook (CPUs that can overclock, all GPUs); without it
             Intel CPUs 100 °C, AMD CPUs 95 °C, GPUs 95 °C (the game's usual values). */
const OC_SHARE = 0.9;
function ocEst(stock, oc) {
  return Math.round(stock + OC_SHARE * Math.max(0, oc - stock));
}
// what a part should reach overclocked (90 % of its potential): CPU MHz · GPU { core, mem } · RAM MHz
function ocReach(name) {
  const d = ocOf(name);
  if (!d) return null;
  return d.core != null ? { core: ocEst(d.core, d.ocCore), mem: ocEst(d.mem, d.ocMem) } : ocEst(d.mhz, d.ocMhz);
}
// what to set in the game for that estimate: CPU – multiplier on the 100 MHz base clock and the core voltage it needs (the
// voltage rises in step with the clock from stock to the overclock base, as in the workbook); GPU – the GPU Tuner clocks
function ocSettings(name) {
  const d = ocOf(name),
    r = ocReach(name);
  if (!d || !r) return null;
  if (d.core != null) return { core: r.core, mem: r.mem, dCore: r.core - d.core, dMem: r.mem - d.mem };
  const mult = Math.floor(r / 100),
    mhz = mult * 100,
    v = d.ocMhz > d.mhz && d.ocV ? d.v + ((mhz - d.mhz) / (d.ocMhz - d.mhz)) * (d.ocV - d.v) : null;
  return { mhz, mult, volt: v != null && v > 0 ? Math.round(v * 100) / 100 : null };
}
function throttleOf(cat, name) {
  const d = ocOf(name);
  if (d && d.thr) return { c: d.thr, known: true };
  return { c: cat === "CPU" && /^amd\b/i.test(name) ? 95 : cat === "CPU" ? 100 : 95, known: false };
}

let OCD = null;
function ocOf(name) {
  if (!OCD) {
    OCD = new Map();
    for (const cat in window.PARTS_DB || {})
      for (const r of window.PARTS_DB[cat])
        if (r[12]) {
          const v = String(r[12]).split(",").map(Number);
          OCD.set(
            r[0].toLowerCase(),
            cat === "CPU"
              ? { ocMhz: v[0], ocV: v[1], mhz: v[2], v: v[3], thr: v[4] }
              : cat === "GPU"
                ? { core: v[0], ocCore: v[1], maxCore: v[2], mem: v[3], ocMem: v[4], maxMem: v[5], thr: v[6] }
                : cat === "RAM"
                  ? { mhz: v[0], ocMhz: v[1], ocV: v[2] }
                  : null
          );
        }
  }
  return (
    OCD.get(
      String(name || "")
        .trim()
        .toLowerCase()
    ) || null
  );
}
// the overclock objectives: [{ part: "CPU" | "GPU" | "RAM", mem: GPU memory clock?, mhz: target or null, text }]
function ocTargets(j) {
  return jobObjectives(j)
    .filter(o => /\b(overclock\w*|oc)\b/i.test(o))
    .map(o => {
      const t = o.toLowerCase(),
        m = t.match(/(\d[\d.,]*)\s*(ghz|mhz)/);
      // "4.5 GHz" / "4,5 GHz" → 4500 · "2,133 MHz" / "2133MHz" → 2133
      const part = /\b(gpu|graphics|video card)\b/.test(t)
        ? "GPU"
        : /\b(ram|memory)\b/.test(t) && !/\bgpu\b/.test(t)
          ? "RAM"
          : "CPU";
      return {
        part,
        mem: part === "GPU" && /\bmem/.test(t),
        mhz: m ? (m[2] === "ghz" ? Math.round(parseFloat(m[1].replace(",", ".")) * 1000) : +m[1].replace(/[.,]/g, "")) : null,
        text: o,
      };
    });
}
// one line per objective + the PSU; state: ok · warn (above the overclock base – depends on cooling) · bad (can't be done)
// "Overclock CPU to N MHz" means the customer's own CPU – it can't be swapped, unless an objective also asks to replace /
// upgrade the CPU (then the new one is overclocked)
function cpuIsFixed(j) {
  const objs = jobObjectives(j);
  return ocTargets(j).some(t => t.part === "CPU") && !objs.some(o => /\b(replace|upgrade)\b.*\b(cpu|processor)\b/i.test(o));
}
// "Install dual graphics cards" keeps the customer's motherboard (the game doesn't allow a board swap for it), unless an
// objective also asks to replace / upgrade / swap the motherboard
function boardIsFixed(j) {
  const objs = jobObjectives(j);
  return (
    objs.some(o => /dual graphics|two graphics|2 graphics|dual gpu|sli|crossfire/i.test(o)) &&
    !objs.some(o => /\b(replace|upgrade|swap|change)\b.*\b(motherboard|mobo|mainboard|board)\b/i.test(o))
  );
}
function ocCheck(j) {
  const targets = ocTargets(j);
  if (!targets.length) return null;
  const build = plannedBuild(j),
    first = cat => build.find(p => p.cat === cat),
    mhz = x => x.toLocaleString() + " MHz";
  const items = [],
    missing = new Set();
  for (const t of targets) {
    const it = { ...t, state: "ok", lines: [] };
    items.push(it);
    const temp = (cat, name) => {
      const th = throttleOf(cat, name);
      it.lines.push(
        `<span class="octemp">🌡 Keep the ${cat} under <b>${th.c} °C</b> – it throttles there${th.known ? "" : ` (usual for ${cat === "CPU" ? (/^amd\b/i.test(name) ? "AMD" : "Intel") + " CPUs" : "GPUs"})`}.</span>`
      );
    };
    if (t.part === "CPU") {
      const cpu = first("CPU"),
        mb = first("Motherboard");
      if (!cpu) {
        missing.add("CPU");
        it.state = "off";
        continue;
      }
      it.name = cpu.name;
      const own = (j.components || []).find(p => p.cat === "CPU");
      if (cpuIsFixed(j) && own && own.name !== cpu.name) {
        it.state = "bad";
        it.lines.push(
          `This job overclocks the customer's own CPU (<b>${esc(own.name)}</b>) – swapping it for ${esc(cpu.name)} fails the objective. Remove the CPU swap.`
        );
        continue;
      }
      if (!hasUnlock("cpuOC")) {
        it.state = "bad";
        it.lines.push(gateMsg("cpuOC") + ".");
        continue;
      }
      const d = ocOf(cpu.name),
        c = compatOf(cpu.name) || {};
      if (!d || c.oc === "0") {
        it.state = "bad";
        it.lines.push(`<b>${esc(cpu.name)}</b> is locked – it can't be overclocked. An unlocked CPU is needed.`);
      }
      if (!mb) missing.add("Motherboard");
      else if ((compatOf(mb.name) || {}).oc === "0") {
        it.state = "bad";
        it.lines.push(`<b>${esc(mb.name)}</b> can't overclock – a motherboard that can is needed.`);
      }
      if (it.state === "bad" || !d) continue;
      const est = ocEst(d.mhz, d.ocMhz);
      if (t.mhz != null && t.mhz <= d.mhz)
        it.lines.push(`Already runs at ${mhz(d.mhz)} – the ${mhz(t.mhz)} target is met without overclocking.`);
      else {
        if (t.mhz == null)
          it.lines.push(
            `Should reach about <b>${mhz(est)}</b> (stock ${mhz(d.mhz)}, full potential ${mhz(d.ocMhz)} at ${d.ocV} V).`
          );
        else if (t.mhz <= est)
          it.lines.push(
            `${mhz(t.mhz)} – should be reachable: estimate <b>${mhz(est)}</b> (stock ${mhz(d.mhz)}, full potential ${mhz(d.ocMhz)} at ${d.ocV} V).`
          );
        else if (t.mhz <= d.ocMhz) {
          it.state = "warn";
          it.lines.push(
            `${mhz(t.mhz)} is above the estimate (<b>${mhz(est)}</b>) but within its full potential (${mhz(d.ocMhz)}) – needs very good cooling.`
          );
        } else {
          it.state = "warn";
          it.lines.push(
            `${mhz(t.mhz)} is above this CPU's full overclock potential (${mhz(d.ocMhz)}; estimate ${mhz(est)}) – unlikely to get there.`
          );
        }
        temp("CPU", cpu.name);
      }
    } else if (t.part === "GPU") {
      const gpu = first("GPU");
      if (!gpu) {
        missing.add("GPU");
        it.state = "off";
        continue;
      }
      it.name = gpu.name;
      const d = ocOf(gpu.name);
      if (!hasUnlock("gpuOC")) {
        it.state = "bad";
        it.lines.push(gateMsg("gpuOC") + ".");
        continue;
      }
      if (!d) {
        it.state = "off";
        it.lines.push(`No overclocking data for <b>${esc(gpu.name)}</b>.`);
        continue;
      }
      const [base, oc, max, what] = t.mem
          ? [d.mem, d.ocMem, d.maxMem, "memory clock"]
          : [d.core, d.ocCore, d.maxCore, "core clock"],
        est = ocEst(base, oc);
      if (t.mhz != null && t.mhz > max) {
        it.state = "bad";
        it.lines.push(
          `${mhz(t.mhz)} is over this card's maximum ${what} (${mhz(max)}) – no cooler gets there. Another GPU is needed.`
        );
        continue;
      }
      if (t.mhz != null && t.mhz <= base) {
        it.lines.push(`Already runs at ${mhz(base)} – the target is met without overclocking.`);
        continue;
      }
      if (t.mhz == null)
        it.lines.push(
          `${what}: should reach about <b>${mhz(est)}</b> (stock ${mhz(base)}, full potential ${mhz(oc)}, maximum ${mhz(max)}).`
        );
      else if (t.mhz <= est)
        it.lines.push(
          `${mhz(t.mhz)} – should be reachable: estimate <b>${mhz(est)}</b> (stock ${mhz(base)}, full potential ${mhz(oc)}).`
        );
      else {
        it.state = "warn";
        it.lines.push(
          `${mhz(t.mhz)} is above the estimate (<b>${mhz(est)}</b>${t.mhz <= oc ? `, full potential ${mhz(oc)}` : `; over its full potential ${mhz(oc)}, under the maximum ${mhz(max)}`}) – needs very good cooling.`
        );
      }
      temp("GPU", gpu.name);
    } else {
      const ram = build.filter(p => p.cat === "RAM");
      if (!ram.length) {
        missing.add("RAM");
        it.state = "off";
        continue;
      }
      const ds = ram.map(r => ocOf(r.name)).filter(Boolean);
      it.name = ram[0].name;
      if (!ds.length) {
        it.state = "off";
        it.lines.push("No overclocking data for this RAM.");
        continue;
      }
      const base = Math.min(...ds.map(d => d.mhz)),
        est = Math.min(...ds.map(d => ocEst(d.mhz, d.ocMhz)));
      if (t.mhz == null || t.mhz <= base)
        it.lines.push(
          `RAM runs at ${mhz(base)}${t.mhz ? " – the target is met (turn on XMP in the BIOS)" : ""}; overclocked estimate ${mhz(est)}.`
        );
      else if (t.mhz <= est) it.lines.push(`${mhz(t.mhz)} – should be reachable: estimate <b>${mhz(est)}</b>.`);
      else {
        it.state = "warn";
        it.lines.push(`${mhz(t.mhz)} is above the RAM's estimate (${mhz(est)}) – may not get there; faster RAM is safer.`);
      }
    }
  }
  const pc = powerCheck(j),
    psu = pc && pc.psuW != null ? { use: pc.oc, w: pc.psuW, bad: pc.oc > pc.psuW } : null;
  const order = { off: 0, ok: 1, warn: 2, bad: 3 };
  let state = items.reduce((s, i) => (order[i.state] > order[s] ? i.state : s), "ok");
  if (psu && psu.bad) state = "bad";
  if (items.every(i => i.state === "off")) state = "off";
  return { items, psu, missing: [...missing], state };
}
if (typeof module !== "undefined")
  module.exports = { cpuIsFixed, boardIsFixed, ocOf, ocTargets, ocCheck, ocReach, ocEst, throttleOf };
