/* PCBS Job Board – The board: job cards (objectives, hidden objectives, tasks, part swaps, Status tiles + their details popup), the three tables, drag & drop, Undo notices.
   Files (js/ui/board/, loaded in this order): status.js the Status tiles' HTML, tooltip.js their details popup,
   cards.js tables + job cards + job focus, events.js moving jobs, clicks / keys, drag & drop, toast. */
// the swap tile's "replaced by" arrow: a filled one, drawn – a text ⬇ turns into a colour emoji on some systems
const SWAP_ARROW = '<svg viewBox="0 0 13 15" aria-hidden="true"><path d="M4 0h5v7h4l-6.5 8L0 7h4z"/></svg>';
function hidIcon(t) {
  const s = t.toLowerCase();
  return /cables/.test(s)
    ? "🔌"
    : /^use .* for as many/.test(s)
      ? "★"
      : /^check \/ replace the/.test(s)
        ? "🔁"
        : /new parts only/.test(s)
          ? "✨"
          : /compressed air/.test(s)
            ? "💨"
            : /virus/.test(s)
              ? "🛡️"
              : /3dmark/.test(s)
                ? "📊"
                : /^urgent/.test(s)
                  ? "⏰"
                  : /rgb|light/.test(s)
                    ? "🌈"
                    : /water/.test(s)
                      ? "💧"
                      : "❗";
}
function deadlineValue(s) {
  const m = String(s || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? Date.UTC(+m[3], +m[1] - 1, +m[2]) : Infinity;
}
// ⚡ power check: CPU + GPU(s) + ~50 W for the rest vs. the PSU of the planned PC (current parts + swaps)
function powerHtml(j) {
  const pc = powerCheck(j);
  if (!pc) return "";
  const w = n => n.toLocaleString() + " W",
    g = pc.gpus.length;
  if (pc.psuW == null)
    return `<div class="power unknown">⚡ <span>Power check: watts of <b>${esc(pc.psu)}</b> unknown</span></div>`;
  const use = pc.ocWanted ? pc.oc : pc.stock,
    over = use > pc.psuW,
    ocOver = !pc.ocWanted && pc.oc > pc.psuW,
    tight = !over && use > pc.psuW * 0.9;
  const pct = Math.min(100, (use / pc.psuW) * 100);
  const what = [pc.cpu ? "CPU" : "", g ? (g > 1 ? g + " GPUs" : "GPU") : ""].filter(Boolean).join(" + ");
  const title = pc.parts
    .map(
      c =>
        `${c.cat}: ${c.name} – ${c.p ? c.p.w + " W" + (c.p.oc > c.p.w ? " (up to " + c.p.oc + " W overclocked)" : "") : "watts unknown"}`
    )
    .concat([`Everything else (board, RAM, drives, fans…): ~${POWER_OTHER} W`])
    .join("\n");
  return `<div class="power ${over ? "over" : tight || ocOver ? "tight" : ""}" title="${esc(title)}">
    <div class="brow"><span>${over ? "⚠️ PSU too weak" : "⚡ Power"}${pc.ocWanted ? " <small>(overclocked)</small>" : ""}</span><b>${w(use)} / ${w(pc.psuW)}</b></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <small>${what ? what + " + " : ""}~${POWER_OTHER} W for the rest${pc.unknown.length ? ` · <span class="warn">${pc.unknown.length} part${pc.unknown.length > 1 ? "s" : ""} without watts</span>` : ""}${over ? ` · needs a PSU of at least <b>${w(Math.ceil(use / 50) * 50)}</b>` : ""}${ocOver ? ` · <span class="warn">too weak when overclocked (~${w(pc.oc)})${pc.ocLater ? " – the customer plans to overclock" : ""}</span>` : !pc.ocWanted && pc.oc > pc.stock ? ` · overclocked ~${w(pc.oc)}` : ""}</small></div>`;
}
// ⚡ state for the Status tile: off (no PSU / watts unknown) · ok · warn (over 90 % or too weak overclocked) · bad
function powerState(j) {
  const pc = powerCheck(j);
  if (!pc || pc.psuW == null) return "off";
  const use = pc.ocWanted ? pc.oc : pc.stock;
  return use > pc.psuW ? "bad" : use > pc.psuW * 0.9 || (!pc.ocWanted && pc.oc > pc.psuW) ? "warn" : "ok";
}
// 3DMark: the planned PC's score (XMP off – how customer PCs come – and on) against the objective's target
const BENCH_ICON = `<svg class="bicon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="13" width="4" height="7" rx="1" fill="#ffb066"/><rect x="10" y="9" width="4" height="11" rx="1" fill="#ff9a3d"/><rect x="17" y="4" width="4" height="16" rx="1" fill="#ff7a12"/><text x="7.2" y="8.6" text-anchor="middle" font-size="6.5" font-weight="900" fill="#fff" font-family="Segoe UI,Arial,sans-serif">3D</text></svg>`; // score bars + "3D" (a gauge would read as overclocking)
function benchHtml(bc) {
  const n = x => x.toLocaleString(),
    t = bc.target,
    pct = Math.min(100, (bc.off / t) * 100),
    pctOn = Math.min(100, (bc.on / t) * 100);
  const verdict =
    bc.state === "ok"
      ? `<span class="okc">✓ Reaches the target${bc.off >= t ? " as it is" : " with XMP on (task ticked off)"}.</span>`
      : bc.state === "warn"
        ? `<b>Turn on XMP</b> (BIOS → RAM) – that alone reaches it.`
        : `<span class="badc">${n(t - bc.on)} short even with XMP</span> – see the suggested swaps.`;
  return `<div class="bench st-${bc.state}">
    <div class="brow"><span>3DMark score</span><b>${n(bc.off)} / ${n(t)}</b></div>
    <div class="bar"><i class="on" style="width:${pctOn}%"></i><i style="width:${pct}%"></i></div>
    <small>XMP off (how customer PCs come): <b>${n(bc.off)}</b> · XMP on: <b>${n(bc.on)}</b>${bc.mhzOn === bc.mhzOff ? " (no difference – RAM already at its speed)" : ""}</small>
    <small>CPU ${n(bc.cpuOff)}${bc.cpuOn !== bc.cpuOff ? "→" + n(bc.cpuOn) : ""} · GPU ${n(bc.gpu)}${bc.gpus > 1 ? " (2 cards)" : ""} · RAM ${bc.sticks} stick${bc.sticks > 1 ? "s" : ""}, ${bc.channels} of ${bc.maxCh} channel${bc.maxCh > 1 ? "s" : ""}, ${bc.mhzOff}${bc.mhzOn !== bc.mhzOff ? "→" + bc.mhzOn : ""} MHz</small>
    ${bc.mixedGpus ? `<small class="warn">Two GPUs of different models – they don't pair, only one counts.</small>` : ""}
    <div class="bverdict">${verdict}</div></div>`;
}
// Overclock objective: can it be done (certain), how hard (rough guide), PSU when overclocked
const OC_ICON = `<svg class="bicon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 17a8.5 8.5 0 0 1 17 0" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".35"/><path d="M3.5 17a8.5 8.5 0 0 1 12.7-7.4" fill="none" stroke="#ff8a1f" stroke-width="2.6" stroke-linecap="round"/><path d="M12 17l5.2-6.4" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17" r="2.1" fill="#fff"/></svg>`;
function ocHtml(oc) {
  const ic = { ok: "✓", warn: "!", bad: "✗", off: "–" };
  return `<div class="ocbox st-${oc.state}"><div class="brow"><span>Overclock</span></div>
    ${oc.items.map(i => `<div class="ocitem st-${i.state}"><b class="ocic">${ic[i.state]}</b><div><div class="octitle">${esc(i.text)}</div>${i.lines.map(l => `<small>${l}</small>`).join("")}</div></div>`).join("")}
    ${oc.psu ? `<div class="ocitem st-${oc.psu.bad ? "bad" : "ok"}"><b class="ocic">${oc.psu.bad ? "✗" : "✓"}</b><div><small>Overclocked power ~${oc.psu.use.toLocaleString()} W of ${oc.psu.w.toLocaleString()} W${oc.psu.bad ? " – <b>the PSU is too weak</b>" : ""}</small></div></div>` : `<small>Power: add the PSU to check the overclocked watts.</small>`}
    <small class="ocnote">Clocks are estimated at each part's full overclock potential – reaching it depends a lot on the cooling (and power for GPUs) and may not be possible. In-game results can differ. Watts are counted at the full overclock.</small></div>`;
}
// 💡 tips for this job (js/core/hints.js) – only shown when at least one applies; the list pops up like a Status tile's details
function hintBtn(j) {
  const hs = jobHints(j);
  if (!hs.length) return "";
  return `<button class="hintbtn" aria-label="${hs.length} tip${hs.length > 1 ? "s" : ""} for this job"><span aria-hidden="true">💡</span><template><div class="hintbox"><div class="brow">💡 Tips for this job</div><ul>${hs.map(h => `<li>${esc(h.text)}</li>`).join("")}</ul></div></template></button>`;
}
// STATUS: one row of icon tiles under T1–T3 – colour = state, details in a small popup (hover / focus ~0.5 s)
function statusHtml(j, { budgetHtml, budgetState, clashes, compact = true }) {
  const ps = powerState(j),
    pw = powerHtml(j),
    bc = benchCheck(j),
    occ = ocCheck(j);
  const word = { off: "not active", ok: "fine", warn: "close to the limit", bad: "over the limit" };
  const tiles = [
    {
      k: "budget",
      icon: "💰",
      state: budgetState,
      label: "Budget",
      body: budgetHtml || `<div class="stoff">No budget for this job.</div>`,
    },
    {
      k: "power",
      icon: "⚡",
      state: ps,
      label: "Power",
      body: pw || `<div class="stoff">⚡ Power check starts when a PSU is planned (PC Stats or a part swap).</div>`,
    },
    ...(bc && !bc.missing.length
      ? [
          {
            k: "bench",
            icon: BENCH_ICON,
            state: bc.state,
            label: "3DMark score",
            word: `${bc.off.toLocaleString()} of ${bc.target.toLocaleString()}${bc.state === "warn" ? ", enough with XMP on" : ""}`,
            body: benchHtml(bc),
          },
        ]
      : []),
    ...(occ && occ.state !== "off"
      ? [
          {
            k: "oc",
            icon: OC_ICON,
            state: occ.state,
            label: "Overclock",
            word: { ok: "should be reachable", warn: "depends on cooling", bad: "can't be done as planned" }[occ.state],
            body: ocHtml(occ),
          },
        ]
      : []),
    {
      k: "fit",
      icon: "⚠️",
      state: clashes.length ? "bad" : "ok",
      label: "Parts fit together",
      body: clashes.length ? compatHtml(clashes) : `<div class="stoff ok">✓ All planned parts fit together.</div>`,
    },
  ];
  if (!compact) {
    // expanded (0.15.0): every status the job uses on its own line, values and bars visible
    const used = tiles.filter(t => t.state !== "off");
    return `<div class="sec statussec"><h4>Status</h4><div class="sexp">${used.length ? used.map(t => `<div class="sxl st-${t.state}" data-sx="${t.k}">${t.body}</div>`).join("") : `<div class="hint" style="margin:0">Nothing to check yet – plan a budget, a PSU or part swaps.</div>`}</div></div>`;
  }
  return `<div class="sec statussec"><h4>Status</h4><div class="stiles">${tiles.map(t => `<button class="stile st-${t.state}" data-stile="${t.k}" aria-label="${esc(t.label)}: ${t.word ? esc(t.word) : t.k === "fit" ? (clashes.length ? clashes.length + " problem" + (clashes.length > 1 ? "s" : "") : "fine") : word[t.state]}"><span aria-hidden="true">${t.icon}</span><template>${t.body}</template></button>`).join("")}</div></div>`;
}
