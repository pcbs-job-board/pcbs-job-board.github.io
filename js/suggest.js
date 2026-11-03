/* Suggested part swaps – from the job's objectives (and some hidden objectives) and the PC's parts.
   General rules (agreed with Mariusz):
     G1 only parts the player can buy: unlocked at the career level, allowed DLC / game version
     G2 inside the remaining budget when possible – otherwise the cheapest, marked "over budget"
     G3 must fit the planned PC and its PSU; a part that needs a second change is offered with that change
     G4 cheapest that does the job first, then up to 2 alternatives
     G5 never added by itself – the player ticks a suggestion to add it as a swap
     G6 recalculated whenever an email / PC Stats screenshot (or a typed part) is added
   Priority: the customer's objectives first, then the budget, then hidden objectives (favourite brand…). */

const RATED = new Set(["CPU", "GPU"]);
const CAT_WORDS = [
  ["CPU Cooler", /\b(cpu )?cooler|cpu cooling\b/], ["CPU", /\b(cpu|processor)\b/], ["GPU", /\b(gpu|graphics card|video card)\b/],
  ["Motherboard", /\bmotherboard|mainboard\b/], ["RAM", /\b(ram|memory)\b/], ["PSU", /\b(psu|power supply)\b/],
  ["Storage", /\b(hdd|ssd|hard drive|storage|m\.2|nvme)\b/], ["Case", /\bcase\b/], ["Case Fan", /\b(case )?fans?\b/],
];
const catOfText = t => (CAT_WORDS.find(([, re]) => re.test(t)) || [])[0] || null;
const cInfo = p => compatOf(p.name) || {};
const rk = p => +(cInfo(p).rk || 0);
const priceOk = (p, left) => left == null || p.price == null || p.price <= left;

// parts the player can buy now (G1), by category
function shopParts(cat) {
  return INDEX.filter(p => !p.hist && p.cat === cat && p.price != null && unlocked(p));
}
// would this part fit the planned PC (in place of `replace`)? – compatibility only (G3)
function fitsBuild(job, cand, replace) {
  const c = { name: cand.name, cat: cand.cat, pri: 1e9, src: "swap", cand: true };
  const b = compatBuild(job, { replace: replace || null, part: c });
  return !compatIssues(job, b).some(i => i.part === c || i.other === c);
}
// a copy of the job with extra planned swaps – to check power / fit of a combination
const withSwaps = (job, swaps) => ({ ...job, swaps: [...(job.swaps || []), ...swaps.map((s, i) => ({ id: "sg" + i, ...s }))] });
// the cheapest PSU that carries the job (same format as the case allows, fits the case)
function psuFor(job, extraSwaps) {
  const j2 = withSwaps(job, extraSwaps), pc = powerCheck(j2); if (!pc || pc.psuW == null) return null;
  const need = pc.ocWanted ? pc.oc : pc.stock; if (need <= pc.psuW) return null;
  const cur = plannedBuild(j2).filter(c => c.cat === "PSU").pop();
  const ok = shopParts("PSU").filter(p => (powerOf(p.name)?.w || 0) >= need && fitsBuild(j2, p, cur?.name)).sort((a, b) => a.price - b.price);
  return ok[0] ? { cat: "PSU", old: cur?.name || "", name: ok[0].name, price: ok[0].price, why: `PSU for ~${need} W` } : { cat: "PSU", old: cur?.name || "", name: null, why: `needs a PSU of ~${need} W – none unlocked` };
}
// turn a list of candidate parts into the options of one suggestion (G2–G4, brand)
function pickOptions(job, ctx, cands, { replace = "", count = 1, upgrade = false, base = null } = {}) {
  const left = ctx.left;
  const ok = cands.filter(p => fitsBuild(job, p, replace)).sort((a, b) => a.price - b.price || rk(b) - rk(a));
  if (!ok.length) return [];
  const opt = (p, tag) => {
    const swaps = Array.from({ length: count }, () => ({ cat: p.cat, old: replace && count === 1 ? replace : "", new: p.name }));
    const psu = RATED.has(p.cat) ? psuFor(job, swaps) : null, extras = psu ? [psu] : [];
    const total = p.price * count + extras.reduce((t, e) => t + (e.price || 0), 0);
    return { name: p.name, cat: p.cat, price: p.price, count, lvl: p.lvl, pct: p.pct, det: p.det, tag, swaps, extras, total, over: !priceOk({ price: total }, left), rk: rk(p) };
  };
  const out = [], seen = new Set(), add = (p, tag) => { if (p && !seen.has(p.name)) { seen.add(p.name); out.push(opt(p, tag)); } };
  const inBudget = ok.filter(p => priceOk({ price: p.price * count }, left));
  // favourite brand (hidden objective – lowest priority): the brand's part when it does the job inside the budget
  const brandP = (ctx.brands.length ? ok.filter(p => ctx.brands.some(b => brandMatch(p, b))) : [])
    .sort((a, b) => base && RATED.has(base.cat) ? (rk(a) - rk(b)) || a.price - b.price : a.price - b.price);
  const brandIn = brandP.filter(p => inBudget.includes(p));
  if (brandIn.length) add(brandIn[0], `★ ${ctx.brands.find(b => brandMatch(brandIn[0], b))}`);
  add(inBudget[0] || ok[0], upgrade ? "cheapest step up" : "cheapest");
  if (upgrade) { const best = [...inBudget].sort((a, b) => rk(b) - rk(a) || a.price - b.price)[0]; add(best, "best in budget"); }
  else if (base && RATED.has(base.cat)) { const close = [...ok].sort((a, b) => Math.abs(rk(a) - rk(base)) - Math.abs(rk(b) - rk(base)) || a.price - b.price)[0]; add(close, "closest to current"); }
  if (brandP.length && !brandIn.length) add(brandP[0], `★ ${ctx.brands.find(b => brandMatch(brandP[0], b))}`);
  return out.slice(0, 3);
}
// parts at least as good as `ref` (never worse)
function atLeast(ref, cat) {
  const r = cInfo(ref);
  if (RATED.has(cat) && r.rk) return p => rk(p) >= +r.rk;
  if (cat === "Storage" && r.gb) return p => { const c = cInfo(p); return +c.k >= +r.k && +c.gb >= +r.gb && +c.sp >= +r.sp; };
  if (cat === "RAM" && r.gb) return p => { const c = cInfo(p); return +c.gb >= +r.gb && +c.mhz >= +r.mhz; };
  if (cat === "PSU") return p => (powerOf(p.name)?.w || 0) >= (powerOf(ref.name)?.w || 0);
  return () => true;
}
const sameAs = name => p => p.name.toLowerCase() === String(name).toLowerCase();

