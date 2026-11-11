// Suggestions for lighting objectives ("Install Parts with Lights: N …", RGB).
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
