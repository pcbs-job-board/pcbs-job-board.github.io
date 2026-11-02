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
      const r = rules.find(x => x.task === d.task); if (!r) continue; // deleted on purpose → stays deleted
      for (const k of d.keys) if (!r.keys.includes(k)) r.keys.push(k);
    }
  }
  LS.set("pcbs.rules", rules);
}
LS.set("pcbs.rulesVer", RULES_VERSION);
if (!rules) rules = DEFAULT_RULES;
let smart = Object.assign({}, SMART_DEFAULT, LS.get("pcbs.smart", {})); // built-in detections on/off
const DEFAULT_CROPS = { email: { x: .5, y: .14, w: .42, h: .68 }, stats: { x: .015, y: .1, w: .265, h: .76 } };
let crops = LS.get("pcbs.crops", structuredClone(DEFAULT_CROPS));
// v1 → v2 migration: tables can hold only one job each
(() => { const seen = new Set(); jobs.forEach(j => { if (j.table && seen.has(j.table)) j.table = 0; else if (j.table) seen.add(j.table); }); })();
const save = () => LS.set("pcbs.jobs", jobs);
const TCOL = ["var(--t0)", "var(--t1)", "var(--t2)", "var(--t3)"];

// ================= board =================
function hidIcon(t) {
  const s = t.toLowerCase();
  return /cables/.test(s) ? "🔌" : /^use .* for as many/.test(s) ? "★" : /^check \/ replace the/.test(s) ? "🔁" : /new parts only/.test(s) ? "✨" : /compressed air/.test(s) ? "💨"
    : /virus/.test(s) ? "🛡️" : /3dmark/.test(s) ? "📊" : /^urgent/.test(s) ? "⏰" : /rgb|light/.test(s) ? "🌈" : /water/.test(s) ? "💧" : "❗";
}

