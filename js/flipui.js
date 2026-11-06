/* 📦 PC Bay build – the step window, the tile and the top-bar button (logic in flip.js). */
let flipCur = null;   // the build shown in the window
const FLIP_STEPS = ["Parts", "Fix", "Hardware", "Profit"];
const money = v => v == null ? "–" : (v < 0 ? "−$" : "$") + Math.abs(Math.round(v)).toLocaleString();
const flipJob = id => jobs.find(j => j.id === id && isFlip(j));
const flipName = f => (f.parts.find(p => p.cat === "Case") || {}).name || "PC Bay build";

// ---------- top-bar button (from career level 9 – PC Bay) ----------
function flipBtnUpdate() { const b = $("#btnFlip"); if (b) b.hidden = !hasUnlock("pcBay"); }
$("#btnFlip").onclick = () => { const f = newFlip(); jobs.push(f); save(); render(); openFlip(f.id); };

// ---------- tile ----------
function flipCard(f) {
  const st = flipState(f), busy = n => jobs.some(o => o.table === n && o !== f);
  return `<article class="job flip" draggable="true" data-job="${f.id}" style="--c:${TCOL[f.table || 0]}">
    <div class="fliptag">📦 PC Bay build</div>
    <div class="top"><div class="who"><b>${esc(flipName(f))}</b><small>Step ${f.step} of 4: ${FLIP_STEPS[f.step - 1]}${st.unfixed.length ? ` · ${st.unfixed.length} broken part${st.unfixed.length > 1 ? "s" : ""} to fix` : ""}</small></div><div class="topbtns">${hintBtn(f)}</div></div>
    <div class="chips"><span class="chip">Bought ${money(st.start)}</span><span class="chip">Now ${money(st.value)}</span>${st.estValue != null && !st.scored ? `<span class="chip">Sale ~${money(st.estValue)}</span>` : ""}${st.profit != null ? `<span class="chip ${st.profit >= 0 ? "profit" : "loss"}">${st.scored ? "Profit" : "Profit ~"} ${st.profit >= 0 ? "+" : ""}${money(st.profit)}</span>` : ""}</div>
    <div class="tables">${[1, 2, 3].map(n => `<button class="${f.table === n ? "sel" : ""} ${busy(n) ? "busy" : ""}" style="--c:${TCOL[n]}" data-act="table" data-id="${f.id}" data-n="${n}" title="${f.table === n ? "Back to open jobs" : busy(n) ? "Table " + n + " is busy – swap jobs" : "Move to table " + n}">T${n}</button>`).join("")}</div>
    <div class="foot"><button class="primary" data-flip="open" data-id="${f.id}">📦 Open build</button><button data-flip="finish" data-id="${f.id}" title="Remove this build and its saved inventory">✔ Finish</button></div>
  </article>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-flip]"); if (!b) return;
  const a = b.dataset.flip;
  if (a === "open") openFlip(b.dataset.id);
  else if (a === "finish") { openFlip(b.dataset.id); flipAskFinish(); }
});

// ---------- the window ----------
function openFlip(id) {
  const f = flipJob(id); if (!f) return;
  flipCur = f; flipRender(); const d = $("#dlgFlip"); if (!d.open) d.showModal(); if (typeof warmReader === "function") warmReader();
}
function flipSave() { if (flipCur) { save(); render(); } }
function flipRender() {
  const f = flipCur, st = flipState(f), d = $("#dlgFlip");
  d.querySelector(".flipsteps").innerHTML = FLIP_STEPS.map((s, i) => `<button class="${f.step === i + 1 ? "sel" : ""} ${i + 1 < f.step ? "done" : ""}" data-fstep="${i + 1}">${i + 1}. ${s}</button>`).join("");
  d.querySelector(".flipsum").innerHTML = `<span>Bought <b>${money(st.start)}</b></span><span>Now <b>${money(st.value)}</b></span>
    <span>Sale ${st.scored ? "" : "~"}<b>${money(st.scored ? st.value : st.estValue)}</b></span><span class="${st.profit == null ? "" : st.profit >= 0 ? "profit" : "loss"}">Profit ${st.profit == null ? "<b>after the fix</b>" : `${st.scored ? "" : "~"}<b>${st.profit >= 0 ? "+" : ""}${money(st.profit)}</b>`}</span>
    <span>3DMark ${st.scored ? `<b>${f.score.toLocaleString()}</b>` : st.best ? `~<b>${st.best.toLocaleString()}</b>` : "–"}</span>${st.newCost ? `<span class="warn">New parts ${money(st.newCost)}</span>` : ""}`;
  const body = d.querySelector(".flipbody");
  body.innerHTML = [flipStep1, flipStep2, flipStep3, flipStep4][f.step - 1](f, st);
  d.querySelector(".flipback").hidden = f.step === 1;
  const nx = d.querySelector(".flipnext");
  nx.textContent = f.step < 4 ? `Next step (${["Fix", "Hardware optimisation", "Profit optimisation"][f.step - 1]}) →` : "✔ Finish build";
  nx.classList.toggle("good", f.step === 4);
  d.querySelector(".flipconfirm").hidden = true;
}
// ---------- step 1: the parts as bought ----------
function partRow(p, f) {
  const why = brokenWhy(p);
  return `<div class="fprow ${p.broken ? "broken" : ""}"><span class="cat">${esc(p.cat)}</span><span class="nm">${esc(p.name)}${p.sure === false ? ` <small class="warn">not in the parts list – check</small>` : ""}</span>
    <label class="fbrk" title="Mark as broken"><input type="checkbox" data-fp="broken" data-k="${p.id}" ${p.broken ? "checked" : ""}> broken</label>
    <input class="fval" type="number" min="0" value="${p.value ?? ""}" placeholder="$" data-fp="value" data-k="${p.id}" title="Resale value shown in the game"><button class="ghost x" data-fp="del" data-k="${p.id}" title="Remove">✕</button>
    ${why ? `<small class="why">⚠ ${esc(why)} → probably broken</small>` : ""}</div>`;
}
function flipStep1(f) {
  return `<div class="fstep">
    <p class="hint">Open the PC's <b>Resale Value</b> window in the game (look at the PC), then <b>📸 Capture</b> – or paste / drop a screenshot. Long list? Scroll it in the game and capture again; the parts are joined like PC Stats.</p>
    <div class="fcap"><button class="primary" data-fa="cap">📸 Capture Resale Value window</button><button data-fa="adjust-resale" title="Find / move the box around the Resale Value window">🎯 Adjust area</button>${f.lastShot ? `<img src="${f.lastShot}" alt="last screenshot">` : ""}<span class="fstate"></span></div>
    <div class="fgrid">${f.parts.map(p => partRow(p, f)).join("") || `<div class="hint">No parts yet.</div>`}</div>
    <div class="addrow"><input data-ac data-fa="addname" placeholder="Add a part – type to search" autocomplete="off"><input class="fval" type="number" min="0" data-fa="addval" placeholder="$"><button data-fa="add">＋</button></div>
    <label class="fstart">Resale value as bought <input type="number" min="0" data-fa="start" value="${f.startValue ?? ""}" placeholder="${f.parts.reduce((t, p) => t + (p.value || 0), 0)}"> <small>(the "Resale Value" at the top of the window – the start for the profit)</small></label></div>`;
}
// ---------- inventory panel (steps 2 + 3) ----------
function invHtml(f, cat) {
  const inv = flipInventory(f).filter(i => !cat || i.cat === cat);
  return `<div class="finv"><div class="fh">Your inventory for this build${cat ? ` – ${esc(cat)}` : ""}</div>
    <p class="hint">Open the game's <b>Inventory</b> (tick “Fits this PC” if it's there), pick a category, then <b>📸 Capture inventory</b> – one screenshot per category, scroll for more. Or type parts in. USED / NEW / BROKEN are read from the cards – check the ticks. Used parts are best: a NEW part keeps only ⅓ of its price in the sale value; BROKEN ones can't be used.</p>
    <div class="fcap"><button data-fa="capinv">📸 Capture inventory</button><button data-fa="adjust-inv" title="Find / move the box around the inventory's part cards">🎯 Adjust area</button><span class="fstate"></span></div>
    ${inv.map(i => `<div class="fprow inv ${i.taken ? "taken" : ""}"><span class="cat">${esc(i.cat)}</span><span class="nm">${esc(i.name)}${i.src === "removed" ? ` <small>(taken out of this PC)</small>` : ""}${i.taken && !i.broken ? ` <small>(in use)</small>` : ""}</span>
      ${i.src === "removed" ? `<span class="tag used">USED</span>` : i.broken ? `<span class="tag broken">BROKEN</span><button class="ghost x" data-fi="del" data-k="${i.id}" title="Remove">✕</button>` : `<label class="fbrk"><input type="checkbox" data-fi="used" data-k="${i.id}" ${i.used ? "checked" : ""}> used</label><button class="ghost x" data-fi="del" data-k="${i.id}" title="Remove">✕</button>`}</div>`).join("") || `<div class="hint">Nothing yet.</div>`}
    <div class="addrow"><input data-ac data-fa="invname" placeholder="Add a part you have – type to search" autocomplete="off"><label class="fbrk"><input type="checkbox" data-fa="invused" checked> used</label><button data-fa="invadd">＋</button></div></div>`;
}
// ---------- step 2: fix ----------
function flipStep2(f, st) {
  const broken = f.parts.filter(p => p.broken);
  if (!broken.length) return `<div class="fstep"><p class="okc">✓ No broken part found – the values all look normal.</p><p class="hint">If the game still shows "Broken part(s)", mark the part as broken in step 1 (the PC Status line in the Resale Value window).</p>${invHtml(f)}</div>`;
  const inv = flipInventory(f);
  return `<div class="fstep">${broken.map(p => {
    const fix = f.changes.find(c => c.kind === "fix" && c.old === p.id), why = brokenWhy(p);
    const cands = inv.filter(i => i.cat === p.cat && !i.taken).map(i => ({ i, fits: flipFits(st.build.filter(b => b.partId !== p.id), [{ cat: i.cat, old: "", new: i.name }]) })).sort((a, b) => b.fits - a.fits || b.i.used - a.i.used || (usedValue(b.i.name) || 0) - (usedValue(a.i.name) || 0));
    return `<div class="ffix"><div class="fh">🔧 ${esc(p.cat)}: ${esc(p.name)}</div><small class="why">${why ? `Broken: ${esc(why)}.` : "Marked as broken."} Broken parts can't be used again.</small>
      ${fix ? `<div class="fchosen">Replacement: <b>${esc(fix.name)}</b> ${fix.isNew ? `<span class="tag new">NEW</span> <small class="warn">a new part loses ~66 % of its value: you pay ${money(fix.price ?? priceOf(fix.name))}, the sale value gains ${money(usedValue(fix.name))}</small>` : `<span class="tag used">USED</span>`} <button class="ghost x" data-fx="undo" data-k="${fix.id}">✕</button></div>`
        : `<div class="fopts">${cands.map(({ i, fits }) => `<button data-fx="pick" data-part="${p.id}" data-inv="${i.id}" class="${fits ? "" : "nofit"}">${esc(i.name)} ${i.used ? `<span class="tag used">USED</span>` : `<span class="tag new">NEW</span>`}${fits ? "" : " <small>doesn't fit</small>"}</button>`).join("") || `<span class="hint">No ${esc(p.cat)} in your inventory yet – capture it or type one below.</span>`}
          <div class="addrow"><input data-ac data-fx-name="${p.id}" placeholder="Or type the replacement" value="${esc(p.name)}" autocomplete="off"><label class="fbrk"><input type="checkbox" data-fx-used="${p.id}"> used</label><button data-fx="typed" data-part="${p.id}">Use it</button></div></div>`}</div>`;
  }).join("")}${invHtml(f)}</div>`;
}
// ---------- step 3: hardware (optional) ----------
function flipStep3(f, st) {
  if (st.unfixed.length) return `<div class="fstep"><p class="warn">Fix the broken part first (step 2) – the score needs a working PC.</p></div>`;
  const ups = flipUpgrades(f), notes = flipNotes(f), hw = f.changes.filter(c => c.kind === "hw");
  return `<div class="fstep"><p class="hint">Optional: parts from your inventory that raise the 3DMark score – and so the price. Estimated with XMP on and overclocking where this PC allows it. Sets need all their parts.</p>
    ${notes.map(n => `<div class="fnote">💡 ${esc(n)}</div>`).join("")}
    <div class="fh">Now: 3DMark ~${st.best ? st.best.toLocaleString() : "–"} → sale ~${money(st.estValue)}</div>
    ${hw.length ? `<div class="fh">Your changes</div>${hw.map(c => `<div class="fprow"><span class="cat">${esc(c.cat)}</span><span class="nm">${c.oldName ? `<span class="old">${esc(c.oldName)}</span> → ` : "(add) "}${esc(c.name)} ${c.isNew ? `<span class="tag new">NEW</span>` : `<span class="tag used">USED</span>`}</span><button class="ghost x" data-fx="undo" data-k="${c.id}">✕</button></div>`).join("")}` : ""}
    <div class="fh">Suggestions from your inventory</div>
    ${ups.map((u, k) => `<div class="fup"><div><b>${esc(u.label)}</b> ${u.isNew ? `<span class="tag new">NEW – costs ${money(u.cost)}</span>` : ""}${u.psuLow ? ` <small class="warn">⚡ the PSU is too weak overclocked (needs ~${u.psuLow} W)</small>` : ""}<br><small>3DMark ~${u.score.toLocaleString()} (${u.dScore >= 0 ? "+" : ""}${u.dScore.toLocaleString()}) · sale ~${money(u.value)} · profit ${u.gain >= 0 ? "+" : ""}${money(u.gain)}</small></div><button data-fx="up" data-k="${k}">Use</button></div>`).join("") || `<div class="hint">No upgrade in your inventory helps yet – capture more categories (GPU, CPU, RAM, motherboards) below.</div>`}
    ${invHtml(f)}</div>`;
}
// ---------- step 4: software ----------
function flipStep4(f, st) {
  if (st.unfixed.length) return `<div class="fstep"><p class="warn">Fix the broken part first (step 2).</p></div>`;
  const b = st.build, s = f.soft, cpu = b.find(p => p.cat === "CPU"), gpu = b.find(p => p.cat === "GPU");
  const sc = o => flipScore(b, o), base = { xmp: s.xmp, ocCpu: s.ocCpu && st.can.ocCpu, ocGpu: s.ocGpu && st.can.ocGpu };
  const gain = k => { const on = sc({ ...base, [k]: true }), off = sc({ ...base, [k]: false }); return on != null && off != null ? on - off : 0; };
  const thr = (cat, n) => throttleOf(cat, n).c, est = ocReach(cpu?.name), gest = ocReach(gpu?.name);
  const row = (k, title, sub, ok = true, why = "") => `<label class="fsoft ${ok ? "" : "locked"}"><input type="checkbox" data-fs="${k}" ${s[k] && ok ? "checked" : ""} ${ok ? "" : "disabled"}><span><b>${title}</b><br><small>${ok ? sub : why}</small></span></label>`;
  return `<div class="fstep"><p class="hint">Do these in the game in this order, tick each one. The value only changes once 3DMark has run.</p>
    ${row("boot", "Boot to the OS", "+$100 to the resale value.")}
    ${row("xmp", "Turn on XMP in the BIOS (RAM settings)", gain("xmp") > 0 ? `3DMark +${gain("xmp").toLocaleString()}.` : "No difference on this motherboard / RAM – it's fine either way.")}
    ${row("ocCpu", "Overclock the CPU", `Aim for ~${est ? est.toLocaleString() : "?"} MHz (90 % of its potential), keep it under ${thr("CPU", cpu?.name)} °C, then run OCCT. 3DMark +${gain("ocCpu").toLocaleString()}.`, st.can.ocCpu,
      !hasUnlock("cpuOC") ? gateMsg("cpuOC").replace(/<\/?b>/g, "") + "." : `Can't overclock: ${cpu && (compatOf(cpu.name) || {}).oc === "0" ? "the CPU is locked" : "the motherboard can't overclock"}.`)}
    ${row("ocGpu", "Overclock the GPU (GPU Tuner)", `Aim for ~${gest ? gest.core.toLocaleString() : "?"} MHz core / ~${gest ? gest.mem.toLocaleString() : "?"} MHz memory, keep it under ${thr("GPU", gpu?.name)} °C. 3DMark +${gain("ocGpu").toLocaleString()}.`, st.can.ocGpu,
      !hasUnlock("gpuOC") ? gateMsg("gpuOC").replace(/<\/?b>/g, "") + "." : "No overclocking data for this GPU.")}
    ${row("bench", "Run 3DMark", `Expected ~${(sc(base) || 0).toLocaleString()} points with the ticks above. Enter the score the game shows:`)}
    <div class="addrow fscore"><input type="number" min="0" data-fa="score" placeholder="3DMark score" value="${f.score ?? ""}"><small>${f.score ? `Multiplier ×${benchMult(f.score).toFixed(2)} → resale value ${money(st.value)}` : "the multiplier goes from 1.0× at 1,000 points to 3.0× at 10,000"}</small></div>
    <p class="hint">Then add the PC Bay sticker and sell it – the auction can move the final price a little.</p></div>`;
}

// ---------- events in the window ----------
const flipDlg = $("#dlgFlip");
flipDlg.addEventListener("click", e => {
  const f = flipCur; if (!f) return;
  const t = e.target.closest("[data-fstep],[data-fa],[data-fp],[data-fi],[data-fx],.flipnext,.flipback,.flipmin,.flipyes,.flipno"); if (!t) return;
  if (t.dataset.fstep) { f.step = +t.dataset.fstep; }
  else if (t.classList.contains("flipback")) f.step = Math.max(1, f.step - 1);
  else if (t.classList.contains("flipnext")) { if (f.step === 4) { flipAskFinish(); return; } f.step++; }
  else if (t.classList.contains("flipmin")) { flipSave(); flipDlg.close(); toast("Build saved – open it from its tile any time"); return; }
  else if (t.classList.contains("flipyes")) { const i = jobs.indexOf(f); jobs.splice(i, 1); flipCur = null; save(); render(); flipDlg.close(); toast("Build finished – it and its inventory were removed"); return; }
  else if (t.classList.contains("flipno")) { flipDlg.querySelector(".flipconfirm").hidden = true; return; }
  else if (t.dataset.fa === "cap") { flipCapture("resale"); return; }
  else if (t.dataset.fa === "capinv") { flipCapture("inv"); return; }
  else if (t.dataset.fa === "adjust-resale" || t.dataset.fa === "adjust-inv") { flipAdjust(t.dataset.fa.slice(7)); return; }
  else if (t.dataset.fa === "add") { const n = flipDlg.querySelector('[data-fa="addname"]').value.trim(); if (!n) return; const m = INDEX.find(p => p.name === n) || bestPartMatch(n); const v = flipDlg.querySelector('[data-fa="addval"]').value; f.parts.push({ id: flipUid(), cat: m ? m.cat : categorize(n), name: m ? m.name : n, value: v === "" ? usedValue(m ? m.name : n) : +v, src: "typed", sure: !!m }); markBroken(f); }
  else if (t.dataset.fa === "invadd") { const n = flipDlg.querySelector('[data-fa="invname"]').value.trim(); if (!n) return; const m = INDEX.find(p => p.name === n) || bestPartMatch(n); f.inv.push({ id: flipUid(), cat: m ? m.cat : categorize(n), name: m ? m.name : n, used: flipDlg.querySelector('[data-fa="invused"]').checked, src: "typed" }); }
  else if (t.dataset.fp === "del") { f.parts = f.parts.filter(p => p.id !== t.dataset.k); f.changes = f.changes.filter(c => c.old !== t.dataset.k); }
  else if (t.dataset.fi === "del") { f.inv = f.inv.filter(i => i.id !== t.dataset.k); f.changes = f.changes.filter(c => c.invId !== t.dataset.k); }
  else if (t.dataset.fx === "pick") { const i = flipInventory(f).find(x => x.id === t.dataset.inv); if (i) flipChange(f, { kind: "fix", old: t.dataset.part, cat: i.cat, name: i.name, invId: i.id, isNew: !i.used, price: i.used ? null : priceOf(i.name) }); }
  else if (t.dataset.fx === "typed") { const k = t.dataset.part, n = flipDlg.querySelector(`[data-fx-name="${k}"]`).value.trim(); if (!n) return; const m = INDEX.find(p => p.name === n) || bestPartMatch(n), p = f.parts.find(x => x.id === k), used = flipDlg.querySelector(`[data-fx-used="${k}"]`).checked; flipChange(f, { kind: "fix", old: k, cat: m ? m.cat : p.cat, name: m ? m.name : n, isNew: !used, price: used ? null : priceOf(m ? m.name : n) }); }
  else if (t.dataset.fx === "undo") flipUnchange(f, t.dataset.k);
  else if (t.dataset.fx === "up") { const u = flipUpgrades(f)[+t.dataset.k]; if (!u) return; for (const x of u.items) { const old = x.old ? f.parts.find(p => p.name === x.old.name && p.cat === x.old.cat && !f.changes.some(c => c.old === p.id)) : null; flipChange(f, { kind: "hw", old: old ? old.id : "", oldName: x.old ? x.old.name : "", cat: x.inv.cat, name: x.inv.name, invId: x.inv.id, isNew: !x.inv.used, price: x.inv.used ? null : priceOf(x.inv.name) }); } }
  else return;
  flipSave(); flipRender();
});
flipDlg.addEventListener("change", e => {
  const f = flipCur, t = e.target; if (!f) return;
  if (t.dataset.fp === "value") { const p = f.parts.find(x => x.id === t.dataset.k); p.value = t.value === "" ? null : +t.value; if (p.brokenManual == null) markBroken(f); }
  else if (t.dataset.fp === "broken") { const p = f.parts.find(x => x.id === t.dataset.k); p.broken = t.checked; p.brokenManual = t.checked; if (!t.checked) f.changes = f.changes.filter(c => !(c.kind === "fix" && c.old === p.id)); }
  else if (t.dataset.fi === "used") { const i = f.inv.find(x => x.id === t.dataset.k); i.used = t.checked; f.changes.filter(c => c.invId === i.id).forEach(c => { c.isNew = !i.used; c.price = i.used ? null : priceOf(i.name); }); }
  else if (t.dataset.fa === "start") f.startValue = t.value === "" ? null : +t.value;
  else if (t.dataset.fa === "score") { f.score = t.value === "" ? null : +t.value; if (f.score) f.soft.bench = true; }
  else if (t.dataset.fs) { f.soft[t.dataset.fs] = t.checked; if (t.dataset.fs !== "bench" && t.dataset.fs !== "boot") { f.soft.bench = false; f.score = null; } }
  else return;
  flipSave(); flipRender();
});
function flipAskFinish() { const c = flipDlg.querySelector(".flipconfirm"); c.hidden = false; c.querySelector(".flipno").focus(); }
flipDlg.addEventListener("close", () => { flipCur = null; });

// ---------- screenshots ----------
const flipLast = {};   // newest screenshot per area (in memory only) – read again after "🎯 Adjust area"
async function flipImage(url, kind, again) {
  const f = flipCur; if (!f) return;
  const st = flipDlg.querySelector(".fstate"); if (st) st.textContent = "Reading…";
  try {
    const img = new Image(); img.src = url; await img.decode();
    flipLast[kind] = url; lastFrame[kind] = url;
    // first capture of this kind: find the window in the big set-up window first (like email / PC Stats)
    if (!areasSet[kind] && !again) { openAreas(kind, img, ok => { if (ok) flipImage(url, kind, true); else if (st) st.textContent = ""; }); return; }
    if (kind === "resale") {
      const r = parseResale((await readText(cropCanvas(img, crops.resale))).lines);
      if (!r.items.length) { if (st) st.innerHTML = '⚠ No Resale Value window found – is it open in the game (look at the PC)? Box in the wrong place? <button data-fa="adjust-resale">🎯 Adjust area</button>'; return; }
      f.shots = [...(f.shots || []), r.items.map(i => ({ ...i }))];
      const merged = mergePCStats(f.shots), typed = f.parts.filter(p => p.src === "typed");
      const keep = new Map(f.parts.map(p => [p.cat + "|" + p.name, p]));
      f.parts = [...merged.map(i => { const old = keep.get(i.cat + "|" + i.name); return { id: old ? old.id : flipUid(), cat: i.cat, name: i.name, value: i.value, sure: i.sure, src: "capture", broken: old ? old.broken : false, brokenManual: old ? old.brokenManual : null }; }), ...typed];
      if (f.startValue == null && r.total != null && f.shots.length === 1) f.startValue = r.total;
      if (r.score && f.step === 4) { f.score = r.score; f.soft.bench = true; }
      markBroken(f); f.lastShot = flipThumb(img);
      toast(`Read ${r.items.length} parts${r.total != null ? ` · resale value $${r.total}` : ""}`);
    } else {
      const items = await readInventory(img, crops.inv, (i, n) => { if (st) st.textContent = `Reading the inventory… column ${i} of ${n}`; });
      if (!items.length) { if (st) st.innerHTML = '⚠ No inventory cards found – is the Inventory open in the game? Box in the wrong place? <button data-fa="adjust-inv">🎯 Adjust area</button>'; return; }
      for (const i of items) f.inv.push({ id: flipUid(), cat: i.cat, name: i.name, used: i.used, broken: !!i.broken, price: i.price, src: "capture" });
      const nb = items.filter(i => i.broken).length, nn = items.filter(i => !i.used && !i.broken).length;
      toast(`Added ${items.length} part${items.length > 1 ? "s" : ""} from the inventory${nn ? ` · ${nn} new` : ""}${nb ? ` · ${nb} broken (can't be used)` : ""}`);
    }
    flipSave(); flipRender();
  } catch (err) { if (st) st.textContent = "⚠ " + (err.message || "Couldn't read the screenshot"); }
}
// 🎯 Adjust area: the set-up window on the newest screenshot (or the live screen); then that screenshot is read again
async function flipAdjust(kind) {
  let src = flipLast[kind] || null;
  if (!src && typeof stream !== "undefined" && stream) src = (await grabFrame()).url;
  if (!src && lastFrame[kind]) src = lastFrame[kind];
  if (!src) { areasSet[kind] = false; LS.set("pcbs.areasSet", areasSet); renderAreaStatus(); toast(`No screenshot yet – the ${AREA_NAME[kind]} area is set up on your next capture.`); return; }
  const im = new Image(); im.src = src; await im.decode().catch(() => { });
  openAreas(kind, im, ok => { if (ok && flipLast[kind]) flipImage(flipLast[kind], kind, true); });
}
function flipThumb(img) { const c = document.createElement("canvas"), w = 320; c.width = w; c.height = Math.round(img.naturalHeight / img.naturalWidth * w); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", 0.7); }
async function flipCapture(kind) {
  if (!stream) { toast("Connect the game screen first – or paste / drop a screenshot here."); return; }
  const fr = await grabFrame(); flipImage(fr.url, kind);
}
// paste / drop while the window is open: step 1 = Resale Value window, otherwise the inventory
function flipTakeImage(url) { if (!flipDlg.open || !flipCur) return false; flipImage(url, flipCur.step === 1 ? "resale" : "inv"); return true; }
