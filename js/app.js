/* PCBS Job Board – main app (board, capture, OCR review, settings). */
// ================= state =================
let jobs = LS.get("pcbs.jobs", []);
let rules = LS.get("pcbs.rules", null);
// saved rules from an older version
if (rules && LS.get("pcbs.rulesVer", 1) < RULES_VERSION) {
  if (LS.get("pcbs.rulesVer", 1) < 3) {
    // before the rules table (v3): the old default rules are replaced by the current set, own rules kept
    const defaults = new Set([...OLD_DEFAULT_TASKS, ...DEFAULT_RULES.map(d => d.task)]);
    rules = [...structuredClone(DEFAULT_RULES), ...rules.filter(r => !defaults.has(r.task))];
  } else {
    // since the rules table the user may have edited the defaults: only add the new words to them
    for (const d of DEFAULT_RULES) {
      const r = rules.find(x => x.task === d.task);
      if (!r) continue; // deleted on purpose → stays deleted
      for (const k of d.keys) if (!r.keys.includes(k)) r.keys.push(k);
    }
  }
  LS.set("pcbs.rules", rules);
}
LS.set("pcbs.rulesVer", RULES_VERSION);
if (!rules) rules = DEFAULT_RULES;
let smart = Object.assign({}, SMART_DEFAULT, LS.get("pcbs.smart", {})); // built-in detections on/off
// resale = PC Bay's Resale Value panel, inv = the inventory's card grid (3 columns) – both found automatically too
const DEFAULT_CROPS = {
  email: { x: 0.5, y: 0.14, w: 0.42, h: 0.68 },
  stats: { x: 0.015, y: 0.1, w: 0.265, h: 0.76 },
  resale: { x: 0.725, y: 0.1, w: 0.264, h: 0.647 },
  inv: { x: 0.337, y: 0.24, w: 0.493, h: 0.731 },
};
let crops = Object.assign(structuredClone(DEFAULT_CROPS), LS.get("pcbs.crops", {}));
// v1 → v2 migration: tables can hold only one job each
(() => {
  const seen = new Set();
  jobs.forEach(j => {
    if (j.table && seen.has(j.table)) j.table = 0;
    else if (j.table) seen.add(j.table);
  });
})();
const save = () => LS.set("pcbs.jobs", jobs);
const TCOL = ["var(--t0)", "var(--t1)", "var(--t2)", "var(--t3)"];

