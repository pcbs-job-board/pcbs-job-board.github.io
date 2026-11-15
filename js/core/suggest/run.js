// ---------- "PC can run X (Minimum Spec)" (0.15.4) ----------
// The game's "Will it run?" app lists the minimum / recommended / recommended 4K spec of each app or game
// (data/will-it-run.csv → window.WILL_IT_RUN). A spec is met when the PC has a CPU ranked at least as high as the
// listed CPU, a GPU ranked at least as high as the weakest card of the listed chip with at least the listed VRAM
// (the best GPU counts when there are two), at least the listed RAM in total and drives that hold at least the listed
// storage together.
// The suggestions work the objective out as up to four steps of their own – "Install <CPU> or better",
// "Install <GPU chip> or better" (+ VRAM), "Upgrade to N GB of RAM", "Upgrade to N GB of Storage" – so the one set,
// a new board for another socket and a complete PC built from nothing all work as for those objectives.
const RUN_RE = /\bPC\s+can\s+run\s+(.+?)\s*[([{]\s*(min\w*|rec\w*(?:\s*4\s*k)?)\s*(?:spec\w*)?\s*[)\]}]?\s*$/i;
const RUN_TIERS = { min: "Minimum Spec", rec: "Recommended Spec", rec4k: "Recommended 4k Spec" };
const runNorm = s =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
// the app / game a name means (a few misread letters allowed)
function runApp(name) {
  const list = window.WILL_IT_RUN || [],
    n = runNorm(name);
  if (!n) return null;
  const exact = list.find(a => runNorm(a.app) === n);
  if (exact) return exact;
  let best = null,
    bestD = Infinity;
  for (const a of list) {
    const d = editDist(runNorm(a.app), n);
    if (d < bestD) ((best = a), (bestD = d));
  }
  return best && bestD <= Math.max(1, Math.floor(n.length / 6)) ? best : null;
}
const vramOf = p => +((String(ixByName(p.name)?.spec || p.spec || "").match(/(\d+)\s*GB/i) || [])[1] || 0);
// "PC can run SubSim X (Minimum Spec)" → { app, tier, label, cpu, gpu, chip, ram, vram, storage, cpuRef, gpuRef } or null
function runSpec(o) {
  const m = String(o || "").match(RUN_RE);
  if (!m) return null;
  const a = runApp(m[1]);
  if (!a) return { o, unknown: m[1].trim() };
  const t = /4\s*k/i.test(m[2]) ? "rec4k" : /^rec/i.test(m[2]) ? "rec" : "min",
    s = a[t];
  if (!s) return { o, app: a.app, tier: t, label: RUN_TIERS[t], noSpec: true };
  const [cpu, gpu, ram, vram, storage] = s,
    chip = chipFromText(gpu),
    cards = INDEX.filter(p => p.cat === "GPU" && cInfo(p).c === chip),
    withVram = cards.filter(p => vramOf(p) >= (vram || 0)),
    gpuRef = [...(withVram.length ? withVram : cards)].sort((x, y) => rk(x) - rk(y))[0] || null;
  return {
    o,
    app: a.app,
    dlc: a.dlc,
    tier: t,
    label: RUN_TIERS[t],
    cpu,
    gpu,
    chip,
    ram: ram || 0,
    vram: vram || 0,
    storage: storage || 0,
    cpuRef: ixByName(cpu) || null,
    gpuRef,
  };
}
// does this PC meet the spec? one line per part kind: { cat, ok, want, have }
function runChecks(spec, build) {
  const of = cat => build.filter(p => p.cat === cat),
    sum = cat => of(cat).reduce((t, p) => t + +(cInfo(p).gb || 0), 0),
    best = cat => [...of(cat)].sort((a, b) => rk(b) - rk(a))[0] || null;
  const cpu = best("CPU"),
    gpus = of("GPU").sort((a, b) => rk(b) - rk(a) || vramOf(b) - vramOf(a)),
    gpuOk = p => rk(p) >= rk(spec.gpuRef || {}) && vramOf(p) >= spec.vram,
    gpu = gpus.find(gpuOk) || gpus[0] || null,
    ram = sum("RAM"),
    disk = sum("Storage");
  return [
    {
      cat: "CPU",
      want: `${spec.cpu} or better`,
      have: cpu ? cpu.name : "",
      ok: !!cpu && !!spec.cpuRef && rk(cpu) >= rk(spec.cpuRef),
    },
    {
      cat: "GPU",
      want: `${spec.chip || spec.gpu} or better, ${spec.vram} GB VRAM`,
      have: gpu ? `${gpu.name} (${vramOf(gpu)} GB)` : "",
      ok: !!gpu && gpuOk(gpu),
    },
    { cat: "RAM", want: `${spec.ram} GB`, have: ram ? `${ram} GB` : "", ok: ram >= spec.ram },
    { cat: "Storage", want: gbText(spec.storage), have: disk ? gbText(disk) : "", ok: disk >= spec.storage },
  ];
}
// RAM comes in 1 / 2 / 4 / 8 / 16 / 32 / 64 GB sticks: "6 GB" is bought as 8 GB (2 × 4) – the RAM step asks for that
const ramStep = gb => {
  let n = 1;
  while (n < gb) n *= 2;
  return n;
};
// the steps an objective "PC can run X" is worked out as (others pass through). Steps already met by the PC are left
// out; RUN_SUB remembers which objective and spec each step belongs to (its suggestion is named after it).
const RUN_SUB = new Map();
function expandRunObjectives(objs, build) {
  const out = [];
  for (const o of objs) {
    const s = runSpec(o);
    if (!s || !s.cpu) {
      out.push(o);
      continue;
    }
    const chk = runChecks(s, build),
      okOf = cat => chk.find(c => c.cat === cat).ok,
      subs = [];
    if (!okOf("CPU")) subs.push([`Install ${s.cpu} or better`, "CPU", `CPU: ${s.cpu} or better`]);
    if (!okOf("GPU") && s.chip) subs.push([`Install ${s.chip} or better`, "GPU", `GPU: ${s.chip} or better, ${s.vram} GB VRAM`]);
    if (!okOf("RAM")) {
      const r = ramStep(s.ram);
      subs.push([`Upgrade to ${r} GB of RAM`, "RAM", `RAM: ${s.ram} GB${r !== s.ram ? ` (${r} GB in sticks)` : ""}`]);
    }
    if (!okOf("Storage")) subs.push([`Upgrade to ${s.storage} GB of Storage`, "Storage", `storage: ${gbText(s.storage)}`]);
    if (!subs.length) {
      out.push(o); // met – the suggestions say so
      continue;
    }
    for (const [t, cat, what] of subs) {
      RUN_SUB.set(t, { o, spec: s, cat, what });
      out.push(t);
    }
  }
  return out;
}
// the objectives the suggestions work out: "PC can run X" as its steps
const suggestObjectives = (job, objs) => expandRunObjectives(objs || jobObjectives(job), plannedBuild(job));
// a suggestion for one step is named after the objective: "PC can run SubSim X (Minimum Spec) – CPU: … or better"
function runRename(out) {
  for (const sg of out) {
    const o = sg.key?.startsWith("obj:") ? sg.key.slice(4) : null,
      sub = o && RUN_SUB.get(o);
    if (!sub) continue;
    const rest = sg.reason.startsWith(o)
      ? sg.reason
          .slice(o.length)
          .replace(/^ – now 0 GB$/, "")
          .replace(/^ – now /, ", now ")
      : "";
    sg.reason = `${sub.o} – ${sub.what}${rest}`;
    sg.runOf = sub.o;
  }
  return out;
}
// objectives "PC can run X" that need nothing / can't be read – shown like any other objective's suggestion
function runInfo(o, build) {
  const s = runSpec(o);
  if (!s) return null;
  if (s.unknown) return { key: "obj:" + o, reason: o, options: [], hint: `"${s.unknown}" isn't in the Will it run? list.` };
  if (s.noSpec) return { key: "obj:" + o, reason: o, options: [], hint: `Will it run? has no ${s.label} for ${s.app}.` };
  const chk = runChecks(s, build);
  if (chk.every(c => c.ok))
    return {
      key: "obj:" + o,
      reason: o,
      options: [],
      met: true,
      hint: `Already met – ${chk.map(c => `${c.cat} ${c.have}`).join(" · ")}`,
    };
  return null;
}
// the job card's Status tile: each "PC can run X" objective checked on the planned PC (current parts + swaps).
// state: off (no parts yet / not in the list) · ok · bad
function runStatus(j) {
  const specs = jobObjectives(j)
    .map(runSpec)
    .filter(s => s && s.cpu);
  if (!specs.length) return null;
  const build = plannedBuild(j);
  if (!build.length) return { state: "off", items: [] };
  const items = specs.map(s => {
    const chk = runChecks(s, build);
    return { spec: s, chk, ok: chk.every(c => c.ok) };
  });
  return { state: items.every(i => i.ok) ? "ok" : "bad", items };
}