function deadlineValue(s) { const m = String(s || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? Date.UTC(+m[3], +m[1] - 1, +m[2]) : Infinity; }
// ⚡ power check: CPU + GPU(s) + ~50 W for the rest vs. the PSU of the planned PC (current parts + swaps)
function powerHtml(j) {
  const pc = powerCheck(j); if (!pc) return "";
  const w = n => n.toLocaleString() + " W", g = pc.gpus.length;
  if (pc.psuW == null) return `<div class="power unknown">⚡ <span>Power check: watts of <b>${esc(pc.psu)}</b> unknown</span></div>`;
  const use = pc.ocWanted ? pc.oc : pc.stock, over = use > pc.psuW, ocOver = !pc.ocWanted && pc.oc > pc.psuW, tight = !over && use > pc.psuW * 0.9;
  const pct = Math.min(100, use / pc.psuW * 100);
  const what = [pc.cpu ? "CPU" : "", g ? (g > 1 ? g + " GPUs" : "GPU") : ""].filter(Boolean).join(" + ");
  const title = pc.parts.map(c => `${c.cat}: ${c.name} – ${c.p ? c.p.w + " W" + (c.p.oc > c.p.w ? " (up to " + c.p.oc + " W overclocked)" : "") : "watts unknown"}`).concat([`Everything else (board, RAM, drives, fans…): ~${POWER_OTHER} W`]).join("\n");
  return `<div class="power ${over ? "over" : tight || ocOver ? "tight" : ""}" title="${esc(title)}">
    <div class="brow"><span>${over ? "⚠️ PSU too weak" : "⚡ Power"}${pc.ocWanted ? " <small>(overclocked)</small>" : ""}</span><b>${w(use)} / ${w(pc.psuW)}</b></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <small>${what ? what + " + " : ""}~${POWER_OTHER} W for the rest${pc.unknown.length ? ` · <span class="warn">${pc.unknown.length} part${pc.unknown.length > 1 ? "s" : ""} without watts</span>` : ""}${over ? ` · needs a PSU of at least <b>${w(Math.ceil(use / 50) * 50)}</b>` : ""}${ocOver ? ` · <span class="warn">too weak when overclocked (~${w(pc.oc)})</span>` : !pc.ocWanted && pc.oc > pc.stock ? ` · overclocked ~${w(pc.oc)}` : ""}</small></div>`;
}
// 🔧 parts that don't fit together – only shown when there is a clash with a planned swap / required part
function compatHtml(clashes) {
  if (!clashes.length) return "";
  const tag = p => p.req ? " <em>(job requirement)</em>" : p.src === "stats" ? " <em>(customer's part)</em>" : "";
  return `<div class="compat"><b>⚠️ Parts that don't fit together</b><ul>${clashes.map(c => `<li><span class="cpart">${esc(c.part.cat)}: ${esc(c.part.name)}</span>${tag(c.part)} – ${esc(c.msg)}<small>with ${esc(c.other.cat)}: ${esc(c.other.name)}${tag(c.other)}</small></li>`).join("")}</ul>
    <small class="chint">Higher in the swap list wins – drag ⠿ (or Alt + ↑ ↓) to change the order.</small></div>`;
}
// change the order of a job's part swaps (it decides which part "wins" when two don't fit together)
function moveSwap(j, id, to) {
  const i = j.swaps.findIndex(s => s.id === id); if (i < 0) return;
  const k = Math.max(0, Math.min(j.swaps.length - 1, to)); if (k === i) return;
  const [s] = j.swaps.splice(i, 1); j.swaps.splice(k, 0, s); save(); render();
}
function render() {
  $("#tables").innerHTML = [1, 2, 3].map(n => {
    const j = jobs.find(j => j.table === n);
    return `<section class="slot" style="--c:${TCOL[n]}" data-table="${n}"><h2>Table ${n}<small>${j ? "in progress" : "free"}</small></h2>
      <div class="body">${j ? jobCard(j) : `<div class="free">Free – drag a job here or press T${n} on a job</div>`}</div></section>`;
  }).join("");
  // soonest in-game deadline first; jobs without a deadline keep their order at the end
  const q = jobs.filter(j => !j.table).map((j, i) => ({ j, i, d: deadlineValue(j.deadline) })).sort((a, b) => a.d - b.d || a.i - b.i).map(x => x.j);
  $("#qCount").textContent = q.length ? `(${q.length})` : "";
  $("#queue").innerHTML = q.length ? q.map(jobCard).join("") : `<div class="empty">No open jobs. Press <b>📸 Capture job</b> or <b>＋ Manual job</b>.</div>`;
}
function jobCard(j) {
  const busy = n => jobs.some(o => o.table === n && o !== j);
  const hid = j.tasks.filter(k => k.src === "hid"), main = j.tasks.filter(k => k.src === "obj"), found = j.tasks.filter(k => k.src === "add");
  const del = k => `<button class="ghost x" data-act="delTask" data-id="${j.id}" data-k="${k.id}" title="Remove">✕</button>`;
  const hidHtml = hid.length ? `<div class="hidbox ${hid.every(k => k.done) ? "alldone" : ""}"><div class="hidhead">🔍 Hidden objectives <span>${hid.filter(k => k.done).length}/${hid.length}</span></div>${hid.map(k => { const [, t, d] = k.text.match(/^(.*?)\s*(\((?:makes|e\.g\.)[^)]*\))?$/) || [, k.text]; return `<label class="hid ${k.done ? "done" : ""}"><input type="checkbox" ${k.done ? "checked" : ""} data-act="toggleTask" data-id="${j.id}" data-k="${k.id}"><span class="ico">${hidIcon(k.text)}</span><span><b>${esc(t)}</b>${d ? `<small>${esc(d.slice(1, -1))}</small>` : ""}</span>${del(k)}</label>`; }).join("")}</div>` : "";
  const mainHtml = main.length ? `<div class="sec"><h4>Objectives</h4><ul class="mainobj">${main.map(k => `<li>${esc(k.text)}${del(k)}</li>`).join("")}</ul></div>` : "";
  const foundHtml = found.map(k => `<div class="task ${k.done ? "done" : ""}"><input type="checkbox" ${k.done ? "checked" : ""} data-act="toggleTask" data-id="${j.id}" data-k="${k.id}"><span>${esc(k.text)}</span>${del(k)}</div>`).join("");
  const swapPrice = s => s.price ?? priceOf(s.new);
  const clashes = jobCompatIssues(j), bad = new Set(clashes.map(c => c.part.swapId).filter(Boolean));
  const swaps = j.swaps.map(s => { const pr = swapPrice(s); return `<div class="swap ${s.done ? "done" : ""} ${bad.has(s.id) ? "clash" : ""}" data-swap="${s.id}"><input type="checkbox" ${s.done ? "checked" : ""} data-act="toggleSwap" data-id="${j.id}" data-k="${s.id}" style="accent-color:var(--good)"><div style="flex:1"><span class="cat">${esc(s.cat)}</span><span class="old">${esc(s.old || "(empty slot)")}</span> → <span class="new">${esc(s.new)}</span>${detailsOf(s.new) ? `<small class="det">${esc(detailsOf(s.new))}</small>` : ""}</div><button class="price ${pr == null ? "unknown" : ""}" data-act="setPrice" data-id="${j.id}" data-k="${s.id}" title="${pr == null ? "Price unknown – click to enter it" : "Click to change the price"}">${pr == null ? "$ ?" : "$" + pr}</button><span class="grip" draggable="true" title="Drag to change the order – higher = wins when parts don't fit together (Alt + ↑ ↓)" aria-hidden="true">⠿</span><button class="ghost x" data-act="delSwap" data-id="${j.id}" data-k="${s.id}">✕</button></div>`; }).join("");
  // budget = what the customer pays for parts; labour is not part of it
  let budgetHtml = "";
  const loose = j.story && !budgetInObjectives(main); // story job: the budget only counts when an objective says so
  if (j.budget != null && loose) {
    const spent = j.swaps.reduce((t, s) => t + (swapPrice(s) || 0), 0);
    budgetHtml = `<div class="budget loose" title="Story job – you can go over the budget and still get full marks">
      <div class="brow"><span>💰 Budget <small>(story job – can go over)</small></span><b>$${j.budget.toLocaleString()}</b></div>
      <small>$${spent.toLocaleString()} spent on ${j.swaps.length} part${j.swaps.length === 1 ? "" : "s"}</small></div>`;
  } else if (j.budget != null) {
    const spent = j.swaps.reduce((t, s) => t + (swapPrice(s) || 0), 0), noPrice = j.swaps.filter(s => swapPrice(s) == null).length;
    const left = j.budget - spent, over = left < 0, pct = j.budget > 0 ? Math.min(100, spent / j.budget * 100) : (spent > 0 ? 100 : 0);
    budgetHtml = `<div class="budget ${over ? "over" : pct >= 85 ? "tight" : ""}">
      <div class="brow"><span>${over ? "⚠️ Over budget" : "💰 Budget left"}</span><b>${over ? "−$" + (-left).toLocaleString() : "$" + left.toLocaleString()}</b></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <small>$${spent.toLocaleString()} of $${j.budget.toLocaleString()} spent on ${j.swaps.length} part${j.swaps.length === 1 ? "" : "s"}${noPrice ? ` · <span class="warn">${noPrice} without price</span>` : ""}</small></div>`;
  }
  const comp = j.components.length ? `<details><summary>Current parts (${j.components.length})</summary><ul class="parts">${j.components.map(c => `<li>${esc(c.cat)}: <span>${esc(c.name)}</span></li>`).join("")}</ul></details>` : `<div class="hint" style="margin:0">No parts list yet</div>`;
  return `<article class="job ${j.story ? "story" : ""}" draggable="true" data-job="${j.id}" style="--c:${TCOL[j.table || 0]}">
    ${j.story ? `<div class="storytag">📖 Story job</div>` : ""}
    <div class="top"><div class="who"><b>${esc(j.sender || "Unknown customer")}</b><small>${esc(j.subject)}</small></div><button class="ghost" data-act="edit" data-id="${j.id}" title="Edit">✎</button></div>
    <div class="chips">${j.labour != null ? `<span class="chip">Labour $${j.labour}</span>` : ""}${j.deadline ? `<span class="chip dl" ${j.softDeadline ? 'title="Urgent job – no exact deadline, aim for 2 days"' : ""}>⏰ ${j.softDeadline ? "~" : "by "}${esc(j.deadline)}</span>` : ""}${j.suspect ? `<span class="chip sus">Says: ${esc(j.suspect)}?</span>` : ""}${hid.some(k => !k.done) ? `<span class="chip hidchip">🔍 ${hid.filter(k => !k.done).length} hidden</span>` : ""}</div>${budgetHtml}
    <div class="tables">${[1, 2, 3].map(n => `<button class="${j.table === n ? "sel" : ""} ${busy(n) ? "busy" : ""}" style="--c:${TCOL[n]}" data-act="table" data-id="${j.id}" data-n="${n}" title="${j.table === n ? "Back to open jobs" : busy(n) ? "Table " + n + " is busy – swap jobs" : "Move to table " + n}">T${n}</button>`).join("")}</div>
    ${hidHtml}${mainHtml}
    <div class="sec"><h4>Found while working${found.length ? ` <span>${found.filter(t => t.done).length}/${found.length}</span>` : ""}</h4>${foundHtml}
      <div class="addrow"><input placeholder="New task found…" data-input="task" data-id="${j.id}"><button data-act="addTask" data-id="${j.id}">＋</button></div></div>
    <div class="sec"><h4>Part swaps</h4>${powerHtml(j)}${swaps}${compatHtml(clashes)}
      <div class="swapform" data-swapform="${j.id}" data-brands="${esc((j.brands || []).join("|"))}" ${j.budget != null && !loose ? `data-left="${j.budget - j.swaps.reduce((t, s) => t + ((s.price ?? priceOf(s.new)) || 0), 0)}"` : ""} hidden>
        <select data-f="old"><option value="">— replace which part? —</option>${j.components.map((c, i) => `<option value="${i}">${esc(c.cat)}: ${esc(c.name)}</option>`).join("")}<option value="new">(new / empty slot)</option></select>
        <div class="grid2"><select data-f="cat">${CATS.map(c => `<option ${c === "Other" ? "selected" : ""}>${c}</option>`).join("")}</select><input data-f="new" data-ac placeholder="New part – type e.g. 1700X" autocomplete="off"></div>
        <div class="addrow" style="margin:0"><button class="primary" data-act="saveSwap" data-id="${j.id}" style="flex:1">Add swap</button><button data-act="cancelSwap" data-id="${j.id}">Cancel</button></div>
      </div>
      <button data-act="openSwap" data-id="${j.id}" style="width:100%;margin-top:4px">⇄ Add part replacement</button></div>
    <div class="sec">${comp}</div>
    <div class="foot"><button data-act="addParts" data-id="${j.id}" title="Capture the PC Stats popup again (e.g. after scrolling)">📸 Parts</button><button class="good" data-act="complete" data-id="${j.id}">✔ Job completed</button></div>
  </article>`;
}
const job = id => jobs.find(j => j.id === id);
function moveToTable(j, n) {
  if (j.table === n) { j.table = 0; return; }
  const occ = jobs.find(o => o.table === n && o !== j);
  if (occ) { occ.table = j.table || 0; toast(occ.table ? `Swapped – ${occ.sender || "other job"} moved to Table ${occ.table}` : `${occ.sender || "Previous job"} moved back to open jobs`); }
  j.table = n;
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const j = job(b.dataset.id); const a = b.dataset.act;
  if (a === "table") { moveToTable(j, +b.dataset.n); }
  else if (a === "toggleTask") { const t = j.tasks.find(t => t.id === b.dataset.k); t.done = b.checked; }
  else if (a === "delTask") { j.tasks = j.tasks.filter(t => t.id !== b.dataset.k); }
  else if (a === "addTask") { const inp = document.querySelector(`[data-input="task"][data-id="${j.id}"]`); if (!inp.value.trim()) return; j.tasks.push({ id: uid(), text: inp.value.trim(), src: "add", done: false }); }
  else if (a === "toggleSwap") { j.swaps.find(s => s.id === b.dataset.k).done = b.checked; }
  else if (a === "setPrice") { const s = j.swaps.find(s => s.id === b.dataset.k); const cur = s.price ?? priceOf(s.new); const v = prompt(`Price of ${s.new} in $ (leave empty to use the shop price):`, cur ?? ""); if (v === null) return; s.price = v.trim() === "" ? undefined : Math.max(0, Math.round(+v.replace(/[^\d.]/g, "")) || 0); if (s.price === undefined) delete s.price; }
  else if (a === "delSwap") { j.swaps = j.swaps.filter(s => s.id !== b.dataset.k); }
  else if (a === "openSwap") { const f = document.querySelector(`[data-swapform="${j.id}"]`); f.hidden = false; b.hidden = true;
    f.querySelector('[data-f="old"]').onchange = ev => {
      // copy the chosen part (name + category) into "New part", selected so typing replaces it
      const c = j.components[ev.target.value], inp = f.querySelector('[data-f="new"]');
      f.querySelector('[data-f="cat"]').value = c && CATS.includes(c.cat) ? c.cat : "Other";
      inp.value = c ? c.name : "";
      if (ev.target.dataset.kb) return; // changed with ← → : stay on the dropdown
      inp.dataset.noAc = "1"; inp.focus(); inp.select(); delete inp.dataset.noAc;
    };
    f.querySelector('[data-f="new"]').focus(); return; }
  else if (a === "cancelSwap") { render(); return; }
  else if (a === "saveSwap") { const f = document.querySelector(`[data-swapform="${j.id}"]`); const o = f.querySelector('[data-f="old"]').value, nw = f.querySelector('[data-f="new"]').value.trim(), cat = f.querySelector('[data-f="cat"]').value;
    if (!nw) { f.querySelector('[data-f="new"]').focus(); return; }
    j.swaps.push({ id: uid(), old: j.components[o]?.name || "", cat, new: nw, done: false }); rememberPart(nw, cat); }
  else if (a === "complete") { const idx = jobs.indexOf(j); jobs.splice(idx, 1); save(); render(); toast(`Completed: ${j.sender || "job"}`, () => { if (j.table && jobs.some(o => o.table === j.table)) j.table = 0; jobs.splice(idx, 0, j); save(); render(); }); return; }
  else if (a === "edit") { openReview(null, j); return; }
  else if (a === "addParts") { startCapture(j); return; }
  else return;
  save(); render();
});
document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  if (e.target.dataset.input === "task") document.querySelector(`[data-act="addTask"][data-id="${e.target.dataset.id}"]`).click();
  else if (e.target.matches('[data-swapform] [data-f="new"]')) e.target.closest("[data-swapform]").querySelector('[data-act="saveSwap"]').click();
});
// drag & drop: onto a table slot or back to open jobs
const dropTarget = el => el.closest?.(".slot") || el.closest?.("#queue");
document.addEventListener("dragstart", e => {
  const g = e.target.closest?.(".grip");
  if (g) { const sw = g.closest(".swap"); e.dataTransfer.setData("swap", sw.dataset.swap); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setDragImage(sw, 12, 12); sw.classList.add("dragging"); return; }
  const c = e.target.closest?.(".job"); if (c) e.dataTransfer.setData("job", c.dataset.job);
});
// swap rows: drop above / below another swap of the same job
const swapDrop = e => { const row = e.target.closest?.(".swap"); if (!row) return null; const r = row.getBoundingClientRect(); return { row, after: e.clientY > r.top + r.height / 2 }; };
document.addEventListener("dragover", e => {
  if (!e.dataTransfer.types.includes("swap")) return;
  const d = swapDrop(e), src = document.querySelector(".swap.dragging");
  document.querySelectorAll(".swap.dropbefore,.swap.dropafter").forEach(x => x.classList.remove("dropbefore", "dropafter"));
  if (!d || !src || d.row.closest(".job") !== src.closest(".job")) return;
  e.preventDefault(); e.dataTransfer.dropEffect = "move"; d.row.classList.add(d.after ? "dropafter" : "dropbefore");
});
document.addEventListener("drop", e => {
  if (!e.dataTransfer.types.includes("swap")) return;
  e.preventDefault(); const id = e.dataTransfer.getData("swap"), d = swapDrop(e);
  document.querySelectorAll(".swap.dropbefore,.swap.dropafter,.swap.dragging").forEach(x => x.classList.remove("dropbefore", "dropafter", "dragging"));
  if (!d) return; const j = jobs.find(x => x.id === d.row.closest(".job").dataset.job); if (!j) return;
  const from = j.swaps.findIndex(s => s.id === id), at = j.swaps.findIndex(s => s.id === d.row.dataset.swap); if (from < 0 || at < 0) return;
  moveSwap(j, id, at + (d.after ? 1 : 0) - (from < at + (d.after ? 1 : 0) ? 1 : 0));
});
document.addEventListener("dragend", () => document.querySelectorAll(".swap.dragging,.swap.dropbefore,.swap.dropafter").forEach(x => x.classList.remove("dragging", "dropbefore", "dropafter")));
document.addEventListener("dragover", e => { if (!e.dataTransfer.types.includes("job")) return; const t = dropTarget(e.target); document.querySelectorAll(".slot,#queue").forEach(c => c.classList.toggle("drop", c === t)); if (t) e.preventDefault(); });
document.addEventListener("dragend", () => document.querySelectorAll(".drop").forEach(c => c.classList.remove("drop")));
document.addEventListener("drop", e => { const id = e.dataTransfer.getData("job"); const t = dropTarget(e.target); document.querySelectorAll(".drop").forEach(c => c.classList.remove("drop")); if (!t || !id) return; e.preventDefault(); const j = job(id); const n = t.id === "queue" ? 0 : +t.dataset.table; if (n) { if (j.table !== n) moveToTable(j, n); } else j.table = 0; save(); render(); });

