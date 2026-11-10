/* PCBS Job Board – The board: job cards (objectives, hidden objectives, tasks, part swaps, Status tiles + their details popup), the three tables, drag & drop, Undo notices. */
// ================= board =================
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
// 💡 tips for this job (js/hints.js) – only shown when at least one applies; the list pops up like a Status tile's details
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
// the popup with a tile's details: shown after ~0.5 s of hover or keyboard focus, never focusable itself;
// leaving the tile, moving with the keyboard or clicking elsewhere closes it (a click / tap on the tile opens it at once)
const stip = Object.assign(document.createElement("div"), { id: "stip", className: "stip", role: "tooltip", hidden: true });
document.body.append(stip);
let stipTimer = null,
  stipFor = null;
function stipShow(tile) {
  clearTimeout(stipTimer);
  stipFor = tile;
  const big = tile.id === "btnUnlocks"; // the career unlocks list: wider and taller than a Status tile's details
  stip.innerHTML = big ? unlocksHtml() : tile.querySelector("template").innerHTML;
  stip.hidden = false;
  tile.setAttribute("aria-describedby", "stip");
  stip.classList.toggle("big", big);
  stip.classList.toggle("tips", tile.classList.contains("hintbtn"));
  // always fully inside the window: width capped, pushed in from the left / right edge, below the tile or – when
  // there is more room – above it; taller than the room on that side (or than 260 px) → cut to fit with a note (the popup can't scroll)
  const r = tile.getBoundingClientRect(),
    M = 8,
    w = Math.min(big ? 540 : 340, innerWidth - 2 * M);
  Object.assign(stip.style, { width: w + "px", maxHeight: "", left: "0px", top: "0px" });
  stip.classList.remove("cut");
  const roomBelow = innerHeight - r.bottom - 6 - M,
    roomAbove = r.top - 6 - M,
    h = stip.offsetHeight;
  const below = h <= roomBelow || roomBelow >= roomAbove,
    room = Math.min(big ? 640 : tile.classList.contains("hintbtn") ? 480 : 260, Math.max(60, below ? roomBelow : roomAbove));
  if (h > room) {
    stip.style.maxHeight = room + "px";
    stip.classList.add("cut");
  }
  const hh = Math.min(h, room);
  stip.style.left = Math.max(M, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - M)) + "px";
  stip.style.top = Math.max(M, Math.min(below ? r.bottom + 6 : r.top - 6 - hh, innerHeight - hh - M)) + "px";
}
function stipHide() {
  clearTimeout(stipTimer);
  if (stipFor) stipFor.removeAttribute("aria-describedby");
  stipFor = null;
  stip.hidden = true;
}
const stipLater = tile => {
  clearTimeout(stipTimer);
  stipTimer = setTimeout(() => stipShow(tile), 500);
};
document.addEventListener("mouseover", e => {
  const t = e.target.closest?.(".stile,.ulbtn,.hintbtn");
  if (t && t !== stipFor) stipLater(t);
});
document.addEventListener("mouseout", e => {
  const t = e.target.closest?.(".stile,.ulbtn,.hintbtn");
  if (t && !t.contains(e.relatedTarget)) {
    if (document.activeElement !== t) stipHide();
    else clearTimeout(stipTimer);
  }
});
document.addEventListener("focusin", e => {
  const t = e.target.closest?.(".stile,.ulbtn,.hintbtn");
  if (t) stipLater(t);
  else stipHide();
});
document.addEventListener("focusout", e => {
  if (e.target.closest?.(".stile,.ulbtn,.hintbtn")) stipHide();
});
// any key closes the details popup; Esc only does that (it doesn't also leave the card / close the window)
document.addEventListener(
  "keydown",
  e => {
    if (!stip.hidden || stipTimer) {
      const was = !stip.hidden;
      stipHide();
      if (was && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  },
  true
);
document.addEventListener("click", e => {
  const t = e.target.closest?.(".stile,.ulbtn,.hintbtn");
  if (t) {
    if (stipFor === t && !stip.hidden) stipHide();
    else stipShow(t);
  } else if (!e.target.closest?.("#stip")) stipHide();
});
// scrolling / resizing closes an open popup but doesn't cancel one about to open
// (keyboard moves scroll the focused tile into view – the popup is placed after that)
const stipClose = () => {
  if (!stip.hidden) stipHide();
};
addEventListener("scroll", stipClose, true);
addEventListener("resize", stipClose);

// 🔧 parts that don't fit together – only shown when there is a clash with a planned swap / required part
function compatHtml(clashes) {
  if (!clashes.length) return "";
  const tag = p => (p.req ? " <em>(job requirement)</em>" : p.src === "stats" ? " <em>(customer's part)</em>" : "");
  return `<div class="compat"><b>⚠️ Parts that don't fit together</b><ul>${clashes.map(c => `<li><span class="cpart">${esc(c.part.cat)}: ${esc(c.part.name)}</span>${tag(c.part)} – ${esc(c.msg)}<small>with ${esc(c.other.cat)}: ${esc(c.other.name)}${tag(c.other)}</small></li>`).join("")}</ul>
    <small class="chint">Higher in the swap list wins – drag ⠿ (or Alt + ↑ ↓) to change the order.</small></div>`;
}
// change the order of a job's part swaps (it decides which part "wins" when two don't fit together)
function moveSwap(j, id, to) {
  const i = j.swaps.findIndex(s => s.id === id);
  if (i < 0) return;
  const k = Math.max(0, Math.min(j.swaps.length - 1, to));
  if (k === i) return;
  const [s] = j.swaps.splice(i, 1);
  j.swaps.splice(k, 0, s);
  save();
  render();
}
function render() {
  if (typeof stipHide === "function") stipHide();
  // an open swap form (and what is typed in it) survives the redraw – e.g. a job moved to another table meanwhile
  const forms = [...document.querySelectorAll("[data-swapform]:not([hidden])")].map(f => ({
    id: f.dataset.swapform,
    edit: f.dataset.edit,
    v: ["old", "cat", "new"].map(k => f.querySelector(`[data-f="${k}"]`)?.value),
  }));
  renderBoard();
  for (const o of forms) {
    const btn = document.querySelector(
      o.edit ? `[data-act="editSwap"][data-id="${o.id}"][data-k="${o.edit}"]` : `[data-act="openSwap"][data-id="${o.id}"]`
    );
    if (!btn) continue;
    btn.click();
    const f = document.querySelector(`[data-swapform="${o.id}"]`);
    if (!f) continue;
    ["old", "cat", "new"].forEach((k, i) => {
      const el = f.querySelector(`[data-f="${k}"]`);
      if (el && o.v[i] != null && [...(el.options || [{ value: o.v[i] }])].some(x => x.value === o.v[i])) el.value = o.v[i];
    });
  }
  if (forms.length) {
    const ac = document.getElementById("ac");
    if (ac) ac.hidden = true;
  }
}
function renderBoard() {
  $("#tables").innerHTML = [1, 2, 3]
    .map(n => {
      const j = jobs.find(j => j.table === n);
      return `<section class="slot" style="--c:${TCOL[n]}" data-table="${n}"><h2>Table ${n}<small>${j ? "in progress" : "free"}</small></h2>
      <div class="body">${j ? jobCard(j) : `<div class="free">Free – drag a job here or press T${n} on a job</div>`}</div></section>`;
    })
    .join("");
  // soonest in-game deadline first; jobs without a deadline keep their order at the end
  const q = jobs
    .filter(j => !j.table)
    .map((j, i) => ({ j, i, d: deadlineValue(j.deadline) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map(x => x.j);
  $("#qCount").textContent = q.length ? `(${q.length})` : "";
  $("#queue").innerHTML = q.length
    ? q.map(jobCard).join("")
    : `<div class="empty">No open jobs. Press <b>📸 Capture job</b> or <b>＋</b> (manual job).</div>`;
}
function jobCard(j) {
  if (isFlip(j)) return flipCard(j); // 📦 PC Bay build – own tile (flipui.js)
  const busy = n => jobs.some(o => o.table === n && o !== j);
  const hid = j.tasks.filter(k => k.src === "hid"),
    main = j.tasks.filter(k => k.src === "obj"),
    found = j.tasks.filter(k => k.src === "add");
  const del = k => `<button class="ghost x" data-act="delTask" data-id="${j.id}" data-k="${k.id}" title="Remove">✕</button>`;
  const hidHtml = hid.length
    ? `<div class="hidbox ${hid.every(k => k.done) ? "alldone" : ""}"><div class="hidhead">🔍 Hidden objectives <span>${hid.filter(k => k.done).length}/${hid.length}</span></div>${hid
        .map(k => {
          const [, t, d] = k.text.match(/^(.*?)\s*(\((?:makes|e\.g\.)[^)]*\))?$/) || [, k.text];
          return `<label class="hid ${k.done ? "done" : ""}"><input type="checkbox" ${k.done ? "checked" : ""} data-act="toggleTask" data-id="${j.id}" data-k="${k.id}"><span class="ico">${hidIcon(k.text)}</span><span><b>${esc(t)}</b>${d ? `<small>${esc(d.slice(1, -1))}</small>` : ""}</span>${del(k)}</label>`;
        })
        .join("")}</div>`
    : "";
  // the game's own objectives, in a framed box under T1–T3; the deadline is one of them in the game too –
  // shown without "(2 days)" / "(Tomorrow)": the app can't know the game's current day
  const dlLine = j.deadline && !j.softDeadline ? `Complete by End of Day ${j.deadline}` : "";
  // a part the customer only guesses at (no hidden "check / replace" task for it) – shown under the objectives
  const sus = String(j.suspect || "")
    .split(/,\s*/)
    .filter(x => x && !hid.some(k => k.text.toLowerCase().includes(x.toLowerCase())));
  const susHtml = sus.length ? `<div class="objsus">Customer suspects: ${esc(sus.join(", "))} <small>(often wrong – verify)</small></div>` : "";
  const mainHtml =
    main.length || dlLine || susHtml
      ? `<div class="objbox"><div class="objhead">Objectives</div><ul class="mainobj">${main.map(k => `<li tabindex="-1" data-line="${k.id}">${esc(k.text)}${del(k)}</li>`).join("")}${dlLine ? `<li class="dlobj" tabindex="-1" data-line="deadline">${esc(dlLine)}</li>` : ""}</ul>${susHtml}</div>`
      : "";
  const foundHtml = found
    .map(
      k =>
        `<div class="task ${k.done ? "done" : ""}"><input type="checkbox" ${k.done ? "checked" : ""} data-act="toggleTask" data-id="${j.id}" data-k="${k.id}"><span>${esc(k.text)}</span>${del(k)}</div>`
    )
    .join("");
  const swapPrice = s => s.price ?? priceOf(s.new);
  const clashes = jobCompatIssues(j),
    bad = new Set(clashes.map(c => c.part.swapId).filter(Boolean));
  // tile: ☐ | category / old (red) / ↓ / new (green) / details | price | ✕ over ✎ | drag handle (full height)
  // folded unless the card is opened (▾): ticked swaps and the unticked ones after the first SWAP_SHOW
  let openNo = 0;
  const focused = focusJob === j.id,
    statusCompact = compactStatus && !focused,
    swapsCompact = compactSwaps && !focused; // Settings switches; job focus always shows everything
  const xtra = new Set(swapsCompact ? j.swaps.filter(s => s.done || ++openNo > SWAP_SHOW).map(s => s.id) : []);
  const swaps = j.swaps
    .map(s => {
      const pr = swapPrice(s);
      return `<div class="swap ${s.done ? "done" : ""} ${xtra.has(s.id) ? "xtra" : ""} ${bad.has(s.id) ? "clash" : ""}" data-swap="${s.id}"><input type="checkbox" ${s.done ? "checked" : ""} data-act="toggleSwap" data-id="${j.id}" data-k="${s.id}" style="accent-color:var(--good)"><div class="sbody"><span class="cat">${esc(s.cat === "Water Cooling" ? wcKind({ name: s.new }) || s.cat : s.cat)}</span><span class="old">${esc(s.old || "(empty slot)")}</span><span class="arr" role="img" aria-label="replaced by">${SWAP_ARROW}</span><span class="new">${esc(s.new)}</span>${detailsOf(s.new) ? `<small class="det">${esc(detailsOf(s.new))}</small>` : ""}</div><button class="price ${pr == null ? "unknown" : ""}" data-act="setPrice" data-id="${j.id}" data-k="${s.id}" title="${pr == null ? "Price unknown – click to enter it" : "Click to change the price"}">${pr == null ? "$ ?" : "$" + pr}</button><div class="sacts"><button class="ghost sx" data-act="delSwap" data-id="${j.id}" data-k="${s.id}" title="Remove this swap" aria-label="Remove this swap">✕</button><button class="ghost sx" data-act="editSwap" data-id="${j.id}" data-k="${s.id}" title="Edit this swap" aria-label="Edit this swap">✎</button></div><span class="grip" draggable="true" title="Drag to change the order – higher = wins when parts don't fit together (Alt + ↑ ↓)" aria-hidden="true"></span></div>`;
    })
    .join("");
  const swapMore = xtra.size ? swapMoreHtml(j, xtra) : "";
  // budget = what the customer pays for parts; labour is not part of it
  let budgetHtml = "",
    budgetState = "off";
  const loose = j.story && !budgetInObjectives(main); // story job: the budget only counts when an objective says so
  if (j.budget != null && loose) {
    const spent = j.swaps.reduce((t, s) => t + (swapPrice(s) || 0), 0);
    budgetState = spent > j.budget ? "warn" : "ok"; // story job: going over is allowed – never red
    budgetHtml = `<div class="budget loose">
      <div class="brow"><span>💰 Budget <small>(story job – see 💡)</small></span><b>$${j.budget.toLocaleString()}</b></div>
      <small>$${spent.toLocaleString()} spent on ${j.swaps.length} part${j.swaps.length === 1 ? "" : "s"}</small></div>`;
  } else if (j.budget != null) {
    const spent = j.swaps.reduce((t, s) => t + (swapPrice(s) || 0), 0),
      noPrice = j.swaps.filter(s => swapPrice(s) == null).length;
    const left = j.budget - spent,
      over = left < 0,
      pct = j.budget > 0 ? Math.min(100, (spent / j.budget) * 100) : spent > 0 ? 100 : 0;
    budgetState = over ? "bad" : pct >= 85 ? "warn" : "ok";
    budgetHtml = `<div class="budget ${over ? "over" : pct >= 85 ? "tight" : ""}">
      <div class="brow"><span>${over ? "⚠️ Over budget" : "💰 Budget left"}</span><b>${over ? "−$" + (-left).toLocaleString() : "$" + left.toLocaleString()}</b></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <small>$${spent.toLocaleString()} of $${j.budget.toLocaleString()} spent on ${j.swaps.length} part${j.swaps.length === 1 ? "" : "s"}${noPrice ? ` · <span class="warn">${noPrice} without price</span>` : ""}</small></div>`;
  }
  const comp = j.components.length
    ? `<details><summary>Current parts (${j.components.length})</summary><ul class="parts">${j.components.map(c => `<li>${esc(c.cat)}: <span>${esc(c.name)}</span></li>`).join("")}</ul></details>`
    : `<div class="hint" style="margin:0">No parts list yet</div>`;
  return `<article class="job ${j.story ? "story" : ""} ${swapsOpen.has(j.id) ? "swopen" : ""} ${focused ? "focused" : ""}" draggable="true" data-job="${j.id}" style="--c:${TCOL[j.table || 0]}">
    ${j.story ? `<div class="storytag">📖 Story job</div>` : ""}
    ${focused ? `<div class="focusnote" aria-live="polite">Job focus · <kbd>Esc</kbd> to leave</div>` : ""}
    <div class="top"><div class="who"><b>${esc(j.sender || "Unknown customer")}</b><small>${esc(j.subject)}</small></div><div class="topbtns">${hintBtn(j)}</div></div>
    <div class="chips">${j.labour != null ? `<span class="chip">Labour $${j.labour.toLocaleString()}</span>` : ""}${j.budget != null ? `<span class="chip">Budget $${j.budget.toLocaleString()}</span>` : ""}${j.level != null ? `<span class="chip">Lv ${j.level}</span>` : ""}${j.stars ? `<span class="chip stars" role="img" aria-label="Requires ${j.stars} star${j.stars === 1 ? "" : "s"}" title="Requires ${j.stars} star${j.stars === 1 ? "" : "s"}">${"★".repeat(Math.min(5, j.stars))}</span>` : ""}</div>
    <div class="tables">${[1, 2, 3].map(n => `<button class="${j.table === n ? "sel" : ""} ${busy(n) ? "busy" : ""}" style="--c:${TCOL[n]}" data-act="table" data-id="${j.id}" data-n="${n}" title="${j.table === n ? "Back to open jobs" : busy(n) ? "Table " + n + " is busy – swap jobs" : "Move to table " + n}">T${n}</button>`).join("")}</div>
    ${mainHtml}
    ${statusHtml(j, { budgetHtml, budgetState, clashes, compact: statusCompact })}
    ${hidHtml}
    <div class="sec"><h4>Found while working${found.length ? ` <span>${found.filter(t => t.done).length}/${found.length}</span>` : ""}</h4>${foundHtml}
      <div class="addrow"><input placeholder="New task found…" data-input="task" data-id="${j.id}"><button data-act="addTask" data-id="${j.id}">＋</button></div></div>
    <div class="sec"><h4>Part swaps</h4>${swaps}${swapMore}
      <div class="swapform" data-swapform="${j.id}" data-brands="${esc((j.brands || []).join("|"))}" ${j.budget != null && !loose ? `data-left="${j.budget - j.swaps.reduce((t, s) => t + ((s.price ?? priceOf(s.new)) || 0), 0)}"` : ""} hidden>
        <select data-f="old"><option value="">— replace which part? —</option>${j.components.map((c, i) => `<option value="${i}">${esc(c.cat)}: ${esc(c.name)}</option>`).join("")}<option value="new">(new / empty slot)</option></select>
        <div class="grid2"><select data-f="cat">${SWAP_CATS()
          .map(c => `<option value="${esc(c)}" ${c === "Other" ? "selected" : ""}>${esc(catLabel(c))}</option>`)
          .join("")}</select><input data-f="new" data-ac placeholder="New part – type e.g. 1700X" autocomplete="off"></div>
        <div class="addrow" style="margin:0"><button class="primary" data-act="saveSwap" data-id="${j.id}" style="flex:1">Add swap</button><button data-act="cancelSwap" data-id="${j.id}">Cancel</button></div>
      </div>
      <button data-act="openSwap" data-id="${j.id}" style="width:100%;margin-top:4px">⇄ Add part replacement</button></div>
    <div class="sec">${comp}</div>
    <div class="foot"><button data-act="edit" data-id="${j.id}" title="Edit the job: details, objectives, tasks, parts – and capture PC Stats again (E)">✎ Edit</button><button class="good" data-act="complete" data-id="${j.id}">✔ Job completed</button></div>
  </article>`;
}
const job = id => jobs.find(j => j.id === id);

// ---- part swaps on a card: at most SWAP_SHOW unticked ones, ticked ones fold away; ▾ shows them all ----
const SWAP_SHOW = 3;
// Settings (0.15.0): compact Status (icon tiles) and compact Part swaps (up to SWAP_SHOW open ones) – both on by default
let compactStatus = LS.get("pcbs.compactStatus", true),
  compactSwaps = LS.get("pcbs.compactSwaps", true);
function setCompact(k, v) {
  if (k === "status") LS.set("pcbs.compactStatus", (compactStatus = !!v));
  else LS.set("pcbs.compactSwaps", (compactSwaps = !!v));
  render();
}
// ---- job focus: going into a card with the keyboard (Enter) dims every other job and shows the card in full;
// Esc, Job completed or leaving the card ends it ----
let focusJob = null;
const focusDim = Object.assign(document.createElement("div"), { id: "focusDim", className: "focusdim" });
document.body.append(focusDim);
focusDim.addEventListener("mousedown", () => setFocusJob(null));
function setFocusJob(id) {
  if (focusJob === id) return;
  const still = matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const prev = focusJob;
  focusJob = id;
  document.body.classList.toggle("jobfocus", !!id);
  const redraw = () => {
    if (typeof rememberFocus === "function") rememberFocus();
    render();
    if (typeof restoreFocus === "function") restoreFocus();
  };
  // the card grows / shrinks smoothly: measure, redraw, animate the height between the two
  const card = id || prev ? document.querySelector(`.job[data-job="${id || prev}"]`) : null,
    h0 = card?.getBoundingClientRect().height;
  redraw();
  const now = document.querySelector(`.job[data-job="${id || prev}"]`);
  if (!still && now && h0) {
    const h1 = now.getBoundingClientRect().height;
    if (Math.abs(h1 - h0) > 2) now.animate([{ height: h0 + "px", overflow: "hidden" }, { height: h1 + "px", overflow: "hidden" }], { duration: 260, easing: "ease-in-out" });
  }
}
// leaving the focused card (mouse click elsewhere, Tab out) ends job focus
document.addEventListener("focusin", e => {
  if (focusJob && !e.target.closest?.(`.job[data-job="${focusJob}"]`) && !e.target.closest?.("dialog, header, #ac, #stip")) setFocusJob(null);
});
const swapsOpen = new Set(); // cards showing every swap (until another job is selected)
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
function swapMoreHtml(j, xtra) {
  const left = j.swaps.filter(s => !s.done && xtra.has(s.id)).length,
    done = j.swaps.filter(s => s.done).length;
  const closed = !j.swaps.some(s => !s.done)
    ? `✔ All planned swaps are done <small>– click to show ${done === 1 ? "it" : "them"}</small>`
    : left
      ? `${plural(left, "more part swap")} planned${done ? ` <small>· ${done} done</small>` : ""} <small>– click to show</small>`
      : `✔ ${plural(done, "swap")} done <small>– click to show</small>`;
  return `<button class="ghost swapmore" data-act="swapMore" data-id="${j.id}" aria-expanded="${swapsOpen.has(j.id)}"><span class="sm-closed">${closed}</span><span class="sm-open">▴ Show less</span></button>`;
}
// fold every opened card except the selected one
function foldSwaps(keep) {
  document.querySelectorAll(".job.swopen").forEach(c => {
    const id = c.dataset.job;
    if (id === keep) return;
    animSwaps(id, () => {
      swapsOpen.delete(id);
      c.classList.remove("swopen");
      c.querySelector(".swapmore")?.setAttribute("aria-expanded", "false");
    });
  });
}
document.addEventListener("mousedown", e => {
  const c = e.target.closest?.(".job");
  if (c) foldSwaps(c.dataset.job);
});
// smooth change of the swap tiles' sizes: measure, change (or redraw), measure again, animate between the two
const ANIM_PROPS = ["height", "paddingTop", "paddingBottom", "marginTop", "marginBottom", "borderTopWidth", "borderBottomWidth"];
function animSwaps(jobId, change) {
  const tiles = () => {
    const card = document.querySelector(`.job[data-job="${jobId}"]`);
    return card ? [...card.querySelectorAll(".swap, .swapmore")] : [];
  };
  const key = el => el.dataset.swap || "more";
  const look = el => {
    const cs = getComputedStyle(el),
      o = {};
    ANIM_PROPS.forEach(p => (o[p] = cs[p]));
    return o;
  };
  const still = matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const before = new Map(still ? [] : tiles().map(el => [key(el), look(el)]));
  change();
  if (still) return;
  tiles().forEach(el => {
    const a = before.get(key(el)),
      b = look(el);
    if (!a) return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 }); // new line: fade in
    if (ANIM_PROPS.every(p => a[p] === b[p])) return;
    el.animate(
      [
        { ...a, overflow: "hidden", visibility: "visible" },
        { ...b, overflow: "hidden", visibility: "visible" },
      ],
      {
        duration: 240,
        easing: "ease-in-out",
      }
    );
  });
}
function moveToTable(j, n) {
  if (j.table === n) {
    j.table = 0;
    return;
  }
  const occ = jobs.find(o => o.table === n && o !== j);
  if (occ) {
    occ.table = j.table || 0;
    toast(
      occ.table
        ? `Swapped – ${occ.sender || "other job"} moved to Table ${occ.table}`
        : `${occ.sender || "Previous job"} moved back to open jobs`
    );
  }
  j.table = n;
  // the workbenches are at the top of the page – show the job where it went (after the board is drawn again)
  if (n) setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const j = job(b.dataset.id);
  const a = b.dataset.act;
  if (a === "table") {
    moveToTable(j, +b.dataset.n);
  } else if (a === "toggleTask") {
    const t = j.tasks.find(t => t.id === b.dataset.k);
    t.done = b.checked;
  } else if (a === "delTask") {
    const i = j.tasks.findIndex(t => t.id === b.dataset.k);
    if (i < 0) return;
    const [t] = j.tasks.splice(i, 1);
    save();
    render();
    toast(`Removed: ${t.text}`, () => {
      j.tasks.splice(Math.min(i, j.tasks.length), 0, t);
      save();
      render();
    });
    return;
  } else if (a === "addTask") {
    const inp = document.querySelector(`[data-input="task"][data-id="${j.id}"]`);
    if (!inp.value.trim()) return;
    j.tasks.push({ id: uid(), text: inp.value.trim(), src: "add", done: false });
  } else if (a === "toggleSwap") {
    j.swaps.find(s => s.id === b.dataset.k).done = b.checked;
    animSwaps(j.id, () => {
      save();
      render();
    });
    return;
  } else if (a === "swapMore") {
    const card = b.closest(".job");
    animSwaps(j.id, () => {
      const on = !swapsOpen.has(j.id);
      if (on) swapsOpen.add(j.id);
      else swapsOpen.delete(j.id);
      card.classList.toggle("swopen", on);
    });
    return;
  } else if (a === "setPrice") {
    const s = j.swaps.find(s => s.id === b.dataset.k);
    const cur = s.price ?? priceOf(s.new);
    const v = prompt(`Price of ${s.new} in $ (leave empty to use the shop price):`, cur ?? "");
    if (v === null) return;
    s.price = v.trim() === "" ? undefined : Math.max(0, Math.round(+v.replace(/[^\d.]/g, "")) || 0);
    if (s.price === undefined) delete s.price;
  } else if (a === "delSwap") {
    const i = j.swaps.findIndex(s => s.id === b.dataset.k);
    if (i < 0) return;
    const [sw] = j.swaps.splice(i, 1);
    save();
    render();
    toast(`Removed swap: ${sw.new}`, () => {
      j.swaps.splice(Math.min(i, j.swaps.length), 0, sw);
      save();
      render();
    });
    return;
  } else if (a === "editSwap") {
    // the swap form, filled in, right under that swap – saving changes it in place
    const sw = j.swaps.find(x => x.id === b.dataset.k);
    if (!sw) return;
    const f = document.querySelector(`[data-swapform="${j.id}"]`),
      row = b.closest(".swap"),
      sel = f.querySelector('[data-f="old"]');
    row.after(f);
    f.hidden = false;
    f.dataset.edit = sw.id;
    document.querySelector(`[data-act="openSwap"][data-id="${j.id}"]`).hidden = true;
    let i = j.components.findIndex(c => c.name === sw.old && c.cat === sw.cat);
    if (i < 0) i = j.components.findIndex(c => c.name === sw.old);
    if (sw.old && i < 0) {
      sel.insertAdjacentHTML("beforeend", `<option value="keep">${esc(sw.cat)}: ${esc(sw.old)}</option>`);
      sel.value = "keep";
    } else sel.value = sw.old ? String(i) : "new";
    f.querySelector('[data-f="cat"]').value = CATS.includes(sw.cat) ? catKey({ name: sw.new, cat: sw.cat }) : "Other";
    const inp = f.querySelector('[data-f="new"]');
    inp.value = sw.new;
    const save = f.querySelector('[data-act="saveSwap"]');
    save.textContent = "Save change";
    sel.onchange = ev => {
      const c = j.components[ev.target.value];
      if (c) f.querySelector('[data-f="cat"]').value = CATS.includes(c.cat) ? catKey(c) : "Other";
    };
    inp.dataset.noAc = "1";
    inp.focus();
    inp.select();
    delete inp.dataset.noAc;
    return;
  } else if (a === "openSwap") {
    const f = document.querySelector(`[data-swapform="${j.id}"]`);
    f.hidden = false;
    b.hidden = true;
    f.querySelector('[data-f="old"]').onchange = ev => {
      // copy the chosen part (name + category) into "New part", selected so typing replaces it
      const c = j.components[ev.target.value],
        inp = f.querySelector('[data-f="new"]');
      f.querySelector('[data-f="cat"]').value = c && CATS.includes(c.cat) ? catKey(c) : "Other";
      inp.value = c ? c.name : "";
      if (ev.target.dataset.kb) return; // changed with ← → : stay on the dropdown
      inp.dataset.noAc = "1";
      inp.focus();
      inp.select();
      delete inp.dataset.noAc;
    };
    f.querySelector('[data-f="new"]').focus();
    return;
  } else if (a === "cancelSwap") {
    b.closest("[data-swapform]").hidden = true;
    render();
    return;
  } else if (a === "saveSwap") {
    const f = document.querySelector(`[data-swapform="${j.id}"]`);
    const o = f.querySelector('[data-f="old"]').value,
      nw = f.querySelector('[data-f="new"]').value.trim(),
      cat = catData(f.querySelector('[data-f="cat"]').value);
    if (!nw) {
      f.querySelector('[data-f="new"]').focus();
      return;
    }
    let ed = f.dataset.edit && j.swaps.find(x => x.id === f.dataset.edit);
    const old = ed && o === "keep" ? ed.old : j.components[o]?.name || "";
    // a part that already has a planned swap: the new one takes its place (same spot in the list), never both
    const twin = old && j.swaps.find(x => x !== ed && lowName(x.old) === lowName(old));
    const before = j.swaps.map(x => ({ ...x }));
    if (twin && ed) j.swaps.splice(j.swaps.indexOf(twin), 1);
    else if (twin) ed = twin;
    if (ed) {
      const was = ed.new;
      ed.old = old;
      ed.cat = cat;
      ed.new = nw;
      if (nw !== was) {
        delete ed.price;
        ed.done = false;
      }
    } else j.swaps.push({ id: uid(), old, cat, new: nw, done: false });
    rememberPart(nw, cat);
    f.hidden = true;
    if (twin) {
      save();
      render();
      toast(`Replaced the planned swap ${twin === ed ? before.find(x => x.id === twin.id).new : twin.new} → ${nw}`, () => {
        j.swaps = before;
        save();
        render();
      });
      return;
    }
  } else if (a === "complete") {
    const idx = jobs.indexOf(j);
    if (focusJob === j.id) {
      focusJob = null; // job focus ends with the job (no animation – the card is gone)
      document.body.classList.remove("jobfocus");
    }
    jobs.splice(idx, 1);
    save();
    render();
    toast(`Completed: ${j.sender || "job"}`, () => {
      if (j.table && jobs.some(o => o.table === j.table)) j.table = 0;
      jobs.splice(idx, 0, j);
      save();
      render();
    });
    return;
  } else if (a === "edit") {
    openReview(null, j);
    return;
  } else if (a === "addParts") {
    openReview(null, j);
    return;
  } // old shortcut target – now the Edit window
  else return;
  save();
  render();
});
document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  if (e.target.dataset.input === "task") document.querySelector(`[data-act="addTask"][data-id="${e.target.dataset.id}"]`).click();
  else if (e.target.matches('[data-swapform] [data-f="new"]'))
    e.target.closest("[data-swapform]").querySelector('[data-act="saveSwap"]').click();
});
// drag & drop: onto a table slot or back to open jobs
const dropTarget = el => el.closest?.(".slot") || el.closest?.("#queue");
document.addEventListener("dragstart", e => {
  const g = e.target.closest?.(".grip");
  if (g) {
    const sw = g.closest(".swap");
    e.dataTransfer.setData("swap", sw.dataset.swap);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setDragImage(sw, 12, 12);
    sw.classList.add("dragging");
    return;
  }
  const c = e.target.closest?.(".job");
  if (c) e.dataTransfer.setData("job", c.dataset.job);
});
// swap rows: drop above / below another swap of the same job
const swapDrop = e => {
  const row = e.target.closest?.(".swap");
  if (!row) return null;
  const r = row.getBoundingClientRect();
  return { row, after: e.clientY > r.top + r.height / 2 };
};
document.addEventListener("dragover", e => {
  if (!e.dataTransfer.types.includes("swap")) return;
  const d = swapDrop(e),
    src = document.querySelector(".swap.dragging");
  document.querySelectorAll(".swap.dropbefore,.swap.dropafter").forEach(x => x.classList.remove("dropbefore", "dropafter"));
  if (!d || !src || d.row.closest(".job") !== src.closest(".job")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  d.row.classList.add(d.after ? "dropafter" : "dropbefore");
});
document.addEventListener("drop", e => {
  if (!e.dataTransfer.types.includes("swap")) return;
  e.preventDefault();
  const id = e.dataTransfer.getData("swap"),
    d = swapDrop(e);
  document
    .querySelectorAll(".swap.dropbefore,.swap.dropafter,.swap.dragging")
    .forEach(x => x.classList.remove("dropbefore", "dropafter", "dragging"));
  if (!d) return;
  const j = jobs.find(x => x.id === d.row.closest(".job").dataset.job);
  if (!j) return;
  const from = j.swaps.findIndex(s => s.id === id),
    at = j.swaps.findIndex(s => s.id === d.row.dataset.swap);
  if (from < 0 || at < 0) return;
  moveSwap(j, id, at + (d.after ? 1 : 0) - (from < at + (d.after ? 1 : 0) ? 1 : 0));
});
document.addEventListener("dragend", () =>
  document
    .querySelectorAll(".swap.dragging,.swap.dropbefore,.swap.dropafter")
    .forEach(x => x.classList.remove("dragging", "dropbefore", "dropafter"))
);
document.addEventListener("dragover", e => {
  if (!e.dataTransfer.types.includes("job")) return;
  const t = dropTarget(e.target);
  document.querySelectorAll(".slot,#queue").forEach(c => c.classList.toggle("drop", c === t));
  if (t) e.preventDefault();
});
document.addEventListener("dragend", () => document.querySelectorAll(".drop").forEach(c => c.classList.remove("drop")));
document.addEventListener("drop", e => {
  const id = e.dataTransfer.getData("job");
  const t = dropTarget(e.target);
  document.querySelectorAll(".drop").forEach(c => c.classList.remove("drop"));
  if (!t || !id) return;
  e.preventDefault();
  const j = job(id);
  const n = t.id === "queue" ? 0 : +t.dataset.table;
  if (n) {
    if (j.table !== n) moveToTable(j, n);
  } else j.table = 0;
  save();
  render();
});

let toastTimer;
function toast(msg, undo) {
  const host = [...document.querySelectorAll("dialog")].find(d => d.open) || document.body;
  if ($("#toast").parentNode !== host) host.append($("#toast"));
  $("#toastTxt").textContent = msg;
  $("#toast").style.display = "flex";
  $("#toastBtn").style.display = undo ? "" : "none";
  $("#toastBtn").onclick = () => {
    undo();
    $("#toast").style.display = "none";
  };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").style.display = "none"), 7000);
}
