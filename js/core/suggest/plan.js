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
        lvl: Math.max(0, ...parts.map(x => ixByName(x.new)?.lvl || 0)),
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