let toastTimer;
function toast(msg, undo) { const host = [...document.querySelectorAll("dialog")].find(d => d.open) || document.body; if ($("#toast").parentNode !== host) host.append($("#toast")); $("#toastTxt").textContent = msg; $("#toast").style.display = "flex"; $("#toastBtn").style.display = undo ? "" : "none"; $("#toastBtn").onclick = () => { undo(); $("#toast").style.display = "none"; }; clearTimeout(toastTimer); toastTimer = setTimeout(() => $("#toast").style.display = "none", 7000); }

// ================= screen capture =================
let stream = null;
$("#btnShare").onclick = async () => {
  try {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
    stopStream(); stream = s;
    $("#video").srcObject = stream;
    stream.getVideoTracks()[0].onended = () => { stream = null; setStatus(); };
    try { await $("#video").play(); } catch {}
    setStatus();
  } catch (err) { toast("Screen sharing was cancelled or blocked."); }
};
function stopStream() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } $("#video").srcObject = null; }
$("#btnStop").onclick = () => { stopStream(); setStatus(); toast("Screen capture stopped"); };
function setStatus() { startLive(); $("#dot").classList.toggle("on", !!stream); $("#statusTxt").textContent = stream ? "Screen connected" : "Not connected"; $("#btnShare").textContent = stream ? "🖥️ Change screen" : "🖥️ Connect screen"; $("#btnStop").hidden = !stream; }
async function grabFrame() {
  const track = stream.getVideoTracks()[0];
  let c = null;
  if (window.ImageCapture) {
    try { const bmp = await new ImageCapture(track).grabFrame(); c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0); if (isBlack(c)) c = null; } catch { c = null; }
  }
  if (!c) {
    const v = $("#video");
    try { await v.play(); } catch {}
    for (let i = 0; i < 20 && (!v.videoWidth || v.readyState < 2); i++) await new Promise(r => setTimeout(r, 100));
    await new Promise(r => (v.requestVideoFrameCallback ? v.requestVideoFrameCallback(() => r()) : setTimeout(r, 200)));
    c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0);
  }
  return { url: c.toDataURL("image/png"), black: isBlack(c) };
}
function isBlack(c) {
  if (!c.width || !c.height) return true;
  const t = document.createElement("canvas"); t.width = 64; t.height = 36; const g = t.getContext("2d"); g.drawImage(c, 0, 0, 64, 36);
  const d = g.getImageData(0, 0, 64, 36).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
  return sum / (d.length / 4) < 12;
}
let liveTimer = null;
function startLive() {
  const cv = $("#live"), v = $("#video"); cv.hidden = !stream; clearInterval(liveTimer); if (!stream) return;
  liveTimer = setInterval(() => { if (v.videoWidth) cv.getContext("2d").drawImage(v, 0, 0, cv.width, cv.height); }, 1000);
}
const BLACK_HELP = `The captured image is black. Try, in this order:<br>
1. Click <b>Change screen</b> and choose the <b>Entire screen</b> tab → screen 1 (not the “Window” tab).<br>
2. Switch chiaki-ng from fullscreen to a maximised window.<br>
3. Browser Settings → System → turn <b>off “Use graphics/hardware acceleration”</b>, restart the browser.<br>
Meanwhile: press <b>Win+Shift+S</b>, snip screen 1, and <b>Ctrl+V</b> into this page.`;
async function startCapture(forJob) {
  if (!stream) { toast("Click “Connect screen” first and pick screen 1 – or paste/drop a screenshot."); return; }
  const f = await grabFrame();
  openReview(f.url, null, forJob);
  showBlack(f.black);
}
function showBlack(b) { $("#blackWarn").innerHTML = BLACK_HELP; $("#blackWarn").hidden = !b; }
$("#btnCapture").onclick = () => startCapture(null);
$("#btnManual").onclick = () => openReview(null, null);
window.addEventListener("paste", e => { const f = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith("image/")); if (f) readImg(f); });
let dragDepth = 0;
window.addEventListener("dragenter", e => { if (e.dataTransfer.types.includes("Files")) { dragDepth++; $("#drop").style.display = "flex"; } });
window.addEventListener("dragleave", e => { if (e.dataTransfer.types.includes("Files") && --dragDepth <= 0) { dragDepth = 0; $("#drop").style.display = "none"; } });
window.addEventListener("dragover", e => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); });
window.addEventListener("drop", e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); dragDepth = 0; $("#drop").style.display = "none"; const f = [...e.dataTransfer.files].find(f => f.type.startsWith("image/")); if (f) readImg(f); });
function readImg(f) { const r = new FileReader(); r.onload = () => { if ($("#dlgReview").open && rev) addShot(r.result, rev.forJob ? "parts" : "auto"); else openReview(r.result, null); }; r.readAsDataURL(f); }