// ================= board =================
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
    ${bc.mixedGpus ? `<small class="warn">Two different GPUs – only one counts.</small>` : ""}
    <div class="bverdict">${verdict}</div></div>`;
}
// Overclock objective: can it be done (certain), how hard (rough guide), PSU when overclocked
const OC_ICON = `<svg class="bicon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 17a8.5 8.5 0 0 1 17 0" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".35"/><path d="M3.5 17a8.5 8.5 0 0 1 12.7-7.4" fill="none" stroke="#ff8a1f" stroke-width="2.6" stroke-linecap="round"/><path d="M12 17l5.2-6.4" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17" r="2.1" fill="#fff"/></svg>`;
function ocHtml(oc) {
  const ic = { ok: "✓", warn: "!", bad: "✗", off: "–" };
  return `<div class="ocbox st-${oc.state}"><div class="brow"><span>Overclock</span></div>
    ${oc.items.map(i => `<div class="ocitem st-${i.state}"><b class="ocic">${ic[i.state]}</b><div><div class="octitle">${esc(i.text)}</div>${i.lines.map(l => `<small>${l}</small>`).join("")}</div></div>`).join("")}
    ${oc.psu ? `<div class="ocitem st-${oc.psu.bad ? "bad" : "ok"}"><b class="ocic">${oc.psu.bad ? "✗" : "✓"}</b><div><small>Overclocked power ~${oc.psu.use.toLocaleString()} W of ${oc.psu.w.toLocaleString()} W${oc.psu.bad ? " – <b>the PSU is too weak</b>" : ""}</small></div></div>` : `<small>Power: add the PSU to check the overclocked watts.</small>`}
    <small class="ocnote">Clocks are estimated at 90 % of each part's overclock potential – your in-game result can differ with the cooling and power. Watts are counted at the full overclock.</small></div>`;
}
// 💡 tips for this job (js/hints.js) – only shown when at least one applies; the list pops up like a Status tile's details
function hintBtn(j) {
  const hs = jobHints(j);
  if (!hs.length) return "";
  return `<button class="hintbtn" aria-label="${hs.length} tip${hs.length > 1 ? "s" : ""} for this job"><span aria-hidden="true">💡</span><template><div class="hintbox"><div class="brow">💡 Tips for this job</div><ul>${hs.map(h => `<li>${esc(h.text)}</li>`).join("")}</ul></div></template></button>`;
}
// STATUS: one row of icon tiles under T1–T3 – colour = state, details in a small popup (hover / focus ~0.5 s)
function statusHtml(j, { budgetHtml, budgetState, clashes }) {
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
  const mainHtml = main.length
    ? `<div class="sec"><h4>Objectives</h4><ul class="mainobj">${main.map(k => `<li tabindex="-1" data-line="${k.id}">${esc(k.text)}${del(k)}</li>`).join("")}</ul></div>`
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
  const swaps = j.swaps
    .map(s => {
      const pr = swapPrice(s);
      return `<div class="swap ${s.done ? "done" : ""} ${bad.has(s.id) ? "clash" : ""}" data-swap="${s.id}"><input type="checkbox" ${s.done ? "checked" : ""} data-act="toggleSwap" data-id="${j.id}" data-k="${s.id}" style="accent-color:var(--good)"><div class="sbody"><span class="cat">${esc(s.cat === "Water Cooling" ? wcKind({ name: s.new }) || s.cat : s.cat)}</span><span class="old">${esc(s.old || "(empty slot)")}</span><span class="arr" aria-label="replaced by">↓</span><span class="new">${esc(s.new)}</span>${detailsOf(s.new) ? `<small class="det">${esc(detailsOf(s.new))}</small>` : ""}</div><button class="price ${pr == null ? "unknown" : ""}" data-act="setPrice" data-id="${j.id}" data-k="${s.id}" title="${pr == null ? "Price unknown – click to enter it" : "Click to change the price"}">${pr == null ? "$ ?" : "$" + pr}</button><div class="sacts"><button class="ghost sx" data-act="delSwap" data-id="${j.id}" data-k="${s.id}" title="Remove this swap" aria-label="Remove this swap">✕</button><button class="ghost sx" data-act="editSwap" data-id="${j.id}" data-k="${s.id}" title="Edit this swap" aria-label="Edit this swap">✎</button></div><span class="grip" draggable="true" title="Drag to change the order – higher = wins when parts don't fit together (Alt + ↑ ↓)" aria-hidden="true"></span></div>`;
    })
    .join("");
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
  return `<article class="job ${j.story ? "story" : ""}" draggable="true" data-job="${j.id}" style="--c:${TCOL[j.table || 0]}">
    ${j.story ? `<div class="storytag">📖 Story job</div>` : ""}
    <div class="top"><div class="who"><b>${esc(j.sender || "Unknown customer")}</b><small>${esc(j.subject)}</small></div><div class="topbtns">${hintBtn(j)}</div></div>
    <div class="chips">${j.labour != null ? `<span class="chip">Labour $${j.labour}</span>` : ""}${j.deadline ? `<span class="chip dl" ${j.softDeadline ? 'title="Urgent job – no exact deadline, aim for 2 days"' : ""}>⏰ ${j.softDeadline ? "~" : "by "}${esc(j.deadline)}</span>` : ""}${j.suspect ? `<span class="chip sus">Says: ${esc(j.suspect)}?</span>` : ""}${hid.some(k => !k.done) ? `<span class="chip hidchip">🔍 ${hid.filter(k => !k.done).length} hidden</span>` : ""}</div>
    <div class="tables">${[1, 2, 3].map(n => `<button class="${j.table === n ? "sel" : ""} ${busy(n) ? "busy" : ""}" style="--c:${TCOL[n]}" data-act="table" data-id="${j.id}" data-n="${n}" title="${j.table === n ? "Back to open jobs" : busy(n) ? "Table " + n + " is busy – swap jobs" : "Move to table " + n}">T${n}</button>`).join("")}</div>
    ${statusHtml(j, { budgetHtml, budgetState, clashes })}
    ${hidHtml}${mainHtml}
    <div class="sec"><h4>Found while working${found.length ? ` <span>${found.filter(t => t.done).length}/${found.length}</span>` : ""}</h4>${foundHtml}
      <div class="addrow"><input placeholder="New task found…" data-input="task" data-id="${j.id}"><button data-act="addTask" data-id="${j.id}">＋</button></div></div>
    <div class="sec"><h4>Part swaps</h4>${swaps}
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
    const ed = f.dataset.edit && j.swaps.find(x => x.id === f.dataset.edit);
    if (ed) {
      const was = ed.new;
      ed.old = o === "keep" ? ed.old : j.components[o]?.name || "";
      ed.cat = cat;
      ed.new = nw;
      if (nw !== was) {
        delete ed.price;
        ed.done = false;
      }
    } else j.swaps.push({ id: uid(), old: j.components[o]?.name || "", cat, new: nw, done: false });
    rememberPart(nw, cat);
    f.hidden = true;
  } else if (a === "complete") {
    const idx = jobs.indexOf(j);
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

// ================= screen capture =================
let stream = null;
$("#btnShare").onclick = async () => {
  try {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
    stopStream();
    stream = s;
    $("#video").srcObject = stream;
    stream.getVideoTracks()[0].onended = () => {
      stream = null;
      setStatus();
    };
    try {
      await $("#video").play();
    } catch {}
    setStatus();
    warmReader();
  } catch (err) {
    toast("Screen sharing was cancelled or blocked.");
  }
};
function stopStream() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  $("#video").srcObject = null;
}
$("#btnStop").onclick = () => {
  stopStream();
  setStatus();
  toast("Screen capture stopped");
};
$("#btnChange").onclick = () => $("#btnShare").onclick();
function setStatus() {
  startLive();
  $("#btnShare").hidden = !!stream;
  $("#scrChip").hidden = !stream;
}
async function grabFrame() {
  const track = stream.getVideoTracks()[0];
  let c = null;
  if (window.ImageCapture) {
    try {
      const bmp = await new ImageCapture(track).grabFrame();
      c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext("2d").drawImage(bmp, 0, 0);
      if (isBlack(c)) c = null;
    } catch {
      c = null;
    }
  }
  if (!c) {
    const v = $("#video");
    try {
      await v.play();
    } catch {}
    for (let i = 0; i < 20 && (!v.videoWidth || v.readyState < 2); i++) await new Promise(r => setTimeout(r, 100));
    await new Promise(r => (v.requestVideoFrameCallback ? v.requestVideoFrameCallback(() => r()) : setTimeout(r, 200)));
    c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
  }
  return { url: c.toDataURL("image/png"), black: isBlack(c) };
}
function isBlack(c) {
  if (!c.width || !c.height) return true;
  const t = document.createElement("canvas");
  t.width = 64;
  t.height = 36;
  const g = t.getContext("2d");
  g.drawImage(c, 0, 0, 64, 36);
  const d = g.getImageData(0, 0, 64, 36).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
  return sum / (d.length / 4) < 12;
}
let liveTimer = null;
function startLive() {
  const cv = $("#live"),
    v = $("#video");
  clearInterval(liveTimer);
  if (!stream) return;
  liveTimer = setInterval(() => {
    if (v.videoWidth) cv.getContext("2d").drawImage(v, 0, 0, cv.width, cv.height);
  }, 1000);
}
const BLACK_HELP = `The captured image is black. Try, in this order:<br>
1. Click the <b>screen preview</b> in the top bar (change screen) and choose the <b>Entire screen</b> tab → screen 1 (not the “Window” tab).<br>
2. Switch chiaki-ng from fullscreen to a maximised window.<br>
3. Browser Settings → System → turn <b>off “Use graphics/hardware acceleration”</b>, restart the browser.<br>
Meanwhile: press <b>Win+Shift+S</b>, snip screen 1, and <b>Ctrl+V</b> into this page.`;
async function startCapture(forJob) {
  if (!stream) {
    toast("Click “Connect screen” first and pick screen 1 – or paste/drop a screenshot.");
    return;
  }
  const f = await grabFrame();
  openReview(f.url, null, forJob);
  showBlack(f.black);
}
function showBlack(b) {
  $("#blackWarn").innerHTML = BLACK_HELP;
  $("#blackWarn").hidden = !b;
}
$("#btnCapture").onclick = () => startCapture(null);
$("#btnManual").onclick = () => openReview(null, null);
window.addEventListener("paste", e => {
  const f = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith("image/"));
  if (f) readImg(f);
});
let dragDepth = 0;
window.addEventListener("dragenter", e => {
  if (e.dataTransfer.types.includes("Files")) {
    dragDepth++;
    $("#drop").style.display = "flex";
  }
});
window.addEventListener("dragleave", e => {
  if (e.dataTransfer.types.includes("Files") && --dragDepth <= 0) {
    dragDepth = 0;
    $("#drop").style.display = "none";
  }
});
window.addEventListener("dragover", e => {
  if (e.dataTransfer.types.includes("Files")) e.preventDefault();
});
window.addEventListener("drop", e => {
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();
  dragDepth = 0;
  $("#drop").style.display = "none";
  const f = [...e.dataTransfer.files].find(f => f.type.startsWith("image/"));
  if (f) readImg(f);
});
function readImg(f) {
  const r = new FileReader();
  r.onload = () => {
    if (typeof flipTakeImage === "function" && flipTakeImage(r.result)) return;
    if ($("#dlgReview").open && rev) addShot(r.result, rev.forJob ? "parts" : "auto");
    else openReview(r.result, null);
  };
  r.readAsDataURL(f);
}

// ================= OCR =================
let worker = null,
  workerP = null;
// "working on it" line of whichever window is reading: the job window (#ocrState) or the PC Bay window (.fstate)
function ocrNote(msg) {
  if ($("#dlgReview").open) $("#ocrState").textContent = msg;
  const fs = $("#dlgFlip").open && $("#dlgFlip .fstate");
  if (fs) fs.textContent = msg;
}
// the text reader starts once per visit (the first time it also downloads a few MB, then the browser keeps them);
// it is started early in the background (screen connected, job / PC Bay window opened) so a capture doesn't wait for it
function getWorker(quiet) {
  if (worker) return Promise.resolve(worker);
  if (!workerP) {
    if (!window.Tesseract)
      return Promise.reject(new Error("Text reader didn't load – check internet connection (needed the first time)."));
    const first = !LS.get("pcbs.ocrUsed", false);
    workerP = (async () => {
      const w = await Tesseract.createWorker("eng", 1, {
        logger: m => {
          if (m.status === "recognizing text") $("#prog").style.width = Math.round(m.progress * 100) + "%";
          else if (/^loading/.test(m.status) && !workerQuiet)
            ocrNote(
              `⏳ ${first ? "Downloading" : "Starting"} the text reader${first ? " (first time only, a few MB)" : ""}… ${m.progress ? Math.round(m.progress * 100) + "%" : ""}`
            );
        },
      });
      await w.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "0" });
      LS.set("pcbs.ocrUsed", true);
      worker = w;
      return w;
    })().catch(e => {
      workerP = null;
      throw e;
    });
  }
  if (!quiet) {
    workerQuiet = false;
    ocrNote("⏳ Starting the text reader…");
  } // a capture is waiting for it: say so
  return workerP;
}
let workerQuiet = true; // messages only once a capture waits for the reader
const warmReader = () => {
  if (window.Tesseract) getWorker(true).catch(() => {});
}; // background start, no messages
// people who have captured before get the reader started right after the page has loaded
if (LS.get("pcbs.ocrUsed", false)) setTimeout(() => (window.requestIdleCallback || setTimeout)(warmReader), 1500);
function cropCanvas(img, r) {
  const W = img.naturalWidth,
    H = img.naturalHeight,
    sx = r.x * W,
    sy = r.y * H,
    sw = r.w * W,
    sh = r.h * H;
  const scale = sw < 1300 ? Math.min(2.5, 1300 / sw) : 1;
  const c = document.createElement("canvas");
  c.width = sw * scale;
  c.height = sh * scale;
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.filter = "grayscale(1) contrast(1.15)";
  g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}
// text + every line with its certainty (0–100). Since tesseract.js 6 only the plain text comes back
// unless more is asked for, so the lines are taken from the "blocks" output (block → paragraph → line).
async function readText(canvas) {
  const w = await getWorker();
  const d = (await w.recognize(canvas, {}, { text: true, blocks: true })).data;
  const lines = [];
  for (const b of d.blocks || [])
    for (const p of b.paragraphs || [])
      for (const l of p.lines || []) lines.push([String(l.text || "").trim(), l.confidence, l.bbox]); // bbox: where on the (cropped) picture
  return { text: d.text || "", lines };
}
let lastConf = null;
async function ocr(img, kind) {
  await getWorker();
  $("#ocrState").textContent = `Reading ${kind === "email" ? "email" : "PC Stats"}…`;
  $("#prog").style.width = "0";
  const r = await readText(cropCanvas(img, crops[kind === "parts" ? "stats" : kind]));
  lastConf = r.lines; // per-line certainty, used when joining screenshots
  $("#prog").style.width = "100%";
  return r.text;
}

// ================= review dialog =================
// rev.shots: [{url, kind: "email"|"parts", text}] – the email is read first; each
// "Add PC parts capture" adds a frame whose PC Stats popup is read and merged into the parts list.
let rev = null;
function openReview(dataUrl, editJob, forJob) {
  const dlg = $("#dlgReview");
  if (editJob) forJob = editJob; // 0.13.0: one Edit window for the job's details AND its parts (the old Parts window is gone)
  rev = { editJob, forJob, shots: [], cur: -1, draft: editJob ? structuredClone(editJob) : blankDraft() };
  if (editJob) {
    // the job's tasks back into the form's three lists
    const t = editJob.tasks || [];
    rev.draft.objectives = t.filter(x => x.src === "obj").map(x => x.text);
    rev.draft.hidden = t.filter(x => x.src === "hid").map(x => ({ task: x.text, because: [], keep: true }));
    rev.draft.extra = t.filter(x => x.src !== "obj" && x.src !== "hid").map(x => x.text);
  }
  if (forJob) rev.draft.components = structuredClone(forJob.components || []);
  // parts that came from a PC Stats capture are replaced by a new capture (typed ones are kept);
  // jobs saved before 0.11.1 don't know which were captured – all their parts count as captured
  const known = forJob || editJob;
  rev.autoNames = new Set(known ? (known.capNames || (known.components || []).map(c => c.name)).map(n => n.toLowerCase()) : []);
  // a new capture in a saved job's Parts window adds to the parts captured before instead of standing next to them
  rev.prevCap = forJob
    ? (forJob.components || []).filter(c => rev.autoNames.has(c.name.toLowerCase())).map(({ cat, name }) => ({ cat, name }))
    : [];
  $("#revTitle").textContent = editJob
    ? `Edit job: ${editJob.sender || "unknown customer"}`
    : dataUrl
      ? "New job from capture"
      : "New job";
  $("#rawTxt").textContent = "";
  $("#prog").style.width = "0";
  $("#ocrState").textContent = "";
  renderForm();
  showBlack(false);
  renderShots();
  dlg.showModal();
  warmReader();
  $("#fSender")?.focus({ preventScroll: true }); // not the ✕ in the corner (Enter would close the window)
  if (dataUrl) addShot(dataUrl, forJob ? "parts" : "email");
}
// a warning under the screenshot with a shortcut to the set-up window – nothing is changed automatically
function areaWarn(msg) {
  $("#ocrState").innerHTML = `<div class="areawarn">⚠ ${esc(msg)} <button id="warnAdjust">🎯 Adjust areas</button></div>`;
  $("#warnAdjust").onclick = adjustArea;
}
function blankDraft() {
  return {
    id: uid(),
    sender: "",
    subject: "",
    labour: null,
    budget: null,
    level: null,
    deadline: "",
    suspect: "",
    table: 0,
    tasks: [],
    swaps: [],
    components: [],
    hidden: [],
    objectives: [],
  };
}
function addShot(url, kind) {
  rev.shots.push({ url, kind, text: "" });
  showShot(rev.shots.length - 1, true);
}
function showShot(i, read) {
  rev.cur = i;
  const sh = rev.shots[i];
  mode = sh.kind === "parts" ? "stats" : "email";
  renderShots();
  const im = $("#shot");
  im.onload = () => {
    drawCrops();
    if (read) runOcr();
  };
  im.src = sh.url;
  $("#rawTxt").textContent = sh.text || "";
}
function renderShots() {
  const has = rev && rev.shots.length;
  const dlg = $("#dlgReview");
  dlg.querySelector(".review").style.gridTemplateColumns = has || $("#revJob").innerHTML.trim() ? "" : "1fr"; // job fields left, parts right
  $("#shotPane").hidden = !has;
  $("#shotTabs").innerHTML = has
    ? rev.shots
        .map((sh, i) => {
          const n = rev.shots.slice(0, i + 1).filter(x => x.kind === "parts").length;
          const e = rev.shots.slice(0, i + 1).filter(x => x.kind === "email").length;
          return `<button class="${i === rev.cur ? "sel" : ""}" data-shot="${i}">${sh.kind === "email" ? "✉ Email " + e : "🧩 Parts " + n}</button>`;
        })
        .join("")
    : "";
  const k = rev && rev.cur >= 0 ? rev.shots[rev.cur].kind : "email";
  $("#cropEmail").hidden = k !== "email";
  $("#cropStats").hidden = k !== "parts";
  $("#areaHint").innerHTML =
    k === "email"
      ? "Blue box = the email text, budget and objectives."
      : "Orange box = the <b>PC Stats</b> popup (Components list). Scroll it in-game and capture again for more parts.";
}
$("#shotTabs").addEventListener("click", e => {
  const b = e.target.closest("[data-shot]");
  if (b) showShot(+b.dataset.shot, false);
});
async function capture(kind) {
  syncComps();
  if (!stream) {
    toast("No screen connected – connect screen 1, or paste a screenshot (Ctrl+V) while this window is open.");
    return;
  }
  const f = await grabFrame();
  addShot(f.url, kind);
  showBlack(f.black);
}
const capParts = () => capture("parts"),
  capEmail = () => capture("email");
// keep what the user typed in the parts box before anything re-renders the form
function syncComps() {
  const ta = $("#fComps");
  if (ta && rev) rev.draft.components = parseCompText(ta.value);
}
// parts list = best of all PC Stats screenshots + anything the user typed in themselves
function rebuildParts() {
  syncComps();
  const prevAuto = rev.autoNames || new Set();
  const lists = rev.shots.filter(s => s.kind === "parts" && s.parts).map(s => s.parts);
  // the earlier captured parts come first: a category is only replaced when a new screenshot shows more of it
  const auto = mergePCStats(rev.prevCap?.length ? [rev.prevCap, ...lists] : lists).filter(
    p => !rev.dropAuto?.has(p.name.toLowerCase())
  );
  rev.autoNames = new Set(auto.map(p => p.name.toLowerCase()));
  const manual = rev.draft.components.filter(
    c => !prevAuto.has(c.name.toLowerCase()) && !rev.autoNames.has(c.name.toLowerCase())
  );
  rev.draft.components = [...auto.map(({ name, cat }) => ({ name, cat })), ...manual];
  const ta = $("#fComps");
  if (ta) {
    ta.value = rev.draft.components.map(c => c.cat + ": " + c.name).join("\n");
    renderPartFields();
  }
  renderSuggestions(); // setting the box from code fires no "input" event
  return auto;
}
async function runOcr() {
  if (!rev || rev.cur < 0) return;
  const sh = rev.shots[rev.cur];
  try {
    if (sh.kind === "auto") {
      // pasted screenshot: PC Stats popup or more of the email? (by colour first – fast)
      let k = null;
      try {
        const im = areaImage($("#shot"));
        k = detectArea(im, "stats") ? "parts" : detectArea(im, "email") ? "email" : null;
      } catch {}
      if (!k) {
        const t = await ocr($("#shot"), "parts");
        k = /components|pc for|benchmark/i.test(t) ? "parts" : "email";
      }
      sh.kind = k;
      showShot(rev.cur, false);
    }
    // first capture of this kind: set up the area in the big window first, then read
    const ak = sh.kind === "parts" ? "stats" : "email";
    lastFrame[ak] = sh.url;
    if (!areasSet[ak] && !sh.areaAsked) {
      sh.areaAsked = true;
      openAreas(ak, $("#shot"), () => runOcr());
      return;
    }
    const text = await ocr($("#shot"), sh.kind);
    sh.text = text;
    sh.conf = lastConf;
    $("#rawTxt").textContent = text;
    // career level / % from the HUD – only after the main reading is done, never waited for, errors ignored
    if (!sh.careerDone) {
      sh.careerDone = true;
      setTimeout(() => autoCareer(sh.url).catch(() => {}), 0);
    }
    if (sh.kind === "parts") {
      const ok = /components|pc for|benchmark/i.test(text);
      sh.parts = ok ? resolvePCStats(text) : null;
      const total = rebuildParts();
      if (!rev.forJob && !rev.draft.sender) {
        const m = text.match(/PC for\s+(\S+@\S+)/i);
        if (m && $("#fSender") && !$("#fSender").value) $("#fSender").value = m[1];
      }
      const unsure = (sh.parts || []).filter(p => !p.sure).length;
      $("#ocrState").textContent = ok
        ? `Read ${sh.parts.length} parts here · list now has ${total.length}.${unsure ? ` ${unsure} not found in the parts database – check them.` : ""} Several RAM sticks / GPUs / drives / fans must be on one screenshot to be counted.`
        : "";
      if (!ok)
        areaWarn(
          "This doesn't look like the PC Stats window. Is it open in-game (PC Stats button)? If it is, the box may be in the wrong place."
        );
      return;
    }
    syncComps();
    const emails = rev.shots.filter(s => s.kind === "email" && s.text).map(s => ({ text: s.text, conf: s.conf }));
    const keep = { extra: $("#fExtra")?.value, table: $("#fTable")?.value };
    const p = parseEmail(emails.length > 1 ? mergeTexts(emails) : text, rules, smart);
    p.hidden.forEach(h => {
      if (h.brand && !h.avoid) {
        const c = brandCategories(h.brand);
        if (c.length) h.task += " (makes: " + c.join(", ") + ")";
      }
    });
    // suggest matching in-game cable sets for cable colour requests
    // coolant: name a matching coolant from the game ("Blue Clear Coolant")
    p.hidden.forEach(h => {
      if (h.coolant) {
        const c = h.coolant,
          ex = INDEX.filter(
            x => x.cat === "Water Cooling" && /^coolant/i.test(x.spec || "") && !/not in shop/i.test(x.spec || "")
          )
            .map(x => x.name)
            .find(n =>
              c.col === "clear"
                ? /^clear coolant$/i.test(n)
                : new RegExp("^" + c.col.replace(/\s+/g, " ") + "\\b" + (c.kind ? ".*" + c.kind : ""), "i").test(n)
            );
        if (ex) h.task += " (e.g. " + ex + ")";
      }
    });
    p.hidden.forEach(h => {
      if (h.want) {
        const ex = h.want.map(w => cablesFor(w)[0]).filter(Boolean);
        if (ex.length) h.task += " (e.g. " + ex.join(", ") + ")";
      }
    });
    Object.assign(rev.draft, {
      sender: p.sender,
      subject: p.subject,
      labour: p.labour,
      budget: p.budget,
      level: p.level,
      deadline: p.deadline,
      softDeadline: !!p.softDeadline,
      suspect: p.suspect,
      objectives: p.objectives,
      hidden: p.hidden,
      body: p.body,
      signature: p.signature,
      noStars: p.noStars,
      words: p.words,
    });
    // story job? known from the list (sender email / subject / name) or looks like one (no star requirement, long text)
    const sm = storyMatch(p, window.STORY_JOBS || []),
      sl = storyLooks(p);
    rev.draft.storyKnown = sm ? sm.entry.story || sm.entry.sender_name || "known story job" : "";
    rev.draft.storyWhy = sm ? "" : sl.why.join(" · ");
    if (!rev.storyTouched) rev.draft.story = !!sm || sl.looks;
    renderForm();
    if (keep.extra && $("#fExtra")) $("#fExtra").value = keep.extra;
    if (keep.table && $("#fTable")) $("#fTable").value = keep.table;
    $("#ocrState").textContent =
      (emails.length > 1 ? `Joined ${emails.length} email screenshots. ` : "") +
      "Check the fields. Long email? Scroll it in-game and press “📸 Add email capture”. Repair job? Open PC Stats and press “📸 Add PC parts capture”.";
    // gentle warning: none of the words every job email has
    if (!/labou?r|budget|objectives|[\w.]+@[\w-]+\.|regards|thanks/i.test(text))
      areaWarn("This doesn't look like a job email. Is an email open in-game? If it is, the box may be in the wrong place.");
  } catch (err) {
    $("#ocrState").textContent = "⚠ " + err.message;
  }
}
// the PC's parts, one field per part type (the hidden #fComps text box stays the single source for the rest of the app)
const PART_SLOTS = [
  { k: "Case", label: "Case", max: 1 },
  { k: "Motherboard", label: "Motherboard", max: 1 },
  { k: "CPU", label: "CPU", max: 1 },
  { k: "CPU Cooler", label: "CPU Cooling", max: 1 },
  { k: "RAM", label: "RAM", max: 4 },
  { k: "GPU", label: "GPU", max: 2, hint: "💧 = watercooled" },
  { k: "PSU", label: "PSU", max: 1 },
  { k: "Storage", label: "Storage", max: 99, hint: "HDD, SSD, M.2" },
  { k: "Case Fan", label: "Case Fans", max: 99, opt: true },
  { k: "WC:Reservoir", label: "Reservoir", max: 1, opt: true, hint: "custom water cooling" },
  { k: "WC:Radiator", label: "Radiator", max: 1, opt: true },
  { k: "WC:CPU Block", label: "CPU Block", max: 1, opt: true },
  {
    k: "Other",
    label: "Other",
    max: 99,
    other: true,
    onlyIfUsed: true,
    hint: "parts of no other type – shown only when there are some",
  },
];
// "Other" = every category no other field takes (case fans, cables, custom water cooling…)
const OTHER_CATS = () =>
  CATS.filter(c => c !== "Cables" && c !== "Water Cooling" && !PART_SLOTS.some(sl => !sl.other && sl.k === c)).join("|");
const slotOf = (cat, name) =>
  PART_SLOTS.find(sl => sl.k === (cat === "Water Cooling" ? catKey({ name, cat }) : cat) && !sl.other) ||
  PART_SLOTS[PART_SLOTS.length - 1];
let DBNAMES = null;
function inPartsDb(name) {
  // exactly a part of the database (any DLC / version – a customer PC can have anything)
  if (!DBNAMES) {
    DBNAMES = new Set();
    for (const c in window.PARTS_DB || {}) for (const r of window.PARTS_DB[c]) DBNAMES.add(r[0].toLowerCase());
  }
  return DBNAMES.has(
    String(name || "")
      .trim()
      .toLowerCase()
  );
}
// RAM sticks in one PC are all the same size and speed – an odd one out is often another part read as RAM
// (a 960GB SSD became a "32 GB" RAM stick once). Returns the names that don't match the most common size + speed.
function oddRam(names) {
  const key = n => {
    const c = (typeof compatOf === "function" && compatOf(n)) || {};
    const t = String(n);
    return `${c.gb || (t.match(/(\d+)\s*GB/i) || [])[1] || "?"}/${c.mhz || (t.match(/(\d+)\s*MHz/i) || [])[1] || "?"}`;
  };
  const keys = names.map(key),
    count = {};
  keys.forEach(k => (count[k] = (count[k] || 0) + 1));
  if (Object.keys(count).length < 2) return new Set(); // one stick, or all the same
  const top = Math.max(...Object.values(count)),
    common = Object.keys(count).filter(k => count[k] === top);
  return new Set(names.filter((n, i) => common.length > 1 || keys[i] !== common[0])); // a tie: check all of them
}
function partFieldsHtml(comps) {
  const ramOdd = oddRam(comps.filter(c => c.name && slotOf(c.cat, c.name).k === "RAM").map(c => c.name));
  return `<div id="fParts">${PART_SLOTS.map(sl => {
    const rows = comps.filter(c => slotOf(c.cat, c.name) === sl),
      shown = rows.length || sl.other ? rows : [{ cat: sl.k, name: "" }];
    if (sl.onlyIfUsed && !rows.length) return "";
    const row = c =>
      `<div class="prow"><input data-ac data-ac-cat="${sl.other ? OTHER_CATS() : esc(sl.k)}" data-slot="${esc(sl.k)}" data-cat="${esc(c.cat)}" value="${esc(c.name)}" placeholder="${sl.other ? "add a part…" : "(empty)"}" autocomplete="off">${c.name && !inPartsDb(c.name) ? `<span class="pwarn" title="Not found in the parts database – check the name (the text reader may have misread it)">!</span>` : sl.k === "RAM" && ramOdd.has(c.name) ? `<span class="pwarn" title="RAM sticks differ in size or speed – check this one (another part may have been read as RAM)">!</span>` : ""}${c.name ? `<button class="ghost px" data-prm title="Remove" aria-label="Remove ${esc(c.name)}">✕</button>` : ""}</div>`;
    const more =
      sl.other || rows.length < sl.max
        ? rows.length
          ? `<button class="ghost padd" data-padd="${esc(sl.k)}">＋ add${sl.max < 99 ? ` (max ${sl.max})` : ""}</button>`
          : sl.other
            ? row({ cat: "Other", name: "" })
            : ""
        : "";
    return `<div class="pslot${!sl.other && !sl.opt && !rows.length ? " pempty" : ""}" data-slotk="${esc(sl.k)}"><label>${esc(sl.label)}${sl.hint ? ` <small>(${esc(sl.hint)})</small>` : ""}${sl.max > 1 && sl.max < 99 ? ` <small>${rows.length}/${sl.max}</small>` : ""}</label>${shown.map(row).join("")}${more}</div>`;
  }).join("")}</div>`;
}
// fields → hidden text box (+ "input" so the suggestions follow); text box → fields
function partsFromFields() {
  const ta = $("#fComps"),
    box = $("#fParts");
  if (!ta || !box) return;
  const list = [...box.querySelectorAll("input[data-slot]")]
    .map(i => {
      const v = i.value.trim();
      if (!v) return null;
      const m =
        INDEX.find(p => p.name.toLowerCase() === v.toLowerCase()) || (inPartsDb(v) ? { name: v, cat: categorize(v) } : null);
      const cat =
        i.dataset.slot === "Other"
          ? (m && m.cat) || (i.dataset.cat !== "Other" ? catData(i.dataset.cat) : categorize(v))
          : catData(i.dataset.slot);
      return { cat, name: m ? m.name : v };
    })
    .filter(Boolean);
  // a captured part the user changed or removed must not come back with the next capture
  if (rev) {
    const now = new Set(list.map(c => c.name.toLowerCase()));
    rev.dropAuto = rev.dropAuto || new Set();
    for (const n of rev.autoNames || []) if (!now.has(n)) rev.dropAuto.add(n);
  }
  ta.value = list.map(c => c.cat + ": " + c.name).join("\n");
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}
function renderPartFields() {
  const ta = $("#fComps"),
    box = $("#fParts");
  if (ta && box) box.outerHTML = partFieldsHtml(parseCompText(ta.value));
}
function bindPartFields() {
  const wrap = $("#revForm");
  wrap.addEventListener("change", e => {
    if (e.target.matches("#fParts input[data-slot]")) {
      partsFromFields();
      renderPartFields();
    }
  });
  wrap.addEventListener("input", e => {
    if (e.target.matches("#fParts input[data-slot]")) {
      clearTimeout(bindPartFields.t);
      bindPartFields.t = setTimeout(partsFromFields, 400);
    }
  });
  wrap.addEventListener("click", e => {
    const rm = e.target.closest("[data-prm]");
    if (rm) {
      rm.closest(".prow").querySelector("input").value = "";
      partsFromFields();
      renderPartFields();
      return;
    }
    const add = e.target.closest("[data-padd]");
    if (add) {
      add.insertAdjacentHTML(
        "beforebegin",
        `<div class="prow"><input data-ac data-ac-cat="${add.dataset.padd === "Other" ? OTHER_CATS() : esc(add.dataset.padd)}" data-slot="${esc(add.dataset.padd)}" data-cat="${esc(add.dataset.padd)}" placeholder="(empty)" autocomplete="off"></div>`
      );
      add.previousElementSibling.querySelector("input").focus();
      if (add.closest(".pslot").querySelectorAll(".prow").length >= slotOf(add.dataset.padd).max) add.remove();
    }
  });
}
function renderForm() {
  const d = rev.draft,
    f = $("#revForm"),
    jb = $("#revJob");
  const parts = `<button id="btnCapParts" class="capparts captop">📸 Add PC parts capture <small>open PC Stats in-game first · repeat after scrolling</small><kbd class="capkey" title="Keyboard shortcut">(Alt+P)</kbd></button>
    <label>Parts of this PC</label>${partFieldsHtml(d.components)}<textarea id="fComps" hidden>${esc(d.components.map(c => c.cat + ": " + c.name).join("\n"))}</textarea>`;
  const emailAdder = `<button id="btnCapEmail" class="capparts capemail captop">📸 Add email capture <small>long email? scroll it in-game first – text is joined</small><kbd class="capkey" title="Keyboard shortcut">(Alt+E)</kbd></button>`;
  if (rev.forJob && !rev.editJob) {
    // (no longer opened – kept for safety)
    jb.innerHTML = "";
    $("#revCapE").innerHTML = "";
    f.innerHTML = `${parts}
      <p class="hint">New captures add to the parts captured before (a part type is replaced when a screenshot shows more of it); parts you typed yourself are kept.</p><div id="fSugg"></div><button class="primary big" id="fSave" style="width:100%;margin-top:10px">Save parts</button>`;
  } else {
    const isEdit = !!rev.editJob;
    $("#revCapE").innerHTML = emailAdder;
    jb.innerHTML = `<div class="grid2"><div><label>Customer</label><input id="fSender" value="${esc(d.sender)}"></div><div><label>Subject</label><input id="fSubject" value="${esc(d.subject)}"></div></div>
      <div class="grid3"><div><label>Labour $</label><input id="fLabour" type="number" value="${d.labour ?? ""}"></div><div><label>Budget $</label><input id="fBudget" type="number" value="${d.budget ?? ""}"></div><div><label>Deadline</label><input id="fDeadline" value="${esc(d.deadline)}"></div></div>
      <label class="dlcrow storyrow"><input type="checkbox" class="switch" id="fStory" ${d.story ? "checked" : ""}><span><b>📖 Story job</b><br><small>Career story customer: no hidden objectives, and the budget doesn't count unless an objective mentions it.</small></span></label>
      <div class="grid2"><div><label>Customer suspects</label><input id="fSuspect" value="${esc(d.suspect)}" placeholder="(often wrong – verify)"></div><div><label>Put on</label><select id="fTable"><option value="0">Open jobs</option>${[
        1, 2, 3,
      ]
        .map(n => {
          const o = jobs.find(j => j.table === n && j.id !== d.id);
          return `<option value="${n}" ${d.table === n ? "selected" : ""}>Table ${n}${o ? " (busy – swaps)" : ""}</option>`;
        })
        .join("")}</select></div></div>
      <label>Objectives (one per line)</label><textarea id="fObj" rows="3">${esc((d.objectives || []).join("\n"))}</textarea>
      ${storyBanner(d)}
      <label>${isEdit ? "Hidden objectives (untick to remove)" : "Hidden objectives found in email"}${d.story && !isEdit ? " <small>(story job – not ticked)</small>" : ""}</label><div id="fHidden">${(d.hidden || []).length ? d.hidden.map((h, i) => `<div class="hidrow"><input type="checkbox" ${h.keep || !d.story ? "checked" : ""} data-h="${i}"><div>${esc(h.task)}${h.because && h.because.length ? `<br><small>because: “${esc(h.because.join("”, “"))}”</small>` : ""}</div></div>`).join("") : `<div class="hint">${isEdit ? "None." : "None detected."}</div>`}</div>
      <label>Extra tasks (one per line)</label><textarea id="fExtra" rows="2">${esc((d.extra || []).join("\n"))}</textarea>`;
    f.innerHTML = `${parts}
      <div id="fSugg"></div>
      ${d.body ? `<details style="margin-top:8px"><summary>Email text</summary><div class="rawtxt">${esc(d.body)}</div></details>` : ""}
      <button class="primary big" id="fSave" style="width:100%;margin-top:12px">${isEdit ? "Save changes" : "Create job"}</button>`;
  }
  if (!f.dataset.pf) {
    f.dataset.pf = "1";
    bindPartFields();
  }
  $("#fSave").onclick = saveReview;
  // switching "Story job" unticks / ticks the hidden objectives in one go
  $("#fStory")?.addEventListener("change", e => {
    rev.storyTouched = true;
    rev.draft.story = e.target.checked;
    document.querySelectorAll("#fHidden input").forEach(c => (c.checked = !e.target.checked));
    const b = $("#storyBanner");
    if (b) b.outerHTML = storyBanner(rev.draft);
    bindStoryBanner();
  });
  bindStoryBanner();
  $("#btnCapParts").onclick = capParts;
  if ($("#btnCapEmail")) $("#btnCapEmail").onclick = capEmail;
  // suggested swaps follow what is typed / ticked in the form
  let t = null;
  const later = () => {
    clearTimeout(t);
    t = setTimeout(renderSuggestions, 350);
  };
  ["#fComps", "#fObj", "#fBudget", "#fSuspect"].forEach(id => $(id)?.addEventListener("input", later));
  $("#fHidden")?.addEventListener("change", renderSuggestions);
  $("#fStory")?.addEventListener("change", renderSuggestions);

  renderSuggestions();
}
// ================= suggested swaps (new-job window and "Add parts from PC Stats") =================
// what the suggestions are worked out from: the form as it is now (or the job the parts are for)
function suggestInput() {
  const d = rev.draft,
    fj = rev.forJob && job(rev.forJob.id),
    lines = id =>
      ($(id)?.value || "")
        .split("\n")
        .map(x => x.trim())
        .filter(Boolean);
  const components = $("#fComps") ? parseCompText($("#fComps").value) : d.components;
  if (fj) {
    const hid = (fj.tasks || []).filter(t => t.src === "hid").map(t => t.text);
    return {
      job: { ...fj, components },
      opts: {
        brands: fj.brands || [],
        broken: hid.map(t => (t.match(/replace the (.+?) – customer hints/i) || [])[1]).filter(Boolean),
        rgb: hid.some(t => /^add rgb/i.test(t)),
        waterCooling: hid.some(t => /^water cooling requested/i.test(t)),
      },
    };
  }
  const hid = [...document.querySelectorAll("#fHidden input:checked")].map(c => d.hidden[c.dataset.h]).filter(Boolean);
  const budget = $("#fBudget") && $("#fBudget").value !== "" ? +$("#fBudget").value : d.budget;
  return {
    job: {
      components,
      swaps: [],
      objectives: $("#fObj") ? lines("#fObj") : d.objectives || [],
      budget,
      suspect: $("#fSuspect")?.value.trim() || "",
      story: !!$("#fStory")?.checked,
      tasks: [],
      hidden: hid,
      ocLater: ocLaterOf(d),
    },
    opts: {
      picked: tickedForBench(),
      pickedLights: tickedSwaps("lights"),
      brands: hid.filter(h => h.brand && !h.avoid).map(h => h.brand),
      broken: hid.filter(h => h.part).map(h => h.part),
      rgb: hid.some(h => /^add rgb/i.test(h.task)),
      waterCooling: hid.some(h => /^water cooling requested/i.test(h.task)),
    },
  };
}
// parts ticked in other suggestions (an objective's GPU, case…) – the 3DMark set for a new build and the coloured-lights
// set are worked out around them (each leaves its own group out)
function tickedSwaps(skipKey) {
  const out = [];
  document.querySelectorAll("#fSugg input[data-sg]:checked").forEach(c => {
    const sg = rev?.sugg?.[+c.dataset.sg],
      o = sg?.options[+c.dataset.so];
    if (!o || sg.key === skipKey) return;
    o.swaps.forEach(s => out.push({ cat: s.cat, old: s.old || "", new: s.new }));
    (o.extras || []).filter(e => e.name).forEach(e => out.push({ cat: e.cat, old: e.old || "", new: e.name }));
  });
  return out;
}
const tickedForBench = () => tickedSwaps("bench");
// Working them out can take a moment (a 3DMark set for a PC built from nothing tries many part sets): a "working on it"
// line shows first, the list follows a moment later. Nothing changed since the last time → the same list again (↻ Refresh: always new).
let suggRun = 0;
function renderSuggestions(force) {
  const box = $("#fSugg");
  if (!box || !rev) return;
  let input = null;
  try {
    input = suggestInput();
  } catch (e) {
    console.warn("suggestions", e);
  }
  const key = JSON.stringify([input, career, dlcOn, gameVersion]);
  if (!force && key === rev.suggKey && !suggRun) return;
  const run = ++suggRun;
  if (!box.querySelector(".sbusy"))
    box.insertAdjacentHTML("afterbegin", `<div class="sbusy" role="status">⏳ Working out suggested swaps…</div>`);
  box.classList.add("working");
  setTimeout(() => {
    if (run !== suggRun || !rev || !box.isConnected) return;
    suggRun = 0;
    drawSuggestions(box, input, key);
  }, 30);
}
function drawSuggestions(box, input, key) {
  box.classList.remove("working");
  const keep = new Set([...box.querySelectorAll("input:checked")].map(c => c.dataset.pick));
  let list = [];
  try {
    if (input) list = suggestSwaps(input.job, input.opts);
  } catch (e) {
    console.warn("suggestions", e);
  }
  rev.sugg = list;
  rev.suggKey = key;
  if (!list.length) {
    box.innerHTML = "";
    return;
  }
  const money = o => (o.total != null ? "$" + o.total.toLocaleString() : "");
  box.innerHTML =
    `<div class="sugghead"><label>💡 Suggested swaps <small>(tick one to add it – nothing is added by itself)</small></label><button class="ghost" id="suggRefresh" title="Work out all suggestions again">↻ Refresh</button></div>` +
    list
      .map(
        (sg, i) => `<div class="sugg"><div class="sreason">for: <b>${esc(sg.reason)}</b></div>
    ${
      sg.options.length
        ? sg.options
            .map((o, k) => {
              const pick = sg.key + "|" + o.name + "|" + o.tag + "|" + (o.swaps || []).map(x => x.new).join("+");
              if (o.multi) return benchOptHtml(o, i, k, pick, keep);
              return `<label class="sopt ${o.over ? "over" : ""}"><input type="checkbox" data-sg="${i}" data-so="${k}" data-pick="${esc(pick)}" ${keep.has(pick) ? "checked" : ""}>
      <span><span class="sname">${sg.old && o.swaps[0]?.old ? `<span class="old">${esc(sg.old)}</span> → ` : o.swaps[0]?.old === "" && o.cat !== "RAM" ? '<span class="old">(empty slot)</span> → ' : ""}<span class="new">${o.count > 1 ? o.count + " × " : ""}${esc(o.name)}</span></span>
      <small class="stag">${esc(o.tag)}${o.lvl != null ? ` · Lv ${o.lvl}` : ""}${o.over ? ` · <b class="overtag">over budget</b>` : ""}</small>
      ${o.det ? `<small class="sdet">${esc(o.det)}</small>` : ""}
      ${(o.extras || []).map(e => `<small class="sextra">+ ${esc(e.cat)}: ${e.name ? esc(e.name) + (e.price != null ? " ($" + e.price + ")" : "") : '<span class="warn">' + esc(e.why) + "</span>"}${e.name && e.why ? " – " + esc(e.why) : ""}</small>`).join("")}
      ${o.removeOld?.length ? `<small class="sextra">+ take out ${o.removeOld.length} old stick${o.removeOld.length > 1 ? "s" : ""}</small>` : ""}</span><b class="sprice">${money(o)}</b></label>`;
            })
            .join("")
        : `<div class="hint" style="margin:2px 0">${esc(sg.hint || "No unlocked part fits – check the budget, your career level or the parts list.")}</div>`
    }</div>`
      )
      .join("");
  // one choice per suggestion
  // sets that follow the other ticks: the 3DMark set of a new build, the coloured-lights set
  $("#suggRefresh").onclick = () => renderSuggestions(true);
  const follows = list
    .filter(sg => (sg.key === "bench" && / – new build/.test(sg.reason)) || sg.key === "lights")
    .map(sg => sg.key);
  box.querySelectorAll("input[data-sg]").forEach(c =>
    c.addEventListener("change", () => {
      if (c.checked)
        box.querySelectorAll(`input[data-sg="${c.dataset.sg}"]`).forEach(o => {
          if (o !== c) o.checked = false;
        });
      const k = list[+c.dataset.sg]?.key;
      if (follows.some(f => f !== k)) renderSuggestions();
    })
  );
}
// a 3DMark suggestion is a SET of parts: one box adds all of them (+ the XMP task when the score needs it)
function benchOptHtml(o, i, k, pick, keep) {
  const n = o.nParts,
    all = [
      ...o.swaps.map(x => ({ ...x, name: x.new })),
      ...(o.extras || []).filter(e => e.name).map(e => ({ cat: e.cat, old: e.old, name: e.name, price: e.price, why: e.why })),
    ];
  return `<label class="sopt multi ${o.over ? "over" : ""}"><input type="checkbox" data-sg="${i}" data-so="${k}" data-pick="${esc(pick)}" ${keep.has(pick) ? "checked" : ""}>
    <span><span class="sname"><b>${esc(o.name)}</b>${o.score != null ? ` → score <b class="bscore">${o.score.toLocaleString()}</b>` : ""}</span>
    <small class="stag">${n > 1 ? `one tick adds <b>all ${n} parts</b> below` : n ? "one tick adds the part below" : "no parts needed"}${o.tag ? " · " + esc(o.tag) : ""}${o.lvl ? ` · up to Lv ${o.lvl}` : ""}${o.over ? ` · <b class="overtag">over budget</b>` : ""}</small>
    ${n ? `<ul class="sset">${all.map(x => `<li><span class="scat">${esc(x.cat)}</span> ${x.old ? `<span class="old">${esc(x.old)}</span> → ` : `<span class="old">(add)</span> `}<span class="new">${esc(x.name)}</span>${x.price != null ? ` <small>$${x.price}</small>` : ""}${x.why ? ` <small>– ${esc(x.why)}</small>` : ""}</li>`).join("")}</ul>` : ""}
    ${(o.tasks || []).map(t => `<small class="sextra">+ task: ${esc(t)}</small>`).join("")}</span><b class="sprice">${o.total ? "$" + o.total.toLocaleString() : "free"}</b></label>`;
}
// the ticked suggestions → part swaps (+ tasks for sticks to take out)
function pickedSuggestions() {
  const swaps = [],
    tasks = [];
  document.querySelectorAll("#fSugg input[data-sg]:checked").forEach(c => {
    const o = rev.sugg?.[+c.dataset.sg]?.options[+c.dataset.so];
    if (!o) return;
    o.swaps.forEach(s => swaps.push({ id: uid(), cat: s.cat, old: s.old || "", new: s.new, done: false }));
    (o.extras || [])
      .filter(e => e.name)
      .forEach(e => swaps.push({ id: uid(), cat: e.cat, old: e.old || "", new: e.name, done: false }));
    (o.tasks || []).forEach(t => {
      if (!tasks.some(x => x.text === t)) tasks.push({ id: uid(), text: t, src: "add", done: false });
    });
    if (o.removeOld?.length)
      tasks.push({
        id: uid(),
        text: `Take out ${o.removeOld.length} old RAM stick${o.removeOld.length > 1 ? "s" : ""} (${o.removeOld[0]})`,
        src: "add",
        done: false,
      });
  });
  return { swaps, tasks };
}
// "I'm going to overclock it myself later" – the email body mentions overclocking (objectives decide on their own)
const ocLaterOf = d => /\boverclock/i.test(d.body || "");
function parseCompText(txt) {
  return txt
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const m = s.match(/^([^:]{2,15}):\s*(.+)$/);
      return m && CATS.includes(m[1].trim()) ? { cat: m[1].trim(), name: m[2].trim() } : { cat: categorize(s), name: s };
    });
}
function saveReview() {
  const d = rev.draft,
    comps = parseCompText($("#fComps").value);
  comps.forEach(c => rememberPart(c.name, c.cat));
  const picked = pickedSuggestions(),
    capNames = comps.filter(c => rev.autoNames?.has(c.name.toLowerCase())).map(c => c.name);
  if (rev.forJob && !rev.editJob) {
    const fj = job(rev.forJob.id);
    fj.components = comps;
    fj.capNames = capNames;
    fj.swaps.push(...picked.swaps);
    fj.tasks.push(...picked.tasks);
  } else {
    const fields = {
      sender: $("#fSender").value.trim(),
      subject: $("#fSubject").value.trim(),
      labour: $("#fLabour").value === "" ? null : +$("#fLabour").value,
      budget: $("#fBudget").value === "" ? null : +$("#fBudget").value,
      deadline: $("#fDeadline").value.trim(),
      softDeadline: !!d.softDeadline && $("#fDeadline").value.trim() === d.deadline,
      suspect: $("#fSuspect").value.trim(),
      components: comps,
      capNames,
      story: !!$("#fStory")?.checked,
      ocLater: ocLaterOf(d) || !!d.ocLater,
    };
    const table = +$("#fTable").value;
    let target;
    if (rev.editJob) {
      target = job(rev.editJob.id);
      Object.assign(target, fields);
      const old = [...target.tasks],
        take = (src, text) => {
          const i = old.findIndex(
            x => (x.src === src || (src === "add" && x.src !== "obj" && x.src !== "hid")) && x.text === text
          );
          return i >= 0 ? old.splice(i, 1)[0] : { id: uid(), text, src, done: false };
        };
      const lines = id =>
          $(id)
            .value.split("\n")
            .map(x => x.trim())
            .filter(Boolean),
        tasks = [];
      lines("#fObj")
        .filter(x => !/^complete by/i.test(x))
        .forEach(t => tasks.push(take("obj", t)));
      document.querySelectorAll("#fHidden input:checked").forEach(c => tasks.push(take("hid", d.hidden[c.dataset.h].task)));
      lines("#fExtra").forEach(t => tasks.push(take("add", t)));
      target.tasks = [...tasks, ...picked.tasks];
      target.swaps.push(...picked.swaps);
      // a favourite-brand hint that was unticked: the brand no longer steers the suggestions
      target.brands = (target.brands || []).filter(br =>
        target.tasks.some(t => t.src === "hid" && t.text.toLowerCase().includes(br.toLowerCase()))
      );
    } else {
      const tasks = [];
      $("#fObj")
        .value.split("\n")
        .map(s => s.trim())
        .filter(Boolean)
        .filter(s => !/^complete by/i.test(s))
        .forEach(t => tasks.push({ id: uid(), text: t, src: "obj", done: false }));
      const brands = [];
      document.querySelectorAll("#fHidden input:checked").forEach(c => {
        const h = d.hidden[c.dataset.h];
        tasks.push({ id: uid(), text: h.task, src: "hid", done: false });
        if (h.brand && !h.avoid) brands.push(h.brand);
      });
      $("#fExtra")
        .value.split("\n")
        .map(s => s.trim())
        .filter(Boolean)
        .forEach(t => tasks.push({ id: uid(), text: t, src: "add", done: false }));
      tasks.push(...picked.tasks);
      target = { ...fields, table: 0, id: d.id, level: d.level, tasks, swaps: picked.swaps, brands, created: Date.now() };
      jobs.push(target);
    }
    if ((target.table || 0) !== table) {
      if (table) moveToTable(target, table);
      else target.table = 0;
    }
  }
  save();
  render();
  $("#dlgReview").close();
}
// crop drawing
let mode = "email"; // which crop box the current screenshot uses
function drawCrops() {
  for (const k of ["email", "stats"]) {
    const el = $(k === "email" ? "#cropEmail" : "#cropStats"),
      r = crops[k];
    Object.assign(el.style, { left: r.x * 100 + "%", top: r.y * 100 + "%", width: r.w * 100 + "%", height: r.h * 100 + "%" });
  }
}
$("#btnReOcr").onclick = runOcr;
// 🎯 Adjust areas: the big set-up window for the screenshot being looked at, then read it again
function adjustArea() {
  if (!rev || rev.cur < 0) return;
  const k = rev.shots[rev.cur].kind === "parts" ? "stats" : "email";
  openAreas(k, $("#shot"), ok => {
    if (ok) runOcr();
  });
}
$("#btnAdjust").onclick = adjustArea;
document.querySelectorAll("[data-close]").forEach(b => (b.onclick = () => b.closest("dialog").close()));
$("#dlgReview").addEventListener("close", () => {
  acEl.hidden = true;
  document.body.append(acEl);
});

// ================= settings: content packs (DLC) + rules =================
// DLC that only add workshops, modes or music – listed for information, no parts to filter
const DLC_NO_PARTS = [
  "Career Power Pack",
  "Esports Expansion",
  "NZXT Workshop",
  "Republic of Gamers Workshop",
  "Fractal Design Workshop",
  "AORUS Workshop",
  "EVGA Workshop",
  "Overclockers UK Workshop",
  "Razer Workshop",
  "PC Building Simulator Soundtrack",
];
// 📜 Changelog window: CHANGELOG.md from the site itself (published with the app – always the same file as on GitHub)
function changelogHtml(md) {
  const out = [];
  let list = null;
  const inline = t =>
    esc(t)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  const close = () => {
    if (list) {
      out.push(`<ul>${list.join("")}</ul>`);
      list = null;
    }
  };
  let first = true;
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+)$/),
      li = line.match(/^\s*[-*]\s+(.+)$/);
    if (/^#\s/.test(line)) continue; // the file's own title
    if (h) {
      close();
      out.push(
        `${first ? "" : "</section>"}<section class="clver"><h4>${inline(h[1])}${h[1].trim() === (window.PCBS_CONFIG || {}).version ? ' <span class="clnow">your version</span>' : ""}</h4>`
      );
      first = false;
    } else if (li) (list = list || []).push(`<li>${inline(li[1])}</li>`);
    else if (line.trim()) {
      close();
      out.push(`<p class="hint">${inline(line.trim())}</p>`);
    }
  }
  close();
  if (!first) out.push("</section>");
  return out.join("");
}
async function openChangelog(e) {
  e?.preventDefault?.();
  const dlg = $("#dlgChangelog"),
    body = $("#clBody");
  try {
    const r = await fetch("CHANGELOG.md", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    body.innerHTML = changelogHtml(await r.text());
  } catch {
    window.open(changelogUrl(), "_blank", "noopener");
    return;
  } // e.g. opened as a local file
  if (!dlg.open) dlg.showModal();
  body.scrollTo(0, 0);
}
function changelogUrl() {
  const r = reportRepo();
  return r ? `https://github.com/${r}/blob/main/CHANGELOG.md` : "CHANGELOG.md";
}
function renderSettings() {
  const m = window.PARTS_META || {};
  const row = d => {
    const n = dlcCount(d.key);
    return `<label class="dlcrow"><input type="checkbox" class="switch" data-dlc="${esc(d.key)}" ${dlcOn[d.key] ? "checked" : ""}><span><b>${esc(d.label)}</b> <small>${n} parts</small><br><small>${esc(d.note)}</small></span></label>`;
  };
  const withParts = DLCS.filter(d => dlcCount(d.key) > 0);
  $("#dlcList").innerHTML = withParts.map(row).join("") || `<p class="hint">None.</p>`;
  $("#dlcOther").textContent =
    "No extra parts (workshops, game modes, music – nothing to switch): " + DLC_NO_PARTS.join(", ") + ".";
  $("#gameVersion").innerHTML = VERSIONS.slice()
    .reverse()
    .map(v => `<option value="${esc(v.v)}" ${v.v === gameVersion ? "selected" : ""}>${esc(v.label)}</option>`)
    .join("");
  $("#appVersion").textContent = "PCBS Job Board v" + ((window.PCBS_CONFIG || {}).version || "?");
  $("#appVersion").href = changelogUrl();
  $("#appVersion").onclick = openChangelog;
  if (typeof keysOn !== "undefined") $("#keysToggle").checked = keysOn;
  $("#dbInfo").textContent = m.counts
    ? `${Object.values(m.counts).reduce((a, b) => a + b, 0)} parts in the database (built ${m.built}). ${INDEX.filter(p => !p.hist).length} shown with your current settings.`
    : "Parts database not loaded.";
}
$("#btnSettings").onclick = () => {
  renderSettings();
  $("#dlgSettings").showModal();
};
// ❓ How to use it – the pictures are only downloaded the first time the window is opened
$("#btnHelp").onclick = () => {
  document.querySelectorAll("#dlgHelp img[data-src]").forEach(i => {
    i.src = i.dataset.src;
    i.removeAttribute("data-src");
  });
  $("#dlgHelp").showModal();
  $("#dlgHelp .dlg-b").scrollTop = 0;
};
$("#btnKeysFromSettings").onclick = () => {
  $("#dlgSettings").close();
  openKeysHelp();
};
// career level + % in the top bar; the tooltip says what it does and how many parts are unlocked
function careerInfo() {
  const n = INDEX.filter(p => !p.hist).length,
    ok = INDEX.filter(p => !p.hist && unlocked(p)).length;
  $("#careerBar").title =
    "Your career level and % through it (in-game, top right under the stars). Part-swap suggestions only show parts you have unlocked.\n" +
    (career.level == null ? "Not set – every part is suggested." : `${ok} of ${n} parts unlocked.`);
  $("#careerBar").classList.toggle("set", career.level != null);
  if (typeof flipBtnUpdate === "function") flipBtnUpdate();
}
function showCareer() {
  $("#careerLevel").value = career.level ?? "";
  $("#careerPct").value = career.level == null || !career.pct ? "" : career.pct;
  careerInfo();
}
// typing a level / % saves straight away; empty level = not set
// (the job cards follow: overclocking help and custom water cooling parts wait for their in-game unlock)
let careerRender = null;
["#careerLevel", "#careerPct"].forEach(id =>
  $(id).addEventListener("input", () => {
    setCareer($("#careerLevel").value, $("#careerPct").value);
    careerInfo();
    clearTimeout(careerRender);
    careerRender = setTimeout(render, 400);
  })
);
$("#btnUnlocks .ulic").innerHTML = UL_ICON;
// tidy the fields when leaving them (e.g. 150 % → 100), empty % = 0
$("#careerLevel").addEventListener("change", () => {
  $("#careerLevel").value = career.level ?? "";
});
$("#careerPct").addEventListener("change", () => {
  $("#careerPct").value = career.pct ? career.pct : "";
});
// factory reset: every saved key of this tool, the screen share, then a fresh start
$("#btnResetAll").onclick = () => {
  $("#resetSure").checked = false;
  $("#resetGo").disabled = true;
  $("#dlgSettings").close();
  $("#dlgReset").showModal();
};
$("#resetSure").onchange = e => {
  $("#resetGo").disabled = !e.target.checked;
};
$("#resetGo").onclick = () => {
  if (!$("#resetSure").checked) return;
  try {
    if (stream) stream.getTracks().forEach(t => t.stop());
  } catch {}
  Object.keys(localStorage)
    .filter(k => k.startsWith("pcbs."))
    .forEach(k => localStorage.removeItem(k));
  LS.set("pcbs.seenVersion", (window.PCBS_CONFIG || {}).version || ""); // no "what's new" right after a reset
  location.reload();
};
$("#dlgSettings").addEventListener("change", e => {
  if (e.target.id === "keysToggle") {
    setKeys(e.target.checked);
    return;
  }
  const k = e.target.dataset.dlc;
  if (k) {
    setDlc(k, e.target.checked);
    renderSettings();
    careerInfo();
  } else if (e.target.id === "gameVersion") {
    setGameVersion(e.target.value);
    renderSettings();
    careerInfo();
  }
});

