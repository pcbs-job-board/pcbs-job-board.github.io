/* PCBS Job Board – main app (board, capture, OCR review, settings). */
// ================= state =================
let jobs = LS.get("pcbs.jobs", []);
let rules = LS.get("pcbs.rules", null);
// saved rules from an older version: add new default keywords/rules, drop retired ones
if (rules && LS.get("pcbs.rulesVer", 1) < RULES_VERSION) {
  for (const d of DEFAULT_RULES) {
    const r = rules.find(x => x.task === d.task);
    if (r) r.keys = [...new Set([...r.keys.filter(k => !(RULES_REMOVED[d.task] || []).includes(k)), ...d.keys])];
    else rules.push(structuredClone(d));
  }
  LS.set("pcbs.rules", rules);
}
LS.set("pcbs.rulesVer", RULES_VERSION);
if (!rules) rules = DEFAULT_RULES;
const DEFAULT_CROPS = { email: { x: .5, y: .14, w: .42, h: .68 }, stats: { x: .015, y: .1, w: .265, h: .76 } };
let crops = LS.get("pcbs.crops", structuredClone(DEFAULT_CROPS));
let cropLocked = true;
// v1 → v2 migration: tables can hold only one job each
(() => { const seen = new Set(); jobs.forEach(j => { if (j.table && seen.has(j.table)) j.table = 0; else if (j.table) seen.add(j.table); }); })();
const save = () => LS.set("pcbs.jobs", jobs);
const TCOL = ["var(--t0)", "var(--t1)", "var(--t2)", "var(--t3)"];