// ================= OCR =================
let worker = null;
async function getWorker() {
  if (worker) return worker;
  if (!window.Tesseract) throw new Error("Text reader didn't load – check internet connection (needed the first time).");
  worker = await Tesseract.createWorker("eng", 1, { logger: m => { if (m.status === "recognizing text") $("#prog").style.width = Math.round(m.progress * 100) + "%"; } });
  await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "0" });
  return worker;
}
function cropCanvas(img, r) {
  const W = img.naturalWidth, H = img.naturalHeight, sx = r.x * W, sy = r.y * H, sw = r.w * W, sh = r.h * H;
  const scale = sw < 1300 ? Math.min(2.5, 1300 / sw) : 1;
  const c = document.createElement("canvas"); c.width = sw * scale; c.height = sh * scale;
  const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.filter = "grayscale(1) contrast(1.15)"; g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height); return c;
}
// text + every line with its certainty (0–100). Since tesseract.js 6 only the plain text comes back
// unless more is asked for, so the lines are taken from the "blocks" output (block → paragraph → line).
async function readText(canvas) {
  const w = await getWorker();
  const d = (await w.recognize(canvas, {}, { text: true, blocks: true })).data;
  const lines = [];
  for (const b of d.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) lines.push([String(l.text || "").trim(), l.confidence]);
  return { text: d.text || "", lines };
}
let lastConf = null;
async function ocr(img, kind) {
  await getWorker();
  $("#ocrState").textContent = `Reading ${kind === "email" ? "email" : "PC Stats"}…`; $("#prog").style.width = "0";
  const r = await readText(cropCanvas(img, crops[kind === "parts" ? "stats" : kind]));
  lastConf = r.lines; // per-line certainty, used when joining screenshots
  $("#prog").style.width = "100%"; return r.text;
}

