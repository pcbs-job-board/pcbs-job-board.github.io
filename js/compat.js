/* Compatibility of the planned PC – which parts fit together.
   Data: "compat" column of the parts database (row[10], "key=value;…", from the community workbook).
   Priority (who "wins" when two parts clash – the other one gets the warning):
     0      a part the job's objectives ask for ("Install GTX 1080" – any maker counts)
     100+i  part swaps, in the order of the swap list (drag ⠿ or Alt+↑/↓ to change it)
     1000+i the customer's parts from PC Stats that stay (a replaced one is ignored)
   Clashes between two of the customer's own parts are not reported. */
// a saved job keeps its objectives as tasks (src "obj"); a draft / test job has an objectives list
const jobObjectives = j => j.objectives || (j.tasks || []).filter(t => t.src === "obj").map(t => t.text);
let COMPAT = null;
function compatOf(name) {
  if (!COMPAT) {
    COMPAT = new Map();
    for (const cat in window.PARTS_DB || {}) for (const r of window.PARTS_DB[cat]) {
      const c = { cat };
      for (const kv of String(r[10] || "").split(";")) { const i = kv.indexOf("="); if (i > 0) c[kv.slice(0, i)] = kv.slice(i + 1); }
      COMPAT.set(r[0].toLowerCase(), c);
    }
  }
  return COMPAT.get(String(name || "").trim().toLowerCase()) || null;
}
const BOARD_NAME = { ITX: "Mini-ITX", mATX: "Micro-ATX", ATX: "ATX", EATX: "E-ATX", XL: "XL-ATX", EEB: "SSI-EEB" };
const numC = v => v == null || v === "" ? null : +v;
const short = n => String(n).length > 34 ? String(n).slice(0, 32) + "…" : String(n);

// ---------- the planned PC with priorities ----------
// parts: [{ name, cat, c, pri, src: "stats" | "swap", req, swapId }]
function compatBuild(j, extra) {
  const out = (j.components || []).map((c, i) => ({ name: c.name, cat: c.cat, pri: 1000 + i, src: "stats" }));
  (j.swaps || []).forEach((s, i) => {
    const k = s.old ? out.findIndex(p => p.src === "stats" && p.name.toLowerCase() === s.old.toLowerCase()) : -1;
    const db = compatOf(s.new), cat = s.cat && s.cat !== "Other" ? s.cat : db ? db.cat : k >= 0 ? out[k].cat : s.cat;
    const p = { name: s.new, cat, pri: 100 + i, src: "swap", swapId: s.id };
    if (k >= 0) out.splice(k, 1, p); else out.push(p);
  });
  if (extra) { if (extra.replace != null) { const k = out.findIndex(p => p.src === "stats" && p.name.toLowerCase() === extra.replace.toLowerCase()); if (k >= 0) out.splice(k, 1); } out.push(extra.part); }
  for (const p of out) p.c = p.c || compatOf(p.name) || {};
  for (const p of out) if (!p.cand && requiredBy(j, p)) { p.req = true; p.pri = 0; }
  return out;
}
// does an objective name this part? "Install GTX 1080" → any GeForce GTX 1080 (not 1080 Ti); "Install Intel Core i5-7500 or better" → that CPU,
// or – with "or better" – the part swapped in for that category
function requiredBy(j, p) {
  const objs = jobObjectives(j).filter(o => /\b(install|upgrade to|replace .* with)\b/i.test(o));
  if (!objs.length || p.cat === "Other") return false;
  const norm = s => " " + String(s).toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim() + " ";
  const keys = [norm(p.name)];
  if (p.c.c) keys.push(norm(p.c.c), norm(p.c.c.replace(/^(geforce|radeon)\s+/i, "")));
  for (const o of objs) {
    const on = norm(o);
    if (keys.some(k => k.trim().length > 3 && on.includes(k) && !new RegExp(reEsc(k.trim()) + " (ti|super|xt)\\b").test(on))) return true;
    if (/or better/i.test(o) && p.src === "swap") {
      const named = o.replace(/^\W*(install|upgrade to)\s+/i, "").replace(/\s+or better.*$/i, "");
      const m = bestPartMatch(named);
      if (m && m.cat === p.cat) return true;
    }
  }
  return false;
}