// ---------- the rules ----------
function suggestSwaps(job, opts = {}) {
  const out = [], build = plannedBuild(job), cur = cat => build.filter(c => c.cat === cat);
  const spent = (job.swaps || []).reduce((t, s) => t + ((s.price ?? priceOf(s.new)) || 0), 0);
  const ctx = { left: job.budget != null ? job.budget - spent : null, brands: (opts.brands || []).filter(Boolean) };
  const objs = jobObjectives(job).filter(o => !/^complete by/i.test(o));
  const add = (key, reason, items, extra = {}) => { if (items.length) out.push({ key, reason, options: items, ...extra }); };
  const missing = (key, reason, need) => out.push({ key, reason, options: [], hint: need });
  const ref = name => { const m = bestPartMatch(name); return m ? INDEX.find(p => p.name === m.name) || { name: m.name, cat: m.cat } : null; };
  const handled = new Set();

  for (const o of objs) {
    const ol = o.toLowerCase();
    // 1 / 2 / 4  Install <part> [or better]
    let m = o.match(/^\W*install\s+(.+?)(\s+or better)?\s*$/i);
    if (m && !/water cooling|dual|two|2 (gpu|graphics)|\brgb\b/i.test(m[1])) {
      const chip = chipFromText(m[1]), r = chip ? INDEX.find(p => p.cat === "GPU" && cInfo(p).c === chip) || ref(m[1]) : ref(m[1]); if (!r) continue;
      const cat = r.cat, curP = cur(cat).pop(), better = !!m[2];
      let cands;
      const size = (m[1].match(/(\d+(?:\.\d+)?)\s*(tb|gb)\b/i) || []), gbWant = size[1] ? +size[1] * (/tb/i.test(size[2]) ? 1000 : 1) : 0;
      if (better && cat === "Storage" && gbWant) cands = shopParts(cat).filter(p => { const c = cInfo(p), rc = cInfo(r); return +c.gb >= gbWant && +c.k >= +(rc.k || 1); });
      else if (better) cands = shopParts(cat).filter(atLeast(r, cat));
      else if (cat === "GPU" && chipFromText(m[1])) { const chip = chipFromText(m[1]); cands = shopParts(cat).filter(p => cInfo(p).c === chip); }
      else cands = shopParts(cat).filter(sameAs(r.name));
      if (curP && cands.some(sameAs(curP.name)) ) continue;                     // already there
      if (curP && better && atLeast(r, cat)(curP)) continue;
      let found = pickOptions(job, ctx, cands, { replace: curP?.name || "", base: curP || r });
      if (!found.length && cat === "CPU") found = cpuWithBoard(job, ctx, cands, curP, cur);
      add("obj:" + o, o, found, { cat, old: curP?.name || "" });
      handled.add(cat); continue;
    }
    // 7 / 8  Upgrade to N GB of RAM
    m = ol.match(/(\d+)\s*gb\s+(of\s+)?(ram|memory)/);
    if (m && /upgrade|install|at least|need/.test(ol)) {
      const want = +m[1], sticks = cur("RAM"), have = sticks.reduce((t, s) => t + +(cInfo(s).gb || 0), 0);
      const board = cur("Motherboard").pop(), slots = board ? +(cInfo(board).ram || 4) : 4;
      if (!sticks.length) { missing("obj:" + o, o, "capture PC Stats to get a RAM suggestion"); continue; }
      if (have >= want) continue;
      const one = sticks[0], same = sticks.every(s => s.name === one.name), g = +(cInfo(one).gb || 0);
      const opts2 = [];
      if (same && g && (want - have) % g === 0) {
        const k = (want - have) / g, shop = shopParts("RAM").find(sameAs(one.name));
        if (sticks.length + k <= slots && shop) opts2.push(...pickOptions(job, ctx, [shop], { count: k }).map(x => ({ ...x, tag: `add ${k} × the same stick` })));
      }
      // replace all sticks with fewer / bigger ones, same speed or faster
      const mhz = Math.max(...sticks.map(s => +(cInfo(s).mhz || 0)));
      for (const n of [2, 4, 1].filter(n => n <= slots)) {
        const per = want / n; if (!Number.isInteger(per)) continue;
        const c = shopParts("RAM").filter(p => +cInfo(p).gb === per && +cInfo(p).mhz >= mhz).sort((a, b) => a.price - b.price)[0];
        if (!c) continue;
        const swaps = [...sticks.map(s => ({ cat: "RAM", old: s.name, new: c.name })).slice(0, n), ...Array.from({ length: Math.max(0, n - sticks.length) }, () => ({ cat: "RAM", old: "", new: c.name }))];
        const removed = sticks.slice(n).map(s => s.name);
        opts2.push({ name: c.name, cat: "RAM", price: c.price, count: n, det: c.det, lvl: c.lvl, pct: c.pct, tag: `${n} × ${per} GB${removed.length ? ` (take out ${removed.length})` : ""}`, swaps, extras: [], removeOld: removed, total: c.price * n, over: !priceOk({ price: c.price * n }, ctx.left) });
        if (opts2.length >= 3) break;
      }
      add("obj:" + o, o, opts2.slice(0, 3), { cat: "RAM" }); handled.add("RAM"); continue;
    }
    // 9  Install dual graphics cards
    if (/dual graphics|two graphics|2 graphics|dual gpu|sli|crossfire/i.test(o)) {
      const gpus = cur("GPU"); if (gpus.length >= 2) continue;
      if (!gpus.length) { missing("obj:" + o, o, "capture PC Stats to get a second-GPU suggestion"); continue; }
      const g = gpus[0], shop = shopParts("GPU").find(sameAs(g.name));
      if (!shop) { missing("obj:" + o, o, `${g.name} isn't in the shop (locked or not sold) – pick a pair yourself`); continue; }
      const opt = pickOptions(job, ctx, [shop], {})[0] || null;
      // the board may need SLI / CrossFire, the PSU more watts – offered together (G3)
      const pairSw = [{ cat: "GPU", old: "", new: shop.name }], extra = [];
      const board = cur("Motherboard").pop(), mc = cInfo(shop).m;
      if (board && mc && !(mc === "SLI" ? cInfo(board).sli === "1" : cInfo(board).cf === "1")) {
        const bc = cInfo(board), nb = shopParts("Motherboard").filter(p => { const c = cInfo(p); return c.s === bc.s && (mc === "SLI" ? c.sli === "1" : c.cf === "1") && (!c.ds || +c.ds >= +(cInfo(shop).sl || 0)); }).filter(p => fitsBuild(withSwaps(job, pairSw), p, board.name)).sort((a, b) => a.price - b.price)[0];
        extra.push(nb ? { cat: "Motherboard", old: board.name, name: nb.name, price: nb.price, why: `board with ${mc}` } : { cat: "Motherboard", old: board.name, name: null, why: `needs a board with ${mc} – none unlocked` });
      }
      const psu = psuFor(job, [...pairSw, ...extra.filter(e => e.name).map(e => ({ cat: e.cat, old: e.old, new: e.name }))]);
      if (psu) extra.push(psu);
      const total = shop.price + extra.reduce((t, e) => t + (e.price || 0), 0);
      add("obj:" + o, o, [{ name: shop.name, cat: "GPU", price: shop.price, count: 1, det: shop.det, lvl: shop.lvl, pct: shop.pct, tag: "same GPU again", swaps: pairSw, extras: extra, total, over: !priceOk({ price: total }, ctx.left) }], { cat: "GPU" });
      continue;
    }
    // 10  Install AIO water cooling (not custom loops)
    if (/water cooling|aio|liquid cool/i.test(o) && !/custom/i.test(o)) { out.push(...aioSuggestion(job, ctx, o, cur)); handled.add("CPU Cooler"); continue; }
    // 12  overclocking
    if (/overclock/i.test(o)) { out.push(...ocSuggestions(job, ctx, o, cur)); continue; }
    // 5  Replace <part>  ·  6  Upgrade <part>
    m = ol.match(/^\W*(replace|upgrade)\s+(the\s+)?(.+)$/);
    if (m && !/\bto\b\s+\d/.test(ol)) {
      const cat = catOfText(m[3]); if (!cat) continue;
      const parts = cur(cat);
      if (!parts.length) { missing("obj:" + o, o, `capture PC Stats to get a ${cat} suggestion`); continue; }
      const p0 = parts[0], hdd = /\bhdd\b/.test(m[3]) ? parts.find(p => cInfo(p).k === "1") || p0 : p0;
      if (m[1] === "replace") {
        const eq = sameOrBrand(cat, hdd, ctx);
        add("obj:" + o, o, pickOptions(job, ctx, eq, { replace: hdd.name, base: hdd }), { cat, old: hdd.name });
      } else {
        const better = shopParts(cat).filter(p => RATED.has(cat) ? rk(p) > rk(hdd) : atLeast(hdd, cat)(p) && !sameAs(hdd.name)(p));
        add("obj:" + o, o, pickOptions(job, ctx, better, { replace: hdd.name, upgrade: true, base: hdd }), { cat, old: hdd.name });
      }
      handled.add(cat); continue;
    }
  }
  // 15  Diagnose and fix + broken-part hint / "customer suspects": identical replacement
  const broken = new Set([...(opts.broken || []), ...(job.suspect ? [job.suspect] : [])].map(x => catOfText(String(x).toLowerCase()) || x).filter(c => CATS.includes(c)));
  if (objs.some(o => /diagnose|fix/i.test(o))) for (const cat of broken) {
    if (handled.has(cat)) continue;
    const p0 = cur(cat)[0]; if (!p0) { missing("hint:" + cat, `Customer hints the ${cat} is broken`, `capture PC Stats to get a ${cat} suggestion`); continue; }
    const eq = sameOrBrand(cat, p0, ctx);
    add("hint:" + cat, `Customer hints the ${cat} is broken – same part again${cur(cat).length > 1 ? " (one of " + cur(cat).length + "; which one shows in the game)" : ""}`, pickOptions(job, ctx, eq, { replace: p0.name, base: p0 }), { cat, old: p0.name });
  }
  // 15b Diagnose and fix + favourite brand ("I'm a total Intel fanboy"): the broken part is the one made by that
  //     brand – the same part again, once per customer's part of that brand (which one is broken shows in the game)
  if (objs.some(o => /diagnose|fix/i.test(o)) && ctx.brands.length) {
    const mine = CATS.flatMap(cat => broken.has(cat) || handled.has(cat) ? [] : cur(cat)).filter(p => { const ix = INDEX.find(x => x.name === p.name); return ix && ctx.brands.some(b => brandMatch(ix, b)); });
    if (!build.length) missing("brandfix", `${ctx.brands[0]} fan + "diagnose and fix" – the broken part is likely made by ${ctx.brands[0]}`, `capture PC Stats to get a suggestion`);
    const seenP = new Set();
    for (const p0 of mine) {
      if (seenP.has(p0.cat + p0.name)) continue; seenP.add(p0.cat + p0.name);
      const ix = INDEX.find(x => x.name === p0.name), b = ctx.brands.find(x => brandMatch(ix, x));
      add("brandfix:" + p0.cat + ":" + p0.name, `${b} fan + "diagnose and fix" – the broken part is likely their ${b} ${p0.cat}: same part again${mine.length > 1 ? ` (one of ${mine.length} ${b} parts)` : ""}`,
        pickOptions(job, ctx, sameOrBrand(p0.cat, p0, ctx), { replace: p0.name, base: p0 }), { cat: p0.cat, old: p0.name });
    }
  }
  // 19  water cooling requested (hidden) – AIO only
  if (opts.waterCooling && !handled.has("CPU Cooler")) out.push(...aioSuggestion(job, ctx, "Water cooling requested (hidden objective)", cur));
  // 18  Add RGB lighting – RGB case fans for free fan places
  if (opts.rgb) {
    const cs = cur("Case").pop(), cc = cs ? cInfo(cs) : {};
    for (const z of ["120", "140"]) {
      const places = +(cc["r" + z] || 0), used = cur("Case Fan").filter(f => cInfo(f).z === z).length, free = places - used;
      if (cs && free > 0) { const fans = shopParts("Case Fan").filter(p => cInfo(p).z === z && cInfo(p).lt === "1"); add("hid:rgb" + z, `Add RGB lighting – ${free} free ${z} mm fan place${free > 1 ? "s" : ""}`, pickOptions(job, ctx, fans, { count: Math.min(free, 2) }), { cat: "Case Fan" }); break; }
    }
  }
  // 20  the planned PC is too much for its PSU
  const pc = powerCheck(job);
  if (pc && pc.psuW != null && (pc.ocWanted ? pc.oc : pc.stock) > pc.psuW) {
    const need = pc.ocWanted ? pc.oc : pc.stock, curPsu = cur("PSU").pop();
    add("fix:power", `PSU too weak – needs ~${need} W`, pickOptions(job, ctx, shopParts("PSU").filter(p => (powerOf(p.name)?.w || 0) >= need), { replace: curPsu?.name || "" }), { cat: "PSU", old: curPsu?.name || "" });
  }
  // 3DMark score of N (0.12.0): XMP, or the cheapest set of parts that reaches it – one tick adds the whole set
  out.push(...benchSuggestions(job, ctx));
  // 21  a customer's part that clashes with a planned swap → the cheapest part that fits (never worse)
  for (const cl of jobCompatIssues(job)) {
    const p = cl.part; if (p.src !== "stats" || p.req) continue;
    const key = "fix:" + p.cat + ":" + p.name; if (out.some(s => s.key === key)) continue;
    const cands = shopParts(p.cat).filter(atLeast(p, p.cat));
    add(key, `${p.cat}: ${p.name} – ${cl.msg}`, pickOptions(job, ctx, cands, { replace: p.name, base: p }), { cat: p.cat, old: p.name });
  }
  return out;
}
// the identical part (or the closest equal-or-better one of the same kind when it can't be bought),
// plus the favourite brand's equal-or-better parts of the same kind
function sameOrBrand(cat, p0, ctx) {
  const same = shopParts(cat).filter(sameAs(p0.name)), alike = shopParts(cat).filter(atLeast(p0, cat)).filter(p => similarTo(p0, p));
  const brand = ctx.brands.length ? alike.filter(p => ctx.brands.some(b => brandMatch(p, b))) : [];
  return [...new Set([...(same.length ? same : alike), ...brand])];
}
const norm = s => " " + String(s).toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim() + " ";
// "Install GTX 1080" → chipset "GeForce GTX 1080" (any maker; not the 1080 Ti / Super)
function chipFromText(t) {
  const on = norm(t), chips = [...new Set(INDEX.filter(p => p.cat === "GPU").map(p => cInfo(p).c).filter(Boolean))];
  const hit = chips.map(c => ({ c, k: norm(c.replace(/^(geforce|radeon)\s+/i, "")) })).filter(({ k }) => on.includes(k)).sort((a, b) => b.k.length - a.k.length)[0];
  return hit ? hit.c : null;
}
// "the same kind of part" when the identical one can't be bought: same socket / size / format / type
function similarTo(a, b) {
  const x = cInfo(a), y = cInfo(b);
  switch (a.cat) {
    case "Motherboard": return x.s === y.s && x.f === y.f;
    case "CPU": return sockOk(x.s, y.s);
    case "PSU": return x.f === y.f;
    case "Storage": return x.t === y.t;
    case "Case": return (x.b || "") === (y.b || "");
    case "CPU Cooler": return !!x.aio === !!y.aio;
    default: return true;
  }
}
// no CPU fits the current socket: the cheapest CPU + motherboard pair that fits the rest of the PC
function cpuWithBoard(job, ctx, cands, curP, cur) {
  const board = cur("Motherboard").pop(), pairs = [];
  for (const sock of new Set(cands.map(p => cInfo(p).s))) {
    const cpu = cands.filter(p => cInfo(p).s === sock).sort((a, b) => a.price - b.price)[0]; if (!cpu) continue;
    const sw = [{ cat: "CPU", old: curP?.name || "", new: cpu.name }];
    const nb = shopParts("Motherboard").filter(p => cInfo(p).s === sock).filter(p => fitsBuild(withSwaps(job, sw), p, board?.name)).sort((a, b) => a.price - b.price)[0];
    if (nb) pairs.push({ cpu, nb, total: cpu.price + nb.price });
  }
  return pairs.sort((a, b) => a.total - b.total).slice(0, 2).map((x, i) => {
    const extras = [{ cat: "Motherboard", old: board?.name || "", name: x.nb.name, price: x.nb.price, why: `board for socket ${cInfo(x.cpu).s}` }];
    const psu = psuFor(job, [{ cat: "CPU", old: curP?.name || "", new: x.cpu.name }, { cat: "Motherboard", old: board?.name || "", new: x.nb.name }]); if (psu) extras.push(psu);
    const total = x.cpu.price + extras.reduce((t, e) => t + (e.price || 0), 0);
    return { name: x.cpu.name, cat: "CPU", price: x.cpu.price, count: 1, lvl: x.cpu.lvl, pct: x.cpu.pct, det: x.cpu.det, tag: i ? "other socket" : "cheapest – needs a new motherboard",
      swaps: [{ cat: "CPU", old: curP?.name || "", new: x.cpu.name }], extras, total, over: !priceOk({ price: total }, ctx.left) };
  });
}
function aioSuggestion(job, ctx, reason, cur) {
  const old = cur("CPU Cooler").pop();
  if (old && cInfo(old).aio === "1") return [];
  const c = shopParts("CPU Cooler").filter(p => cInfo(p).aio === "1");
  const opts = pickOptions(job, ctx, c, { replace: old?.name || "" });
  return opts.length ? [{ key: "obj:aio", reason, options: opts, cat: "CPU Cooler", old: old?.name || "" }] : [];
}
function ocSuggestions(job, ctx, reason, cur) {
  const out = [], cpu = cur("CPU").pop(), board = cur("Motherboard").pop();
  if (cpu && cInfo(cpu).oc === "0") {
    const c = shopParts("CPU").filter(p => cInfo(p).oc === "1" && sockOk(cInfo(p).s, cInfo(cpu).s) && rk(p) >= rk(cpu));
    const o = pickOptions(job, ctx, c, { replace: cpu.name, base: cpu }); if (o.length) out.push({ key: "obj:oc-cpu", reason: reason + " – the CPU is locked", options: o, cat: "CPU", old: cpu.name });
  }
  if (board && cInfo(board).oc === "0") {
    const bc = cInfo(board), c = shopParts("Motherboard").filter(p => cInfo(p).oc === "1" && cInfo(p).s === bc.s && cInfo(p).f === bc.f);
    const o = pickOptions(job, ctx, c, { replace: board.name }); if (o.length) out.push({ key: "obj:oc-board", reason: reason + " – the motherboard can't overclock", options: o, cat: "Motherboard", old: board.name });
  }
  return out;
}
// ---------- 3DMark score ----------
// does a set of new parts fit the planned PC (with each other too)? – compatibility incl. slot counts
function planFits(job, swaps) {
  const j2 = withSwaps(job, swaps), b = compatBuild(j2), mine = p => p && p.src === "swap" && /^sg\d/.test(p.swapId || "");
  return !compatIssues(j2, b).some(i => mine(i.part) || mine(i.other));
}
const BENCH_LABEL = { "RAM": "More RAM sticks (more channels)", "GPU": "New GPU", "GPU + RAM": "New GPU + RAM sticks", "2 GPUs": "Two new GPUs", "2 GPUs + RAM": "Two new GPUs + RAM sticks",
  "2nd GPU": "Second GPU (same card)", "2nd GPU + RAM": "Second GPU + RAM sticks", "CPU": "New CPU", "CPU + RAM": "New CPU + RAM sticks", "CPU + GPU": "New CPU + GPU",
  "CPU + GPU + RAM": "New CPU + GPU + RAM sticks", "Motherboard + CPU": "New motherboard + CPU", "Motherboard + CPU + RAM": "New motherboard + CPU + RAM sticks" };