// ================= review dialog =================
// rev.shots: [{url, kind: "email"|"parts", text}] – the email is read first; each
// "Add PC parts capture" adds a frame whose PC Stats popup is read and merged into the parts list.
let rev = null;
function openReview(dataUrl, editJob, forJob) {
  const dlg = $("#dlgReview");
  rev = { editJob, forJob, shots: [], cur: -1, draft: editJob ? structuredClone(editJob) : blankDraft() };
  if (forJob) { rev.draft.components = structuredClone(forJob.components || []); rev.autoNames = new Set(); }
  $("#revTitle").textContent = editJob ? "Edit job" : forJob ? "Add parts from PC Stats" : dataUrl ? "New job from capture" : "New job";
  $("#rawTxt").textContent = ""; $("#prog").style.width = "0"; $("#ocrState").textContent = "";
  renderForm(); showBlack(false); renderShots(); dlg.showModal();
  if (dataUrl) addShot(dataUrl, forJob ? "parts" : "email");
}
// a warning under the screenshot with a shortcut to the set-up window – nothing is changed automatically
function areaWarn(msg) { $("#ocrState").innerHTML = `<div class="areawarn">⚠ ${esc(msg)} <button id="warnAdjust">🎯 Adjust areas</button></div>`; $("#warnAdjust").onclick = adjustArea; }
function blankDraft() { return { id: uid(), sender: "", subject: "", labour: null, budget: null, level: null, deadline: "", suspect: "", table: 0, tasks: [], swaps: [], components: [], hidden: [], objectives: [] }; }
function addShot(url, kind) { rev.shots.push({ url, kind, text: "" }); showShot(rev.shots.length - 1, true); }
function showShot(i, read) {
  rev.cur = i; const sh = rev.shots[i]; mode = sh.kind === "parts" ? "stats" : "email";
  renderShots();
  const im = $("#shot"); im.onload = () => { drawCrops(); if (read) runOcr(); }; im.src = sh.url;
  $("#rawTxt").textContent = sh.text || "";
}
function renderShots() {
  const has = rev && rev.shots.length; const dlg = $("#dlgReview");
  dlg.querySelector(".review").style.gridTemplateColumns = has ? "" : "1fr";
  $("#shotPane").hidden = !has;
  $("#shotTabs").innerHTML = has ? rev.shots.map((sh, i) => { const n = rev.shots.slice(0, i + 1).filter(x => x.kind === "parts").length; const e = rev.shots.slice(0, i + 1).filter(x => x.kind === "email").length; return `<button class="${i === rev.cur ? "sel" : ""}" data-shot="${i}">${sh.kind === "email" ? "✉ Email " + e : "🧩 Parts " + n}</button>`; }).join("") : "";
  const k = rev && rev.cur >= 0 ? rev.shots[rev.cur].kind : "email";
  $("#cropEmail").hidden = k !== "email"; $("#cropStats").hidden = k !== "parts";
  $("#areaHint").innerHTML = k === "email" ? "Blue box = the email text, budget and objectives." : "Orange box = the <b>PC Stats</b> popup (Components list). Scroll it in-game and capture again for more parts.";
}
$("#shotTabs").addEventListener("click", e => { const b = e.target.closest("[data-shot]"); if (b) showShot(+b.dataset.shot, false); });
async function capture(kind) {
  syncComps();
  if (!stream) { toast("No screen connected – connect screen 1, or paste a screenshot (Ctrl+V) while this window is open."); return; }
  const f = await grabFrame(); addShot(f.url, kind); showBlack(f.black);
}
const capParts = () => capture("parts"), capEmail = () => capture("email");
// keep what the user typed in the parts box before anything re-renders the form
function syncComps() { const ta = $("#fComps"); if (ta && rev) rev.draft.components = parseCompText(ta.value); }
// parts list = best of all PC Stats screenshots + anything the user typed in themselves
function rebuildParts() {
  syncComps();
  const prevAuto = rev.autoNames || new Set();
  const auto = mergePCStats(rev.shots.filter(s => s.kind === "parts" && s.parts).map(s => s.parts));
  rev.autoNames = new Set(auto.map(p => p.name.toLowerCase()));
  const manual = rev.draft.components.filter(c => !prevAuto.has(c.name.toLowerCase()) && !rev.autoNames.has(c.name.toLowerCase()));
  rev.draft.components = [...auto.map(({ name, cat }) => ({ name, cat })), ...manual];
  const ta = $("#fComps"); if (ta) ta.value = rev.draft.components.map(c => c.cat + ": " + c.name).join("\n");
  return auto;
}
async function runOcr() {
  if (!rev || rev.cur < 0) return;
  const sh = rev.shots[rev.cur];
  try {
    if (sh.kind === "auto") { // pasted screenshot: PC Stats popup or more of the email? (by colour first – fast)
      let k = null; try { const im = areaImage($("#shot")); k = detectArea(im, "stats") ? "parts" : detectArea(im, "email") ? "email" : null; } catch { }
      if (!k) { const t = await ocr($("#shot"), "parts"); k = /components|pc for|benchmark/i.test(t) ? "parts" : "email"; }
      sh.kind = k; showShot(rev.cur, false);
    }
    // first capture of this kind: set up the area in the big window first, then read
    const ak = sh.kind === "parts" ? "stats" : "email";
    lastFrame[ak] = sh.url;
    if (!areasSet[ak] && !sh.areaAsked) { sh.areaAsked = true; openAreas(ak, $("#shot"), () => runOcr()); return; }
    const text = await ocr($("#shot"), sh.kind); sh.text = text; sh.conf = lastConf; $("#rawTxt").textContent = text;
    // career level / % from the HUD – only after the main reading is done, never waited for, errors ignored
    if (!sh.careerDone) { sh.careerDone = true; setTimeout(() => autoCareer(sh.url).catch(() => { }), 0); }
    if (sh.kind === "parts") {
      const ok = /components|pc for|benchmark/i.test(text);
      sh.parts = ok ? resolvePCStats(text) : null;
      const total = rebuildParts();
      if (!rev.forJob && !rev.draft.sender) { const m = text.match(/PC for\s+(\S+@\S+)/i); if (m && $("#fSender") && !$("#fSender").value) $("#fSender").value = m[1]; }
      const unsure = (sh.parts || []).filter(p => !p.sure).length;
      $("#ocrState").textContent = ok ? `Read ${sh.parts.length} parts here · list now has ${total.length}.${unsure ? ` ${unsure} not found in the parts database – check them.` : ""} Several RAM sticks / GPUs / drives / fans must be on one screenshot to be counted.` : "";
      if (!ok) areaWarn("This doesn't look like the PC Stats window. Is it open in-game (PC Stats button)? If it is, the box may be in the wrong place.");
      return;
    }
    syncComps();
    const emails = rev.shots.filter(s => s.kind === "email" && s.text).map(s => ({ text: s.text, conf: s.conf }));
    const keep = { extra: $("#fExtra")?.value, table: $("#fTable")?.value };
    const p = parseEmail(emails.length > 1 ? mergeTexts(emails) : text, rules, smart);
    p.hidden.forEach(h => { if (h.brand && !h.avoid) { const c = brandCategories(h.brand); if (c.length) h.task += " (makes: " + c.join(", ") + ")"; } });
    // suggest matching in-game cable sets for cable colour requests
    p.hidden.forEach(h => { if (h.want) { const ex = h.want.map(w => cablesFor(w)[0]).filter(Boolean); if (ex.length) h.task += " (e.g. " + ex.join(", ") + ")"; } });
    Object.assign(rev.draft, { sender: p.sender, subject: p.subject, labour: p.labour, budget: p.budget, level: p.level, deadline: p.deadline, softDeadline: !!p.softDeadline, suspect: p.suspect, objectives: p.objectives, hidden: p.hidden, body: p.body, signature: p.signature, noStars: p.noStars, words: p.words });
    // story job? known from the list (sender email / subject / name) or looks like one (no star requirement, long text)
    const sm = storyMatch(p, window.STORY_JOBS || []), sl = storyLooks(p);
    rev.draft.storyKnown = sm ? (sm.entry.story || sm.entry.sender_name || "known story job") : "";
    rev.draft.storyWhy = sm ? "" : sl.why.join(" · ");
    if (!rev.storyTouched) rev.draft.story = !!sm || sl.looks;
    renderForm();
    if (keep.extra && $("#fExtra")) $("#fExtra").value = keep.extra;
    if (keep.table && $("#fTable")) $("#fTable").value = keep.table;
    $("#ocrState").textContent = (emails.length > 1 ? `Joined ${emails.length} email screenshots. ` : "") + "Check the fields. Long email? Scroll it in-game and press “📸 Add email capture”. Repair job? Open PC Stats and press “📸 Add PC parts capture”.";
    // gentle warning: none of the words every job email has
    if (!/labou?r|budget|objectives|[\w.]+@[\w-]+\.|regards|thanks/i.test(text)) areaWarn("This doesn't look like a job email. Is an email open in-game? If it is, the box may be in the wrong place.");
  } catch (err) { $("#ocrState").textContent = "⚠ " + err.message; }
}
function renderForm() {
  const d = rev.draft, f = $("#revForm");
  const partAdder = `<div class="addrow"><input id="fPartAdd" data-ac data-ac-cat="" placeholder="Add a part – type to search (e.g. 8700, Vega 64)" autocomplete="off"><button id="fPartAddBtn">＋</button></div>
    <button id="btnCapParts" class="capparts">📸 Add PC parts capture <small>open PC Stats in-game first · repeat after scrolling</small></button>`;
  const emailAdder = `<button id="btnCapEmail" class="capparts capemail">📸 Add email capture <small>long email? scroll it in-game first – text is joined</small></button>`;
  if (rev.forJob) {
    f.innerHTML = `<label>Parts of this PC (one per line, “Category: name”)</label><textarea id="fComps" rows="12">${esc(d.components.map(c => c.cat + ": " + c.name).join("\n"))}</textarea>${partAdder}
      <p class="hint">Captured parts replace earlier captured ones; lines you typed yourself are kept.</p><button class="primary big" id="fSave" style="width:100%;margin-top:10px">Save parts</button>`;
  } else {
    const isEdit = !!rev.editJob;
    f.innerHTML = `${isEdit ? "" : emailAdder}<div class="grid2"><div><label>Customer</label><input id="fSender" value="${esc(d.sender)}"></div><div><label>Subject</label><input id="fSubject" value="${esc(d.subject)}"></div></div>
      <div class="grid3"><div><label>Labour $</label><input id="fLabour" type="number" value="${d.labour ?? ""}"></div><div><label>Budget $</label><input id="fBudget" type="number" value="${d.budget ?? ""}"></div><div><label>Deadline</label><input id="fDeadline" value="${esc(d.deadline)}"></div></div>
      <label class="dlcrow storyrow"><input type="checkbox" class="switch" id="fStory" ${d.story ? "checked" : ""}><span><b>📖 Story job</b><br><small>Career story customer: no hidden objectives, and the budget doesn't count unless an objective mentions it.</small></span></label>
      <div class="grid2"><div><label>Customer suspects</label><input id="fSuspect" value="${esc(d.suspect)}" placeholder="(often wrong – verify)"></div><div><label>Put on</label><select id="fTable"><option value="0">Open jobs</option>${[1, 2, 3].map(n => { const o = jobs.find(j => j.table === n && j.id !== d.id); return `<option value="${n}" ${d.table === n ? "selected" : ""}>Table ${n}${o ? " (busy – swaps)" : ""}</option>`; }).join("")}</select></div></div>
      ${isEdit ? "" : `<label>Objectives (one per line)</label><textarea id="fObj" rows="3">${esc((d.objectives || []).join("\n"))}</textarea>
      ${storyBanner(d)}
      <label>Hidden objectives found in email${d.story ? " <small>(story job – not ticked)</small>" : ""}</label><div id="fHidden">${(d.hidden || []).length ? d.hidden.map((h, i) => `<div class="hidrow"><input type="checkbox" ${d.story ? "" : "checked"} data-h="${i}"><div>${esc(h.task)}<br><small>because: “${esc(h.because.join("”, “"))}”</small></div></div>`).join("") : `<div class="hint">None detected.</div>`}</div>
      <label>Extra tasks (one per line)</label><textarea id="fExtra" rows="2"></textarea>`}
      <label>Current parts (one per line, “Category: name”)</label><textarea id="fComps" rows="7">${esc(d.components.map(c => c.cat + ": " + c.name).join("\n"))}</textarea>${partAdder}
      ${d.body ? `<details style="margin-top:8px"><summary>Email text</summary><div class="rawtxt">${esc(d.body)}</div></details>` : ""}
      <button class="primary big" id="fSave" style="width:100%;margin-top:12px">${isEdit ? "Save changes" : "Create job"}</button>`;
  }
  $("#fSave").onclick = saveReview;
  // switching "Story job" unticks / ticks the hidden objectives in one go
  $("#fStory")?.addEventListener("change", e => { rev.storyTouched = true; rev.draft.story = e.target.checked; document.querySelectorAll("#fHidden input").forEach(c => c.checked = !e.target.checked); const b = $("#storyBanner"); if (b) b.outerHTML = storyBanner(rev.draft); bindStoryBanner(); });
  bindStoryBanner();
  const addPart = () => { const v = $("#fPartAdd").value.trim(); if (!v) return; const m = INDEX.find(p => p.name === v) || matchPart(v); const line = (m ? m.cat + ": " + m.name : categorize(v) + ": " + v); const ta = $("#fComps"); ta.value = (ta.value.trim() ? ta.value.trim() + "\n" : "") + line; $("#fPartAdd").value = ""; };
  $("#fPartAddBtn").onclick = addPart;
  $("#btnCapParts").onclick = capParts;
  if ($("#btnCapEmail")) $("#btnCapEmail").onclick = capEmail;
  $("#fPartAdd").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addPart(); } });
}
function parseCompText(txt) { return txt.split("\n").map(s => s.trim()).filter(Boolean).map(s => { const m = s.match(/^([^:]{2,15}):\s*(.+)$/); return m && CATS.includes(m[1].trim()) ? { cat: m[1].trim(), name: m[2].trim() } : { cat: categorize(s), name: s }; }); }
function saveReview() {
  const d = rev.draft, comps = parseCompText($("#fComps").value);
  comps.forEach(c => rememberPart(c.name, c.cat));
  if (rev.forJob) { job(rev.forJob.id).components = comps; }
  else {
    const fields = { sender: $("#fSender").value.trim(), subject: $("#fSubject").value.trim(), labour: $("#fLabour").value === "" ? null : +$("#fLabour").value, budget: $("#fBudget").value === "" ? null : +$("#fBudget").value, deadline: $("#fDeadline").value.trim(), softDeadline: !!d.softDeadline && $("#fDeadline").value.trim() === d.deadline, suspect: $("#fSuspect").value.trim(), components: comps, story: !!$("#fStory")?.checked };
    const table = +$("#fTable").value;
    let target;
    if (rev.editJob) { target = job(rev.editJob.id); Object.assign(target, fields); }
    else {
      const tasks = [];
      $("#fObj").value.split("\n").map(s => s.trim()).filter(Boolean).filter(s => !/^complete by/i.test(s)).forEach(t => tasks.push({ id: uid(), text: t, src: "obj", done: false }));
      const brands = [];
      document.querySelectorAll("#fHidden input:checked").forEach(c => { const h = d.hidden[c.dataset.h]; tasks.push({ id: uid(), text: h.task, src: "hid", done: false }); if (h.brand && !h.avoid) brands.push(h.brand); });
      $("#fExtra").value.split("\n").map(s => s.trim()).filter(Boolean).forEach(t => tasks.push({ id: uid(), text: t, src: "add", done: false }));
      target = { ...fields, table: 0, id: d.id, level: d.level, tasks, swaps: [], brands, created: Date.now() };
      jobs.push(target);
    }
    if ((target.table || 0) !== table) { if (table) moveToTable(target, table); else target.table = 0; }
  }
  save(); render(); $("#dlgReview").close();
}
// crop drawing
let mode = "email"; // which crop box the current screenshot uses
function drawCrops() { for (const k of ["email", "stats"]) { const el = $(k === "email" ? "#cropEmail" : "#cropStats"), r = crops[k]; Object.assign(el.style, { left: r.x * 100 + "%", top: r.y * 100 + "%", width: r.w * 100 + "%", height: r.h * 100 + "%" }); } }
$("#btnReOcr").onclick = runOcr;
// 🎯 Adjust areas: the big set-up window for the screenshot being looked at, then read it again
function adjustArea() { if (!rev || rev.cur < 0) return; const k = rev.shots[rev.cur].kind === "parts" ? "stats" : "email"; openAreas(k, $("#shot"), ok => { if (ok) runOcr(); }); }
$("#btnAdjust").onclick = adjustArea;
document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => b.closest("dialog").close());
$("#dlgReview").addEventListener("close", () => { acEl.hidden = true; document.body.append(acEl); });

