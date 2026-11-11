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
  ["CPU Cooler", /\b(cpu )?cooler|cpu cooling\b/],
  ["CPU", /\b(cpu|processor)\b/],
  ["GPU", /\b(gpu|graphics card|video card)\b/],
  ["Motherboard", /\bmotherboard|mainboard\b/],
  ["RAM", /\b(ram|memory)\b/],
  ["PSU", /\b(psu|power supply)\b/],
  ["Storage", /\b(hdd|ssd|hard drive|storage|m\.2|nvme)\b/],
  ["Case", /\bcase\b/],
  ["Case Fan", /\b(case )?fans?\b/],
];
const catOfText = t => (CAT_WORDS.find(([, re]) => re.test(t)) || [])[0] || null;
const cInfo = p => compatOf(p.name) || {};
const rk = p => +(cInfo(p).rk || 0);
const priceOk = (p, left) => left == null || p.price == null || p.price <= left;

// parts the player can buy now (G1), by category
function shopParts(cat) {
  return INDEX.filter(p => !p.hist && !p.noShop && p.cat === cat && p.price != null && unlocked(p)); // menu cases etc. can't be bought
}
// would this part fit the planned PC (in place of `replace`)? – compatibility only (G3)
function fitsBuild(job, cand, replace) {
  const c = { name: cand.name, cat: cand.cat, pri: 1e9, src: "swap", cand: true };
  const b = compatBuild(job, { replace: replace || null, part: c });
  return !compatIssues(job, b).some(i => i.part === c || i.other === c);
}
// a copy of the job with extra planned swaps – to check power / fit of a combination
// (a new swap for a slot that already has a planned swap takes its place – replaceSwaps)
const withSwaps = (job, swaps) => ({
  ...job,
  swaps: replaceSwaps(
    job.swaps,
    swaps.map((s, i) => ({ id: "sg" + i, ...s }))
  ).swaps,
});
// the cheapest PSU that carries the job (same format as the case allows, fits the case)
function psuFor(job, extraSwaps, oc = false) {
  const j2 = withSwaps(job, extraSwaps),
    pc = powerCheck(j2);
  if (!pc || pc.psuW == null) return null;
  const need = pc.ocWanted || oc ? pc.oc : pc.stock;
  if (need <= pc.psuW) return null;
  const cur = plannedBuild(j2)
    .filter(c => c.cat === "PSU")
    .pop();
  const ok = shopParts("PSU")
    .filter(p => (powerOf(p.name)?.w || 0) >= need && fitsBuild(j2, p, cur?.name))
    .sort((a, b) => a.price - b.price);
  return ok[0]
    ? { cat: "PSU", old: cur?.name || "", name: ok[0].name, price: ok[0].price, why: `PSU for ~${need} W` }
    : { cat: "PSU", old: cur?.name || "", name: null, why: `needs a PSU of ~${need} W – none unlocked` };
}
// turn a list of candidate parts into the options of one suggestion (G2–G4, brand)
function pickOptions(job, ctx, cands, { replace = "", count = 1, upgrade = false, base = null } = {}) {
  // a part already planned for this slot is not bought any more: its price is back in the budget
  const left = ctx.left == null ? null : ctx.left + (replace && count === 1 ? refundFor(job, [replace]) : 0);
  const ok = cands.filter(p => fitsBuild(job, p, replace)).sort((a, b) => a.price - b.price || rk(b) - rk(a));
  if (!ok.length) return [];
  const opt = (p, tag) => {
    const swaps = Array.from({ length: count }, () => ({ cat: p.cat, old: replace && count === 1 ? replace : "", new: p.name }));
    const psu = RATED.has(p.cat) ? psuFor(job, swaps) : null,
      extras = psu ? [psu] : [];
    const total = p.price * count + extras.reduce((t, e) => t + (e.price || 0), 0);
    return {
      name: p.name,
      cat: p.cat,
      price: p.price,
      count,
      lvl: p.lvl,
      pct: p.pct,
      det: p.det,
      tag,
      swaps,
      extras,
      total,
      over: !priceOk({ price: total }, left),
      rk: rk(p),
    };
  };
  const out = [],
    seen = new Set(),
    add = (p, tag) => {
      if (p && !seen.has(p.name)) {
        seen.add(p.name);
        out.push(opt(p, tag));
      }
    };
  const inBudget = ok.filter(p => priceOk({ price: p.price * count }, left));
  // favourite brand (hidden objective – lowest priority): the brand's part when it does the job inside the budget
  const brandP = (ctx.brands.length ? ok.filter(p => ctx.brands.some(b => brandMatch(p, b))) : []).sort((a, b) =>
    base && RATED.has(base.cat) ? rk(a) - rk(b) || a.price - b.price : a.price - b.price
  );
  const brandIn = brandP.filter(p => inBudget.includes(p));
  if (brandIn.length) add(brandIn[0], `★ ${ctx.brands.find(b => brandMatch(brandIn[0], b))}`);
  add(inBudget[0] || ok[0], upgrade ? "cheapest step up" : "cheapest");
  if (upgrade) {
    const best = [...inBudget].sort((a, b) => rk(b) - rk(a) || a.price - b.price)[0];
    add(best, "best in budget");
  } else if (base && RATED.has(base.cat)) {
    const close = [...ok].sort((a, b) => Math.abs(rk(a) - rk(base)) - Math.abs(rk(b) - rk(base)) || a.price - b.price)[0];
    add(close, "closest to current");
  }
  if (brandP.length && !brandIn.length) add(brandP[0], `★ ${ctx.brands.find(b => brandMatch(brandP[0], b))}`);
  return out.slice(0, 3);
}
// parts at least as good as `ref` (never worse)
function atLeast(ref, cat) {
  const r = cInfo(ref);
  if (RATED.has(cat) && r.rk) return p => rk(p) >= +r.rk;
  if (cat === "Storage" && r.gb)
    return p => {
      const c = cInfo(p);
      return +c.k >= +r.k && +c.gb >= +r.gb && +c.sp >= +r.sp;
    };
  if (cat === "RAM" && r.gb)
    return p => {
      const c = cInfo(p);
      return +c.gb >= +r.gb && +c.mhz >= +r.mhz;
    };
  if (cat === "PSU") return p => (powerOf(p.name)?.w || 0) >= (powerOf(ref.name)?.w || 0);
  // coolers and fans: never less air flow (the game calls a weaker one a "worse part" and won't finish the job)
  if ((cat === "CPU Cooler" || cat === "Case Fan" || cat === "Water Cooling") && r.af)
    return p => {
      const c = cInfo(p);
      return +(c.af || 0) >= +r.af && (cat !== "Case Fan" || !r.z || c.z === r.z);
    };
  return () => true;
}
const sameAs = name => p => p.name.toLowerCase() === String(name).toLowerCase();