const XMP_TASK = "Turn on XMP in the BIOS (RAM settings) – needed for the 3DMark score";
function benchSuggestions(job, ctx) {
  const target = benchTarget(job); if (!target) return [];
  const build = plannedBuild(job), now = benchScore(build), n = x => x.toLocaleString();
  const reason = `3DMark score of ${n(target)}`;
  if (now.missing.length) return [{ key: "bench", reason, options: [], hint: `capture PC Stats to get a suggestion (needs ${now.missing.join(", ")})` }];
  if (now.off >= target) return [];
  const why = `${reason} – now ${n(now.off)} (XMP off) / ${n(now.on)} (XMP on)`;
  const set = (label, tag, swaps, sc, extras = []) => {
    const parts = swaps.reduce((t, s) => t + (s.price || 0), 0), total = parts + extras.reduce((t, e) => t + (e.price || 0), 0);
    return { multi: true, name: label, cat: "3DMark", tag, swaps, extras, tasks: sc.off >= target ? [] : [XMP_TASK], score: sc.off >= target ? sc.off : sc.on, xmp: sc.off < target,
      total, price: total, count: 1, lvl: Math.max(0, ...swaps.map(s => s.lvl || 0)), over: !priceOk({ price: total }, ctx.left), nParts: swaps.length + extras.filter(e => e.name).length };
  };
  if (now.on >= target) return [{ key: "bench", reason: why, cat: "3DMark", options: [set("Turn on XMP – no new parts", "free", [], now)] }];

  // what can change: parts an objective asks for stay
  const locked = new Set(compatBuild(job).filter(p => p.req).map(p => p.cat));
  const cur = c => build.filter(p => p.cat === c), cpu0 = cur("CPU")[0], mb0 = cur("Motherboard")[0], gpus0 = cur("GPU"), ram0 = cur("RAM");
  const mbB = benchOf(mb0.name), cpuB = benchOf(cpu0.name), stick = Math.min(...ram0.map(r => +(cInfo(r).mhz || 0)).filter(Boolean)), sticks = ram0.length;
  const nG = gpus0.length > 1 && gpus0[1].name === gpus0[0].name ? 2 : 1;
  const score = (c, steps, gpu, k) => {   // c: CPU factors, steps: board RAM steps, gpu: graphics score, k: RAM sticks
    const ch = Math.min(k, c.maxCh || 1), off = sysBench(cpuBench(c, ch, Math.min(c.defMem || stick, stick)), gpu), on = sysBench(cpuBench(c, ch, xmpSpeed(stick, steps)), gpu);
    return { off, on };
  };
  const sw = (p, old) => ({ cat: p.cat, old: old || "", new: p.name, price: p.price, lvl: p.lvl });
  const withB = (cat, f) => shopParts(cat).map(p => ({ p, b: benchOf(p.name) })).filter(x => x.b && (!f || f(x.p, x.b)));
  // RAM: fill the free channels with the same stick (or the cheapest one like it)
  let ramFill = null;
  if (!locked.has("RAM") && sticks < (cpuB.maxCh || 1)) {
    const r0 = ram0[0], same = shopParts("RAM").filter(sameAs(r0.name))[0] || shopParts("RAM").filter(p => +cInfo(p).mhz === stick && +cInfo(p).gb === +cInfo(r0).gb).sort((a, b) => a.price - b.price)[0];
    if (same) ramFill = { k: (cpuB.maxCh || 1) - sticks, p: same };
  }
  const fillSw = () => ramFill ? Array.from({ length: ramFill.k }, () => sw(ramFill.p)) : [];
  const cands = [];   // { type, swaps, sc, cost }
  const push = (type, swaps, sc) => { if (sc.on >= target) cands.push({ type, swaps, sc, cost: swaps.reduce((t, s) => t + s.price, 0) }); };
  const both = (type, swaps, c, steps, gpu) => {   // without and with the RAM channels filled
    push(type, swaps, score(c, steps, gpu, sticks));
    if (ramFill) push(type + " + RAM", [...swaps, ...fillSw()], score(c, steps, gpu, sticks + ramFill.k));
  };
  const gNow = nG === 2 ? benchOf(gpus0[0].name).two : benchOf(gpus0[0].name).one;
  if (ramFill) push("RAM", fillSw(), score(cpuB, mbB.steps, gNow, sticks + ramFill.k));
  const gpusNew = locked.has("GPU") ? [] : withB("GPU");
  const gpuSw = g => nG === 2 ? [sw(g, gpus0[0].name), sw(g, gpus0[1].name)] : [sw(g, gpus0[0].name)];
  for (const { p: g, b } of gpusNew) {
    both("GPU", gpuSw(g), cpuB, mbB.steps, nG === 2 ? b.two : b.one);
    if (nG === 1 && b.two && cInfo(g).m) both("2 GPUs", [sw(g, gpus0[0].name), sw(g)], cpuB, mbB.steps, b.two);
  }
  if (nG === 1 && !locked.has("GPU") && benchOf(gpus0[0].name).two && cInfo(gpus0[0]).m) { const same = shopParts("GPU").filter(sameAs(gpus0[0].name))[0]; if (same) both("2nd GPU", [sw(same)], cpuB, mbB.steps, benchOf(same.name).two); }
  const cpus = locked.has("CPU") ? [] : withB("CPU");
  for (const { p: c, b } of cpus) if (sockOk(cInfo(mb0).s, cInfo(c).s)) {
    both("CPU", [sw(c, cpu0.name)], b, mbB.steps, gNow);
    for (const { p: g, b: gb } of gpusNew) both("CPU + GPU", [sw(c, cpu0.name), ...gpuSw(g)], b, mbB.steps, nG === 2 ? gb.two : gb.one);
  }
  if (!locked.has("CPU") && !locked.has("Motherboard")) for (const { p: m, b: mbN } of withB("Motherboard")) for (const { p: c, b } of cpus)
    if (sockOk(cInfo(m).s, cInfo(c).s)) both("Motherboard + CPU", [sw(m, mb0.name), sw(c, cpu0.name)], b, mbN.steps, gNow);
  cands.sort((a, b) => a.cost - b.cost || b.sc.on - a.sc.on);
  // cheapest that fits (+ the PSU it needs) for each kind of change; inside the budget when possible
  const best = new Map(), brandBest = { o: null }; let checks = 0;
  const isBrand = c => ctx.brands.length && c.swaps.filter(s => s.cat !== "RAM").every(s => { const ix = INDEX.find(x => x.name === s.new); return ix && ctx.brands.some(b => brandMatch(ix, b)); });
  for (const c of cands) {
    const have = best.get(c.type);
    if (have && !have.over && (!isBrand(c) || brandBest.o)) continue;
    if (++checks > 400) break;
    if (!planFits(job, c.swaps)) continue;
    const psu = psuFor(job, c.swaps.map(({ cat, old, new: nw }) => ({ cat, old, new: nw })));
    if (psu && !psu.name) continue;
    const o = set(BENCH_LABEL[c.type] || c.type, "", c.swaps, c.sc, psu ? [psu] : []);
    if (isBrand(c) && !brandBest.o && !o.over) brandBest.o = o;
    if (!have || (have.over && !o.over)) best.set(c.type, o);
    if ([...best.values()].filter(x => !x.over).length >= 5 && brandBest.o) break;
  }
  let options = [...best.values()].sort((a, b) => a.over - b.over || a.total - b.total);
  // a set that only adds parts to a cheaper set already shown is no real choice ("2nd GPU + RAM" after "2nd GPU")
  const key = o => o.swaps.map(x => x.cat + ">" + x.new);
  options = options.filter(o => !options.some(x => x !== o && x.total <= o.total && !x.over && key(x).length < key(o).length && key(x).every(k => key(o).includes(k))));
  options = options.filter((o, i) => !o.over || !options.some(x => !x.over)).slice(0, 4);
  options.forEach((o, i) => o.tag = i === 0 ? "cheapest" : "");
  if (brandBest.o && !options.some(o => o.swaps.map(s => s.new).join() === brandBest.o.swaps.map(s => s.new).join())) { brandBest.o.tag = `★ ${ctx.brands[0]}`; options.push(brandBest.o); }
  else if (brandBest.o) { const o = options.find(o => o.swaps.map(s => s.new).join() === brandBest.o.swaps.map(s => s.new).join()); o.tag = (o.tag ? o.tag + " · " : "") + `★ ${ctx.brands[0]}`; }
  return [{ key: "bench", reason: why, cat: "3DMark", options, hint: options.length ? "" : "No unlocked parts reach this score – check the budget or your career level." }];
}
if (typeof module !== "undefined") module.exports = { suggestSwaps, benchSuggestions };