// ================= board =================
function hidIcon(t) {
  const s = t.toLowerCase();
  return /^avoid/.test(s) ? "⛔" : /burnt|smoke/.test(s) ? "🔥" : /^check \/ replace the/.test(s) ? "🔁" : /cable/.test(s) ? "🔌" : /parts where possible/.test(s) ? "★" : /new parts only/.test(s) ? "✨" : /dust|clean/.test(s) ? "💨" : /antivirus|virus/.test(s) ? "🛡️" : /temp|thermal|psu/.test(s) ? "🌡️" : /damaged/.test(s) ? "🔧" : /os\b|operating/.test(s) ? "💿" : /storage|drive/.test(s) ? "💾" : /overclock/.test(s) ? "⚡" : /rgb|light/.test(s) ? "🌈" : /water/.test(s) ? "💧" : /fan|noise/.test(s) ? "🌀" : "❗";
}
function deadlineValue(s) { const m = String(s || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? Date.UTC(+m[3], +m[1] - 1, +m[2]) : Infinity; }
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
  const swaps = j.swaps.map(s => `<div class="swap ${s.done ? "done" : ""}"><input type="checkbox" ${s.done ? "checked" : ""} data-act="toggleSwap" data-id="${j.id}" data-k="${s.id}" style="margin-top:3px;accent-color:var(--good)"><div style="flex:1"><span class="cat">${esc(s.cat)}</span><span class="old">${esc(s.old || "(empty slot)")}</span> → <span class="new">${esc(s.new)}</span></div><button class="ghost x" data-act="delSwap" data-id="${j.id}" data-k="${s.id}">✕</button></div>`).join("");
  const comp = j.components.length ? `<details><summary>Current parts (${j.components.length})</summary><ul class="parts">${j.components.map(c => `<li>${esc(c.cat)}: <span>${esc(c.name)}</span></li>`).join("")}</ul></details>` : `<div class="hint" style="margin:0">No parts list yet</div>`;
  return `<article class="job" draggable="true" data-job="${j.id}" style="--c:${TCOL[j.table || 0]}">
    <div class="top"><div class="who"><b>${esc(j.sender || "Unknown customer")}</b><small>${esc(j.subject)}</small></div><button class="ghost" data-act="edit" data-id="${j.id}" title="Edit">✎</button></div>
    <div class="chips">${j.labour != null ? `<span class="chip">Labour $${j.labour}</span>` : ""}${j.budget != null ? `<span class="chip">Budget $${j.budget}</span>` : ""}${j.deadline ? `<span class="chip dl">⏰ by ${esc(j.deadline)}</span>` : ""}${j.suspect ? `<span class="chip sus">Says: ${esc(j.suspect)}?</span>` : ""}${hid.some(k => !k.done) ? `<span class="chip hidchip">🔍 ${hid.filter(k => !k.done).length} hidden</span>` : ""}</div>
    <div class="tables">${[1, 2, 3].map(n => `<button class="${j.table === n ? "sel" : ""} ${busy(n) ? "busy" : ""}" style="--c:${TCOL[n]}" data-act="table" data-id="${j.id}" data-n="${n}" title="${j.table === n ? "Back to open jobs" : busy(n) ? "Table " + n + " is busy – swap jobs" : "Move to table " + n}">T${n}</button>`).join("")}</div>
    ${hidHtml}${mainHtml}
    <div class="sec"><h4>Found while working${found.length ? ` <span>${found.filter(t => t.done).length}/${found.length}</span>` : ""}</h4>${foundHtml}
      <div class="addrow"><input placeholder="New task found…" data-input="task" data-id="${j.id}"><button data-act="addTask" data-id="${j.id}">＋</button></div></div>
    <div class="sec"><h4>Part swaps</h4>${swaps}
      <div class="swapform" data-swapform="${j.id}" data-brands="${esc((j.brands || []).join("|"))}" hidden>
        <select data-f="old"><option value="">— replace which part? —</option>${j.components.map((c, i) => `<option value="${i}">${esc(c.cat)}: ${esc(c.name)}</option>`).join("")}<option value="new">(new / empty slot)</option></select>
        <div class="grid2"><select data-f="cat">${CATS.map(c => `<option>${c}</option>`).join("")}</select><input data-f="new" data-ac placeholder="New part – type e.g. 1700X" autocomplete="off"></div>
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
  else if (a === "delSwap") { j.swaps = j.swaps.filter(s => s.id !== b.dataset.k); }
  else if (a === "openSwap") { const f = document.querySelector(`[data-swapform="${j.id}"]`); f.hidden = false; b.hidden = true;
    f.querySelector('[data-f="old"]').onchange = ev => { const c = j.components[ev.target.value]; if (c) f.querySelector('[data-f="cat"]').value = CATS.includes(c.cat) ? c.cat : "Other"; f.querySelector('[data-f="new"]').focus(); };
    f.querySelector('[data-f="old"]').focus(); return; }
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
document.addEventListener("dragstart", e => { const c = e.target.closest?.(".job"); if (c) e.dataTransfer.setData("job", c.dataset.job); });
document.addEventListener("dragover", e => { if (!e.dataTransfer.types.includes("job")) return; const t = dropTarget(e.target); document.querySelectorAll(".slot,#queue").forEach(c => c.classList.toggle("drop", c === t)); if (t) e.preventDefault(); });
document.addEventListener("dragend", () => document.querySelectorAll(".drop").forEach(c => c.classList.remove("drop")));
document.addEventListener("drop", e => { const id = e.dataTransfer.getData("job"); const t = dropTarget(e.target); document.querySelectorAll(".drop").forEach(c => c.classList.remove("drop")); if (!t || !id) return; e.preventDefault(); const j = job(id); const n = t.id === "queue" ? 0 : +t.dataset.table; if (n) { if (j.table !== n) moveToTable(j, n); } else j.table = 0; save(); render(); });

let toastTimer;
function toast(msg, undo) { $("#toastTxt").textContent = msg; $("#toast").style.display = "flex"; $("#toastBtn").style.display = undo ? "" : "none"; $("#toastBtn").onclick = () => { undo(); $("#toast").style.display = "none"; }; clearTimeout(toastTimer); toastTimer = setTimeout(() => $("#toast").style.display = "none", 7000); }

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
function readImg(f) { const r = new FileReader(); r.onload = () => { if ($("#dlgReview").open && rev) addShot(r.result, "parts"); else openReview(r.result, null); }; r.readAsDataURL(f); }

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
async function ocr(img, kind) {
  const w = await getWorker();
  $("#ocrState").textContent = `Reading ${kind === "email" ? "email" : "PC Stats"}…`; $("#prog").style.width = "0";
  const text = (await w.recognize(cropCanvas(img, crops[kind === "parts" ? "stats" : kind]))).data.text;
  $("#prog").style.width = "100%"; return text;
}
// tidy OCR'd part names using the parts database
function canonParts(list) { return list.map(c => { const m = matchPart(c.name); return m ? { name: m.name, cat: m.cat } : c; }); }

// ================= review dialog =================
// rev.shots: [{url, kind: "email"|"parts", text}] – the email is read first; each
// "Add PC parts capture" adds a frame whose PC Stats popup is read and merged into the parts list.
let rev = null;
function openReview(dataUrl, editJob, forJob) {
  const dlg = $("#dlgReview");
  rev = { editJob, forJob, shots: [], cur: -1, draft: editJob ? structuredClone(editJob) : blankDraft() };
  if (forJob) rev.draft.components = [];
  $("#revTitle").textContent = editJob ? "Edit job" : forJob ? "Add parts from PC Stats" : dataUrl ? "New job from capture" : "New job";
  $("#rawTxt").textContent = ""; $("#prog").style.width = "0"; $("#ocrState").textContent = "";
  renderForm(); setLock(true); showBlack(false); renderShots(); dlg.showModal();
  if (dataUrl) addShot(dataUrl, forJob ? "parts" : "email");
}
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
  $("#shotTabs").innerHTML = has ? rev.shots.map((sh, i) => { const n = rev.shots.slice(0, i + 1).filter(x => x.kind === "parts").length; return `<button class="${i === rev.cur ? "sel" : ""}" data-shot="${i}">${sh.kind === "email" ? "✉ Email" : "🧩 Parts " + n}</button>`; }).join("") : "";
  const k = rev && rev.cur >= 0 ? rev.shots[rev.cur].kind : "email";
  $("#cropEmail").hidden = k !== "email"; $("#cropStats").hidden = k !== "parts";
  $("#areaHint").innerHTML = k === "email" ? "Blue box = the email text, budget and objectives." : "Orange box = the <b>PC Stats</b> popup (Components list). Scroll it in-game and capture again for more parts.";
}
$("#shotTabs").addEventListener("click", e => { const b = e.target.closest("[data-shot]"); if (b) showShot(+b.dataset.shot, false); });
async function capParts() {
  syncComps();
  if (!stream) { toast("No screen connected – connect screen 1, or paste a screenshot (Ctrl+V) while this window is open."); return; }
  const f = await grabFrame(); addShot(f.url, "parts"); showBlack(f.black);
}
// keep what the user typed in the parts box before anything re-renders the form
function syncComps() { const ta = $("#fComps"); if (ta && rev) rev.draft.components = parseCompText(ta.value); }
function mergeParts(found) {
  syncComps(); const have = rev.draft.components; let added = 0;
  for (const c of found) if (!have.some(x => x.name.toLowerCase() === c.name.toLowerCase())) { have.push(c); added++; }
  const ta = $("#fComps"); if (ta) ta.value = have.map(c => c.cat + ": " + c.name).join("\n");
  return added;
}
async function runOcr() {
  if (!rev || rev.cur < 0) return;
  const sh = rev.shots[rev.cur];
  try {
    const text = await ocr($("#shot"), sh.kind); sh.text = text; $("#rawTxt").textContent = text;
    if (sh.kind === "parts") {
      const ok = /components|pc for|benchmark/i.test(text);
      const found = ok ? canonParts(parseComponents(text)) : [];
      const added = mergeParts(found);
      if (!rev.forJob && !rev.draft.sender) { const m = text.match(/PC for\s+(\S+@\S+)/i); if (m && $("#fSender") && !$("#fSender").value) $("#fSender").value = m[1]; }
      $("#ocrState").textContent = ok ? `Read ${found.length} parts, ${added} new added to the list. Scroll the list in-game and capture again if some are missing.` : "No PC Stats popup found in the orange box – open it in-game (PC Stats button) and capture again, or adjust the box.";
      return;
    }
    syncComps();
    const p = parseEmail(text, rules);
    p.hidden.forEach(h => { if (h.brand && !h.avoid) { const c = brandCategories(h.brand); if (c.length) h.task += " (makes: " + c.join(", ") + ")"; } });
    // suggest matching in-game cable sets for cable colour requests
    p.hidden.forEach(h => { if (h.want) { const ex = h.want.map(w => cablesFor(w)[0]).filter(Boolean); if (ex.length) h.task += " (e.g. " + ex.join(", ") + ")"; } });
    Object.assign(rev.draft, { sender: p.sender, subject: p.subject, labour: p.labour, budget: p.budget, level: p.level, deadline: p.deadline, suspect: p.suspect, objectives: p.objectives, hidden: p.hidden, body: p.body });
    renderForm();
    $("#ocrState").textContent = "Done – check the fields. Repair job? Open PC Stats in-game and press “📸 Add PC parts capture”.";
  } catch (err) { $("#ocrState").textContent = "⚠ " + err.message; }
}
function renderForm() {
  const d = rev.draft, f = $("#revForm");
  const partAdder = `<div class="addrow"><input id="fPartAdd" data-ac data-ac-cat="" placeholder="Add a part – type to search (e.g. 8700, Vega 64)" autocomplete="off"><button id="fPartAddBtn">＋</button></div>
    <button id="btnCapParts" class="capparts">📸 Add PC parts capture <small>open PC Stats in-game first · repeat after scrolling</small></button>`;
  if (rev.forJob) {
    f.innerHTML = `<label>Parts found (one per line, “Category: name”)</label><textarea id="fComps" rows="12">${esc(d.components.map(c => c.cat + ": " + c.name).join("\n"))}</textarea>${partAdder}
      <p class="hint">Found parts are added to the job's list (duplicates skipped).</p><button class="primary big" id="fSave" style="width:100%;margin-top:10px">Add parts to job</button>`;
  } else {
    const isEdit = !!rev.editJob;
    f.innerHTML = `<div class="grid2"><div><label>Customer</label><input id="fSender" value="${esc(d.sender)}"></div><div><label>Subject</label><input id="fSubject" value="${esc(d.subject)}"></div></div>
      <div class="grid3"><div><label>Labour $</label><input id="fLabour" type="number" value="${d.labour ?? ""}"></div><div><label>Budget $</label><input id="fBudget" type="number" value="${d.budget ?? ""}"></div><div><label>Deadline</label><input id="fDeadline" value="${esc(d.deadline)}"></div></div>
      <div class="grid2"><div><label>Customer suspects</label><input id="fSuspect" value="${esc(d.suspect)}" placeholder="(often wrong – verify)"></div><div><label>Put on</label><select id="fTable"><option value="0">Open jobs</option>${[1, 2, 3].map(n => { const o = jobs.find(j => j.table === n && j.id !== d.id); return `<option value="${n}" ${d.table === n ? "selected" : ""}>Table ${n}${o ? " (busy – swaps)" : ""}</option>`; }).join("")}</select></div></div>
      ${isEdit ? "" : `<label>Objectives (one per line)</label><textarea id="fObj" rows="3">${esc((d.objectives || []).join("\n"))}</textarea>
      <label>Hidden objectives found in email</label><div id="fHidden">${(d.hidden || []).length ? d.hidden.map((h, i) => `<div class="hidrow"><input type="checkbox" checked data-h="${i}"><div>${esc(h.task)}<br><small>because: “${esc(h.because.join("”, “"))}”</small></div></div>`).join("") : `<div class="hint">None detected.</div>`}</div>
      <label>Extra tasks (one per line)</label><textarea id="fExtra" rows="2"></textarea>`}
      <label>Current parts (one per line, “Category: name”)</label><textarea id="fComps" rows="7">${esc(d.components.map(c => c.cat + ": " + c.name).join("\n"))}</textarea>${partAdder}
      ${d.body ? `<details style="margin-top:8px"><summary>Email text</summary><div class="rawtxt">${esc(d.body)}</div></details>` : ""}
      <button class="primary big" id="fSave" style="width:100%;margin-top:12px">${isEdit ? "Save changes" : "Create job"}</button>`;
  }
  $("#fSave").onclick = saveReview;
  const addPart = () => { const v = $("#fPartAdd").value.trim(); if (!v) return; const m = INDEX.find(p => p.name === v) || matchPart(v); const line = (m ? m.cat + ": " + m.name : categorize(v) + ": " + v); const ta = $("#fComps"); ta.value = (ta.value.trim() ? ta.value.trim() + "\n" : "") + line; $("#fPartAdd").value = ""; };
  $("#fPartAddBtn").onclick = addPart;
  $("#btnCapParts").onclick = capParts;
  $("#fPartAdd").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addPart(); } });
}
function parseCompText(txt) { return txt.split("\n").map(s => s.trim()).filter(Boolean).map(s => { const m = s.match(/^([^:]{2,15}):\s*(.+)$/); return m && CATS.includes(m[1].trim()) ? { cat: m[1].trim(), name: m[2].trim() } : { cat: categorize(s), name: s }; }); }
function saveReview() {
  const d = rev.draft, comps = parseCompText($("#fComps").value);
  comps.forEach(c => rememberPart(c.name, c.cat));
  if (rev.forJob) { const j = job(rev.forJob.id); comps.forEach(c => { if (!j.components.some(x => x.name.toLowerCase() === c.name.toLowerCase())) j.components.push(c); }); }
  else {
    const fields = { sender: $("#fSender").value.trim(), subject: $("#fSubject").value.trim(), labour: $("#fLabour").value === "" ? null : +$("#fLabour").value, budget: $("#fBudget").value === "" ? null : +$("#fBudget").value, deadline: $("#fDeadline").value.trim(), suspect: $("#fSuspect").value.trim(), components: comps };
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
(() => {
  const wrap = $("#shotWrap"); let st = null;
  const pos = e => { const b = wrap.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) }; };
  wrap.addEventListener("pointerdown", e => { if (cropLocked) return; st = pos(e); wrap.setPointerCapture(e.pointerId); e.preventDefault(); });
  wrap.addEventListener("pointermove", e => { if (!st) return; const p = pos(e); crops[mode] = { x: Math.min(st.x, p.x), y: Math.min(st.y, p.y), w: Math.abs(p.x - st.x), h: Math.abs(p.y - st.y) }; drawCrops(); });
  wrap.addEventListener("pointerup", () => { if (!st) return; st = null; if (crops[mode].w < .03 || crops[mode].h < .03) { crops = LS.get("pcbs.crops", crops); drawCrops(); return; } LS.set("pcbs.crops", crops); });
})();
$("#btnReOcr").onclick = runOcr;
function setLock(v) { cropLocked = v; $("#btnLock").textContent = v ? "🔒 Locked" : "🔓 Unlocked – drag to set"; $("#shotWrap").classList.toggle("unlocked", !v); }
$("#btnLock").onclick = () => setLock(!cropLocked);
$("#btnResetCrop").onclick = () => { if (!confirm("Reset both areas to the default positions?")) return; crops = structuredClone(DEFAULT_CROPS); LS.set("pcbs.crops", crops); drawCrops(); setLock(true); if (rev?.shots.length) runOcr(); };
document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => b.closest("dialog").close());
$("#dlgReview").addEventListener("close", () => { acEl.hidden = true; document.body.append(acEl); });

