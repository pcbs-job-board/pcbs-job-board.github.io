/* Keyboard shortcuts – based on a two-level idea: pick a job card with the arrow keys,
   then act on it with single keys. Shortcuts never fire while typing in a field. */
const KEYMAP = [
  { group: "Anywhere", keys: [
    ["C", "Capture job (reads the email)"], ["M", "New manual job"], ["Shift + C", "Connect / change screen"],
    ["S", "Settings"], ["?", "Show this list"], ["Esc", "Close window · leave a text field"]] },
  { group: "Choosing a job", keys: [
    ["← → ↑ ↓", "Move between job cards (tables and open jobs)"], ["Home / End", "First / last job"]] },
  { group: "Selected job", keys: [
    ["1 / 2 / 3", "Put on Table 1 / 2 / 3 (again = back to open jobs)"], ["0", "Back to open jobs"],
    ["H", "Tick the next hidden objective"], ["N", "Type a new task"], ["R", "Add part replacement"],
    ["P", "📸 Capture PC parts for this job"], ["E", "Edit job"], ["Enter", "Go into the card (then Tab / Space)"],
    ["D", "Job completed (Undo stays available)"]] },
  { group: "New job window", keys: [
    ["Ctrl + Enter", "Create / save the job"], ["Alt + E", "📸 Add email capture"], ["Alt + P", "📸 Add PC parts capture"]] },
];
let keysOn = LS.get("pcbs.keys", true);
let selJob = null;

function keysHelpHtml() {
  return KEYMAP.map(g => `<h4 class="sub">${esc(g.group)}</h4><table class="keys">${g.keys.map(([k, d]) => `<tr><td>${k.split(" / ").map(x => x.split(" + ").map(y => `<kbd>${esc(y)}</kbd>`).join(" + ")).join(" / ")}</td><td>${esc(d)}</td></tr>`).join("")}</table>`).join("");
}
function cards() { return [...document.querySelectorAll("#tables .job, #queue .job")]; }
function markSel() {
  document.querySelectorAll(".job.kbsel").forEach(c => c.classList.remove("kbsel"));
  if (!selJob) return;
  const el = document.querySelector(`.job[data-job="${selJob}"]`);
  if (el) el.classList.add("kbsel"); else selJob = null;
}
function selectCard(el) { if (!el) return; selJob = el.dataset.job; markSel(); el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
// spatial move: nearest card in the pressed direction
function moveSel(dir) {
  const list = cards(); if (!list.length) return;
  const cur = list.find(c => c.dataset.job === selJob);
  if (!cur) { selectCard(list[0]); return; }
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bs = Infinity;
  for (const c of list) {
    if (c === cur) continue;
    const b = c.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2, dx = bx - ax, dy = by - ay;
    const ok = dir === "left" ? dx < -10 : dir === "right" ? dx > 10 : dir === "up" ? dy < -10 : dy > 10;
    if (!ok) continue;
    const main = dir === "left" || dir === "right" ? Math.abs(dx) : Math.abs(dy), side = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
    const s = main + side * 2.5;
    if (s < bs) { bs = s; best = c; }
  }
  if (best) selectCard(best);
}
const clickIn = (sel) => { const el = document.querySelector(`.job[data-job="${selJob}"] ${sel}`); if (el) { el.click(); return el; } };
const typing = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) && !(el.tagName === "INPUT" && /checkbox|radio|button/.test(el.type));

document.addEventListener("keydown", e => {
  if (!keysOn || e.defaultPrevented) return;
  const t = e.target, review = $("#dlgReview").open, anyDlg = [...document.querySelectorAll("dialog")].some(d => d.open);
  // new-job window
  if (review) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("#fSave")?.click(); return; }
    if (e.altKey && e.code === "KeyE") { e.preventDefault(); $("#btnCapEmail")?.click(); return; }
    if (e.altKey && e.code === "KeyP") { e.preventDefault(); $("#btnCapParts")?.click(); return; }
    return;
  }
  if (anyDlg) return;
  if (typing(t)) {
    if (e.key === "Escape" && !document.querySelector("#ac:not([hidden])")) { const card = t.closest(".job"); t.blur(); if (card) selectCard(card); }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, j = selJob && jobs.find(x => x.id === selJob);
  const act = fn => { e.preventDefault(); fn(); };
  switch (true) {
    case k === "?": return act(openKeysHelp);
    case k === "c" && e.shiftKey: return act(() => $("#btnShare").click());
    case k === "c": return act(() => $("#btnCapture").click());
    case k === "m": return act(() => $("#btnManual").click());
    case k === "s": return act(() => $("#btnSettings").click());
    case k === "ArrowLeft": return act(() => moveSel("left"));
    case k === "ArrowRight": return act(() => moveSel("right"));
    case k === "ArrowUp": return act(() => moveSel("up"));
    case k === "ArrowDown": return act(() => moveSel("down"));
    case k === "Home": return act(() => selectCard(cards()[0]));
    case k === "End": return act(() => selectCard(cards().slice(-1)[0]));
    case k === "Escape": return act(() => { selJob = null; markSel(); });
  }
  if (!j) return;
  switch (true) {
    case ["1", "2", "3"].includes(k): return act(() => { moveToTable(j, +k); save(); render(); });
    case k === "0": return act(() => { j.table = 0; save(); render(); });
    case k === "h": return act(() => { const t2 = j.tasks.find(x => x.src === "hid" && !x.done); if (t2) { t2.done = true; save(); render(); toast(`Done: ${t2.text}`, () => { t2.done = false; save(); render(); }); } });
    case k === "n": return act(() => document.querySelector(`.job[data-job="${selJob}"] [data-input="task"]`)?.focus());
    case k === "r": return act(() => clickIn('[data-act="openSwap"]:not([hidden])'));
    case k === "p": return act(() => clickIn('[data-act="addParts"]'));
    case k === "e": return act(() => clickIn('[data-act="edit"]'));
    case k === "d": return act(() => clickIn('[data-act="complete"]'));
    case k === "Enter": return act(() => { const c = document.querySelector(`.job[data-job="${selJob}"]`); (c?.querySelector('.hid input:not(:checked)') || c?.querySelector("[data-input='task']"))?.focus(); });
  }
});
// clicking a card selects it, so the keyboard continues from there
document.addEventListener("mousedown", e => { const c = e.target.closest?.(".job"); if (c && keysOn) { selJob = c.dataset.job; markSel(); } });

function openKeysHelp() { $("#keysBody").innerHTML = keysHelpHtml(); $("#dlgKeys").showModal(); }
function setKeys(v) { keysOn = v; LS.set("pcbs.keys", v); document.body.classList.toggle("keys-off", !v); if (!v) { selJob = null; markSel(); } }

// re-apply the selection after every board re-render
const _renderBoard = render;
render = function () { _renderBoard(); markSel(); };
$("#btnKeys").onclick = openKeysHelp;
setKeys(keysOn);
