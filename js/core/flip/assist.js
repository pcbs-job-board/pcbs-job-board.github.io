// 📦 PC Bay – step 3, the build assistant: parts from the inventory (and NEW parts from the shop) that raise the
// profit, the best plan, applying / removing changes. The build itself and its state are in build.js.
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
  // two cards of the same model from different makers (they pair) in place of the GPUs now
  const gpuNames = [...byName(avail.filter(i => i.cat === "GPU"))],
    gNow = cur("GPU");
  for (let x = 0; x < gpuNames.length; x++)
    for (let y = x + 1; y < gpuNames.length; y++)
      if (gpuPair(gpuNames[x][0], gpuNames[y][0])) {
        const pair = [gpuNames[x][1][0], gpuNames[y][1][0]],
          items = pair.map((inv, n) => ({ inv, old: gNow[n] || null }));
        for (let n = 2; n < gNow.length; n++) items.push({ inv: null, old: gNow[n] });
        moves.push({ label: `${gNow.length ? "GPU" : "Add GPU"}: ${gpuNames[x][0]} + ${gpuNames[y][0]}`, items });
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
// 10,000 or more: the score's price multiplier is at its maximum (×3.0) – the plan gets there first (Mariusz, 0.15.3)
const flipTier = e => (e.score != null && e.score >= ENOUGH_TARGET ? 1 : 0);
// how good a change is: a step toward a PC that can be sold first, then reaching 10,000 (or not falling under it),
// then the profit it adds. A NEW part bought only to reach 10,000 still has to pay for itself
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
  const gain = e.value - e.cost - (base.value - base.cost),
    up = flipTier(e) - flipTier(base),
    tier = up > 0 && gain <= 0 && e.cost > base.cost ? 0 : up;
  return {
    ...m,
    build: b2,
    score: e.score,
    value: e.value,
    cost: e.cost,
    gain,
    check: e.check,
    rank: (base.check.bad - e.check.bad) * 1e7 + tier * 1e5 + gain,
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
// the group a single change is listed under: the one part category it touches, or "Combined" (board + CPU, a PSU that comes with it …)
function flipChangeCat(u) {
  const cats = new Set((u.items || []).map(x => (x.inv || x.old || {}).cat).filter(Boolean));
  if (/ \+ PSU: /.test(u.label || "")) cats.add("PSU");
  return cats.size === 1 ? [...cats][0] : "Combined";
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
// changes that only help together: another motherboard (overclocking, SLI / CrossFire, more slots) with a CPU or GPU
// change on top – the board alone can be worth less, and the 2nd GPU / unlocked CPU alone may not work on the old one
function flipCombos(b, avail, moves) {
  const out = [];
  for (const m1 of moves.filter(m => m.items.some(x => x.inv && x.inv.cat === "Motherboard"))) {
    const b1 = flipApplyItems(b, m1.items),
      used = new Set(m1.items.filter(x => x.inv).map(x => x.inv.id)),
      a1 = avail.filter(i => !used.has(i.id));
    for (const m2 of flipMoves(b1, a1))
      if (m2.items.every(x => x.inv && (x.inv.cat === "GPU" || x.inv.cat === "CPU") && (!x.old || b.includes(x.old))))
        out.push({ label: `${m1.label} + ${m2.label}`, items: [...m1.items, ...m2.items] });
  }
  return out;
}
// the best build from the inventory: the best change, again and again, until nothing helps – 10,000 first (when the
// inventory can get there), then the most profitable PC that sells
function flipPlan(f) {
  let b = flipState(f).build,
    base = flipEval(b);
  const start = base,
    b0 = b,
    steps = [];
  for (let n = 0; n < 16; n++) {
    const avail = flipAvail(f, b),
      moves = flipMoves(b, avail);
    let tries = moves.map(m => flipTry(b, base, m, avail)).filter(o => o.rank > 0.5);
    // nothing reaches 10,000 in one step (or nothing helps): try a board with a CPU / GPU change on top
    if (!tries.some(o => flipTier(o) > flipTier(base)))
      tries = tries.concat(
        flipCombos(b, avail, moves)
          .map(m => flipTry(b, base, m, avail))
          .filter(o => o.rank > 0.5)
      );
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
      if (e2.check.bad <= base.check.bad && flipTier(e2) >= flipTier(base) && prof(e2) >= prof(base)) {
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
    from: { score: start.score, value: start.value }, // the PC as it is now, worked out the same way
  };
}
// NEW parts (Mariusz, 0.15.3): a new part keeps only ⅓ of its price in the sale value, so it pays only by lifting the
// score toward 10,000 – the ×3.0 then counts for the whole PC. Against the current build, one new part at a time:
// NEW parts in the inventory are shown whenever they add profit (small gains too, marked); parts from the shop only
// with at least FLIP_SHOP_MIN profit after next-day delivery – ordering, waiting and a workbench taken longer must pay
const FLIP_NEW_SMALL = 250,
  FLIP_SHOP_MIN = 250,
  FLIP_DELIVERY = 30;
function flipNewOptions(f) {
  // the PC as it is now (installed / selected parts) against the same PC with only the new part changed (Mariusz)
  const b = flipState(f).build,
    base = flipEval(b),
    out = [];
  if (!base.check.ok) return out;
  const priceIn = items => items.reduce((t, x) => t + (x.inv ? (x.inv.price ?? priceOf(x.inv.name) ?? 0) : 0), 0);
  const add = (m, src) => {
    const b2 = flipApplyItems(b, m.items),
      score = flipScore(b2, { xmp: true, ...softOk(null, b2) }),
      value = flipValue(flipSum(b2), true, score),
      price = priceIn(m.items),
      fee = src === "shop" ? FLIP_DELIVERY : 0,
      profit = value - base.value - price - fee;
    if (profit < 1 || (src === "shop" && profit < FLIP_SHOP_MIN)) return; // cheap checks first, the fit check last
    if (flipTier({ score }) < flipTier(base) || !flipCheck(b2).ok) return;
    out.push({
      label: m.label,
      src,
      price,
      fee,
      profit,
      from: base.value,
      value,
      fromScore: base.score,
      score,
      build: b2,
      small: profit < FLIP_NEW_SMALL,
    });
  };
  // NEW parts the player already has
  const taken = new Set(b.filter(p => p.inv).map(p => p.inv.id)),
    mine = flipInventory(f).filter(i => !i.used && !i.taken && !taken.has(i.id));
  for (const m of flipMoves(b, mine)) if (m.items.some(x => x.inv)) add(m, "inv");
  // the shop: a GPU or a CPU in place of the one in the PC
  for (const cat of ["GPU", "CPU"]) {
    const now = b.find(p => p.cat === cat);
    for (const p of shopParts(cat))
      if (!now || p.name !== now.name)
        add(
          {
            label: `${CAT_LABEL[cat] || cat}: ${p.name}`,
            items: [{ inv: { id: "shop:" + p.name, cat, name: p.name, used: false, price: p.price }, old: now || null }],
          },
          "shop"
        );
  }
  // best first; one line per label (the same part from the inventory and the shop: the inventory one)
  // the best one per category from the inventory and the best one per category from the shop (Mariusz: not overwhelming)
  const cat = o => (o.build.find(p => p.inv && !p.inv.used && !b.includes(p)) || {}).cat || "",
    seen = new Set();
  return out
    .sort((x, y) => y.profit - x.profit || x.price - y.price)
    .filter(o => !seen.has(o.src + ":" + cat(o)) && seen.add(o.src + ":" + cat(o)))
    .sort((x, y) => (x.src === "inv" ? 0 : 1) - (y.src === "inv" ? 0 : 1) || y.profit - x.profit);
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