// ================= settings: content packs (DLC) + rules =================
// DLC that only add workshops, modes or music – listed for information, no parts to filter
const DLC_NO_PARTS = ["Career Power Pack", "Esports Expansion", "NZXT Workshop", "Republic of Gamers Workshop", "Fractal Design Workshop", "AORUS Workshop", "EVGA Workshop", "Overclockers UK Workshop", "Razer Workshop", "PC Building Simulator Soundtrack"];
function changelogUrl() { const r = reportRepo(); return r ? `https://github.com/${r}/blob/main/CHANGELOG.md` : "CHANGELOG.md"; }
function renderSettings() {
  const m = window.PARTS_META || {};
  const row = d => { const n = dlcCount(d.key); return `<label class="dlcrow"><input type="checkbox" data-dlc="${esc(d.key)}" ${dlcOn[d.key] ? "checked" : ""}><span><b>${esc(d.label)}</b> <small>${n} parts</small><br><small>${esc(d.note)}</small></span></label>`; };
  const withParts = DLCS.filter(d => dlcCount(d.key) > 0);
  $("#dlcList").innerHTML = withParts.filter(d => d.group === "dlc").map(row).join("") || `<p class="hint">None.</p>`;
  $("#groupList").innerHTML = withParts.filter(d => d.group !== "dlc").map(row).join("");
  $("#dlcOther").textContent = "No extra parts (workshops, game modes, music – nothing to switch): " + DLC_NO_PARTS.join(", ") + ".";
  $("#gameVersion").innerHTML = VERSIONS.slice().reverse().map(v => `<option value="${esc(v.v)}" ${v.v === gameVersion ? "selected" : ""}>${esc(v.label)}</option>`).join("");
  $("#appVersion").textContent = "PCBS Job Board v" + ((window.PCBS_CONFIG || {}).version || "?");
  $("#appVersion").href = changelogUrl();
  $("#dbInfo").textContent = m.counts ? `${Object.values(m.counts).reduce((a, b) => a + b, 0)} parts in the database (built ${m.built}). ${INDEX.filter(p => !p.hist).length} shown with your current settings.` : "Parts database not loaded.";
}
$("#btnSettings").onclick = () => { renderSettings(); $("#dlgSettings").showModal(); };
$("#dlgSettings").addEventListener("change", e => { const k = e.target.dataset.dlc; if (k) { setDlc(k, e.target.checked); renderSettings(); } else if (e.target.id === "gameVersion") { setGameVersion(e.target.value); renderSettings(); } });
const rulesToText = r => r.map(x => `${x.task}: ${x.keys.join(", ")}`).join("\n");
$("#btnRules").onclick = () => { $("#dlgSettings").close(); $("#rulesTxt").value = rulesToText(rules); $("#dlgRules").showModal(); };

