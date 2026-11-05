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
  return INDEX.filter(p => !p.hist && !p.noShop && p.cat === cat && p.price != null && unlocked(p));   // menu cases etc. can't be bought
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
  // coolers and fans: never less air flow (the game calls a weaker one a "worse part" and won't finish the job)
  if ((cat === "CPU Cooler" || cat === "Case Fan" || cat === "Water Cooling") && r.af) return p => { const c = cInfo(p); return +(c.af || 0) >= +r.af && (cat !== "Case Fan" || !r.z || c.z === r.z); };
  return () => true;
}
const sameAs = name => p => p.name.toLowerCase() === String(name).toLowerCase();

// two of the same card: the board must have SLI / CrossFire (the card's kind), the PSU must carry both – extras for a pair
function pairExtras(job, card, swaps, board) {
  const extra = [], mc = cInfo(card).m;
  // the board needs the right kind (SLI / CrossFire) AND room for two cards this wide (ds = widest card it fits two of)
  const bi = board ? cInfo(board) : {}, room = c => !c.ds || !cInfo(card).sl || +c.ds >= +cInfo(card).sl;
  if (board && mc && !((mc === "SLI" ? bi.sli === "1" : bi.cf === "1") && room(bi))) {
    const bc = cInfo(board), nb = shopParts("Motherboard").filter(p => { const c = cInfo(p); return c.s === bc.s && (mc === "SLI" ? c.sli === "1" : c.cf === "1") && (!c.ds || +c.ds >= +(cInfo(card).sl || 0)); }).filter(p => fitsBuild(withSwaps(job, swaps), p, board.name)).sort((a, b) => a.price - b.price)[0];
    extra.push(nb ? { cat: "Motherboard", old: board.name, name: nb.name, price: nb.price, why: `board with ${mc} and room for two ${cInfo(card).sl || ""}-slot cards` } : { cat: "Motherboard", old: board.name, name: null, why: `needs a board with ${mc} and room for two of these cards – none unlocked` });
  }
  const psu = psuFor(job, [...swaps, ...extra.filter(e => e.name).map(e => ({ cat: e.cat, old: e.old, new: e.name }))]);
  if (psu) extra.push(psu);
  return extra;
}
// ---------- the rules ----------
function suggestSwaps(job, opts = {}) {
  const out = [], build = plannedBuild(job), cur = cat => build.filter(c => c.cat === cat);
  const spent = (job.swaps || []).reduce((t, s) => t + ((s.price ?? priceOf(s.new)) || 0), 0);
  const ctx = { left: job.budget != null ? job.budget - spent : null, brands: (opts.brands || []).filter(Boolean), picked: opts.picked || [], pickedLights: opts.pickedLights || [] };
  const objs = jobObjectives(job).filter(o => !/^complete by/i.test(o));
  const add = (key, reason, items, extra = {}) => { if (items.length) out.push({ key, reason, options: items, ...extra }); };
  const missing = (key, reason, need) => out.push({ key, reason, options: [], hint: need });
  const ref = name => { const m = bestPartMatch(name); return m ? INDEX.find(p => p.name === m.name) || { name: m.name, cat: m.cat } : null; };
  const handled = new Set(); ctx.objCats = handled;
  // "Upgrade Graphics Card" + "Install dual graphics cards": the upgrade is offered as a PAIR of new cards (one tick
  // adds both), and the dual-GPU rule adds nothing on top
  const DUAL = /dual graphics|two graphics|2 graphics|dual gpu|sli|crossfire/i;
  const pairMode = objs.some(o => DUAL.test(o)) && objs.some(o => /^\W*upgrade\s+(the\s+)?(graphics|gpu|video)/i.test(o)) && cur("GPU").length < 2;   // categories an objective picks a part for (the 3DMark set leaves them to it)
  const newBuild = !(job.components || []).length;   // "build one from nothing" jobs

  for (const o of objs) {
    const ol = o.toLowerCase();
    // 3b  "Install Parts with Lights: 6 coloured (255,0,255)" – 6 parts with RGB lighting (colour set in the game)
    const mL = o.match(/parts with lights?\s*:?\s*(\d+)/i);
    if (mL) { const sg = lightsSuggestion(job, ctx, +mL[1], o); if (sg) out.push(sg); continue; }
    // 1 / 2 / 4  Install <part> [or better]
    let m = o.match(/^\W*install\s+(.+?)(\s+or better)?\s*$/i);
    if (m && !/water cooling|dual|two|2 (gpu|graphics)|\brgb\b/i.test(m[1])) {
      const chip = chipFromText(m[1]), r = chip ? INDEX.find(p => p.cat === "GPU" && cInfo(p).c === chip) || ref(m[1]) : ref(m[1]); if (!r) continue;
      const cat = r.cat, curP = cur(cat).pop(), better = !!m[2] && cat !== "Case";   // "or better" for a case: no way to rank cases – the one asked for
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
      if (!sticks.length && !newBuild) { missing("obj:" + o, o, "capture PC Stats to get a RAM suggestion"); continue; }
      if (have >= want) continue;
      const one = sticks[0], same = !!one && sticks.every(s => s.name === one.name), g = one ? +(cInfo(one).gb || 0) : 0;
      const opts2 = [];
      if (same && g && (want - have) % g === 0) {
        const k = (want - have) / g, shop = shopParts("RAM").find(sameAs(one.name));
        if (sticks.length + k <= slots && shop) opts2.push(...pickOptions(job, ctx, [shop], { count: k }).map(x => ({ ...x, tag: `add ${k} × the same stick` })));
      }
      // replace all sticks with fewer / bigger ones, same speed or faster
      const mhz = sticks.length ? Math.max(...sticks.map(s => +(cInfo(s).mhz || 0))) : 0;
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
    if (DUAL.test(o)) {
      const gpus = cur("GPU"); if (gpus.length >= 2 || pairMode) continue;
      if (!gpus.length) { missing("obj:" + o, o, "capture PC Stats to get a second-GPU suggestion"); continue; }
      const g = gpus[0], shop = shopParts("GPU").find(sameAs(g.name));
      if (!shop) { missing("obj:" + o, o, `${g.name} isn't in the shop (locked or not sold) – pick a pair yourself`); continue; }
      const opt = pickOptions(job, ctx, [shop], {})[0] || null;
      // the board may need SLI / CrossFire, the PSU more watts – offered together (G3)
      const pairSw = [{ cat: "GPU", old: "", new: shop.name }], extra = [];
      const board = cur("Motherboard").pop(), mc = cInfo(shop).m;
      // the board needs the right kind (SLI / CrossFire) AND room for two cards this wide (ds = widest card it fits two of)
  const bi = board ? cInfo(board) : {}, room = c => !c.ds || !cInfo(card).sl || +c.ds >= +cInfo(card).sl;
  if (board && mc && !((mc === "SLI" ? bi.sli === "1" : bi.cf === "1") && room(bi))) {
        const bc = cInfo(board), nb = shopParts("Motherboard").filter(p => { const c = cInfo(p); return c.s === bc.s && (mc === "SLI" ? c.sli === "1" : c.cf === "1") && (!c.ds || +c.ds >= +(cInfo(shop).sl || 0)); }).filter(p => fitsBuild(withSwaps(job, pairSw), p, board.name)).sort((a, b) => a.price - b.price)[0];
        extra.push(nb ? { cat: "Motherboard", old: board.name, name: nb.name, price: nb.price, why: `board with ${mc} and room for two ${cInfo(card).sl || ""}-slot cards` } : { cat: "Motherboard", old: board.name, name: null, why: `needs a board with ${mc} and room for two of these cards – none unlocked` });
      }
      const psu = psuFor(job, [...pairSw, ...extra.filter(e => e.name).map(e => ({ cat: e.cat, old: e.old, new: e.name }))]);
      if (psu) extra.push(psu);
      const total = shop.price + extra.reduce((t, e) => t + (e.price || 0), 0);
      add("obj:" + o, o, [{ name: shop.name, cat: "GPU", price: shop.price, count: 1, det: shop.det, lvl: shop.lvl, pct: shop.pct, tag: "same GPU again", swaps: pairSw, extras: extra, total, over: !priceOk({ price: total }, ctx.left) }], { cat: "GPU" });
      continue;
    }
    // 10b "watercooled GPU" / "custom water cooling for the GPU": a watercooled version (Custom Water Cooling Shop), never worse
    if (/\b(gpu|graphics)\b/i.test(o) && /water ?cool/i.test(o)) {
      const g = cur("GPU")[0]; if (g && isWaterGPU(g)) { handled.add("GPU"); continue; }
      const c = shopParts("GPU").filter(p => isWaterGPU(p) && (!g || rk(p) >= rk(g)));
      if (!c.length) missing("obj:" + o, o, hasUnlock("customWC") ? "No watercooled GPU unlocked yet." : gateMsg("customWC").replace(/<\/?b>/g, "") + ".");
      else add("obj:" + o, o, pickOptions(job, ctx, c, { replace: g?.name || "", base: g || null }), { cat: "GPU", old: g?.name || "" });
      handled.add("GPU"); continue;
    }
    // 10  Install AIO water cooling (not custom loops)
    if (/water cooling|aio|liquid cool/i.test(o) && !/custom/i.test(o)) { out.push(...aioSuggestion(job, ctx, o, cur)); handled.add("CPU Cooler"); continue; }
    // 12  overclocking
    if (/\b(overclock\w*|oc)\b/i.test(o)) { out.push(...ocSuggestions(job, ctx, o, cur)); continue; }
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
        // a GPU "upgrade" must also not score lower in 3DMark (RX 480: higher ranking than a GTX 1060, but a lower score)
        const g0 = cat === "GPU" && benchOf(hdd.name), scoreOk = p => !g0 || !benchOf(p.name) || benchOf(p.name).one >= g0.one;
        // GPUs: "better" = a higher in-game 3DMark score (Mariusz: the game counts the score, not the model year);
        // without score data the ranking decides
        const gBetter = p => { const b = benchOf(p.name); return g0 && b ? b.one > g0.one : rk(p) > rk(hdd); };
        const better = shopParts(cat).filter(p => cat === "GPU" ? gBetter(p) : (RATED.has(cat) ? rk(p) > rk(hdd) : atLeast(hdd, cat)(p) && !sameAs(hdd.name)(p)) && scoreOk(p));
        if (cat === "GPU" && pairMode) {
          // only cards that run as a pair in the game (SLI / CrossFire)
          // a board that takes two of this card as it is (kind + room): first choice – and the only one when the board must stay
          const board = cur("Motherboard").pop(), bi = board ? cInfo(board) : {};
          const onBoard = p => !board || ((cInfo(p).m === "SLI" ? bi.sli === "1" : bi.cf === "1") && (!bi.ds || !cInfo(p).sl || +bi.ds >= +cInfo(p).sl));
          const duo0 = better.filter(p => cInfo(p).m), duo = boardIsFixed(job) || duo0.some(onBoard) ? duo0.filter(onBoard) : duo0;
          const half = { ...ctx, left: ctx.left == null ? null : ctx.left / 2 };   // two cards share the budget
          const opts2 = pickOptions(job, half, duo, { replace: hdd.name, upgrade: true, base: hdd }).map(op => {
            const card = INDEX.find(x => x.name === op.name), swaps = [{ cat: "GPU", old: hdd.name, new: op.name }, { cat: "GPU", old: "", new: op.name }];
            const extras = pairExtras(job, card, swaps, board), total = op.price * 2 + extras.reduce((t, e) => t + (e.price || 0), 0);
            const all = [...swaps, ...extras.filter(e => e.name).map(e => ({ cat: e.cat, old: e.old, new: e.name }))];
            if (extras.some(e => !e.name) || !planFits(job, all)) return null;   // can't be made to fit
            return { ...op, count: 2, tag: op.tag + " · pair (" + cInfo(card).m + ")", swaps, extras, total, over: !priceOk({ price: total }, ctx.left) };
          }).filter(Boolean);
          add("obj:" + o, o + " – as a pair (dual graphics cards)", opts2, { cat, old: hdd.name });
          if (!opts2.length) missing("obj:" + o, o + " – as a pair", "No better SLI / CrossFire card fits – pick a pair yourself.");
        } else
        add("obj:" + o, o, pickOptions(job, ctx, better, { replace: hdd.name, upgrade: true, base: hdd }), { cat, old: hdd.name });
      }
      handled.add(cat); continue;
    }
  }
  // 15  Diagnose and fix + broken-part hint / "customer suspects": identical replacement
  const broken = new Set([...(opts.broken || []), ...(job.suspect ? [job.suspect] : [])].map(x => catOfText(String(x).toLowerCase()) || x).filter(c => CATS.includes(c)));
  if (objs.some(o => /diagnose|fix/i.test(o))) for (const cat of broken) {
    if (handled.has(cat) || (cat === "CPU" && cpuIsFixed(job))) continue;
    const p0 = cur(cat)[0]; if (!p0) { missing("hint:" + cat, `Customer hints the ${cat} is broken`, `capture PC Stats to get a ${cat} suggestion`); continue; }
    const eq = sameOrBrand(cat, p0, ctx);
    add("hint:" + cat, `Customer hints the ${cat} is broken – same part again${cur(cat).length > 1 ? " (one of " + cur(cat).length + "; which one shows in the game)" : ""}`, pickOptions(job, ctx, eq, { replace: p0.name, base: p0 }), { cat, old: p0.name });
  }
  // 15b Diagnose and fix + favourite brand ("I'm a total Intel fanboy"): the broken part is the one made by that
  //     brand – the same part again, once per customer's part of that brand (which one is broken shows in the game)
  if (objs.some(o => /diagnose|fix/i.test(o)) && ctx.brands.length) {
    const mine = CATS.flatMap(cat => broken.has(cat) || handled.has(cat) || (cat === "CPU" && cpuIsFixed(job)) ? [] : cur(cat)).filter(p => { const ix = INDEX.find(x => x.name === p.name); return ix && ctx.brands.some(b => brandMatch(ix, b)); });
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
  if (opts.rgb && !objs.some(o => /parts with lights?/i.test(o))) {   // the lights objective has its own set
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
  // 20b the customer plans to overclock LATER (email body, not an objective): a PSU that carries the overclocked PC –
  //     only inside the budget (it's not something the job asks for)
  if (pc && pc.psuW != null && pc.ocLater && pc.oc > pc.psuW && !(pc.stock > pc.psuW)) {
    const curPsu = cur("PSU").pop(), o = pickOptions(job, ctx, shopParts("PSU").filter(p => (powerOf(p.name)?.w || 0) >= pc.oc), { replace: curPsu?.name || "" }).filter(x => !x.over);
    add("fix:oclater", `The customer plans to overclock – overclocked the PC needs ~${pc.oc} W, the PSU has ${pc.psuW} W (optional, in budget)`, o, { cat: "PSU", old: curPsu?.name || "" });
  }
  // "Install dual graphics cards" (no board objective): the customer's motherboard stays – no option may change it
  if (boardIsFixed(job)) for (const sg of out) {
    const n = sg.options.length; sg.options = sg.options.filter(o => !(o.swaps || []).some(w => w.cat === "Motherboard") && !(o.extras || []).some(e => e.cat === "Motherboard"));
    if (n && !sg.options.length) sg.hint = "Every option here needs a new motherboard – this job keeps the customer's board (dual GPUs). Pick parts that fit it.";
  }
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
  // the identical part (or, without it, similar ones) + favourite-brand parts – all at least as good (atLeast: rating, air flow…)
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
function cpuWithBoard(job, ctx, cands, curP, cur, boardOk = () => true) {
  const board = cur("Motherboard").pop(), pairs = [];
  for (const sock of new Set(cands.map(p => cInfo(p).s))) {
    const cpu = cands.filter(p => cInfo(p).s === sock).sort((a, b) => a.price - b.price)[0]; if (!cpu) continue;
    const sw = [{ cat: "CPU", old: curP?.name || "", new: cpu.name }];
    const nb = shopParts("Motherboard").filter(p => cInfo(p).s === sock && boardOk(p)).filter(p => fitsBuild(withSwaps(job, sw), p, board?.name)).sort((a, b) => a.price - b.price)[0];
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
// an overclock objective: the parts it can't be done with (locked CPU, board that can't overclock, a GPU whose maximum
// clock is under the target) → the cheapest that can; a CPU target above its overclock base → optional CPUs that reach
// it at their overclock base (in budget only). Favourite brand first, as everywhere (pickOptions).
function ocSuggestions(job, ctx, reason, cur) {
  const out = [], t = ocTargets({ objectives: [reason] })[0] || { part: "CPU", mhz: null }, cpu = cur("CPU").pop(), board = cur("Motherboard").pop();
  // the player can't overclock this part in the game yet (OCCT at level 6, GPU Tuner at 13) → say so, suggest nothing
  const gate = t.part === "CPU" ? "cpuOC" : t.part === "GPU" ? "gpuOC" : null;
  if (gate && !hasUnlock(gate)) return [{ key: "obj:oc-locked", reason, options: [], hint: gateMsg(gate).replace(/<\/?b>/g, "") + "." }];
  if (t.part === "CPU") {
    const reach = p => t.mhz == null || (ocReach(p.name) || 0) >= t.mhz;   // 90 % of the overclock potential
    const fixed = cpuIsFixed(job);   // the customer's own CPU must be overclocked – no CPU swaps
    if (fixed && cpu && (cInfo(cpu).oc === "0" || !ocOf(cpu.name))) out.push({ key: "obj:oc-cpu", reason: reason + " – the CPU is locked", options: [], hint: `This job overclocks the customer's own CPU, and ${cpu.name} is locked. Check the CPU name read from PC Stats – the game doesn't swap it for you.` });
    else if (fixed) { /* no CPU suggestions: the board below is all that can be changed */ }
    else if (cpu && (cInfo(cpu).oc === "0" || !ocOf(cpu.name))) {
      const c = shopParts("CPU").filter(p => cInfo(p).oc === "1" && ocOf(p.name) && sockOk(cInfo(p).s, cInfo(cpu).s) && rk(p) >= rk(cpu) && reach(p));
      const o = pickOptions(job, ctx, c, { replace: cpu.name, base: cpu }); if (o.length) out.push({ key: "obj:oc-cpu", reason: reason + " – the CPU is locked", options: o, cat: "CPU", old: cpu.name });
      else { const w = cpuWithBoard(job, ctx, shopParts("CPU").filter(p => cInfo(p).oc === "1" && ocOf(p.name) && rk(p) >= rk(cpu) && reach(p)), cpu, cur, p => cInfo(p).oc === "1"); if (w.length) out.push({ key: "obj:oc-cpu", reason: reason + (cInfo(board || {}).oc === "0" ? " – the CPU is locked and the motherboard can't overclock: an unlocked CPU + a board that can" : " – the CPU is locked: an unlocked CPU with the motherboard it needs"), options: w, cat: "CPU", old: cpu.name }); }
    } else if (cpu && t.mhz && t.mhz > (ocReach(cpu.name) || 0) && t.mhz > (ocOf(cpu.name)?.mhz || 0)) {
      const c = shopParts("CPU").filter(p => cInfo(p).oc === "1" && sockOk(cInfo(p).s, cInfo(cpu).s) && reach(p) && rk(p) >= rk(cpu));
      const o = pickOptions(job, ctx, c, { replace: cpu.name, base: cpu }).filter(x => !x.over);
      if (o.length) out.push({ key: "obj:oc-cpu-easier", reason: `${reason} – optional: ${t.mhz.toLocaleString()} MHz is above this CPU's estimate (${ocReach(cpu.name).toLocaleString()} MHz, 90 % of its potential); these should reach it`, options: o, cat: "CPU", old: cpu.name });
    }
    if (board && cInfo(board).oc === "0" && !out.some(x => x.options.some(o => (o.extras || []).some(e => e.cat === "Motherboard")))) {
      const bc = cInfo(board), c = shopParts("Motherboard").filter(p => cInfo(p).oc === "1" && sockOk(cInfo(p).s, bc.s) && cInfo(p).f === bc.f);
      const o = pickOptions(job, ctx, c, { replace: board.name }); if (o.length) out.push({ key: "obj:oc-board", reason: reason + " – the motherboard can't overclock", options: o, cat: "Motherboard", old: board.name });
    }
  } else if (t.part === "GPU" && t.mhz) {
    const gpu = cur("GPU")[0], d = gpu && ocOf(gpu.name), max = g => t.mem ? g.maxMem : g.maxCore;
    const est = gpu && ocReach(gpu.name);
    if (gpu && d && t.mhz > (t.mem ? est.mem : est.core)) {
      const c = shopParts("GPU").filter(p => { const x = ocReach(p.name); return x && (t.mem ? x.mem : x.core) >= t.mhz && rk(p) >= rk(gpu); });   // 90 % estimate reaches it, never worse
      const must = t.mhz > max(d), o = pickOptions(job, ctx, c, { replace: gpu.name, base: gpu }).filter(x => must || !x.over);   // optional ones: in budget only
      if (must || o.length) out.push({ key: must ? "obj:oc-gpu" : "obj:oc-gpu-easier", reason: must ? `${reason} – this GPU's maximum ${t.mem ? "memory" : "core"} clock is ${max(d).toLocaleString()} MHz` : `${reason} – optional: above this GPU's estimate (${(t.mem ? est.mem : est.core).toLocaleString()} MHz, 90 % of its potential)`, options: o, cat: "GPU", old: gpu.name, hint: o.length ? "" : "No unlocked GPU reaches that clock." });
    }
  } else if (t.part === "RAM" && t.mhz) {
    const ram = cur("RAM"), ds = ram.map(r => ocOf(r.name)).filter(Boolean);
    if (ds.length && t.mhz > Math.min(...ram.map(r => ocReach(r.name) || 0))) {
      const r0 = ram[0], c = shopParts("RAM").filter(p => +cInfo(p).mhz >= t.mhz && +cInfo(p).gb >= +(cInfo(r0).gb || 0));
      const o = pickOptions(job, ctx, c, { replace: r0.name, count: ram.length }).filter(x => !x.over);
      if (o.length) out.push({ key: "obj:oc-ram", reason: `${reason} – optional: RAM that runs at ${t.mhz.toLocaleString()} MHz with XMP (replaces ${ram.length} stick${ram.length > 1 ? "s" : ""})`, options: o, cat: "RAM", old: r0.name });
    }
  }
  // tell how the parts were picked
  out.forEach(x => { if (!/90 %/.test(x.reason) && x.key !== "obj:oc-board") x.reason += " · picked on 90 % of each part's overclock potential – in-game results depend on cooling / power"; });
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
// RGB = lighting whose colour can be set ("· RGB" in the details); "White lighting" etc. can't be coloured
function isRGB(p) { const ix = INDEX.find(x => x.name === p.name); return !!ix && /(^|·\s*)RGB(\s*·|$)/.test(ix.det || ""); }
// N parts with coloured lighting: count the RGB parts planned, then the cheapest way to the rest – RGB fans for free
// fan places first, then RGB versions of fans / RAM / cooler / drive / GPU already there (never worse, must fit)
function lightsSuggestion(job, ctx, want, reason) {
  if (ctx.pickedLights && ctx.pickedLights.length) job = { ...job, swaps: [...(job.swaps || []), ...ctx.pickedLights.map((x, i) => ({ id: "pl" + i, ...x }))] };
  const build = plannedBuild(job), lit = build.filter(isRGB).length, need = want - lit;
  if (need <= 0) return null;
  const rgbShop = cat => shopParts(cat).filter(isRGB).sort((a, b) => a.price - b.price), items = [];
  const cs = build.filter(p => p.cat === "Case").pop(), cc = cs ? cInfo(cs) : {}, fans = build.filter(p => p.cat === "Case Fan");
  for (const z of ["120", "140"]) {
    const fan = rgbShop("Case Fan").find(p => cInfo(p).z === z); if (!fan || !cs) continue;
    const free = +(cc["r" + z] || 0) - fans.filter(f => cInfo(f).z === z).length;
    for (let i = 0; i < free; i++) items.push({ n: 1, cost: fan.price, swaps: [{ cat: "Case Fan", old: "", new: fan.name, price: fan.price, lvl: fan.lvl }] });
    for (const f of fans.filter(f => cInfo(f).z === z && !isRGB(f))) items.push({ n: 1, cost: fan.price, swaps: [{ cat: "Case Fan", old: f.name, new: fan.name, price: fan.price, lvl: fan.lvl }] });
  }
  const ram = build.filter(p => p.cat === "RAM" && !isRGB(p));
  if (ram.length) { const r0 = cInfo(ram[0]), st = rgbShop("RAM").find(p => +cInfo(p).gb >= +(r0.gb || 0) && +cInfo(p).mhz >= +(r0.mhz || 0));
    if (st) items.push({ n: ram.length, cost: st.price * ram.length, swaps: ram.map(r => ({ cat: "RAM", old: r.name, new: st.name, price: st.price, lvl: st.lvl })) }); }
  for (const cat of ["CPU Cooler", "Storage", "GPU"]) for (const p of build.filter(x => x.cat === cat && !isRGB(x) && !x.req)) {
    const better = atLeast(INDEX.find(x => x.name === p.name) || p, cat), c = rgbShop(cat).find(x => better(x) && fitsBuild(job, x, p.name));
    if (c) items.push({ n: 1, cost: c.price, swaps: [{ cat, old: p.name, new: c.name, price: c.price, lvl: c.lvl }] });
  }
  items.sort((a, b) => a.cost / a.n - b.cost / b.n || a.cost - b.cost);
  const take = []; let got = 0; for (const it of items) { if (got >= need) break; take.push(it); got += it.n; }
  const lead = `${reason} – ${lit} of ${want} planned`;
  if (got < need) return { key: "lights", reason: lead, options: [], hint: `Only ${got} more RGB part${got === 1 ? "" : "s"} found for this PC – pick a case with more fan places or RGB parts yourself.` };
  const swaps = take.flatMap(t => t.swaps), total = swaps.reduce((t, x) => t + x.price, 0), colour = (reason.match(/\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/) || [])[0];
  return { key: "lights", reason: lead, cat: "Lights", options: [{ multi: true, name: `${need} more RGB part${need > 1 ? "s" : ""}`, cat: "Lights", tag: "cheapest", swaps, extras: [],
    tasks: [`Set the lighting of ${want} parts to ${colour ? "colour " + colour : "the colour asked for"}`], score: null, total, price: total, count: 1,
    lvl: Math.max(0, ...swaps.map(x => x.lvl || 0)), over: !priceOk({ price: total }, ctx.left), nParts: swaps.length }] };
}
function benchSuggestions(job, ctx) {
  const target = benchTarget(job); if (!target) return [];
  if (ctx.picked && ctx.picked.length) job = { ...job, swaps: [...(job.swaps || []), ...ctx.picked.map((x, i) => ({ id: "pk" + i, ...x }))] };   // ticked in the new-job window
  const build = plannedBuild(job), now = benchScore(build), n = x => x.toLocaleString();
  const reason = `3DMark score of ${n(target)}`;
  const newBuild = !(job.components || []).length;
  if (now.missing.length && !newBuild) return [{ key: "bench", reason, options: [], hint: `capture PC Stats to get a suggestion (needs ${now.missing.join(", ")})` }];
  if (!now.missing.length && now.off >= target) return [];
  const why = now.missing.length ? `${reason} – new build` : `${reason} – now ${n(now.off)} (XMP off) / ${n(now.on)} (XMP on)`;
  const set = (label, tag, swaps, sc, extras = []) => {
    const parts = swaps.reduce((t, s) => t + (s.price || 0), 0), total = parts + extras.reduce((t, e) => t + (e.price || 0), 0);
    return { multi: true, name: label, cat: "3DMark", tag, swaps, extras, tasks: sc.off >= target ? [] : [XMP_TASK], score: sc.off >= target ? sc.off : sc.on, xmp: sc.off < target,
      total, price: total, count: 1, lvl: Math.max(0, ...swaps.map(s => s.lvl || 0)), over: !priceOk({ price: total }, ctx.left), nParts: swaps.length + extras.filter(e => e.name).length };
  };
  if (now.missing.length) return newBuildBench(job, ctx, target, build, why, set);
  if (now.on >= target) return [{ key: "bench", reason: why, cat: "3DMark", options: [set("Turn on XMP – no new parts", "free", [], now)] }];

  // what can change: parts an objective asks for stay
  const locked = new Set(compatBuild(job).filter(p => p.req).map(p => p.cat));
  if (cpuIsFixed(job)) locked.add("CPU");   // "Overclock CPU": the customer's CPU stays
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
// 3DMark for a PC built from nothing: the cheapest CPU + motherboard + RAM (+ GPU) that reach the score – parts already
// planned (an objective's GPU, RAM…) stay – plus the PSU and CPU cooler it needs to run. Search: per category only the
// parts that are the best for their price (a dearer part must score higher), then every mix of them.
function newBuildBench(job, ctx, target, build, why, set) {
  const have = c => build.filter(p => p.cat === c), WANT = ["GPU", "CPU", "Motherboard", "RAM"];
  const wait = WANT.filter(c => !have(c).length && ctx.objCats && ctx.objCats.has(c));
  if (wait.length) return [{ key: "bench", reason: why, options: [], hint: `pick the ${wait.join(" and ")} for its objective first – the 3DMark set is built around it` }];
  const sw = p => ({ cat: p.cat, old: "", new: p.name, price: p.price, lvl: p.lvl });
  const withB = cat => shopParts(cat).map(p => ({ p, b: benchOf(p.name) })).filter(x => x.b);
  const pareto = (list, val) => { const out = []; let top = -Infinity; for (const x of [...list].sort((a, b) => a.p.price - b.p.price || val(b) - val(a))) if (val(x) > top) { out.push(x); top = val(x); } return out; };
  // GPU
  const g0 = have("GPU"), g0b = g0.length && benchOf(g0[0].name);
  if (g0.length && !g0b) return [{ key: "bench", reason: why, options: [], hint: `no 3DMark data for ${g0[0].name}` }];
  // one card, or two of the same (SLI / CrossFire) – each list cheapest first, a dearer entry always scores higher
  const gpuLists = g0.length ? [[{ p: null, g: g0.length > 1 && g0[1].name === g0[0].name && g0b.two ? g0b.two : g0b.one, k: 0, cost: 0 }]]
    : [pareto(withB("GPU"), x => x.b.one).map(x => ({ p: x.p, g: x.b.one, k: 1, cost: x.p.price })),
       pareto(withB("GPU").filter(x => x.b.two && cInfo(x.p).m).map(x => ({ ...x, p: { ...x.p, price: x.p.price * 2 }, one: x.p })), x => x.b.two).map(x => ({ p: x.one, g: x.b.two, k: 2, cost: x.one.price * 2 }))];
  const gpus = gpuLists.flat();
  // CPU
  const c0 = have("CPU")[0], c0b = c0 && benchOf(c0.name);
  const cpus = c0 ? (c0b ? [{ p: null, b: c0b, s: cInfo(c0).s }] : []) : pareto(withB("CPU"), x => cpuBench(x.b, x.b.maxCh || 1, x.b.defMem || 2133)).map(x => ({ ...x, s: cInfo(x.p).s }));
  // motherboards: per socket, the cheapest for each top RAM speed
  const m0 = have("Motherboard")[0], m0b = m0 && benchOf(m0.name);
  const boards = m0 ? (m0b ? [{ p: null, b: m0b, s: cInfo(m0).s, slots: +(cInfo(m0).ram || 4) }] : [])
    : Object.values(withB("Motherboard").reduce((g, x) => { (g[cInfo(x.p).s] = g[cInfo(x.p).s] || []).push(x); return g; }, {}))
        .flatMap(list => pareto(list, x => Math.max(...x.b.steps))).map(x => ({ ...x, s: cInfo(x.p).s, slots: +(cInfo(x.p).ram || 4) }));
  // RAM: the sticks already planned, or k sticks – for each k the cheapest per speed
  const r0 = have("RAM"), rams = r0.length ? [{ k: r0.length, mhz: Math.min(...r0.map(r => +(cInfo(r).mhz || 0))), p: null, cost: 0 }]
    : [1, 2, 4].flatMap(k => pareto(shopParts("RAM").map(p => ({ p, mhz: +cInfo(p).mhz })).filter(x => x.mhz), x => x.mhz).map(x => ({ k, mhz: x.mhz, p: x.p, cost: x.p.price * k })));
  if (!gpus.length || !cpus.length || !boards.length || !rams.length) return [{ key: "bench", reason: why, options: [], hint: "no unlocked parts with 3DMark data for this build" }];
  const cands = [];
  for (const c of cpus) for (const m of boards) if (sockOk(m.s, c.s)) for (const r of rams) if (r.k <= m.slots) {
    const ch = Math.min(r.k, c.b.maxCh || 1), cOff = cpuBench(c.b, ch, Math.min(c.b.defMem || r.mhz, r.mhz)), cOn = cpuBench(c.b, ch, xmpSpeed(r.mhz, m.b.steps));
    // for each GPU list: the cheapest card(s) that reach the score with XMP on, and with XMP off
    const need = cs => { const d = 1 / target - 0.15 / cs; return d > 0 ? 0.85 / d : Infinity; };
    for (const list of gpuLists) for (const cs of new Set([cOn, cOff])) {
      const g = list.find(x => x.g >= need(cs) - 1 && sysBench(cs, x.g) >= target) ; if (!g) continue;
      const sc = { off: sysBench(cOff, g.g), on: sysBench(cOn, g.g) };
      const swaps = [c.p && sw(c.p), m.p && sw(m.p), ...(r.p ? Array.from({ length: r.k }, () => sw(r.p)) : []), ...(g.p ? Array.from({ length: g.k }, () => sw(g.p)) : [])].filter(Boolean);
      cands.push({ swaps, sc, cost: swaps.reduce((t, s) => t + s.price, 0), nG: g.k });
    }
  }
  cands.sort((a, b) => a.cost - b.cost || b.sc.on - a.sc.on);
  // what it still needs to run: a PSU that carries it and a CPU cooler that fits (cheapest)
  const cheap = {}, cheapFirst = cat => cheap[cat] || (cheap[cat] = shopParts(cat).sort((a, b) => a.price - b.price));   // fit checks are slow: cheapest first, stop at the first that fits
  const runParts = swaps => {
    const extras = [], j2 = withSwaps(job, swaps), b2 = plannedBuild(j2), w = name => (powerOf(name) || {}).w || 0;
    if (!have("PSU").length) {
      const need = POWER_OTHER + b2.filter(p => p.cat === "CPU" || p.cat === "GPU").reduce((t, p) => t + w(p.name), 0);
      const psu = cheapFirst("PSU").find(p => w(p.name) >= need && fitsBuild(j2, p, ""));
      if (!psu) return null; extras.push({ cat: "PSU", old: "", name: psu.name, price: psu.price, why: `PSU for ~${need} W` });
    }
    if (!have("CPU Cooler").length) {
      const j3 = withSwaps(job, [...swaps, ...extras.map(e => ({ cat: e.cat, old: "", new: e.name }))]);
      const cool = cheapFirst("CPU Cooler").find(p => fitsBuild(j3, p, ""));
      if (!cool) return null; extras.push({ cat: "CPU Cooler", old: "", name: cool.name, price: cool.price, why: "CPU cooler" });
    }
    // a drive to boot from – the cheapest that fits, unless an objective picks it
    if (!have("Storage").length && !(ctx.objCats && ctx.objCats.has("Storage"))) {
      const j4 = withSwaps(job, [...swaps, ...extras.map(e => ({ cat: e.cat, old: "", new: e.name }))]);
      const drive = cheapFirst("Storage").find(p => fitsBuild(j4, p, ""));
      if (drive) extras.push({ cat: "Storage", old: "", name: drive.name, price: drive.price, why: "drive for the OS" });
    }
    return extras;
  };
  const isBrand = c => ctx.brands.length && c.swaps.filter(s => s.cat !== "RAM").every(s => { const ix = INDEX.find(x => x.name === s.new); return ix && ctx.brands.some(b => brandMatch(ix, b)); });
  const label = c => "Build for the score: " + [...new Set(c.swaps.map(s => s.cat === "Motherboard" ? "motherboard" : s.cat))].join(" + ");
  const picks = []; let checks = 0;
  const tryPick = (test, tag) => {   // of the first fitting sets, the cheapest with its PSU + cooler (one GPU before two)
    const ok = []; let seen = 0;
    for (const c of cands) {
      if (!test(c) || picks.some(p => p.c === c)) continue; if (++checks > 400 || ++seen > 40) break;
      if (!planFits(job, c.swaps)) continue;
      const ex = runParts(c.swaps); if (!ex) continue;
      ok.push({ c, o: set(label(c), tag, c.swaps, c.sc, ex) }); if (ok.length >= 8) break;
    }
    ok.sort((a, b) => a.o.over - b.o.over || a.o.total - b.o.total || a.c.nG - b.c.nG);
    if (ok[0] && !(ok[0].o.over && picks.some(p => !p.o.over))) picks.push(ok[0]);
  };
  tryPick(() => true, "cheapest");
  if (picks.length && picks[0].o.xmp) tryPick(c => c.sc.off >= target, "no XMP needed");
  if (picks.length && picks[0].c.nG === 2) tryPick(c => c.nG === 1, "one GPU");
  if (ctx.brands.length) tryPick(isBrand, `★ ${ctx.brands[0]}`);
  const still = ["Case"].filter(c => !have(c).length).map(c => c.toLowerCase());
  return [{ key: "bench", reason: why + (still.length ? ` · also needs: ${still.join(", ")}` : ""), cat: "3DMark", options: picks.map(p => p.o),
    hint: picks.length ? "" : !cands.length && g0.length ? `The ${g0[0].name} can't reach this score with any CPU – pick a stronger GPU.` : "No unlocked parts reach this score – check the budget or your career level." }];
}
if (typeof module !== "undefined") module.exports = { suggestSwaps, benchSuggestions };