// ================= missing-part reports → GitHub issues =================
function reportRepo() {
  const cfg = (window.PCBS_CONFIG || {}).repo;
  if (cfg) return cfg;
  const m = location.hostname.match(/^([\w-]+)\.github\.io$/i);
  const repo = location.pathname.split("/").filter(Boolean)[0];
  return m ? `${m[1]}/${repo && !/\.html?$/i.test(repo) ? repo : m[1] + ".github.io"}` : ""; // site at the root: OWNER.github.io
}
function openReport(pre = {}) {
  $("#rName").value = pre.name || "";
  $("#rCat").value = CATS.includes(pre.cat) && pre.cat !== "Other" ? pre.cat : "";
  $("#rDlc").innerHTML =
    `<option value="Base game">Base game</option>` +
    DLCS.map(d => `<option>${esc(d.label)}</option>`).join("") +
    `<option>Other / not sure</option>`;
  ["#rLevel", "#rPct", "#rPrice", "#rNotes"].forEach(id => ($(id).value = ""));
  const direct = !!(window.PCBS_CONFIG || {}).reportEndpoint;
  $("#rDirect").hidden = !direct;
  $("#rSend").hidden = direct;
  $("#rCopy").hidden = direct;
  $("#rRepoHint").textContent = direct
    ? ""
    : reportRepo()
      ? `Opens a pre-filled report on github.com/${reportRepo()} (needs a free GitHub account).`
      : "No GitHub repository set – use “Copy report” and post it yourself, or set repo in js/config.js.";
  $("#dlgReport").showModal();
  $("#rName").focus();
}
function reportData() {
  return {
    name: $("#rName").value.trim(),
    cat: $("#rCat").value,
    dlc: $("#rDlc").value,
    level: $("#rLevel").value.trim(),
    pct: $("#rPct").value.trim(),
    price: $("#rPrice").value.trim(),
    notes: $("#rNotes").value.trim(),
  };
}
function reportText(r) {
  return `Missing part: ${r.name}\nCategory: ${r.cat || "?"}\nContent: ${r.dlc}\nUnlock level: ${r.level || "?"}${r.pct ? " (" + r.pct + "%)" : ""}\nPrice: ${r.price ? "$" + r.price : "?"}\nNotes: ${r.notes || "-"}\n(PCBS Job Board ${(window.PCBS_CONFIG || {}).version || ""}, database ${(window.PARTS_META || {}).built || "?"})`;
}
$("#rSend").onclick = () => {
  const r = reportData();
  if (!r.name) {
    $("#rName").focus();
    return;
  }
  const repo = reportRepo();
  if (!repo) {
    $("#rCopy").click();
    return;
  }
  const q = new URLSearchParams({
    template: "missing-part.yml",
    title: `[Missing part] ${r.name}`,
    part_name: r.name,
    category: r.cat,
    content: r.dlc,
    level: r.level + (r.pct ? ` (${r.pct}%)` : ""),
    price: r.price,
    notes: r.notes,
    app_version: `${(window.PCBS_CONFIG || {}).version || ""} / db ${(window.PARTS_META || {}).built || ""}`,
  });
  window.open(`https://github.com/${repo}/issues/new?${q}`, "_blank", "noopener");
  const log = LS.get("pcbs.reports", []);
  log.unshift({ ...r, at: Date.now() });
  LS.set("pcbs.reports", log.slice(0, 100));
  $("#dlgReport").close();
  toast("Report opened on GitHub – press “Create” there to submit");
};
$("#rDirect").onclick = async () => {
  const r = reportData();
  if (!r.name) {
    $("#rName").focus();
    return;
  }
  if (await sendReport("part", r, "#rDirect")) {
    const log = LS.get("pcbs.reports", []);
    log.unshift({ ...r, at: Date.now() });
    LS.set("pcbs.reports", log.slice(0, 100));
    $("#dlgReport").close();
  }
};
$("#rCopy").onclick = async () => {
  const r = reportData();
  if (!r.name) {
    $("#rName").focus();
    return;
  }
  try {
    await navigator.clipboard.writeText(reportText(r));
    toast("Report copied to clipboard");
  } catch {
    prompt("Copy this report:", reportText(r));
  }
};