// ================= settings: content packs (DLC) + rules =================
// DLC that only add workshops, modes or music – listed for information, no parts to filter
const DLC_NO_PARTS = ["Career Power Pack", "Esports Expansion", "NZXT Workshop", "Republic of Gamers Workshop", "Fractal Design Workshop", "AORUS Workshop", "EVGA Workshop", "Overclockers UK Workshop", "Razer Workshop", "PC Building Simulator Soundtrack"];
function changelogUrl() { const r = reportRepo(); return r ? `https://github.com/${r}/blob/main/CHANGELOG.md` : "CHANGELOG.md"; }
function renderSettings() {
  const m = window.PARTS_META || {};
  const row = d => { const n = dlcCount(d.key); return `<label class="dlcrow"><input type="checkbox" class="switch" data-dlc="${esc(d.key)}" ${dlcOn[d.key] ? "checked" : ""}><span><b>${esc(d.label)}</b> <small>${n} parts</small><br><small>${esc(d.note)}</small></span></label>`; };
  const withParts = DLCS.filter(d => dlcCount(d.key) > 0);
  $("#dlcList").innerHTML = withParts.map(row).join("") || `<p class="hint">None.</p>`;
  $("#dlcOther").textContent = "No extra parts (workshops, game modes, music – nothing to switch): " + DLC_NO_PARTS.join(", ") + ".";
  $("#gameVersion").innerHTML = VERSIONS.slice().reverse().map(v => `<option value="${esc(v.v)}" ${v.v === gameVersion ? "selected" : ""}>${esc(v.label)}</option>`).join("");
  $("#appVersion").textContent = "PCBS Job Board v" + ((window.PCBS_CONFIG || {}).version || "?");
  $("#appVersion").href = changelogUrl();
  if (typeof keysOn !== "undefined") $("#keysToggle").checked = keysOn;
  $("#dbInfo").textContent = m.counts ? `${Object.values(m.counts).reduce((a, b) => a + b, 0)} parts in the database (built ${m.built}). ${INDEX.filter(p => !p.hist).length} shown with your current settings.` : "Parts database not loaded.";
}
$("#btnSettings").onclick = () => { renderSettings(); $("#dlgSettings").showModal(); };
// ❓ How to use it – the pictures are only downloaded the first time the window is opened
$("#btnHelp").onclick = () => { document.querySelectorAll("#dlgHelp img[data-src]").forEach(i => { i.src = i.dataset.src; i.removeAttribute("data-src"); }); $("#dlgHelp").showModal(); $("#dlgHelp .dlg-b").scrollTop = 0; };
$("#btnKeysFromSettings").onclick = () => { $("#dlgSettings").close(); openKeysHelp(); };
// career level + % in the top bar; the tooltip says what it does and how many parts are unlocked
function careerInfo() {
  const n = INDEX.filter(p => !p.hist).length, ok = INDEX.filter(p => !p.hist && unlocked(p)).length;
  $("#careerBar").title = "Your career level and % through it (in-game, top right under the stars). Part-swap suggestions only show parts you have unlocked.\n"
    + (career.level == null ? "Not set – every part is suggested." : `${ok} of ${n} parts unlocked.`);
  $("#careerBar").classList.toggle("set", career.level != null);
}
function showCareer() { $("#careerLevel").value = career.level ?? ""; $("#careerPct").value = career.level == null || !career.pct ? "" : career.pct; careerInfo(); }
// typing a level / % saves straight away; empty level = not set
["#careerLevel", "#careerPct"].forEach(id => $(id).addEventListener("input", () => { setCareer($("#careerLevel").value, $("#careerPct").value); careerInfo(); }));
// tidy the fields when leaving them (e.g. 150 % → 100), empty % = 0
$("#careerLevel").addEventListener("change", () => { $("#careerLevel").value = career.level ?? ""; });
$("#careerPct").addEventListener("change", () => { $("#careerPct").value = career.pct ? career.pct : ""; });
// factory reset: every saved key of this tool, the screen share, then a fresh start
$("#btnResetAll").onclick = () => { $("#resetSure").checked = false; $("#resetGo").disabled = true; $("#dlgSettings").close(); $("#dlgReset").showModal(); };
$("#resetSure").onchange = e => { $("#resetGo").disabled = !e.target.checked; };
$("#resetGo").onclick = () => {
  if (!$("#resetSure").checked) return;
  try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch { }
  Object.keys(localStorage).filter(k => k.startsWith("pcbs.")).forEach(k => localStorage.removeItem(k));
  LS.set("pcbs.seenVersion", (window.PCBS_CONFIG || {}).version || ""); // no "what's new" right after a reset
  location.reload();
};
$("#dlgSettings").addEventListener("change", e => { if (e.target.id === "keysToggle") { setKeys(e.target.checked); return; } const k = e.target.dataset.dlc; if (k) { setDlc(k, e.target.checked); renderSettings(); careerInfo(); } else if (e.target.id === "gameVersion") { setGameVersion(e.target.value); renderSettings(); careerInfo(); } });

