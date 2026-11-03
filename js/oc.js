/* Overclocking helper for jobs – only when an OBJECTIVE asks for an overclock ("OC CPU to 4000MHz", "Overclock the GPU…").
   A mention in the email body ("I'll overclock it later") only feeds the PSU check (see suggest.js, "overclock later").
   Level 1 – certain: can it overclock at all (unlocked CPU + a motherboard that can overclock), is the target inside the
             part's hard limit (GPU core / memory maximum), overclocked watts vs the PSU.
   Level 2 – a rough guide: the target against the part's "overclock base" clock from the parts workbook. At or below it:
             should be reachable with a reasonable cooler. Above it: needs good cooling and may not get there – the game's
             temperature formula isn't known, so which cooler is enough can't be worked out. */

let OCD = null;
function ocOf(name) {
  if (!OCD) {
    OCD = new Map();
    for (const cat in window.PARTS_DB || {}) for (const r of window.PARTS_DB[cat]) if (r[12]) {
      const v = String(r[12]).split(",").map(Number);
      OCD.set(r[0].toLowerCase(), cat === "CPU" ? { ocMhz: v[0], ocV: v[1], mhz: v[2], v: v[3], thr: v[4] }
        : cat === "GPU" ? { core: v[0], ocCore: v[1], maxCore: v[2], mem: v[3], ocMem: v[4], maxMem: v[5] }
        : cat === "RAM" ? { mhz: v[0], ocMhz: v[1], ocV: v[2] } : null);
    }
  }
  return OCD.get(String(name || "").trim().toLowerCase()) || null;
}
// the overclock objectives: [{ part: "CPU" | "GPU" | "RAM", mem: GPU memory clock?, mhz: target or null, text }]
function ocTargets(j) {
  return jobObjectives(j).filter(o => /\b(overclock\w*|oc)\b/i.test(o)).map(o => {
    const t = o.toLowerCase(), m = t.match(/(\d[\d.,]*)\s*(ghz|mhz)/);
    // "4.5 GHz" / "4,5 GHz" → 4500 · "2,133 MHz" / "2133MHz" → 2133
    const part = /\b(gpu|graphics|video card)\b/.test(t) ? "GPU" : /\b(ram|memory)\b/.test(t) && !/\bgpu\b/.test(t) ? "RAM" : "CPU";
    return { part, mem: part === "GPU" && /\bmem/.test(t), mhz: m ? (m[2] === "ghz" ? Math.round(parseFloat(m[1].replace(",", ".")) * 1000) : +m[1].replace(/[.,]/g, "")) : null, text: o };
  });
}
// one line per objective + the PSU; state: ok · warn (above the overclock base – depends on cooling) · bad (can't be done)
function ocCheck(j) {
  const targets = ocTargets(j); if (!targets.length) return null;
  const build = plannedBuild(j), first = cat => build.find(p => p.cat === cat), mhz = x => x.toLocaleString() + " MHz";
  const items = [], missing = new Set();
  for (const t of targets) {
    const it = { ...t, state: "ok", lines: [] }; items.push(it);
    if (t.part === "CPU") {
      const cpu = first("CPU"), mb = first("Motherboard");
      if (!cpu) { missing.add("CPU"); it.state = "off"; continue; }
      it.name = cpu.name;
      const d = ocOf(cpu.name), c = compatOf(cpu.name) || {};
      if (!d || c.oc === "0") { it.state = "bad"; it.lines.push(`<b>${esc(cpu.name)}</b> is locked – it can't be overclocked. An unlocked CPU is needed.`); }
      if (!mb) missing.add("Motherboard");
      else if ((compatOf(mb.name) || {}).oc === "0") { it.state = "bad"; it.lines.push(`<b>${esc(mb.name)}</b> can't overclock – a motherboard that can is needed.`); }
      if (it.state === "bad" || !d) continue;
      if (t.mhz == null) it.lines.push(`Unlocked, on a board that can overclock. Its overclock base: ${mhz(d.ocMhz)} at ${d.ocV} V.`);
      else if (t.mhz <= d.mhz) it.lines.push(`Already runs at ${mhz(d.mhz)} – the ${mhz(t.mhz)} target is met without overclocking.`);
      else if (t.mhz <= d.ocMhz) it.lines.push(`${mhz(t.mhz)} is within its overclock base (${mhz(d.ocMhz)} at ${d.ocV} V) – should be reachable with a reasonable cooler.`);
      else { it.state = "warn"; it.lines.push(`${mhz(t.mhz)} is above its overclock base (${mhz(d.ocMhz)} at ${d.ocV} V) – needs good cooling, and may not get there. Throttles at ${d.thr} °C.`); }
    } else if (t.part === "GPU") {
      const gpu = first("GPU"); if (!gpu) { missing.add("GPU"); it.state = "off"; continue; }
      it.name = gpu.name; const d = ocOf(gpu.name);
      if (!d) { it.state = "off"; it.lines.push(`No overclocking data for <b>${esc(gpu.name)}</b>.`); continue; }
      const [base, oc, max, what] = t.mem ? [d.mem, d.ocMem, d.maxMem, "memory clock"] : [d.core, d.ocCore, d.maxCore, "core clock"];
      if (t.mhz == null) it.lines.push(`${what}: ${mhz(base)} stock · overclock base ${mhz(oc)} · maximum ${mhz(max)}.`);
      else if (t.mhz > max) { it.state = "bad"; it.lines.push(`${mhz(t.mhz)} is over this card's maximum ${what} (${mhz(max)}) – no cooler gets there. Another GPU is needed.`); }
      else if (t.mhz <= base) it.lines.push(`Already runs at ${mhz(base)} – the target is met without overclocking.`);
      else if (t.mhz <= oc) it.lines.push(`${mhz(t.mhz)} is within its overclock base (${mhz(oc)}, maximum ${mhz(max)}) – should be reachable.`);
      else { it.state = "warn"; it.lines.push(`${mhz(t.mhz)} is above its overclock base (${mhz(oc)}), under the maximum (${mhz(max)}) – needs good cooling.`); }
    } else {
      const ram = build.filter(p => p.cat === "RAM"); if (!ram.length) { missing.add("RAM"); it.state = "off"; continue; }
      const ds = ram.map(r => ocOf(r.name)).filter(Boolean); it.name = ram[0].name;
      if (!ds.length) { it.state = "off"; it.lines.push("No overclocking data for this RAM."); continue; }
      const base = Math.min(...ds.map(d => d.mhz)), oc = Math.min(...ds.map(d => d.ocMhz));
      if (t.mhz == null || t.mhz <= base) it.lines.push(`RAM runs at ${mhz(base)}${t.mhz ? " – the target is met (turn on XMP in the BIOS)" : ""}; overclock base ${mhz(oc)}.`);
      else if (t.mhz <= oc) it.lines.push(`${mhz(t.mhz)} is within the RAM's overclock base (${mhz(oc)}) – should be reachable.`);
      else { it.state = "warn"; it.lines.push(`${mhz(t.mhz)} is above the RAM's overclock base (${mhz(oc)}) – may not get there; faster RAM is safer.`); }
    }
  }
  const pc = powerCheck(j), psu = pc && pc.psuW != null ? { use: pc.oc, w: pc.psuW, bad: pc.oc > pc.psuW } : null;
  const order = { off: 0, ok: 1, warn: 2, bad: 3 };
  let state = items.reduce((s, i) => order[i.state] > order[s] ? i.state : s, "ok");
  if (psu && psu.bad) state = "bad";
  if (items.every(i => i.state === "off")) state = "off";
  return { items, psu, missing: [...missing], state };
}
if (typeof module !== "undefined") module.exports = { ocOf, ocTargets, ocCheck };
