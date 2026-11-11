// Suggested part swaps per objective (suggestSwaps) + the budget fix and "N of a part" suggestions.
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
//   B4 parts that can't stop a PC from working are left out: case, fans, cables, coolant / pipes / fittings,
//      and drives when there are several (one drive = it may be the boot drive). Custom loop parts (CPU block,
//      reservoir, radiator), watercooled GPUs and the CPU cooler count.
const BUDGET_SKIP = new Set(["Case", "Case Fan", "Cables", "Other"]);
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