// ================= missing-part reports → GitHub issues =================
function reportRepo() {
  const cfg = (window.PCBS_CONFIG || {}).repo; if (cfg) return cfg;
  const m = location.hostname.match(/^([\w-]+)\.github\.io$/i); const repo = location.pathname.split("/").filter(Boolean)[0];
  return m && repo ? `${m[1]}/${repo}` : "";
}
function openReport(pre = {}) {
  $("#rName").value = pre.name || ""; $("#rCat").value = CATS.includes(pre.cat) && pre.cat !== "Other" ? pre.cat : "";
  $("#rDlc").innerHTML = `<option value="Base game">Base game</option>` + DLCS.map(d => `<option>${esc(d.label)}</option>`).join("") + `<option>Other / not sure</option>`;
  ["#rLevel", "#rPrice", "#rNotes"].forEach(id => $(id).value = "");
  $("#rRepoHint").textContent = reportRepo() ? `Opens a pre-filled report on github.com/${reportRepo()} (needs a free GitHub account).` : "No GitHub repository set – use “Copy report” and post it yourself, or set repo in js/config.js.";
  $("#dlgReport").showModal(); $("#rName").focus();
}
function reportData() { return { name: $("#rName").value.trim(), cat: $("#rCat").value, dlc: $("#rDlc").value, level: $("#rLevel").value.trim(), price: $("#rPrice").value.trim(), notes: $("#rNotes").value.trim() }; }
function reportText(r) { return `Missing part: ${r.name}\nCategory: ${r.cat || "?"}\nContent: ${r.dlc}\nUnlock level: ${r.level || "?"}\nPrice: ${r.price ? "$" + r.price : "?"}\nNotes: ${r.notes || "-"}\n(PCBS Job Board ${(window.PCBS_CONFIG || {}).version || ""}, database ${(window.PARTS_META || {}).built || "?"})`; }
$("#btnReport").onclick = () => openReport();
$("#rSend").onclick = () => {
  const r = reportData(); if (!r.name) { $("#rName").focus(); return; }
  const repo = reportRepo(); if (!repo) { $("#rCopy").click(); return; }
  const q = new URLSearchParams({ template: "missing-part.yml", title: `[Missing part] ${r.name}`, part_name: r.name, category: r.cat, content: r.dlc, level: r.level, price: r.price, notes: r.notes, app_version: `${(window.PCBS_CONFIG || {}).version || ""} / db ${(window.PARTS_META || {}).built || ""}` });
  window.open(`https://github.com/${repo}/issues/new?${q}`, "_blank", "noopener");
  const log = LS.get("pcbs.reports", []); log.unshift({ ...r, at: Date.now() }); LS.set("pcbs.reports", log.slice(0, 100));
  $("#dlgReport").close(); toast("Report opened on GitHub – press “Create” there to submit");
};
$("#rCopy").onclick = async () => { const r = reportData(); if (!r.name) { $("#rName").focus(); return; } try { await navigator.clipboard.writeText(reportText(r)); toast("Report copied to clipboard"); } catch { prompt("Copy this report:", reportText(r)); } };
$("#rulesSave").onclick = () => {
  rules = $("#rulesTxt").value.split("\n").map(l => l.trim()).filter(Boolean).map(l => { const i = l.lastIndexOf(":"); return i > 0 ? { task: l.slice(0, i).trim(), keys: l.slice(i + 1).split(",").map(s => s.trim()).filter(Boolean) } : null; }).filter(Boolean);
  LS.set("pcbs.rules", rules); $("#dlgRules").close(); toast("Rules saved");
};
$("#rulesReset").onclick = () => { $("#rulesTxt").value = rulesToText(DEFAULT_RULES); };

// ================= export / import =================
$("#btnExport").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify({ version: 2, jobs, rules, crops, partsHistory, dlc: dlcOn, gameVersion }, null, 1)], { type: "application/json" })); a.download = "pcbs-jobs-backup.json"; a.click(); };
$("#btnImport").onclick = () => $("#importFile").click();
$("#importFile").onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { try { const d = JSON.parse(t); jobs = d.jobs || []; if (d.rules) rules = d.rules; if (d.crops) crops = d.crops; if (d.partsHistory) partsHistory = d.partsHistory.map(p => typeof p === "string" ? { name: p, cat: categorize(p) } : p); const seen = new Set(); jobs.forEach(j => { if (j.table && seen.has(j.table)) j.table = 0; else if (j.table) seen.add(j.table); }); LS.set("pcbs.rules", rules); LS.set("pcbs.crops", crops); LS.set("pcbs.partsHistory", partsHistory); buildIndex(); save(); render(); toast("Backup imported"); } catch { toast("That file isn't a valid backup"); } }); e.target.value = ""; };

if (!window.PARTS_DB) toast("parts-db.js not found next to this page – part suggestions limited to names you've typed.");
buildIndex(); initAutocomplete(); render(); setStatus();