// ================= missing-part reports → GitHub issues =================
function reportRepo() {
  const cfg = (window.PCBS_CONFIG || {}).repo; if (cfg) return cfg;
  const m = location.hostname.match(/^([\w-]+)\.github\.io$/i); const repo = location.pathname.split("/").filter(Boolean)[0];
  return m ? `${m[1]}/${repo && !/\.html?$/i.test(repo) ? repo : m[1] + ".github.io"}` : "";   // site at the root: OWNER.github.io
}
function openReport(pre = {}) {
  $("#rName").value = pre.name || ""; $("#rCat").value = CATS.includes(pre.cat) && pre.cat !== "Other" ? pre.cat : "";
  $("#rDlc").innerHTML = `<option value="Base game">Base game</option>` + DLCS.map(d => `<option>${esc(d.label)}</option>`).join("") + `<option>Other / not sure</option>`;
  ["#rLevel", "#rPrice", "#rNotes"].forEach(id => $(id).value = "");
  const direct = !!(window.PCBS_CONFIG || {}).reportEndpoint;
  $("#rDirect").hidden = !direct; $("#rSend").hidden = direct; $("#rCopy").hidden = direct;
  $("#rRepoHint").textContent = direct ? "" : reportRepo() ? `Opens a pre-filled report on github.com/${reportRepo()} (needs a free GitHub account).` : "No GitHub repository set – use “Copy report” and post it yourself, or set repo in js/config.js.";
  $("#dlgReport").showModal(); $("#rName").focus();
}
function reportData() { return { name: $("#rName").value.trim(), cat: $("#rCat").value, dlc: $("#rDlc").value, level: $("#rLevel").value.trim(), price: $("#rPrice").value.trim(), notes: $("#rNotes").value.trim() }; }
function reportText(r) { return `Missing part: ${r.name}\nCategory: ${r.cat || "?"}\nContent: ${r.dlc}\nUnlock level: ${r.level || "?"}\nPrice: ${r.price ? "$" + r.price : "?"}\nNotes: ${r.notes || "-"}\n(PCBS Job Board ${(window.PCBS_CONFIG || {}).version || ""}, database ${(window.PARTS_META || {}).built || "?"})`; }
$("#rSend").onclick = () => {
  const r = reportData(); if (!r.name) { $("#rName").focus(); return; }
  const repo = reportRepo(); if (!repo) { $("#rCopy").click(); return; }
  const q = new URLSearchParams({ template: "missing-part.yml", title: `[Missing part] ${r.name}`, part_name: r.name, category: r.cat, content: r.dlc, level: r.level, price: r.price, notes: r.notes, app_version: `${(window.PCBS_CONFIG || {}).version || ""} / db ${(window.PARTS_META || {}).built || ""}` });
  window.open(`https://github.com/${repo}/issues/new?${q}`, "_blank", "noopener");
  const log = LS.get("pcbs.reports", []); log.unshift({ ...r, at: Date.now() }); LS.set("pcbs.reports", log.slice(0, 100));
  $("#dlgReport").close(); toast("Report opened on GitHub – press “Create” there to submit");
};
$("#rDirect").onclick = async () => {
  const r = reportData(); if (!r.name) { $("#rName").focus(); return; }
  if (await sendReport("part", r, "#rDirect")) { const log = LS.get("pcbs.reports", []); log.unshift({ ...r, at: Date.now() }); LS.set("pcbs.reports", log.slice(0, 100)); $("#dlgReport").close(); }
};
$("#rCopy").onclick = async () => { const r = reportData(); if (!r.name) { $("#rName").focus(); return; } try { await navigator.clipboard.writeText(reportText(r)); toast("Report copied to clipboard"); } catch { prompt("Copy this report:", reportText(r)); } };