// LGA 1151 Skylake and Kaby Lake work together both ways in the game (customer PCs come with an i7-6700K on a Z270;
// the wiki: "Skylake's Motherboard has capability to support Kaby Lake's Processor"). Coffee Lake stays apart.
const SOCK_GROUP = { "LGA 1151 (Skylake)": "1151a", "LGA 1151 (Kaby Lake)": "1151a" };
const sockOk = (a, b) => a === b || (!!SOCK_GROUP[a] && SOCK_GROUP[a] === SOCK_GROUP[b]);
// ---------- the rules (each checked both ways) ----------
// pair(a, b) rules return a message for the part with the LOWER priority (the one that has to change)
const COMPAT_RULES = [
  // 1 case ↔ motherboard size
  { cats: ["Case", "Motherboard"], test: (cs, mb) => !cs.c.b || !mb.c.f || cs.c.b.split(",").includes(mb.c.f),
    msg: (cs, mb, low) => low === mb ? `${BOARD_NAME[mb.c.f] || mb.c.f} board doesn't fit the case` : `case doesn't take a ${BOARD_NAME[mb.c.f] || mb.c.f} board` },
  // 2 case ↔ PSU format + length
  { cats: ["Case", "PSU"], test: (cs, ps) => !cs.c.p || !ps.c.f || cs.c.p.split(",").includes(ps.c.f),
    msg: (cs, ps, low) => low === ps ? `${ps.c.f} PSU doesn't fit the case (${cs.c.p} only)` : `case only takes ${cs.c.p} PSUs, not ${ps.c.f}` },
  { cats: ["Case", "PSU"], test: (cs, ps) => !numC(cs.c.pl) || !numC(ps.c.l) || +ps.c.l <= +cs.c.pl,
    msg: (cs, ps, low) => low === ps ? `PSU is ${ps.c.l} mm long – case takes up to ${cs.c.pl} mm` : `case takes PSUs up to ${cs.c.pl} mm – this one is ${ps.c.l} mm` },
  // 3 case ↔ GPU length
  { cats: ["Case", "GPU"], test: (cs, g) => !numC(cs.c.g) || !numC(g.c.l) || +g.c.l <= +cs.c.g,
    msg: (cs, g, low) => low === g ? `GPU is ${g.c.l} mm long – case fits up to ${cs.c.g} mm` : `case fits GPUs up to ${cs.c.g} mm – this one is ${g.c.l} mm` },
  // 4 case ↔ air cooler height
  { cats: ["Case", "CPU Cooler"], test: (cs, cl) => !numC(cs.c.h) || !numC(cl.c.h) || +cl.c.h <= +cs.c.h,
    msg: (cs, cl, low) => low === cl ? `cooler is ${cl.c.h} mm tall – case fits up to ${cs.c.h} mm` : `case fits coolers up to ${cs.c.h} mm – this one is ${cl.c.h} mm` },
  // 7 motherboard ↔ CPU socket
  { cats: ["Motherboard", "CPU"], test: (mb, cp) => !mb.c.s || !cp.c.s || sockOk(mb.c.s, cp.c.s),
    msg: (mb, cp, low) => low === cp ? `socket ${cp.c.s} – motherboard is ${mb.c.s}` : `socket ${mb.c.s} – CPU is ${cp.c.s}` },
  // 8 cooler ↔ socket (motherboard's, or the CPU's when there is no motherboard)
  { cats: ["Motherboard", "CPU Cooler"], test: (mb, cl) => !mb.c.s || !cl.c.ss || cl.c.ss.split("|").includes(mb.c.s),
    msg: (mb, cl, low) => low === cl ? `cooler doesn't support socket ${mb.c.s}` : `socket ${mb.c.s} isn't supported by the cooler` },
  { cats: ["CPU", "CPU Cooler"], only: b => !b.some(p => p.cat === "Motherboard"), test: (cp, cl) => !cp.c.s || !cl.c.ss || cl.c.ss.split("|").includes(cp.c.s),
    msg: (cp, cl, low) => low === cl ? `cooler doesn't support socket ${cp.c.s}` : `socket ${cp.c.s} isn't supported by the cooler` },
  // 9 water-cooling CPU block ↔ socket
  { cats: ["Motherboard", "Water Cooling"], test: (mb, w) => !mb.c.s || !w.c.ss || w.c.ss.split("|").includes(mb.c.s),
    msg: (mb, w, low) => low === w ? `water block doesn't support socket ${mb.c.s}` : `socket ${mb.c.s} isn't supported by the water block` },
  // 9b …also with only the CPU known (no motherboard yet)
  { cats: ["CPU", "Water Cooling"], only: b => !b.some(p => p.cat === "Motherboard"), test: (cp, w) => !cp.c.s || !w.c.ss || w.c.ss.split("|").some(x => sockOk(x, cp.c.s)),
    msg: (cp, w, low) => low === w ? `CPU block doesn't support socket ${cp.c.s}` : `socket ${cp.c.s} isn't supported by the CPU block` },
  // 12 motherboard ↔ two GPUs (SLI / CrossFire, slot size)
  { cats: ["Motherboard", "GPU"], only: b => b.filter(p => p.cat === "GPU").length > 1,
    test: (mb, g) => !g.c.m || (g.c.m === "SLI" ? mb.c.sli === "1" : mb.c.cf === "1"),
    msg: (mb, g, low) => low === g ? `motherboard has no ${g.c.m} for two GPUs` : `no ${g.c.m} support for the two GPUs` },
  { cats: ["Motherboard", "GPU"], only: b => b.filter(p => p.cat === "GPU").length > 1,
    test: (mb, g) => !numC(mb.c.ds) || !numC(g.c.sl) || +g.c.sl <= +mb.c.ds,
    msg: (mb, g, low) => low === g ? `${g.c.sl}-slot GPU – motherboard fits ${mb.c.ds}-slot cards for two GPUs` : `two GPUs: fits ${mb.c.ds}-slot cards, this one is ${g.c.sl}-slot` },
  // 13 overclocking
  { cats: ["Motherboard", "CPU"], test: (mb, cp, j) => mb.c.oc !== "0" || !(cp.c.oc === "1" && wantsOC(j)),
    msg: (mb, cp, low) => low === mb ? `motherboard can't overclock – the job asks for it` : `can't be overclocked on this motherboard` },
  // 14 GPU ↔ GPU: same multi-GPU kind and chipset
  { cats: ["GPU", "GPU"], test: (a, b) => !a.c.l || !b.c.l ? true /* a GPU without data: can't tell */ : !!a.c.m && a.c.m === b.c.m && (!a.c.c || !b.c.c || a.c.c === b.c.c),
    msg: (a, b, low) => { const hi = low === a ? b : a; return !low.c.m ? `can't run as a pair (no SLI / CrossFire)` : low.c.m !== hi.c.m ? `${low.c.m} – the other GPU is ${hi.c.m || "single only"}` : `${low.c.c} can't pair with ${hi.c.c} – needs the same chipset`; } },
];
const wantsOC = j => /\b(overclock\w*|oc)\b/i.test(jobObjectives(j).join(" "));   // objectives only (an email-body mention is "later")
// count rules: more parts than places → the lowest-priority ones get the warning
const COMPAT_COUNTS = [
  { host: "Motherboard", item: p => p.cat === "RAM", cap: mb => numC(mb.c.ram), what: n => `motherboard has ${n} RAM slots` },
  { host: "Motherboard", item: p => p.cat === "Storage" && p.c.t === "m2", cap: mb => numC(mb.c.m2), what: n => `motherboard has ${n} M.2 slot${n === 1 ? "" : "s"}` },
  { host: "Motherboard", item: p => p.cat === "Storage" && p.c.t === "sata", cap: mb => numC(mb.c.sata), what: n => `motherboard has ${n} SATA ports` },
  // 5 radiators (liquid coolers + water-cooling radiators) and 6 case fans, per size – case radiator places used as fan places (approximation)
  ...["120", "140"].map(z => ({ host: "Case", item: p => (p.c.r || "").startsWith(z + "x"), size: p => +(p.c.r || "x1").split("x")[1], cap: cs => numC(cs.c["r" + z]), what: n => `case fits radiators up to ${n}×${z} mm` , longest: true })),
  ...["120", "140"].map(z => ({ host: "Case", item: p => p.cat === "Case Fan" && p.c.z === z, cap: cs => numC(cs.c["r" + z]), what: n => `case has about ${n} places for ${z} mm fans` })),
];