// two of the same card: the board must have SLI / CrossFire (the card's kind), the PSU must carry both – extras for a pair
function pairExtras(job, card, swaps, board) {
  const extra = [],
    mc = cInfo(card).m;
  // the board needs the right kind (SLI / CrossFire) AND room for two cards this wide (ds = widest card it fits two of)
  const bi = board ? cInfo(board) : {},
    room = c => !c.ds || !cInfo(card).sl || +c.ds >= +cInfo(card).sl;
  if (board && mc && !((mc === "SLI" ? bi.sli === "1" : bi.cf === "1") && room(bi))) {
    const bc = cInfo(board),
      nb = shopParts("Motherboard")
        .filter(p => {
          const c = cInfo(p);
          return c.s === bc.s && (mc === "SLI" ? c.sli === "1" : c.cf === "1") && (!c.ds || +c.ds >= +(cInfo(card).sl || 0));
        })
        .filter(p => fitsBuild(withSwaps(job, swaps), p, board.name))
        .sort((a, b) => a.price - b.price)[0];
    extra.push(
      nb
        ? {
            cat: "Motherboard",
            old: board.name,
            name: nb.name,
            price: nb.price,
            why: `board with ${mc} and room for two ${cInfo(card).sl || ""}-slot cards`,
          }
        : {
            cat: "Motherboard",
            old: board.name,
            name: null,
            why: `needs a board with ${mc} and room for two of these cards – none unlocked`,
          }
    );
  }
  const psu = psuFor(job, [...swaps, ...extra.filter(e => e.name).map(e => ({ cat: e.cat, old: e.old, new: e.name }))]);
  if (psu) extra.push(psu);
  return extra;
}
// ---------- the rules ----------
function suggestSwaps(job, opts = {}) {
  const out = [],
    build = plannedBuild(job),
    cur = cat => build.filter(c => c.cat === cat);
  const spent = (job.swaps || []).reduce((t, s) => t + ((s.price ?? priceOf(s.new)) || 0), 0);
  const ctx = {
    left: job.budget != null ? job.budget - spent : null,
    brands: (opts.brands || []).filter(Boolean),
    picked: opts.picked || [],
    pickedLights: opts.pickedLights || [],
  };
  const objs = (opts.only || jobObjectives(job)).filter(o => !/^complete by/i.test(o));
  // opts.only: just these objectives (the combined set works them out one step at a time); opts.sections: which of the
  // rules that don't belong to one objective run (all when no step list is given)
  const sec = k => !opts.only || !!opts.sections?.includes(k);
  const add = (key, reason, items, extra = {}) => {
    // an objective with no options → the window says why (hint or the general reason); optional extras just drop out
    if (items.length || key.startsWith("obj:")) out.push({ key, reason, options: items, ...extra });
  };
  const missing = (key, reason, need, extra = {}) => out.push({ key, reason, options: [], hint: need, ...extra });
  const ref = name => {
    const m = bestPartMatch(name);
    return m ? INDEX.find(p => p.name === m.name) || { name: m.name, cat: m.cat } : null;
  };
  const handled = new Set(opts.pinned || []); // categories an earlier step of the combined set already picked
  ctx.objCats = handled;
  ctx.pinned = new Set(opts.pinned || []);
  // "Upgrade Graphics Card" + "Install dual graphics cards": the upgrade is offered as a PAIR of new cards (one tick
  // adds both), and the dual-GPU rule adds nothing on top
  const DUAL = DUAL_RE;
  const pairMode =
    objs.some(o => DUAL.test(o)) &&
    objs.some(o => /^\W*upgrade\s+(the\s+)?(graphics|gpu|video)/i.test(o)) &&
    cur("GPU").length < 2; // categories an objective picks a part for (the 3DMark set leaves them to it)
  const newBuild = !(job.components || []).length; // "build one from nothing" jobs

  for (const o of objs) {
    const ol = o.toLowerCase();
    // 3b  "Install Parts with Lights: 6 coloured (255,0,255)" – 6 parts with RGB lighting (colour set in the game)
    const mL = o.match(/parts with lights?\s*:?\s*(\d+)/i);
    if (mL) {
      const sg = lightsSuggestion(job, ctx, +mL[1], o);
      if (sg) out.push(sg);
      continue;
    }
    // 3c "Install Purple cables": cables are a part in the shop (category Cables) – the cheapest set in exactly those
    //     colours (cablesFor: one colour asked → one-colour sets, no duo / striped / patterned ones)
    const mC = o.match(/^\W*install\s+(.+?)\s+cables?\s*$/i);
    if (mC) {
      const names = new Set(cablesFor(mC[1]).map(n => n.toLowerCase())),
        cands = shopParts("Cables")
          .filter(p => names.has(p.name.toLowerCase()))
          .sort((a, b) => a.price - b.price);
      add("obj:" + o, o, pickOptions(job, ctx, cands, {}), {
        cat: "Cables",
        old: "",
        hint: `No unlocked ${mC[1]} cables – they're in the Shop under Cables (check your career level).`,
      });
      handled.add("Cables");
      continue;
    }
    // 1 / 2 / 4  Install <part> [or better]
    let m = o.match(/^\W*install\s+(.+?)(\s+or better)?\s*$/i);
    // "Install 5 ARCTIC BioniX F140 (Green) or better": a number of parts (not a size – "2 TB")
    let nWant = 1;
    const cm = m && m[1].match(/^([2-9])\s+(?!(?:tb|gb|mb)\b)(\S.+)$/i);
    if (cm && !/water cooling|dual|two|\brgb\b|gpus?\b|graphics/i.test(cm[2])) {
      nWant = +cm[1];
      m = [m[0], cm[2], m[2]];
    }
    if (m && !/water cooling|dual|two|2 (gpu|graphics)|\brgb\b/i.test(m[1])) {
      // a named model ("EVGA GeForce GTX 1080 Ti K|NGP|N GAMING") is that card; a bare chip ("GTX 1080") any card of it
      const chip = chipFromText(m[1]),
        exact = bestPartMatch(m[1]),
        named = exact && exact.score >= 0.9 && !(chip && normP(m[1]) === normP(chip)) ? ref(m[1]) : null,
        r = named || (chip ? INDEX.find(p => p.cat === "GPU" && cInfo(p).c === chip) || ref(m[1]) : ref(m[1]));
      // no part named – "Install an SSD", "Install a 1TB HDD", "Install M.2 storage": the cheapest drive of that kind that fits
      const sk = !r && storageKind(m[1]);
      if (sk) {
        const gb = sizeGB(m[1]),
          c = shopParts("Storage").filter(p => cInfo(p).k === sk && (!gb || +cInfo(p).gb >= gb));
        add("obj:" + o, o, pickOptions(job, ctx, c, {}), {
          cat: "Storage",
          old: "",
          hint: "No unlocked drive of this kind fits – check the budget, your career level or the free SATA / M.2 slots.",
        });
        handled.add("Storage");
        continue;
      }
      if (!r) {
        missing("obj:" + o, o, "Couldn't tell which part this asks for – add the swap yourself (⇄ on the job card).");
        continue;
      }
      const cat = r.cat,
        curP = cur(cat).pop(),
        better = !!m[2] && cat !== "Case"; // "or better" for a case: no way to rank cases – the one asked for
      let cands;
      const size = m[1].match(/(\d+(?:\.\d+)?)\s*(tb|gb)\b/i) || [],
        gbWant = size[1] ? +size[1] * (/tb/i.test(size[2]) ? 1000 : 1) : 0;
      if (better && cat === "Storage" && gbWant)
        cands = shopParts(cat).filter(p => {
          const c = cInfo(p),
            rc = cInfo(r);
          return +c.gb >= gbWant && +c.k >= +(rc.k || 1);
        });
      else if (better) cands = shopParts(cat).filter(atLeast(r, cat));
      else if (cat === "GPU" && chipFromText(m[1]) && !named) {
        const chip = chipFromText(m[1]);
        cands = shopParts(cat).filter(p => cInfo(p).c === chip);
      } else cands = shopParts(cat).filter(sameAs(r.name));
      if (nWant > 1) {
        out.push(countSuggestion(job, ctx, o, r, cands, nWant, better, cur));
        handled.add(cat);
        continue;
      }
      // "or better" goes by the in-game part ranking – shown, so the player can see the rule worked
      const ranked = better && RATED.has(cat) && rk(r) > 0,
        rankOf = p =>
          ranked ? { want: rk(r), wantName: r.name, cur: curP ? rk(curP) : null, curName: curP?.name || "", now: rk(p) } : null;
      if (curP && cands.some(sameAs(curP.name)) && !(better && ranked)) {
        missing("obj:" + o, o, `Already met – ${curP.name} is in the PC`, { met: true, cat });
        handled.add(cat);
        continue;
      }
      if (curP && better && atLeast(r, cat)(curP)) {
        missing(
          "obj:" + o,
          o,
          ranked
            ? `Already met – ${curP.name} ranks ${rk(curP).toLocaleString()}, ${r.name} ${rk(r).toLocaleString()} (in-game part ranking)`
            : `Already met – ${curP.name} counts as "${r.name} or better"`,
          { met: true, cat }
        );
        handled.add(cat);
        continue;
      }
      let found = pickOptions(job, ctx, cands, { replace: curP?.name || "", base: curP || r });
      if (!found.length && cat === "CPU") found = cpuWithBoard(job, ctx, cands, curP, cur);
      // the part asked for comes first (when it can be bought and fits) – the others also count
      if (better && named) {
        const own = pickOptions(job, ctx, shopParts(cat).filter(sameAs(r.name)), { replace: curP?.name || "", base: curP || r });
        if (own.length) found = [{ ...own[0], tag: "asked for" }, ...found.filter(x => x.name !== own[0].name)].slice(0, 3);
      }
      found.forEach(x => (x.rank = rankOf(x)));
      add("obj:" + o, o, found, { cat, old: curP?.name || "" });
      handled.add(cat);
      continue;
    }
    // 7 / 8  Upgrade to N GB of RAM
    m = ol.match(/(\d+)\s*gb\s+(of\s+)?(ram|memory)/);
    if (m && /upgrade|install|at least|need/.test(ol)) {
      const want = +m[1],
        sticks = cur("RAM"),
        have = sticks.reduce((t, s) => t + +(cInfo(s).gb || 0), 0);
      const board = cur("Motherboard").pop(),
        slots = board ? +(cInfo(board).ram || 4) : 4;
      if (!sticks.length && !newBuild) {
        missing("obj:" + o, o, "capture PC Stats to get a RAM suggestion");
        continue;
      }
      if (have >= want) continue;
      const one = sticks[0],
        same = !!one && sticks.every(s => s.name === one.name),
        g = one ? +(cInfo(one).gb || 0) : 0;
      const opts2 = [];
      if (same && g && (want - have) % g === 0) {
        const k = (want - have) / g,
          shop = shopParts("RAM").find(sameAs(one.name));
        if (sticks.length + k <= slots && shop)
          opts2.push(...pickOptions(job, ctx, [shop], { count: k }).map(x => ({ ...x, tag: `add ${k} × the same stick` })));
      }
      // replace all sticks with fewer / bigger ones, same speed or faster
      const mhz = sticks.length ? Math.max(...sticks.map(s => +(cInfo(s).mhz || 0))) : 0;
      for (const n of [2, 4, 1].filter(n => n <= slots)) {
        const per = want / n;
        if (!Number.isInteger(per)) continue;
        const c = shopParts("RAM")
          .filter(p => +cInfo(p).gb === per && +cInfo(p).mhz >= mhz)
          .sort((a, b) => a.price - b.price)[0];
        if (!c) continue;
        const swaps = [
          ...sticks.map(s => ({ cat: "RAM", old: s.name, new: c.name })).slice(0, n),
          ...Array.from({ length: Math.max(0, n - sticks.length) }, () => ({ cat: "RAM", old: "", new: c.name })),
        ];
        const removed = sticks.slice(n).map(s => s.name);
        opts2.push({
          name: c.name,
          cat: "RAM",
          price: c.price,
          count: n,
          det: c.det,
          lvl: c.lvl,
          pct: c.pct,
          tag: `${n} × ${per} GB${removed.length ? ` (take out ${removed.length})` : ""}`,
          swaps,
          extras: [],
          removeOld: removed,
          total: c.price * n,
          over: !priceOk({ price: c.price * n }, ctx.left),
        });
        if (opts2.length >= 3) break;
      }
      // favourite brand that makes RAM (hidden objective): its sticks first – cheapest layout, same speed or faster
      const fav = ctx.brands.length ? ctx.brands.find(b => shopParts("RAM").some(p => brandMatch(p, b))) : null;
      if (fav) {
        const isFav = name => {
          const ix = INDEX.find(x => x.name === name);
          return !!ix && ctx.brands.some(b => brandMatch(ix, b));
        };
        opts2.forEach(x => isFav(x.name) && (x.tag = `★ ${fav} · ${x.tag}`));
        if (!opts2.some(x => isFav(x.name))) {
          const favOpts = [];
          for (const n of [2, 4, 1].filter(n => n <= slots)) {
            const per = want / n;
            if (!Number.isInteger(per)) continue;
            const c = shopParts("RAM")
              .filter(p => brandMatch(p, fav) && +cInfo(p).gb === per && +cInfo(p).mhz >= mhz)
              .sort((a, b) => a.price - b.price)[0];
            if (!c) continue;
            const removed = sticks.slice(n).map(s => s.name);
            favOpts.push({
              name: c.name,
              cat: "RAM",
              price: c.price,
              count: n,
              det: c.det,
              lvl: c.lvl,
              pct: c.pct,
              tag: `★ ${fav} · ${n} × ${per} GB${removed.length ? ` (take out ${removed.length})` : ""}`,
              swaps: [
                ...sticks.map(s => ({ cat: "RAM", old: s.name, new: c.name })).slice(0, n),
                ...Array.from({ length: Math.max(0, n - sticks.length) }, () => ({ cat: "RAM", old: "", new: c.name })),
              ],
              extras: [],
              removeOld: removed,
              total: c.price * n,
              over: !priceOk({ price: c.price * n }, ctx.left),
            });
          }
          // the brand's cheapest layout inside the budget (else its cheapest) first, then 2 others
          favOpts.sort((a, b) => a.over - b.over || a.total - b.total);
          if (favOpts.length) opts2.unshift(favOpts[0]);
        }
      }
      add("obj:" + o, o, opts2.slice(0, 3), { cat: "RAM" });
      handled.add("RAM");
      continue;
    }
    // 7b "Upgrade to 4 TB of Storage" (0.15.2): all drives together hold at least N – a drive added in a free SATA / M.2
    //    place, or the smallest drive replaced by a bigger one; cheapest first
    const want = storageWant(o);
    if (want) {
      const drives = cur("Storage"),
        have = drives.reduce((t, d) => t + +(cInfo(d).gb || 0), 0);
      if (!drives.length && !newBuild) {
        missing("obj:" + o, o, "capture PC Stats to get a storage suggestion");
        continue;
      }
      if (have >= want) {
        missing("obj:" + o, o, `Already met – the drives hold ${gbText(have)}`, { met: true, cat: "Storage" });
        handled.add("Storage");
        continue;
      }
      const big = gb => shopParts("Storage").filter(p => +(cInfo(p).gb || 0) >= gb);
      const added = pickOptions(job, ctx, big(want - have)).map(x => ({ ...x, tag: "add a drive" }));
      const small = [...drives].sort((a, b) => +(cInfo(a).gb || 0) - +(cInfo(b).gb || 0))[0],
        rest = small ? have - +(cInfo(small).gb || 0) : 0,
        swapped = small
          ? pickOptions(job, ctx, big(want - rest), { replace: small.name }).map(x => ({
              ...x,
              tag: `in place of ${small.name}`,
            }))
          : [];
      const opts2 = [...added, ...swapped].sort((a, b) => a.over - b.over || a.total - b.total).slice(0, 3);
      if (opts2[0]) opts2[0].tag = "cheapest · " + opts2[0].tag;
      add("obj:" + o, `${o} – now ${gbText(have)}`, opts2, {
        cat: "Storage",
        old: "",
        hint: "No unlocked drive is big enough or fits – check the budget, your career level or the free SATA / M.2 places.",
      });
      handled.add("Storage");
      continue;
    }
    // 9b Support for double GPU: a board with SLI / CrossFire (no 2nd card)
    if (MULTI_RE.test(o)) {
      const board = cur("Motherboard").pop();
      if (!board) {
        missing(
          "obj:" + o,
          o,
          newBuild
            ? benchTarget(job)
              ? "Planned in the 3DMark build below – a motherboard with SLI / CrossFire."
              : "New build: pick a motherboard with SLI / CrossFire."
            : "capture PC Stats to check the motherboard"
        );
        continue;
      }
      if (multiOk(board)) {
        missing(
          "obj:" + o,
          o,
          `${board.name} already supports two GPUs (${[cInfo(board).sli === "1" && "SLI", cInfo(board).cf === "1" && "CrossFire"].filter(Boolean).join(" / ")}) – nothing to change`,
          { met: true, cat: "Motherboard" }
        );
        continue;
      }
      const bc = cInfo(board),
        cands = shopParts("Motherboard").filter(p => sockOk(cInfo(p).s, bc.s) && multiOk(p) && fitsBuild(job, p, board.name));
      if (!cands.length) {
        missing("obj:" + o, o, `${board.name} has no SLI / CrossFire – no unlocked board for this socket that has it`);
        continue;
      }
      add(
        "obj:" + o,
        `${o} – ${board.name} has no SLI / CrossFire`,
        pickOptions(job, ctx, cands, { replace: board.name, base: board }),
        { cat: "Motherboard", old: board.name }
      );
      handled.add("Motherboard");
      continue;
    }
    // 9  Install dual graphics cards
    if (DUAL.test(o)) {
      const gpus = cur("GPU");
      if (gpus.length >= 2 || pairMode) continue;
      if (!gpus.length) {
        missing(
          "obj:" + o,
          o,
          newBuild
            ? benchTarget(job)
              ? "Planned in the 3DMark build below – two of the same card (SLI / CrossFire) on a board that takes both."
              : "New build: pick two of the same card that support SLI / CrossFire, and a motherboard that takes both."
            : "capture PC Stats to get a second-GPU suggestion"
        );
        continue;
      }
      const g = gpus[0],
        same = shopParts("GPU").find(sameAs(g.name)),
        // any maker's card of the same model pairs in the game (the pair scores between the two) – the cheapest one
        other = shopParts("GPU")
          .filter(p => !sameAs(g.name)(p) && pairBench(g.name, p.name))
          .sort((a, b) => a.price - b.price)[0];
      if (!same && !other) {
        missing(
          "obj:" + o,
          o,
          `${g.name} isn't in the shop (locked or not sold) and no other card pairs with it – pick a pair yourself`
        );
        continue;
      }
      // the board may need SLI / CrossFire, the PSU more watts – offered together (G3)
      const board = cur("Motherboard").pop();
      const pairOpt = (shop, tag) => {
        const pairSw = [{ cat: "GPU", old: "", new: shop.name }],
          extra = pairExtras(job, shop, pairSw, board),
          total = shop.price + extra.reduce((t, e) => t + (e.price || 0), 0);
        return {
          name: shop.name,
          cat: "GPU",
          price: shop.price,
          count: 1,
          det: shop.det,
          lvl: shop.lvl,
          pct: shop.pct,
          tag,
          swaps: pairSw,
          extras: extra,
          total,
          over: !priceOk({ price: total }, ctx.left),
        };
      };
      const opts2 = [
        ...(same ? [pairOpt(same, "same GPU again")] : []),
        ...(other && (!same || other.price < same.price) ? [pairOpt(other, "cheaper card that pairs with it")] : []),
      ];
      add("obj:" + o, o, opts2, { cat: "GPU" });
      handled.add("GPU");
      continue;
    }
    // 10b "watercooled GPU" / "custom water cooling for the GPU": a watercooled version (Custom Water Cooling Shop), never worse
    if (/\b(gpu|graphics)\b/i.test(o) && /water ?cool/i.test(o)) {
      const g = cur("GPU")[0];
      if (g && isWaterGPU(g)) {
        handled.add("GPU");
        continue;
      }
      const c = shopParts("GPU").filter(p => isWaterGPU(p) && (!g || rk(p) >= rk(g)));
      if (!c.length)
        missing(
          "obj:" + o,
          o,
          hasUnlock("customWC") ? "No watercooled GPU unlocked yet." : gateMsg("customWC").replace(/<\/?b>/g, "") + "."
        );
      else
        add("obj:" + o, o, pickOptions(job, ctx, c, { replace: g?.name || "", base: g || null }), {
          cat: "GPU",
          old: g?.name || "",
        });
      handled.add("GPU");
      continue;
    }
    // 10c "Install custom water cooling for CPU": a CPU block for the socket, a radiator with room in the case and a
    //     reservoir (pump combo) on the case's list – cheapest set that fits; pipes, fittings and coolant are looks only
    if (/custom/i.test(o) && /water ?cool/i.test(o)) {
      out.push(...customLoopSuggestion(job, ctx, o, cur));
      handled.add("Water Cooling");
      continue;
    }
    // 10  Install AIO water cooling (not custom loops)
    if (/water cooling|aio|liquid cool/i.test(o) && !/custom/i.test(o)) {
      out.push(...aioSuggestion(job, ctx, o, cur));
      handled.add("CPU Cooler");
      continue;
    }
    // 12  overclocking
    if (/\b(overclock\w*|oc)\b/i.test(o)) {
      out.push(...ocSuggestions(job, ctx, o, cur));
      continue;
    }
    // 5  Replace <part>  ·  6  Upgrade <part>
    m = ol.match(/^\W*(replace|upgrade)\s+(the\s+)?(.+)$/);
    if (m && !/\bto\b\s+\d/.test(ol)) {
      const cat = catOfText(m[3]);
      if (!cat) continue;
      const parts = cur(cat);
      if (!parts.length) {
        missing("obj:" + o, o, `capture PC Stats to get a ${cat} suggestion`);
        continue;
      }
      const p0 = parts[0],
        hdd = /\bhdd\b/.test(m[3]) ? parts.find(p => cInfo(p).k === "1") || p0 : p0;
      if (m[1] === "replace") {
        const eq = sameOrBrand(cat, hdd, ctx);
        add("obj:" + o, o, pickOptions(job, ctx, eq, { replace: hdd.name, base: hdd }), { cat, old: hdd.name });
      } else {
        // a GPU "upgrade" must also not score lower in 3DMark (RX 480: higher ranking than a GTX 1060, but a lower score)
        const g0 = cat === "GPU" && benchOf(hdd.name),
          scoreOk = p => !g0 || !benchOf(p.name) || benchOf(p.name).one >= g0.one;
        // GPUs: "better" = a higher in-game 3DMark score (Mariusz: the game counts the score, not the model year);
        // without score data the ranking decides
        const gBetter = p => {
          const b = benchOf(p.name);
          return g0 && b ? b.one > g0.one : rk(p) > rk(hdd);
        };
        // the ranking of the part the PC came with and of the replacement – shown with the option
        const upRank = p => (RATED.has(cat) && rk(hdd) > 0 ? { want: null, cur: rk(hdd), curName: hdd.name, now: rk(p) } : null);
        const better = shopParts(cat).filter(p =>
          cat === "GPU"
            ? gBetter(p)
            : (RATED.has(cat) ? rk(p) > rk(hdd) : atLeast(hdd, cat)(p) && !sameAs(hdd.name)(p)) && scoreOk(p)
        );
        if (cat === "GPU" && pairMode) {
          // only cards that run as a pair in the game (SLI / CrossFire)
          // a board that takes two of this card as it is (kind + room): first choice – and the only one when the board must stay
          const board = cur("Motherboard").pop(),
            bi = board ? cInfo(board) : {};
          const onBoard = p =>
            !board ||
            ((cInfo(p).m === "SLI" ? bi.sli === "1" : bi.cf === "1") && (!bi.ds || !cInfo(p).sl || +bi.ds >= +cInfo(p).sl));
          const duo0 = better.filter(p => cInfo(p).m),
            duo = boardIsFixed(job) || duo0.some(onBoard) ? duo0.filter(onBoard) : duo0;
          const half = { ...ctx, left: ctx.left == null ? null : ctx.left / 2 }; // two cards share the budget
          const opts2 = pickOptions(job, half, duo, { replace: hdd.name, upgrade: true, base: hdd })
            .map(op => {
              const card = INDEX.find(x => x.name === op.name),
                swaps = [
                  { cat: "GPU", old: hdd.name, new: op.name },
                  { cat: "GPU", old: "", new: op.name },
                ];
              const extras = pairExtras(job, card, swaps, board),
                total = op.price * 2 + extras.reduce((t, e) => t + (e.price || 0), 0);
              const all = [...swaps, ...extras.filter(e => e.name).map(e => ({ cat: e.cat, old: e.old, new: e.name }))];
              if (extras.some(e => !e.name) || !planFits(job, all)) return null; // can't be made to fit
              return {
                ...op,
                count: 2,
                rank: upRank(card),
                tag: op.tag + " · pair (" + cInfo(card).m + ")",
                swaps,
                extras,
                total,
                over: !priceOk({ price: total }, ctx.left),
              };
            })
            .filter(Boolean);
          add("obj:" + o, o + " – as a pair (dual graphics cards)", opts2, {
            cat,
            old: hdd.name,
            hint: "No better SLI / CrossFire card fits – pick a pair yourself.",
          });
        } else
          add(
            "obj:" + o,
            o,
            pickOptions(job, ctx, better, { replace: hdd.name, upgrade: true, base: hdd }).map(op => ({
              ...op,
              rank: upRank(INDEX.find(x => x.name === op.name) || op),
            })),
            { cat, old: hdd.name }
          );
      }
      handled.add(cat);
      continue;
    }
  }
  // 15  Diagnose and fix + broken-part hint / "customer suspects": identical replacement
  const broken = new Set(
    [...(opts.broken || []), ...(job.suspect ? [job.suspect] : [])]
      .map(x => catOfText(String(x).toLowerCase()) || x)
      .filter(c => CATS.includes(c))
  );
  const fixJob = jobObjectives(job).some(o => /diagnose|fix/i.test(o));
  if (fixJob && sec("hint"))
    for (const cat of broken) {
      if (handled.has(cat) || (cat === "CPU" && cpuIsFixed(job))) continue;
      const p0 = cur(cat)[0];
      if (!p0) {
        missing("hint:" + cat, `Customer hints the ${cat} is broken`, `capture PC Stats to get a ${cat} suggestion`);
        continue;
      }
      const eq = sameOrBrand(cat, p0, ctx);
      add(
        "hint:" + cat,
        `Customer hints the ${cat} is broken – same part again${cur(cat).length > 1 ? " (one of " + cur(cat).length + "; which one shows in the game)" : ""}`,
        pickOptions(job, ctx, eq, { replace: p0.name, base: p0 }),
        { cat, old: p0.name }
      );
    }
  // 15b Diagnose and fix + favourite brand ("I'm a total Intel fanboy"): the broken part is the one made by that
  //     brand – the same part again, once per customer's part of that brand (which one is broken shows in the game)
  if (fixJob && ctx.brands.length && sec("hint")) {
    // the customer's OWN parts (not the planned build – a planned part isn't broken); a part that already has a
    // planned swap is left out (the swap is the fix), with a line saying so
    const own = plannedBuild({ ...job, swaps: [] }),
      planned = p => (job.swaps || []).find(s => lowName(s.old) === lowName(p.name));
    const isFan = p => {
      const ix = INDEX.find(x => x.name === p.name);
      return ix && ctx.brands.some(b => brandMatch(ix, b));
    };
    const fanParts = CATS.flatMap(cat =>
      broken.has(cat) || handled.has(cat) || (cat === "CPU" && cpuIsFixed(job)) ? [] : own.filter(p => p.cat === cat)
    ).filter(isFan);
    const mine = fanParts.filter(p => !planned(p));
    for (const p of fanParts.filter(planned))
      missing(
        "brandfix:" + p.cat + ":" + p.name,
        `${ctx.brands[0]} fan + "diagnose and fix" – their ${p.name}`,
        `already planned: ${p.name} → ${planned(p).new}`
      );
    if (!build.length)
      missing(
        "brandfix",
        `${ctx.brands[0]} fan + "diagnose and fix" – the broken part is likely made by ${ctx.brands[0]}`,
        `capture PC Stats to get a suggestion`
      );
    const seenP = new Set();
    for (const p0 of mine) {
      if (seenP.has(p0.cat + p0.name)) continue;
      seenP.add(p0.cat + p0.name);
      const ix = INDEX.find(x => x.name === p0.name),
        b = ctx.brands.find(x => brandMatch(ix, x));
      add(
        "brandfix:" + p0.cat + ":" + p0.name,
        `${b} fan + "diagnose and fix" – the broken part is likely their ${b} ${p0.cat}: same part again${mine.length > 1 ? ` (one of ${mine.length} ${b} parts)` : ""}`,
        // the identical part (as the line says – not a cheaper part of the brand); the brand's other parts that are
        // at least as good only when it isn't sold
        (() => {
          const same = pickOptions(job, ctx, shopParts(p0.cat).filter(sameAs(p0.name)), { replace: p0.name, base: p0 }),
            rest = pickOptions(
              job,
              ctx,
              sameOrBrand(p0.cat, p0, ctx).filter(p => !sameAs(p0.name)(p)),
              { replace: p0.name, base: p0 }
            ).map(o => ({ ...o, tag: `other ${b} part${o.tag ? " · " + o.tag : ""}` }));
          return same.length ? same : rest.slice(0, 3); // others only when the identical part isn't sold
        })(),
        { cat: p0.cat, old: p0.name }
      );
    }
  }
  // 19  water cooling requested (hidden) – AIO only
  if (opts.waterCooling && !handled.has("CPU Cooler") && sec("water"))
    out.push(...aioSuggestion(job, ctx, "Water cooling requested (hidden objective)", cur));
  // 18  Add RGB lighting – RGB case fans for free fan places
  if (opts.rgb && !jobObjectives(job).some(o => /parts with lights?/i.test(o)) && sec("rgb")) {
    // the lights objective has its own set
    const cs = cur("Case").pop(),
      cc = cs ? cInfo(cs) : {};
    for (const z of ["120", "140"]) {
      const places = +(cc["r" + z] || 0),
        used = cur("Case Fan").filter(f => cInfo(f).z === z).length,
        free = places - used;
      if (cs && free > 0) {
        const fans = shopParts("Case Fan").filter(p => cInfo(p).z === z && cInfo(p).lt === "1");
        add(
          "hid:rgb" + z,
          `Add RGB lighting – ${free} free ${z} mm fan place${free > 1 ? "s" : ""}`,
          pickOptions(job, ctx, fans, { count: Math.min(free, 2) }),
          { cat: "Case Fan" }
        );
        break;
      }
    }
  }
  // 20  the planned PC is too much for its PSU
  const pc = powerCheck(job);
  if (pc && pc.psuW != null && (pc.ocWanted ? pc.oc : pc.stock) > pc.psuW && sec("power")) {
    const need = pc.ocWanted ? pc.oc : pc.stock,
      curPsu = cur("PSU").pop();
    add(
      "fix:power",
      `PSU too weak – needs ~${need} W`,
      pickOptions(
        job,
        ctx,
        shopParts("PSU").filter(p => (powerOf(p.name)?.w || 0) >= need),
        { replace: curPsu?.name || "" }
      ),
      { cat: "PSU", old: curPsu?.name || "" }
    );
  }
  // 3DMark score of N (0.12.0): XMP, or the cheapest set of parts that reaches it – one tick adds the whole set
  if (sec("bench")) out.push(...benchSuggestions(job, ctx));
  // 20b the customer plans to overclock LATER (email body, not an objective): a PSU that carries the overclocked PC –
  //     only inside the budget (it's not something the job asks for)
  if (pc && pc.psuW != null && pc.ocLater && pc.oc > pc.psuW && !(pc.stock > pc.psuW) && sec("oclater")) {
    const curPsu = cur("PSU").pop(),
      o = pickOptions(
        job,
        ctx,
        shopParts("PSU").filter(p => (powerOf(p.name)?.w || 0) >= pc.oc),
        { replace: curPsu?.name || "" }
      ).filter(x => !x.over);
    add(
      "fix:oclater",
      `The customer plans to overclock – overclocked the PC needs ~${pc.oc} W, the PSU has ${pc.psuW} W (optional, in budget)`,
      o,
      { cat: "PSU", old: curPsu?.name || "" }
    );
  }
  // "Install dual graphics cards" (no board objective): the customer's motherboard stays – no option may change it
  if (boardIsFixed(job))
    for (const sg of out) {
      const n = sg.options.length;
      sg.options = sg.options.filter(
        o => !(o.swaps || []).some(w => w.cat === "Motherboard") && !(o.extras || []).some(e => e.cat === "Motherboard")
      );
      if (n && !sg.options.length)
        sg.hint =
          "Every option here needs a new motherboard – this job keeps the customer's board (dual GPUs). Pick parts that fit it.";
    }
  // 21  a customer's part that clashes with a planned swap → the cheapest part that fits (never worse)
  for (const cl of sec("fix") ? jobCompatIssues(job) : []) {
    const p = cl.part;
    if (p.src !== "stats" || p.req) continue;
    const key = "fix:" + p.cat + ":" + p.name;
    if (out.some(s => s.key === key)) continue;
    const cands = shopParts(p.cat).filter(atLeast(p, p.cat));
    add(key, `${p.cat}: ${p.name} – ${cl.msg}`, pickOptions(job, ctx, cands, { replace: p.name, base: p }), {
      cat: p.cat,
      old: p.name,
    });
  }
  // "over budget" of every option: parts already planned for the slots it fills are not bought any more – their price is
  // back in the budget (a planned GPU replaced by the suggested one only costs the difference)
  if (ctx.left != null)
    for (const sg of out)
      for (const o of sg.options || []) {
        if (o.over !== true) continue;
        const olds = [...(o.swaps || []).map(w => w.old), ...(o.extras || []).map(e => e.old)];
        const back = refundFor(job, olds);
        if (back) o.over = (o.total ?? (o.price || 0) * (o.count || 1)) > ctx.left + back;
      }
  // 22  "Diagnose and fix" with nothing else to go on: based on the budget (fallback, never part of the one set)
  if (fixJob && sec("budget") && !out.some(sg => sg.options.length)) {
    const sg = budgetFixSuggestion(job, ctx);
    if (sg) out.push(sg);
  }
  return out;
}
// "Based on budget" (Mariusz, 0.15.3): a "Diagnose and fix" job with no other suggestion – the broken part is one of the
// customer's parts whose IDENTICAL replacement fits the budget that's left ("Just won't boot up", $80 → the PSU or the
// drive). Rules:
//   B1 only when no other suggestion has an option; not a step of the one set (suggestPlan never asks for "budget")
//   B2 always the same part again (like for like), sold in the shop and unlocked – never a cheaper or other part
//   B3 inside the budget left only – a part the budget can't replace can't be the expected fix; cheapest first
//   B4 parts that can't stop a PC from working are left out: case, CPU cooler, fans, cables, coolant / pipes / fittings,
//      and drives when there are several (one drive = it may be the boot drive). Custom loop parts (CPU block,
//      reservoir, radiator) and watercooled GPUs count.
const BUDGET_SKIP = new Set(["Case", "CPU Cooler", "Case Fan", "Cables", "Other"]);
function budgetFixSuggestion(job, ctx) {
  // no budget, or a story job whose budget doesn't count – nothing to go by
  if (ctx.left == null || (job.story && !budgetInObjectives(jobObjectives(job)))) return null;
  const own = plannedBuild({ ...job, swaps: [] });
  if (!own.length) return null;
  const drives = own.filter(p => p.cat === "Storage").length;
  const seen = new Set(),
    options = [];
  for (const p of own) {
    const key = p.cat + "|" + lowName(p.name);
    if (BUDGET_SKIP.has(p.cat) || !CATS.includes(p.cat) || seen.has(key)) continue;
    if (p.cat === "Storage" && drives > 1) continue;
    if (p.cat === "Water Cooling" && !wcKind(p)) continue; // coolant, pipes, fittings
    seen.add(key);
    // the same part goes back where it was: no fit check (a tight case the customer's part already sits in is fine)
    const s = shopParts(p.cat).find(sameAs(p.name));
    if (!s || !priceOk(s, ctx.left)) continue;
    const n = own.filter(x => x.cat === p.cat && lowName(x.name) === lowName(p.name)).length,
      label = wcKind(p) || p.cat;
    options.push({
      name: s.name,
      cat: s.cat,
      price: s.price,
      count: 1,
      lvl: s.lvl,
      pct: s.pct,
      det: s.det,
      tag: `same ${label} again${n > 1 ? ` (one of ${n})` : ""}`,
      swaps: [{ cat: s.cat, old: p.name, new: s.name }],
      extras: [],
      total: s.price,
      over: false,
      rk: rk(s),
    });
  }
  options.sort((a, b) => a.total - b.total);
  return {
    key: "budget",
    reason: `Based on budget – nothing else points to the broken part: an identical replacement inside the $${ctx.left} left`,
    cat: "",
    old: "",
    options,
    hint: `No customer's part can be replaced like for like inside the $${ctx.left} left – check the parts list.`,
  };
}
// "Install N <part> [or better]": N of them – parts already in the PC that count are kept; case fans go into free fan
// places of their size first, then in place of the weaker fans of that size
function countSuggestion(job, ctx, o, r, cands, n, better, cur) {
  const cat = r.cat,
    counts = p => (better ? atLeast(r, cat)(p) : sameAs(r.name)(p)),
    mine = cur(cat),
    have = mine.filter(counts).length,
    need = n - have;
  if (need <= 0) return { key: "obj:" + o, reason: o, options: [], hint: `Already met – ${have} in the PC`, met: true, cat };
  let free = need,
    weaker = [],
    roomNote = "";
  const fan = cat === "Case Fan" && cInfo(r).z;
  if (fan) {
    const cs = cur("Case").pop(),
      z = cInfo(r).z,
      places = cs ? +(cInfo(cs)["r" + z] || 0) : 0; // the same fan places the compatibility check uses
    if (cs && places) {
      free = Math.max(0, places - mine.filter(f => cInfo(f).z === z).length);
      weaker = mine.filter(f => cInfo(f).z === z && !counts(f));
      // fan places are known only roughly (the case's radiator places) – too few: offered anyway, with a warning
      if (free + weaker.length < need) {
        roomNote = `check the case has room – ${cs.name} lists ~${places} places for ${z} mm fans`;
        free = need - weaker.length;
      }
    }
  }
  // room unsure: the fit check leaves the fans of that size out (it would only repeat the places warning)
  const jFit = roomNote
    ? { ...job, components: (job.components || []).filter(p => !(p.cat === "Case Fan" && cInfo(p).z === cInfo(r).z)) }
    : job;
  const opts = pickOptions(jFit, ctx, cands, { count: need }).map(op => {
    const olds = Array.from({ length: need }, (_, i) => (i < free ? "" : weaker[i - free]?.name || ""));
    return {
      ...op,
      swaps: olds.map(old => ({ cat, old, new: op.name })),
      tag: [
        op.tag,
        have ? `${have} already in the PC` : "",
        olds.some(Boolean) ? `${olds.filter(Boolean).length} in place of weaker fans` : "",
        roomNote,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });
  return {
    key: "obj:" + o,
    reason: o,
    options: opts,
    cat,
    old: "",
    hint: "No unlocked part does it – check the budget or your career level.",
  };
}
// ---------- one set of parts for the whole job (0.15.0) ----------
// The objectives are worked out in a set order, each step on the PC as the earlier steps left it (a planned PC):
// 1 named parts ("Install X [or better]", replace / upgrade, the parts the customer hints are broken) → 2 counts and
// pairs built on them (dual GPU, RAM amount, a drive, SLI / CrossFire board) → 3 cooling → 4 performance (overclock,
// 3DMark – parts an earlier step picked stay) → 5 power, parts that don't fit → 6 looks (lights, cables, RGB).
// Each step takes its first option inside the budget (else its first). One tick adds the whole set.
const PLAN_SECTIONS = [
  ["hint", 12],
  ["water", 30],
  ["bench", 45],
  ["power", 50],
  ["fix", 55],
  ["rgb", 70],
];
function objWeight(o) {
  const ol = o.toLowerCase();
  if (/parts with lights?/.test(ol) || /^\W*install\s+.+\s+cables?\s*$/.test(ol)) return 70;
  if (MULTI_RE.test(o) || DUAL_RE.test(o)) return 20;
  if (/\d+\s*gb\s+(of\s+)?(ram|memory)/.test(ol)) return 20;
  if (storageWant(o)) return 20;
  if (/water ?cool|\baio\b|liquid cool/.test(ol)) return 30;
  if (/\b(overclock\w*|oc)\b/.test(ol)) return 40;
  if (/^\W*install\s/.test(ol)) return storageKind(ol) ? 20 : 10;
  if (/^\W*(replace|upgrade)\s/.test(ol)) return 15;
  return 50;
}
function suggestPlan(job, opts = {}) {
  const objs = jobObjectives(job).filter(o => !/^complete by/i.test(o));
  const steps = [
    ...objs.map((o, i) => ({ w: objWeight(o), i, only: [o], sections: [] })),
    ...PLAN_SECTIONS.map(([k, w], i) => ({ w, i: 100 + i, only: [], sections: [k] })),
  ].sort((a, b) => a.w - b.w || a.i - b.i);
  // one run through the steps; seed = { sg, o }: an option taken first (another option of a step, or a 3DMark set),
  // the steps then build on it
  const run = seed => {
    let plan = [];
    const tasks = [],
      removeOld = [],
      used = [], // { reason, sw: [...], tag, rank } – what each step added
      met = [], // objectives already met – nothing to add
      left = [], // objectives the set can't cover, and why
      pinned = new Set();
    const take = (sg, o) => {
      const sw = [
        ...(o.swaps || []).map(x => ({ cat: x.cat, old: x.old || "", new: x.new, price: x.price ?? priceOf(x.new) })),
        ...(o.extras || [])
          .filter(e => e.name)
          .map(e => ({ cat: e.cat, old: e.old || "", new: e.name, price: e.price, extra: true })),
      ];
      const cant = (o.extras || []).find(e => !e.name);
      if (cant) left.push({ reason: sg.reason, why: cant.why });
      plan = replaceSwaps(plan, sw).swaps;
      (o.tasks || []).forEach(t => tasks.includes(t) || tasks.push(t));
      if (o.removeOld?.length) removeOld.push(...o.removeOld);
      const note = o !== sg.options[0] && sg.options[0].over ? `${sg.options[0].name} would go over the budget` : "";
      used.push({
        reason: sg.reason.replace(/ – now .*$/, ""),
        sw,
        tag: o.tag,
        note,
        rank: o.rank || null,
        score: o.score ?? null,
        oc: o.oc || null,
      });
      sw.forEach(x => pinned.add(x.cat));
    };
    if (seed) take(seed.sg, seed.o);
    for (const st of steps) {
      let res = [];
      try {
        res = suggestSwaps(withSwaps(job, plan), {
          ...opts,
          picked: [],
          pickedLights: [],
          only: st.only,
          sections: st.sections,
          pinned: [...pinned],
        });
      } catch (e) {
        console.warn("plan step", e);
        continue;
      }
      for (const sg of res) {
        if (/^(brandfix|fix:oclater)/.test(sg.key)) continue; // guesses / optional: per objective only
        if (!sg.options.length) {
          if (sg.met) met.push({ reason: sg.reason, note: sg.hint });
          else if (/^(obj:|bench|hint:)/.test(sg.key)) left.push({ reason: sg.reason, why: sg.hint || "" });
          continue;
        }
        take(sg, sg.options.find(x => !x.over) || sg.options[0]);
      }
    }
    const total = plan.reduce((t, x) => t + (x.price || 0), 0);
    return { plan, tasks, removeOld, used, met, left, total };
  };
  // the straight run first; when it leaves an objective out, runs that start from the other options (a 3DMark set
  // with two GPUs also meets "dual graphics cards") – the one covering the most, inside the budget, then the cheapest
  let best = run(null);
  if (best.left.length) {
    let all = [];
    try {
      all = suggestSwaps(job, { ...opts, picked: [], pickedLights: [] });
    } catch (e) {
      console.warn("plan seeds", e);
    }
    const spent0 = (job.swaps || []).reduce((t, x) => t + ((x.price ?? priceOf(x.new)) || 0), 0),
      over = r =>
        job.budget != null &&
        r.total >
          job.budget -
            spent0 +
            refundFor(
              job,
              r.plan.map(x => x.old)
            );
    const rank = r => [r.left.length, over(r) ? 1 : 0, r.total];
    const better = (a, b) => {
      const x = rank(a),
        y = rank(b);
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
      return false;
    };
    for (const sg of all.filter(x => /^(obj:|bench)/.test(x.key) && x.options.length))
      for (const o of sg.options.slice(0, 4)) {
        const r = run({ sg, o });
        if (better(r, best)) best = r;
        if (!best.left.length && !over(best)) break;
      }
  }
  const { plan, tasks, removeOld, used, met, left } = best;
  // objectives a part of the set covers without a step of their own (two GPUs from a 3DMark set → "dual graphics")
  // (0.15.2: only when the planned PC really meets it – else it's listed as not covered)
  const done = plannedBuild(withSwaps(job, plan));
  for (const o of objs) {
    if (
      [...used, ...met, ...left].some(u => u.reason === o || u.reason.startsWith(o + " – ")) ||
      /3dmark|benchmark|score/i.test(o)
    )
      continue;
    const ok = planMeets(o, done);
    if (ok === true && used.length) met.push({ reason: o, note: "covered by this set" });
    else if (ok === false) left.push({ reason: o, why: "not covered by this set – add the parts yourself" });
  }
  // nothing to add – or a single objective with a single suggestion: that suggestion is already "one set"
  if (!used.length || (used.length === 1 && objs.length <= 1 && !left.length)) return null;
  // what each part of the final set is for (a later step may have replaced an earlier step's part)
  const parts = plan.map(x => {
    const by = used.filter(u => u.sw.some(y => y.cat === x.cat && lowName(y.new) === lowName(x.new)));
    const { extra: _e, ...rest } = x;
    return {
      ...rest,
      for: [...new Set(by.map(u => u.reason))],
      note:
        by
          .filter(u => u.sw.some(y => !y.extra && y.cat === x.cat && lowName(y.new) === lowName(x.new)))
          .map(u => [u.tag, u.note].filter(Boolean).join(" – "))
          .find(Boolean) || "",
      rank: by.map(u => u.rank).find(Boolean) || null,
    };
  });
  const total = parts.reduce((t, x) => t + (x.price || 0), 0);
  const spent = (job.swaps || []).reduce((t, x) => t + ((x.price ?? priceOf(x.new)) || 0), 0),
    budgetLeft = job.budget != null ? job.budget - spent : null,
    back = refundFor(
      job,
      parts.map(x => x.old)
    );
  // 3DMark: the score of the planned PC – an earlier step (a 2nd GPU…) may already reach it
  let score = null;
  const target = benchTarget(job);
  if (target) {
    const sc = benchScore(plannedBuild(withSwaps(job, plan)));
    if (!sc.missing.length) {
      score = sc.off >= target ? sc.off : sc.on;
      // a 3DMark set that needs an overclock: its overclocked score (the stock one is below the target)
      const ocU = used.find(u => u.score != null && u.oc);
      if (ocU && score < target) score = ocU.score;
      const xmp = sc.off < target && sc.on >= target;
      if (xmp && !tasks.includes(XMP_TASK)) tasks.push(XMP_TASK);
      if (sc.on >= target && !used.some(u => u.score != null))
        met.push({
          reason: `3DMark score of ${target.toLocaleString()}`,
          note: `reached with this set: ${score.toLocaleString()}${xmp ? " (XMP on)" : ""}`,
        });
    }
  }
  return {
    key: "plan",
    reason: left.length ? "Every objective it can cover – one set" : "All objectives – one set",
    cat: "Plan",
    met,
    left,
    options: [
      {
        multi: true,
        plan: true,
        name: "One set for the whole job",
        cat: "Plan",
        tag: "",
        swaps: parts.map(({ cat, old, new: nw, price }) => ({ cat, old, new: nw, price })),
        parts,
        extras: [],
        tasks,
        removeOld,
        score,
        total,
        price: total,
        count: 1,
        lvl: Math.max(0, ...parts.map(x => INDEX.find(p => p.name === x.new)?.lvl || 0)),
        over: budgetLeft != null && total > budgetLeft + back,
        nParts: parts.length,
      },
    ],
  };
}
// does a planned PC meet this objective? true / false, or null when there's no check for it (counts and pairs only)
function planMeets(o, build) {
  const sum = cat => build.filter(p => p.cat === cat).reduce((t, p) => t + +(cInfo(p).gb || 0), 0);
  const ram = o.match(/(\d+)\s*gb\s+(of\s+)?(ram|memory)/i);
  if (ram) return sum("RAM") >= +ram[1];
  if (storageWant(o)) return sum("Storage") >= storageWant(o);
  if (MULTI_RE.test(o)) return build.some(p => p.cat === "Motherboard" && multiOk(p));
  if (DUAL_RE.test(o)) return build.filter(p => p.cat === "GPU").length >= 2;
  return null;
}
// the identical part (or the closest equal-or-better one of the same kind when it can't be bought),
// plus the favourite brand's equal-or-better parts of the same kind
function sameOrBrand(cat, p0, ctx) {
  const same = shopParts(cat).filter(sameAs(p0.name)),
    alike = shopParts(cat)
      .filter(atLeast(p0, cat))
      .filter(p => similarTo(p0, p));
  const brand = ctx.brands.length ? alike.filter(p => ctx.brands.some(b => brandMatch(p, b))) : [];
  // the identical part (or, without it, similar ones) + favourite-brand parts – all at least as good (atLeast: rating, air flow…)
  return [...new Set([...(same.length ? same : alike), ...brand])];
}
const norm = s =>
  " " +
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .trim() +
  " ";
// "Install GTX 1080" → chipset "GeForce GTX 1080" (any maker; not the 1080 Ti / Super)
function chipFromText(t) {
  const on = norm(t),
    chips = [
      ...new Set(
        INDEX.filter(p => p.cat === "GPU")
          .map(p => cInfo(p).c)
          .filter(Boolean)
      ),
    ];
  const hit = chips
    .map(c => ({ c, k: norm(c.replace(/^(geforce|radeon)\s+/i, "")) }))
    .filter(({ k }) => on.includes(k))
    .sort((a, b) => b.k.length - a.k.length)[0];
  return hit ? hit.c : null;
}
// "the same kind of part" when the identical one can't be bought: same socket / size / format / type
function similarTo(a, b) {
  const x = cInfo(a),
    y = cInfo(b);
  switch (a.cat) {
    case "Motherboard":
      return x.s === y.s && x.f === y.f;
    case "CPU":
      return sockOk(x.s, y.s);
    case "PSU":
      return x.f === y.f;
    case "Storage":
      return x.t === y.t;
    case "Case":
      return (x.b || "") === (y.b || "");
    case "CPU Cooler":
      return !!x.aio === !!y.aio;
    default:
      return true;
  }
}
// no CPU fits the current socket: the cheapest CPU + motherboard pair that fits the rest of the PC
function cpuWithBoard(job, ctx, cands, curP, cur, boardOk0 = () => true) {
  const boardOk = p => boardOk0(p) && (!needMulti(job) || multiOk(p)), // "Support for double GPU" too
    board = cur("Motherboard").pop(),
    pairs = [];
  for (const sock of new Set(cands.map(p => cInfo(p).s))) {
    const cpu = cands.filter(p => cInfo(p).s === sock).sort((a, b) => a.price - b.price)[0];
    if (!cpu) continue;
    const sw = [{ cat: "CPU", old: curP?.name || "", new: cpu.name }];
    const nb = shopParts("Motherboard")
      .filter(p => cInfo(p).s === sock && boardOk(p))
      .filter(p => fitsBuild(withSwaps(job, sw), p, board?.name))
      .sort((a, b) => a.price - b.price)[0];
    if (nb) pairs.push({ cpu, nb, total: cpu.price + nb.price });
  }
  return pairs
    .sort((a, b) => a.total - b.total)
    .slice(0, 2)
    .map((x, i) => {
      const extras = [
        {
          cat: "Motherboard",
          old: board?.name || "",
          name: x.nb.name,
          price: x.nb.price,
          why: `board for socket ${cInfo(x.cpu).s}`,
        },
      ];
      const psu = psuFor(job, [
        { cat: "CPU", old: curP?.name || "", new: x.cpu.name },
        { cat: "Motherboard", old: board?.name || "", new: x.nb.name },
      ]);
      if (psu) extras.push(psu);
      const total = x.cpu.price + extras.reduce((t, e) => t + (e.price || 0), 0);
      return {
        name: x.cpu.name,
        cat: "CPU",
        price: x.cpu.price,
        count: 1,
        lvl: x.cpu.lvl,
        pct: x.cpu.pct,
        det: x.cpu.det,
        tag: i ? "other socket" : "cheapest – needs a new motherboard",
        swaps: [{ cat: "CPU", old: curP?.name || "", new: x.cpu.name }],
        extras,
        total,
        over: !priceOk({ price: total }, ctx.left),
      };
    });
}
// a drive asked for by kind, not by name: 1 HDD, 2 SATA SSD, 3 M.2 (the database's "k")
function storageKind(t) {
  if (/\bm\.?2\b|nvme/i.test(t)) return "3";
  if (/\bssd\b|solid.state/i.test(t)) return "2";
  if (/\bhdd\b|hard (disk|drive)/i.test(t)) return "1";
  return "";
}
// "Upgrade to 4 TB of Storage" → 4000 (GB, as the database counts them); 0 for other objectives
const storageWant = o =>
  /\b(upgrade|install|at least|need)\b/i.test(o)
    ? sizeGB((o.match(/\d+(?:\.\d+)?\s*(tb|gb)\s+(of\s+)?(storage|disk)/i) || [""])[0])
    : 0;
const gbText = gb => (gb >= 1000 ? `${+(gb / 1000).toFixed(2)} TB` : `${gb} GB`);
const sizeGB = t => {
  const m = String(t).match(/(\d+(?:\.\d+)?)\s*(tb|gb)\b/i);
  return m ? +m[1] * (/tb/i.test(m[2]) ? 1000 : 1) : 0;
};
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
// ---------- 3DMark score ----------
// does a set of new parts fit the planned PC (with each other too)? – compatibility incl. slot counts
function planFits(job, swaps) {
  const j2 = withSwaps(job, swaps),
    b = compatBuild(j2),
    mine = p => p && p.src === "swap" && /^sg\d/.test(p.swapId || "");
  return !compatIssues(j2, b).some(i => mine(i.part) || mine(i.other));
}
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
// "Install Parts with Lights: 6 coloured …" → 6 (0 when the job doesn't ask for lights)
const lightsWanted = job =>
  Math.max(0, ...jobObjectives(job).map(o => +((o.match(/parts with lights?\s*:?\s*(\d+)/i) || [])[1] || 0)));
// RGB = lighting whose colour can be set ("· RGB" in the details); "White lighting" etc. can't be coloured
function isRGB(p) {
  const ix = INDEX.find(x => x.name === p.name);
  return !!ix && /(^|·\s*)RGB(\s*·|$)/.test(ix.det || "");
}
// N parts with coloured lighting: count the RGB parts planned, then the cheapest way to the rest – RGB fans for free
// fan places first, then RGB versions of fans / RAM / cooler / drive / GPU already there (never worse, must fit)
function lightsSuggestion(job, ctx, want, reason) {
  if (ctx.pickedLights && ctx.pickedLights.length)
    job = { ...job, swaps: [...(job.swaps || []), ...ctx.pickedLights.map((x, i) => ({ id: "pl" + i, ...x }))] };
  const build = plannedBuild(job),
    lit = build.filter(isRGB).length,
    need = want - lit;
  if (need <= 0) return null;
  const rgbShop = cat =>
      shopParts(cat)
        .filter(isRGB)
        .sort((a, b) => a.price - b.price),
    items = [];
  const cs = build.filter(p => p.cat === "Case").pop(),
    cc = cs ? cInfo(cs) : {},
    fans = build.filter(p => p.cat === "Case Fan");
  // a PC built from nothing: no case yet → the lights are planned once the build (with its case) is ticked
  if (!cs && !(job.components || []).length)
    return {
      key: "lights",
      reason: `${reason} – ${lit} of ${want} planned`,
      options: [],
      hint: benchTarget(job)
        ? "Tick the 3DMark build first – it brings a case with fan places for the lights; the RGB parts are then planned on it."
        : "Pick the case first – the RGB fans / parts are then planned on it.",
    };
  for (const z of ["120", "140"]) {
    const fan = rgbShop("Case Fan").find(p => cInfo(p).z === z);
    if (!fan || !cs) continue;
    const free = +(cc["r" + z] || 0) - fans.filter(f => cInfo(f).z === z).length;
    for (let i = 0; i < free; i++)
      items.push({ n: 1, cost: fan.price, swaps: [{ cat: "Case Fan", old: "", new: fan.name, price: fan.price, lvl: fan.lvl }] });
    for (const f of fans.filter(f => cInfo(f).z === z && !isRGB(f)))
      items.push({
        n: 1,
        cost: fan.price,
        swaps: [{ cat: "Case Fan", old: f.name, new: fan.name, price: fan.price, lvl: fan.lvl }],
      });
  }
  const ram = build.filter(p => p.cat === "RAM" && !isRGB(p));
  if (ram.length) {
    const r0 = cInfo(ram[0]),
      st = rgbShop("RAM").find(p => +cInfo(p).gb >= +(r0.gb || 0) && +cInfo(p).mhz >= +(r0.mhz || 0));
    if (st)
      items.push({
        n: ram.length,
        cost: st.price * ram.length,
        swaps: ram.map(r => ({ cat: "RAM", old: r.name, new: st.name, price: st.price, lvl: st.lvl })),
      });
  }
  for (const cat of ["CPU Cooler", "Storage", "GPU"])
    for (const p of build.filter(x => x.cat === cat && !isRGB(x) && !x.req)) {
      const better = atLeast(INDEX.find(x => x.name === p.name) || p, cat),
        c = rgbShop(cat).find(x => better(x) && fitsBuild(job, x, p.name));
      if (c) items.push({ n: 1, cost: c.price, swaps: [{ cat, old: p.name, new: c.name, price: c.price, lvl: c.lvl }] });
    }
  items.sort((a, b) => a.cost / a.n - b.cost / b.n || a.cost - b.cost);
  const take = [];
  let got = 0;
  for (const it of items) {
    if (got >= need) break;
    take.push(it);
    got += it.n;
  }
  const lead = `${reason} – ${lit} of ${want} planned`;
  if (got < need)
    return {
      key: "lights",
      reason: lead,
      options: [],
      hint: `Only ${got} more RGB part${got === 1 ? "" : "s"} found for this PC – pick a case with more fan places or RGB parts yourself.`,
    };
  const swaps = take.flatMap(t => t.swaps),
    total = swaps.reduce((t, x) => t + x.price, 0),
    colour = (reason.match(/\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/) || [])[0];
  return {
    key: "lights",
    reason: lead,
    cat: "Lights",
    options: [
      {
        multi: true,
        name: `${need} more RGB part${need > 1 ? "s" : ""}`,
        cat: "Lights",
        tag: "cheapest",
        swaps,
        extras: [],
        tasks: [`Set the lighting of ${want} parts to ${colour ? "colour " + colour : "the colour asked for"}`],
        score: null,
        total,
        price: total,
        count: 1,
        lvl: Math.max(0, ...swaps.map(x => x.lvl || 0)),
        over: !priceOk({ price: total }, ctx.left),
        nParts: swaps.length,
      },
    ],
  };
}
const DUAL_RE = /dual graphics|two graphics|2 graphics|dual gpu|sli|crossfire/i;
// "Support for double GPU" (0.14.10, Steve Shovel's "The Incognito Rig"): a motherboard with SLI / CrossFire – no 2nd
// card needed (unlike "Install dual graphics cards")
const MULTI_RE = /support for (double|dual|two|2|multiple|multi) (gpus?|graphics)|(double|dual|multi)[- ]?gpu support/i;
const multiOk = p => {
  const c = cInfo(p);
  return c.sli === "1" || c.cf === "1";
};
const needMulti = job => jobObjectives(job).some(o => MULTI_RE.test(o));
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
          const ix = INDEX.find(x => x.name === s.new);
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
// can this board run two of this card (SLI / CrossFire of the card's kind, room for two cards this wide)?
function takesPair(board, card) {
  const bi = cInfo(board),
    gi = cInfo(card);
  return !!gi.m && (gi.m === "SLI" ? bi.sli === "1" : bi.cf === "1") && (!bi.ds || !gi.sl || +bi.ds >= +gi.sl);
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
    if (!have("CPU Cooler").length) {
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
        const ix = INDEX.find(x => x.name === s.new);
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
if (typeof module !== "undefined") module.exports = { suggestSwaps, benchSuggestions };
