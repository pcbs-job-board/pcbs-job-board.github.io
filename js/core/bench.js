/* 3DMark score of a PC – the formula from Jacob Klein's PCBS HTML Calculator (v1.15.3), with the inputs from our
   parts workbook ("bench" column, see tools/import_xlsx.py BENCH). Checked against the game's PC Stats "Benchmark".
     CPU score = floor((clock factor × CPU MHz + channel factor × RAM channels + memory factor × RAM MHz + adjustment) × 298)
                 RAM channels = sticks, up to the CPU's maximum
     GPU score = the card's graphics score (one card / two cards)
     score     = floor(1 / (0.85 / GPU score + 0.15 / CPU score))
   RAM speed: XMP off (how every customer PC comes) = the CPU's default memory speed (or the stick's, if slower);
              XMP on = the motherboard's highest speed step at or below the stick's MHz. */

let BENCH = null;
// two GPUs run as a pair (SLI / CrossFire) when they're the same GPU model – any maker or edition (tested in the game:
// MSI GTX 1070 GAMING X 8G + ZOTAC GTX 1070 AMP Extreme, ASUS RX 560 + ROG Strix RX 560 OC); a GTX 1080 and a
// 1080 Ti don't pair. The one place for that rule ("c" = the chip in the parts database)
function gpuPair(a, b) {
  if (!a || !b) return false;
  if (String(a).toLowerCase() === String(b).toLowerCase()) return true;
  const x = (compatOf(a) || {}).c,
    y = (compatOf(b) || {}).c;
  return !!x && x === y;
}
// a pair's score: the two cards' pair scores averaged (the same card twice → its own); null when they don't pair
function pairBench(a, b) {
  const A = benchOf(a),
    B = benchOf(b);
  if (!gpuPair(a, b) || !A || !B || !A.two || !B.two) return null;
  return { two: Math.round((A.two + B.two) / 2), ocTwo: Math.round(((A.ocTwo || A.two) + (B.ocTwo || B.two)) / 2) };
}
function benchOf(name) {
  if (!BENCH) {
    BENCH = new Map();
    for (const cat in window.PARTS_DB || {})
      for (const r of window.PARTS_DB[cat])
        if (r[11]) {
          const v = String(r[11]);
          BENCH.set(
            r[0].toLowerCase(),
            cat === "Motherboard"
              ? { steps: v.split("|").map(Number).filter(Boolean) }
              : cat === "CPU"
                ? (([core, chan, mem, adj, mhz, maxCh, defMem]) => ({ core, chan, mem, adj, mhz, maxCh, defMem }))(
                    v.split(",").map(Number)
                  )
                : cat === "GPU"
                  ? (([one, two, ocOne, ocTwo]) => ({ one, two, ocOne, ocTwo }))(v.split(",").map(Number))
                  : null
          );
        }
  }
  return (
    BENCH.get(
      String(name || "")
        .trim()
        .toLowerCase()
    ) || null
  );
}
const cpuBench = (c, ch, mhz) => Math.floor((c.core * c.mhz + c.chan * ch + c.mem * mhz + c.adj) * 298);
const sysBench = (cpu, gpu) => Math.floor(1 / (0.85 / gpu + 0.15 / cpu));
const xmpSpeed = (mhz, steps) => {
  let s = 0;
  for (const x of steps) {
    if (!s || x <= mhz) s = x;
    else break;
  }
  return s;
};
// "3DMark score of 5660" → 5660
function benchTarget(j) {
  for (const o of jobObjectives(j)) {
    const m = String(o).match(/3\s?d\s?mark\s+score\s+(?:of\s+)?([\d,.]+)/i);
    if (m) return +m[1].replace(/[,.]/g, "");
  }
  return null;
}
// the score of a list of parts [{cat, name}] – null fields say what is missing
function benchScore(parts) {
  const of = cat => parts.filter(p => p.cat === cat);
  const cpuP = of("CPU")[0],
    board = of("Motherboard")[0],
    gpus = of("GPU"),
    ram = of("RAM");
  const missing = [];
  const cpu = cpuP && benchOf(cpuP.name),
    mb = board && benchOf(board.name);
  if (!cpu) missing.push("CPU");
  if (!mb) missing.push("Motherboard");
  if (!gpus.length || !benchOf(gpus[0].name)) missing.push("GPU");
  const sticks = ram.map(r => +((compatOf(r.name) || {}).mhz || 0)).filter(Boolean);
  if (!sticks.length) missing.push("RAM");
  if (missing.length) return { missing };
  const g = benchOf(gpus[0].name),
    pair = gpus.length > 1 ? pairBench(gpus[0].name, gpus[1].name) : null,
    two = !!pair;
  const gpuS = pair ? pair.two : g.one,
    stick = Math.min(...sticks),
    ch = Math.min(sticks.length, cpu.maxCh || 1);
  const mhzOff = Math.min(cpu.defMem || stick, stick),
    mhzOn = xmpSpeed(stick, mb.steps);
  const cOff = cpuBench(cpu, ch, mhzOff),
    cOn = cpuBench(cpu, ch, mhzOn);
  return {
    missing,
    off: sysBench(cOff, gpuS),
    on: sysBench(cOn, gpuS),
    cpuOff: cOff,
    cpuOn: cOn,
    gpu: gpuS,
    gpus: two ? 2 : 1,
    mixedGpus: gpus.length > 1 && !two,
    channels: ch,
    maxCh: cpu.maxCh,
    sticks: sticks.length,
    mhzOff,
    mhzOn,
    stick,
  };
}
// the job's planned PC against its "3DMark score of N" objective; null when there is no such objective
function benchCheck(j) {
  const target = benchTarget(j);
  if (!target) return null;
  const s = benchScore(plannedBuild(j)),
    xmp = (j.tasks || []).some(t => t.done && /\bxmp\b/i.test(t.text)); // "Turn on XMP" ticked off
  return {
    target,
    ...s,
    xmp,
    state: s.missing.length ? "off" : s.off >= target || (xmp && s.on >= target) ? "ok" : s.on >= target ? "warn" : "bad",
  };
}
if (typeof module !== "undefined")
  module.exports = { benchOf, benchScore, benchTarget, benchCheck, sysBench, cpuBench, xmpSpeed };
