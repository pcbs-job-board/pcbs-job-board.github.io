/* The board: drawing the tables and job cards, part swaps folding, job focus (Enter on a card). */
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
  if (isFlip(j)) return flipCard(j); // 📦 PC Bay build – own tile (js/ui/flip/)
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
  const susHtml = sus.length
    ? `<div class="objsus">Customer suspects: ${esc(sus.join(", "))} <small>(often wrong – verify)</small></div>`
    : "";
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
    if (Math.abs(h1 - h0) > 2)
      now.animate(
        [
          { height: h0 + "px", overflow: "hidden" },
          { height: h1 + "px", overflow: "hidden" },
        ],
        { duration: 260, easing: "ease-in-out" }
      );
  }
}
// leaving the focused card (mouse click elsewhere, Tab out) ends job focus
document.addEventListener("focusin", e => {
  if (focusJob && !e.target.closest?.(`.job[data-job="${focusJob}"]`) && !e.target.closest?.("dialog, header, #ac, #stip"))
    setFocusJob(null);
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
