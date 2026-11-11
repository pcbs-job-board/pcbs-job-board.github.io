/* Suggested part swaps – from the job's objectives (and some hidden objectives) and the PC's parts.
   General rules (agreed with Mariusz):
     G1 only parts the player can buy: unlocked at the career level, allowed DLC / game version
     G2 inside the remaining budget when possible – otherwise the cheapest, marked "over budget"
     G3 must fit the planned PC and its PSU; a part that needs a second change is offered with that change
     G4 cheapest that does the job first, then up to 2 alternatives
     G5 never added by itself – the player ticks a suggestion to add it as a swap
     G6 recalculated whenever an email / PC Stats screenshot (or a typed part) is added
   Priority: the customer's objectives first, then the budget, then hidden objectives (favourite brand…).
   Files (js/core/suggest/, plain scripts sharing top-level names, loaded in this order by index.html):
     common.js  shared helpers – parts that can be bought, fit checks, picking options, "or better", pairs, sizes
     swaps.js   the rules: suggested swaps per objective (suggestSwaps), budget fix, "N of a part"
     plan.js    one set of parts for the whole job (suggestPlan)
     cooling.js custom water cooling, AIO, overclock objectives
     lights.js  "Install Parts with Lights", RGB
     score.js   3DMark score: small sets, a new platform, a PC built from nothing */

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
// ---------- 3DMark score ----------
// does a set of new parts fit the planned PC (with each other too)? – compatibility incl. slot counts
function planFits(job, swaps) {
  const j2 = withSwaps(job, swaps),
    b = compatBuild(j2),
    mine = p => p && p.src === "swap" && /^sg\d/.test(p.swapId || "");
  return !compatIssues(j2, b).some(i => mine(i.part) || mine(i.other));
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
// can this board run two of this card (SLI / CrossFire of the card's kind, room for two cards this wide)?
function takesPair(board, card) {
  const bi = cInfo(board),
    gi = cInfo(card);
  return !!gi.m && (gi.m === "SLI" ? bi.sli === "1" : bi.cf === "1") && (!bi.ds || !gi.sl || +bi.ds >= +gi.sl);
}