// ================= export / import =================
$("#btnExport").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify({ version: 2, jobs, rules, smart, crops, partsHistory, dlc: dlcOn, gameVersion, career }, null, 1)], { type: "application/json" })); a.download = "pcbs-jobs-backup.json"; a.click(); };
$("#btnImport").onclick = () => $("#importFile").click();
$("#importFile").onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { try { const d = JSON.parse(t); jobs = d.jobs || []; if (d.rules) rules = d.rules; if (d.smart) { smart = Object.assign({}, SMART_DEFAULT, d.smart); LS.set("pcbs.smart", smart); } if (d.crops) { crops = d.crops; areasSet = { email: true, stats: true }; LS.set("pcbs.areasSet", areasSet); renderAreaStatus(); } if (d.career) { setCareer(d.career.level, d.career.pct); showCareer(); } if (d.dlc) { dlcOn = Object.assign(dlcOn, d.dlc); LS.set("pcbs.dlc", dlcOn); } if (d.gameVersion && typeof setGameVersion === "function") setGameVersion(d.gameVersion); if (d.partsHistory) partsHistory = d.partsHistory.map(p => typeof p === "string" ? { name: p, cat: categorize(p) } : p); const seen = new Set(); jobs.forEach(j => { if (j.table && seen.has(j.table)) j.table = 0; else if (j.table) seen.add(j.table); }); LS.set("pcbs.rules", rules); LS.set("pcbs.crops", crops); LS.set("pcbs.partsHistory", partsHistory); buildIndex(); save(); render(); if ($("#dlgSettings").open) renderSettings(); toast("Backup imported"); } catch { toast("That file isn't a valid backup"); } }); e.target.value = ""; };

if (!window.PARTS_DB) toast("parts-db.js not found next to this page – part suggestions limited to names you've typed.");
buildIndex(); initAutocomplete(); render(); setStatus(); showCareer();