// ================= export / import =================
$("#btnExport").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(
      [JSON.stringify({ version: 2, jobs, rules, smart, crops, partsHistory, dlc: dlcOn, gameVersion, career }, null, 1)],
      { type: "application/json" }
    )
  );
  a.download = "pcbs-jobs-backup.json";
  a.click();
};
$("#btnImport").onclick = () => $("#importFile").click();
$("#importFile").onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  f.text().then(t => {
    try {
      const d = JSON.parse(t);
      jobs = d.jobs || [];
      if (d.rules) rules = d.rules;
      if (d.smart) {
        smart = Object.assign({}, SMART_DEFAULT, d.smart);
        LS.set("pcbs.smart", smart);
      }
      if (d.crops) {
        crops = Object.assign(structuredClone(DEFAULT_CROPS), d.crops);
        areasSet = { email: true, stats: true, resale: !!d.crops.resale, inv: !!d.crops.inv };
        LS.set("pcbs.areasSet", areasSet);
        renderAreaStatus();
      }
      if (d.career) {
        setCareer(d.career.level, d.career.pct);
        showCareer();
      }
      if (d.dlc) {
        Object.assign(dlcOn, d.dlc);
        LS.set("pcbs.dlc", dlcOn);
      }
      if (d.gameVersion && typeof setGameVersion === "function") setGameVersion(d.gameVersion);
      if (d.partsHistory) partsHistory = d.partsHistory.map(p => (typeof p === "string" ? { name: p, cat: categorize(p) } : p));
      const seen = new Set();
      jobs.forEach(j => {
        if (j.table && seen.has(j.table)) j.table = 0;
        else if (j.table) seen.add(j.table);
      });
      LS.set("pcbs.rules", rules);
      LS.set("pcbs.crops", crops);
      LS.set("pcbs.partsHistory", partsHistory);
      buildIndex();
      save();
      render();
      if ($("#dlgSettings").open) renderSettings();
      toast("Backup imported");
    } catch {
      toast("That file isn't a valid backup");
    }
  });
  e.target.value = "";
};

if (!window.PARTS_DB) toast("parts-db.js not found next to this page – part suggestions limited to names you've typed.");
buildIndex();
initAutocomplete();
render();
setStatus();
showCareer();