// all clashes in a build: [{ part (has to change), other, msg }]
function compatIssues(j, build) {
  const out = [], add = (low, other, msg) => { if (!out.some(o => o.part === low && o.msg === msg)) out.push({ part: low, other, msg }); };
  for (const r of COMPAT_RULES) {
    if (r.only && !r.only(build)) continue;
    const A = build.filter(p => p.cat === r.cats[0]), B = build.filter(p => p.cat === r.cats[1]);
    for (const a of A) for (const b of B) {
      if (a === b || (r.cats[0] === r.cats[1] && build.indexOf(a) > build.indexOf(b))) continue;
      if (r.test(a, b, j)) continue;
      const low = a.pri > b.pri ? a : b, other = low === a ? b : a;
      add(low, other, r.msg(a, b, low));
    }
  }
  for (const r of COMPAT_COUNTS) {
    const host = build.find(p => p.cat === r.host); if (!host) continue;
    const cap = r.cap(host); if (cap == null) continue;
    const items = build.filter(r.item).sort((a, b) => a.pri - b.pri);
    if (r.longest) { for (const it of items) if (r.size(it) > cap) add(it.pri > host.pri ? it : host, it.pri > host.pri ? host : it, r.what(cap)); continue; }
    if (items.length <= cap) continue;
    const over = items.slice(cap), lowItem = over[over.length - 1];
    if (host.pri > lowItem.pri) add(host, lowItem, `${r.what(cap)} – ${items.length} planned`);
    else for (const it of over) add(it, host, `${r.what(cap)} – ${items.length} planned`);
  }
  return out;
}
// what the job card shows: clashes that involve a swapped / required part
function jobCompatIssues(j) {
  const b = compatBuild(j);
  return compatIssues(j, b).filter(i => i.part.src !== "stats" || i.other.src !== "stats" || i.part.req || i.other.req);
}
// part suggestions while planning a swap: warnings for each candidate against the planned PC
// (the part being replaced is left out); compatible parts first
function compatRank(j, replaceName, items) {
  const scored = items.map((p, i) => {
    const cand = { name: p.name, cat: p.cat, pri: 1e9, src: "swap", cand: true };   // the candidate always gets the warning
    const b = compatBuild(j, { replace: replaceName || null, part: cand });
    const warn = compatIssues(j, b).filter(x => x.part === cand || x.other === cand).map(x => x.part === cand ? x.msg : `${short(x.part.name)}: ${x.msg}`);
    return { p, i, warn };
  });
  scored.sort((a, b) => (a.warn.length > 0) - (b.warn.length > 0) || a.i - b.i);
  return scored.map(s => Object.assign(Object.create(Object.getPrototypeOf(s.p)), s.p, { warn: s.warn }));
}
if (typeof module !== "undefined") module.exports = { compatOf, compatBuild, compatIssues, jobCompatIssues, compatRank };
