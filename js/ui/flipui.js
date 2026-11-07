/* 📦 PC Bay build – the step window, the tile and the top-bar button (logic in flip.js). */
// shown on every estimated (~) 3DMark / sale figure
const EST_NOTE = "~ = a rough estimate – the 3DMark score and sale price in the game can differ slightly";
let flipCur = null; // the build shown in the window
const FLIP_STEPS = ["Parts", "Fix", "Hardware", "Profit"];
const money = v => (v == null ? "–" : (v < 0 ? "−$" : "$") + Math.abs(Math.round(v)).toLocaleString());
const flipJob = id => jobs.find(j => j.id === id && isFlip(j));
const flipName = f => (f.parts.find(p => p.cat === "Case") || {}).name || "PC Bay build";

// ---------- top-bar button (from career level 9 – PC Bay) ----------
function flipBtnUpdate() {
  const b = $("#btnFlip");
  if (b) b.hidden = !hasUnlock("pcBay");
}
$("#btnFlip").onclick = () => {
  const f = newFlip();
  jobs.push(f);
  save();
  render();
  openFlip(f.id);
};

// ---------- tile ----------
function flipCard(f) {
  const st = flipState(f),
    busy = n => jobs.some(o => o.table === n && o !== f);
  return `<article class="job flip" draggable="true" data-job="${f.id}" style="--c:${TCOL[f.table || 0]}">
    <div class="fliptag">📦 PC Bay build</div>
    <div class="top"><div class="who"><b>${esc(flipName(f))}</b><small>Step ${f.step} of 4: ${FLIP_STEPS[f.step - 1]}${st.unfixed.length ? ` · ${st.unfixed.length} broken part${st.unfixed.length > 1 ? "s" : ""} to fix` : ""}</small></div><div class="topbtns">${hintBtn(f)}</div></div>
    <div class="chips"><span class="chip">Bought ${money(st.start)}</span><span class="chip">Now ${money(st.value)}</span>${st.estValue != null && !st.scored ? `<span class="chip" title="${EST_NOTE}">Sale ~${money(st.estValue)}</span>` : ""}${st.profit != null ? `<span class="chip ${st.profit >= 0 ? "profit" : "loss"}">${st.scored ? "Profit" : "Profit ~"} ${st.profit >= 0 ? "+" : ""}${money(st.profit)}</span>` : ""}</div>
    <div class="tables">${[1, 2, 3].map(n => `<button class="${f.table === n ? "sel" : ""} ${busy(n) ? "busy" : ""}" style="--c:${TCOL[n]}" data-act="table" data-id="${f.id}" data-n="${n}" title="${f.table === n ? "Back to open jobs" : busy(n) ? "Table " + n + " is busy – swap jobs" : "Move to table " + n}">T${n}</button>`).join("")}</div>
    <div class="foot"><button class="primary" data-flip="open" data-id="${f.id}">📦 Open build</button><button data-flip="finish" data-id="${f.id}" title="Remove this build and its saved inventory">✔ Finish</button></div>
  </article>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-flip]");
  if (!b) return;
  const a = b.dataset.flip;
  if (a === "open") openFlip(b.dataset.id);
  else if (a === "finish") {
    openFlip(b.dataset.id);
    flipAskFinish();
  }
});

// ---------- the window ----------
function openFlip(id) {
  const f = flipJob(id);
  if (!f) return;
  flipCur = f;
  flipInvTab = null; // the inventory opens on its first tab
  flipRender();
  const d = $("#dlgFlip");
  if (!d.open) d.showModal();
  if (typeof warmReader === "function") warmReader();
}
function flipSave() {
  if (flipCur) {
    save();
    render();
  }
}
// redraw `old` as `neu`, except the element `keep` (and the path down to it), which stays the same node; false = the
// two don't line up (then the caller redraws it all)
function patchAround(old, neu, keep) {
  const a = [...old.childNodes],
    b = [...neu.childNodes];
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === keep) continue;
    if (a[i].nodeType === 1 && a[i].contains(keep)) {
      if (a[i].tagName !== b[i].tagName || !patchAround(a[i], b[i], keep)) return false;
    } else a[i].replaceWith(b[i]);
  }
  return true;
}
function flipRender() {
  const f = flipCur,
    st = flipState(f),
    d = $("#dlgFlip");
  d.querySelector(".flipsteps").innerHTML = FLIP_STEPS.map(
    (s, i) =>
      `<button class="${f.step === i + 1 ? "sel" : ""} ${i + 1 < f.step ? "done" : ""}" data-fstep="${i + 1}">${i + 1}. ${s}</button>`
  ).join("");
  d.querySelector(".flipsum").innerHTML = `<span>Bought <b>${money(st.start)}</b></span><span>Now <b>${money(st.value)}</b></span>
    <span ${st.scored ? "" : `title="${EST_NOTE}"`}>Sale ${st.scored ? "" : "~"}<b>${money(st.scored ? st.value : st.estValue)}</b></span><span class="${st.profit == null ? "" : st.profit >= 0 ? "profit" : "loss"}">Profit ${st.profit == null ? `<b>${st.unfixed.length ? "after the fix" : "when the PC is complete"}</b>` : `${st.scored ? "" : "~"}<b>${st.profit >= 0 ? "+" : ""}${money(st.profit)}</b>`}</span>
    <span ${st.scored ? "" : `title="${EST_NOTE}"`}>3DMark ${st.scored ? `<b>${f.score.toLocaleString()}</b>` : st.best ? `~<b>${st.best.toLocaleString()}</b>` : "–"}</span>${!st.scored && (st.best || st.estValue != null) ? `<span class="estnote">~ rough estimates</span>` : ""}${st.newCost ? `<span class="warn">New parts ${money(st.newCost)}</span>` : ""}`;
  const body = d.querySelector(".flipbody"),
    html = [flipStep1, flipStep2, flipStep3, flipStep4][f.step - 1](f, st),
    typing = document.activeElement?.matches?.("#dlgFlip input[data-oc]") ? document.activeElement : null;
  // an overclock field being typed in must stay put (focus, caret): redraw everything around it, not the field itself
  if (typing) {
    const t = document.createElement("div");
    t.innerHTML = html;
    if (!patchAround(body, t, typing)) body.innerHTML = html;
  } else body.innerHTML = html;
  d.querySelector(".flipback").hidden = f.step === 1;
  const sw = d.querySelector(".fnewsw");
  sw.hidden = f.step === 4; // parts are changed in steps 1–3
  sw.querySelector("input").checked = !!f.allowNew;
  const nx = d.querySelector(".flipnext"),
    ready = flipCheck(st.build).ok;
  d.querySelector('[data-fstep="4"]').disabled = !ready && f.step !== 4;
  nx.textContent =
    f.step === 3 && !ready
      ? "Complete the PC first"
      : f.step < 4
        ? `Next step (${["Fix", "Hardware optimisation", "Profit optimisation"][f.step - 1]}) →`
        : "✔ Finish build";
  nx.disabled = f.step === 3 && !ready;
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
// ---------- the PC as it is now (steps 2 + 3): every part, each can be taken out ----------
const catRank = c => {
  const i = PART_ORDER.indexOf(c === "Water Cooling" ? "WC:CPU Block" : c);
  return i < 0 ? 99 : i;
};
const byCat = (a, b) => catRank(a.cat) - catRank(b.cat);
const rowKey = r => (r.changed ? "c:" + r.changed : "p:" + r.partId);
// "Overclock Unlocked": a CPU or motherboard that can overclock (unlocked CPU / overclocking chipset)
const ocTag = (cat, name) =>
  (cat === "CPU" || cat === "Motherboard") && (compatOf(name) || {}).oc === "1"
    ? ` <span class="tag oc" title="This ${cat === "CPU" ? "CPU" : "motherboard"} can overclock">Overclock Unlocked</span>`
    : "";
function pcNowHtml(f, st, readOnly = false) {
  const rows = [...st.build].sort(byCat);
  return `<div class="fh">${readOnly ? "The PC's parts" : "This PC now <small>(✕ takes a part out – a working one goes back to the inventory)</small>"}</div>
    ${
      rows
        .map(r => {
          const c = r.changed && f.changes.find(x => x.id === r.changed);
          const tag = r.broken
            ? `<span class="tag broken">BROKEN</span>`
            : c
              ? c.isNew
                ? `<span class="tag new">NEW</span>`
                : `<span class="tag used">USED</span>`
              : `<small>(came with it)</small>`;
          return `<div class="fprow now"><span class="cat">${esc(CAT_LABEL[r.cat] || r.cat)}</span><span class="nm">${esc(r.name)} ${tag}${ocTag(r.cat, r.name)}</span>${readOnly ? "<span></span>" : `<button class="ghost x" data-fr="rm" data-k="${rowKey(r)}" title="Take it out">✕</button>`}</div>`;
        })
        .join("") || `<div class="hint">No parts – put some in from your inventory below.</div>`
    }`;
}
// what still stops the Profit step
function checkHtml(chk) {
  if (chk.ok) return `<div class="fcheck ok">✓ Complete PC – everything fits. Ready for the Profit step.</div>`;
  const l = [
    chk.missing.length && `Missing: <b>${chk.missing.map(esc).join(", ")}</b>`,
    ...chk.extra.map(x => `Too many: ${esc(x)}`),
    ...chk.broken.map(x => `Broken: ${esc(x)} – replace it or take it out`),
    ...chk.issues.map(x => `Doesn't fit – ${esc(x)}`),
    chk.power && `⚡ Power: ${esc(chk.power)}`,
  ].filter(Boolean);
  return `<div class="fcheck"><b>Before the Profit step</b> (PC Bay buyers want a complete PC that works: case, motherboard, CPU, CPU cooling, 1–4 RAM sticks, 1–2 GPUs, PSU, storage):<ul>${l.map(x => `<li>${x}</li>`).join("")}</ul></div>`;
}
// ---------- inventory panel (steps 2 + 3): by category; ＋ Use puts a part in (in place of the one of its kind) ----------
// newest scan first; the parts of one scan keep their order; parts saved before 0.14.3 (no scan time) below, as they were
const invOrder = list =>
  list
    .map((i, k) => ({ i, k }))
    .sort((a, b) => (b.i.at || 0) - (a.i.at || 0) || (a.i.n || 0) - (b.i.n || 0) || a.k - b.k)
    .map(x => x.i);
let flipInvTab = null; // the inventory's open category tab (while the window is open)
function invHtml(f) {
  const inv = flipInventory(f),
    cats = [...new Set([...inv].sort(byCat).map(i => i.cat))]; // only categories that have parts
  if (!cats.includes(flipInvTab)) flipInvTab = cats[0] || null;
  const rows = invOrder(inv.filter(i => i.cat === flipInvTab));
  return `<div class="finv"><div class="fh">Your inventory for this build</div>
    <p class="hint">Open the game's <b>Inventory</b> (tick “Fits this PC” if it's there), pick a category, then <b>📸 Capture inventory</b> – one screenshot per category, scroll for more. Or type parts in. USED / NEW / BROKEN are read from the cards – check the ticks. Used parts are best: a NEW part keeps only ⅓ of its price in the sale value; BROKEN ones can't be used.</p>
    <div class="fcap"><button data-fa="capinv">📸 Capture inventory</button><button data-fa="adjust-inv" title="Find / move the box around the inventory's part cards">🎯 Adjust area</button><span class="fstate"></span></div>
    ${
      cats.length
        ? `<div class="pdbtabs finvtabs" role="tablist">${cats
            .map(cat => {
              const free = inv.filter(i => i.cat === cat && !i.taken).length;
              return `<button class="pdbtab${cat === flipInvTab ? " on" : ""}" role="tab" data-fitab="${esc(cat)}" aria-pressed="${cat === flipInvTab}" title="${free} free">${esc(CAT_LABEL[cat] || cat)} <small>${free}</small></button>`;
            })
            .join("")}</div>
    ${rows
      .map(
        i => `<div class="fprow inv ${i.taken ? "taken" : ""}"><span class="nm">${esc(i.name)}${ocTag(i.cat, i.name)}${i.src === "removed" ? ` <small>(taken out of this PC)</small>` : ""}${i.taken && !i.broken ? ` <small>(in use)</small>` : ""}</span>
      ${i.taken ? "" : `<button class="fuse" data-fi="use" data-k="${i.id}" title="Put it in this PC${ONE_SLOT.includes(i.cat) ? " – in place of the one in it" : ""}">＋ Use</button>`}
      ${i.src === "removed" ? `<span class="tag used">USED</span>` : i.broken ? `<span class="tag broken">BROKEN</span><button class="ghost x" data-fi="del" data-k="${i.id}" title="Remove">✕</button>` : `<label class="fbrk"><input type="checkbox" data-fi="used" data-k="${i.id}" ${i.used ? "checked" : ""}> used</label><button class="ghost x" data-fi="del" data-k="${i.id}" title="Remove">✕</button>`}</div>`
      )
      .join("")}`
        : `<div class="hint">Nothing yet.</div>`
    }
    <div class="addrow"><input data-ac data-fa="invname" placeholder="Add a part you have – type to search" autocomplete="off"><label class="fbrk"><input type="checkbox" data-fa="invused" checked> used</label><button data-fa="invadd">＋</button></div></div>`;
}
const ONE_SLOT = ["Case", "Motherboard", "CPU", "CPU Cooler", "PSU"];
// the assistant's results, worked out again only when the build / inventory changes (or ↻)
let flipCache = { key: "", plan: null, ups: null };
function flipAdvice(f) {
  const key = JSON.stringify([f.id, f.parts, f.inv, f.changes, career.level, !!f.allowNew]);
  if (flipCache.key !== key) flipCache = { key, plan: flipPlan(f), ups: flipUpgrades(f) };
  return flipCache;
}
// ---------- step 2: fix ----------
function flipStep2(f, st) {
  const broken = f.parts.filter(p => p.broken);
  if (!broken.length)
    return `<div class="fstep"><p class="okc">✓ No broken part found – the values all look normal.</p><p class="hint">If the game still shows "Broken part(s)", mark the part as broken in step 1 (the PC Status line in the Resale Value window).</p>${pcNowHtml(f, st)}${invHtml(f)}</div>`;
  const inv = flipInventory(f);
  return `<div class="fstep">${broken
    .map(p => {
      const fix = f.changes.find(c => c.kind === "fix" && c.old === p.id),
        why = brokenWhy(p);
      const newHidden = f.allowNew ? 0 : inv.filter(i => i.cat === p.cat && !i.taken && !i.used).length;
      const cands = inv
        .filter(i => i.cat === p.cat && !i.taken && (f.allowNew || i.used))
        .map(i => ({
          i,
          fits: flipFits(
            st.build.filter(b => b.partId !== p.id),
            [{ cat: i.cat, old: "", new: i.name }]
          ),
        }))
        .sort((a, b) => b.fits - a.fits || b.i.used - a.i.used || (usedValue(b.i.name) || 0) - (usedValue(a.i.name) || 0));
      return `<div class="ffix"><div class="fh">🔧 ${esc(p.cat)}: ${esc(p.name)}</div><small class="why">${why ? `Broken: ${esc(why)}.` : "Marked as broken."} Broken parts can't be used again.</small>
      ${
        fix
          ? `<div class="fchosen">Replacement: <b>${esc(fix.name)}</b> ${fix.isNew ? `<span class="tag new">NEW</span> <small class="warn">a new part loses ~66 % of its value: you pay ${money(fix.price ?? priceOf(fix.name))}, the sale value gains ${money(usedValue(fix.name))}</small>` : `<span class="tag used">USED</span>`} <button class="ghost x" data-fx="undo" data-k="${fix.id}">✕</button></div>`
          : `<div class="fopts">${cands.map(({ i, fits }) => `<button data-fx="pick" data-part="${p.id}" data-inv="${i.id}" class="${fits ? "" : "nofit"}">${esc(i.name)} ${i.used ? `<span class="tag used">USED</span>` : `<span class="tag new">NEW</span>`}${fits ? "" : " <small>doesn't fit</small>"}</button>`).join("") || `<span class="hint">${newHidden ? `No used ${esc(p.cat)} in your inventory – ${newHidden} new one${newHidden > 1 ? "s" : ""} left out (switch on <b>Suggest NEW parts</b> below), or type one.` : `No ${esc(p.cat)} in your inventory yet – capture it or type one below.`}</span>`}${cands.length && newHidden ? `<small class="hint">${newHidden} new one${newHidden > 1 ? "s" : ""} left out – <b>Suggest NEW parts</b> below.</small>` : ""}
          <div class="addrow"><input data-ac data-fx-name="${p.id}" placeholder="Or type the replacement" value="${esc(p.name)}" autocomplete="off"><label class="fbrk"><input type="checkbox" data-fx-used="${p.id}"> used</label><button data-fx="typed" data-part="${p.id}">Use it</button></div></div>`
      }</div>`;
    })
    .join("")}${pcNowHtml(f, st)}${invHtml(f)}</div>`;
}
// ---------- step 3: hardware – the build assistant ----------
function flipStep3(f, st) {
  const { plan, ups } = flipAdvice(f),
    notes = flipNotes(f),
    chk = flipCheck(st.build);
  const sc = v => (v == null ? "–" : "~" + v.toLocaleString()),
    plus = v => `${v >= 0 ? "+" : ""}${money(v)}`;
  const planBox = plan.steps.length
    ? `<div class="fplan"><div><b>Best build from your inventory</b> – ${plan.steps.length} change${plan.steps.length > 1 ? "s" : ""}:<ol>${plan.steps.map(x => `<li>${esc(x.label)} <small>(${plus(x.gain)})</small></li>`).join("")}</ol>
      <small>3DMark ${sc(plan.score)} · sale ~${money(plan.value)}${plan.cost ? ` · new parts ${money(plan.cost)}` : ""} · profit ${plus(plan.gain)}${plan.check.ok ? " · complete PC ✓" : ` · still: ${esc([...plan.check.missing.map(m => "no " + m), ...plan.check.issues, plan.check.power].filter(Boolean).join("; "))}`}</small></div><button class="primary" data-fx="plan">Use all</button></div>`
    : `<div class="hint">${chk.ok ? "Nothing in your inventory makes this PC worth more." : "Nothing in your inventory fills the gaps – capture or type the missing parts into the inventory below."}</div>`;
  return `<div class="fstep"><p class="hint">Put parts in and take them out as you like. The assistant looks for the most profitable PC that works, from your inventory – estimated with XMP on and overclocking where the PC allows it. 3DMark and sale figures are rough estimates – the game's can differ slightly.</p>
    ${notes.map(n => `<div class="fnote">💡 ${esc(n)}</div>`).join("")}
    ${checkHtml(chk)}
    <div class="fh">Now: 3DMark ${sc(st.best)} → sale ~${money(st.estValue)} <button class="ghost fref" data-fa="refresh" title="Work out the suggestions again">↻ Refresh</button></div>
    ${planBox}
    <div class="fh">Single changes</div>
    ${
      ups
        .slice(0, 10)
        .map(
          (u, k) =>
            `<div class="fup"><div><b>${esc(u.label)}</b> ${u.isNew ? `<span class="tag new">NEW – costs ${money(u.cost)}</span>` : ""}<br><small>3DMark ${sc(u.score)}${u.dScore != null ? ` (${u.dScore >= 0 ? "+" : ""}${u.dScore.toLocaleString()})` : ""} · sale ~${money(u.value)} · profit ${plus(u.gain)}${u.check.bad < chk.bad ? " · fills a gap" : ""}</small></div><button data-fx="up" data-k="${k}">Use</button></div>`
        )
        .join("") || `<div class="hint">No single change helps.</div>`
    }
    ${pcNowHtml(f, st)}
    ${invHtml(f)}</div>`;
}
// ---------- step 4: software ----------
function flipStep4(f, st) {
  const chk = flipCheck(st.build);
  if (!chk.ok)
    return `<div class="fstep">${checkHtml(chk)}<p class="hint">Go back to step 3 (Hardware) to complete the PC.</p></div>`;
  const b = st.build,
    s = f.soft,
    cpu = b.find(p => p.cat === "CPU"),
    gpu = b.find(p => p.cat === "GPU");
  const oco = flipOcOpts(f, b),
    sc = o => flipScore(b, { ...oco, ...o }),
    base = { xmp: s.xmp, ocCpu: s.ocCpu && st.can.ocCpu, ocGpu: s.ocGpu && st.can.ocGpu };
  const gain = k => {
    const on = sc({ ...base, [k]: true }),
      off = sc({ ...base, [k]: false });
    return on != null && off != null ? on - off : 0;
  };
  const thr = (cat, n) => throttleOf(cat, n).c,
    est = ocReach(cpu?.name),
    gest = ocReach(gpu?.name),
    cs = ocSettings(cpu?.name),
    gs = ocSettings(gpu?.name),
    set = f.ocSet || {};
  // what the player actually set, if they couldn't reach the suggestion – the estimates follow every change
  const mine = (cs || gs) && (st.can.ocCpu || st.can.ocGpu);
  const ownCpu =
    cs && st.can.ocCpu
      ? (() => {
          const m = set.mult || cs.mult,
            v = ocSettings(cpu.name, m * 100)?.volt;
          return `<div class="focset">CPU multiplier ×<input type="number" min="1" max="80" step="1" data-oc="mult" value="${m}"> = ${(m * 100).toLocaleString()} MHz${v ? ` · needs about ${v.toFixed(2)} V` : ""}</div>`;
        })()
      : "";
  const ownGpu =
    gs && st.can.ocGpu
      ? `<div class="focset">GPU core <input type="number" min="0" step="1" data-oc="core" value="${set.core || gs.core}"> MHz · memory <input type="number" min="0" step="1" data-oc="mem" value="${set.mem || gs.mem}"> MHz</div>`
      : "";
  const row = (k, title, sub, ok = true, why = "") =>
    `<label class="fsoft ${ok ? "" : "locked"}"><input type="checkbox" data-fs="${k}" ${s[k] && ok ? "checked" : ""} ${ok ? "" : "disabled"}><span><b>${title}</b><br><small>${ok ? sub : why}</small></span></label>`;
  return `<div class="fstep">${pcNowHtml(f, st, true)}<p class="hint">Do these in the game in this order, tick each one. The value only changes once 3DMark has run.</p>
    ${row("boot", "Boot to the OS", "+$100 to the resale value.")}
    ${row("xmp", "Turn on XMP in the BIOS (RAM settings)", gain("xmp") > 0 ? `3DMark +${gain("xmp").toLocaleString()}.` : "No difference on this motherboard / RAM – it's fine either way.")}
    ${row(
      "ocCpu",
      "Overclock the CPU",
      cs
        ? `BIOS: base clock 100 MHz, CPU multiplier ×${cs.mult} (${cs.mhz.toLocaleString()} MHz)${cs.volt ? `, core voltage ${cs.volt.toFixed(2)} V` : ""} – 90 % of its potential (${est.toLocaleString()} MHz). Keep it under ${thr("CPU", cpu?.name)} °C, then run OCCT; too hot or unstable → one step lower. 3DMark +${gain("ocCpu").toLocaleString()}.`
        : `Aim for ~${est ? est.toLocaleString() : "?"} MHz (90 % of its potential), keep it under ${thr("CPU", cpu?.name)} °C, then run OCCT. 3DMark +${gain("ocCpu").toLocaleString()}.`,
      st.can.ocCpu,
      !hasUnlock("cpuOC")
        ? gateMsg("cpuOC").replace(/<\/?b>/g, "") + "."
        : `Can't overclock: ${cpu && (compatOf(cpu.name) || {}).oc === "0" ? "the CPU is locked" : "the motherboard can't overclock"}.`
    )}
    ${row(
      "ocGpu",
      "Overclock the GPU (GPU Tuner)",
      gs
        ? `GPU Tuner: core clock ${gs.core.toLocaleString()} MHz (+${gs.dCore}), memory clock ${gs.mem.toLocaleString()} MHz (+${gs.dMem}), ${powerLimitTxt(gs).replace(/<\/?b>/g, "")} – 90 % of its potential${b.filter(p => p.cat === "GPU").length > 1 ? ", the same on both cards" : ""}. Keep it under ${thr("GPU", gpu?.name)} °C. 3DMark +${gain("ocGpu").toLocaleString()}.`
        : `Aim for ~${gest ? gest.core.toLocaleString() : "?"} MHz core / ~${gest ? gest.mem.toLocaleString() : "?"} MHz memory, keep it under ${thr("GPU", gpu?.name)} °C. 3DMark +${gain("ocGpu").toLocaleString()}.`,
      st.can.ocGpu,
      !hasUnlock("gpuOC") ? gateMsg("gpuOC").replace(/<\/?b>/g, "") + "." : "No overclocking data for this GPU."
    )}
    ${
      mine && (ownCpu || ownGpu)
        ? `<div class="focbox"><b>Couldn't reach the suggested overclock?</b> <small>Enter what you set – the 3DMark, sale and profit estimates follow.</small>${ownCpu}${ownGpu}<button class="ghost" data-fa="ocreset" ${f.ocSet ? "" : "hidden"}>↺ Back to the suggestion</button></div>`
        : ""
    }
    ${row("bench", "Run 3DMark", `Expected ~${(sc(base) || 0).toLocaleString()} points with the ticks above – a rough estimate, the game's score can differ slightly. Enter the score the game shows (the sale value then uses it):`)}
    <div class="addrow fscore"><input type="number" min="0" data-fa="score" placeholder="3DMark score" value="${f.score ?? ""}"><small>${f.score ? `Multiplier ×${benchMult(f.score).toFixed(2)} → resale value ${money(st.value)}` : "the multiplier goes from 1.0× at 1,000 points to 3.0× at 10,000"}</small></div>
    <p class="hint">Then add the PC Bay sticker and sell it – the auction can move the final price a little.</p></div>`;
}

// ---------- events in the window ----------
const flipDlg = $("#dlgFlip");
flipDlg.addEventListener("click", e => {
  const f = flipCur;
  if (!f) return;
  const t = e.target.closest(
    "[data-fstep],[data-fa],[data-fp],[data-fi],[data-fx],[data-fr],[data-fitab],.flipnext,.flipback,.flipmin,.flipyes,.flipno"
  );
  if (!t) return;
  if (t.disabled) return;
  if (t.dataset.fitab) {
    flipInvTab = t.dataset.fitab;
    flipRender();
    return;
  }
  if (t.dataset.fstep) {
    f.step = +t.dataset.fstep;
  } else if (t.classList.contains("flipback")) f.step = Math.max(1, f.step - 1);
  else if (t.classList.contains("flipnext")) {
    if (f.step === 4) {
      flipAskFinish();
      return;
    }
    f.step++;
  } else if (t.classList.contains("flipmin")) {
    flipSave();
    flipDlg.close();
    toast("Build saved – open it from its tile any time");
    return;
  } else if (t.classList.contains("flipyes")) {
    const i = jobs.indexOf(f);
    jobs.splice(i, 1);
    flipCur = null;
    save();
    render();
    flipDlg.close();
    toast("Build finished – it and its inventory were removed");
    return;
  } else if (t.classList.contains("flipno")) {
    flipDlg.querySelector(".flipconfirm").hidden = true;
    return;
  } else if (t.dataset.fa === "cap") {
    flipCapture("resale");
    return;
  } else if (t.dataset.fa === "capinv") {
    flipCapture("inv");
    return;
  } else if (t.dataset.fa === "adjust-resale" || t.dataset.fa === "adjust-inv") {
    flipAdjust(t.dataset.fa.slice(7));
    return;
  } else if (t.dataset.fa === "add") {
    const n = flipDlg.querySelector('[data-fa="addname"]').value.trim();
    if (!n) return;
    const m = INDEX.find(p => p.name === n) || bestPartMatch(n);
    const v = flipDlg.querySelector('[data-fa="addval"]').value;
    f.parts.push({
      id: flipUid(),
      cat: m ? m.cat : categorize(n),
      name: m ? m.name : n,
      value: v === "" ? usedValue(m ? m.name : n) : +v,
      src: "typed",
      sure: !!m,
    });
    markBroken(f);
  } else if (t.dataset.fa === "invadd") {
    const n = flipDlg.querySelector('[data-fa="invname"]').value.trim();
    if (!n) return;
    const m = INDEX.find(p => p.name === n) || bestPartMatch(n);
    const cat = m ? m.cat : categorize(n);
    f.inv.push({
      id: flipUid(),
      cat,
      name: m ? m.name : n,
      used: flipDlg.querySelector('[data-fa="invused"]').checked,
      src: "typed",
      at: Date.now(),
      n: 0,
    });
    flipInvTab = cat; // show it
  } else if (t.dataset.fp === "del") {
    f.parts = f.parts.filter(p => p.id !== t.dataset.k);
    f.changes = f.changes.filter(c => c.old !== t.dataset.k);
  } else if (t.dataset.fi === "del") {
    f.inv = f.inv.filter(i => i.id !== t.dataset.k);
    f.changes = f.changes.filter(c => c.invId !== t.dataset.k);
  } else if (t.dataset.fx === "pick") {
    const i = flipInventory(f).find(x => x.id === t.dataset.inv);
    if (i)
      flipChange(f, {
        kind: "fix",
        old: t.dataset.part,
        cat: i.cat,
        name: i.name,
        invId: i.id,
        isNew: !i.used,
        price: i.used ? null : priceOf(i.name),
      });
  } else if (t.dataset.fx === "typed") {
    const k = t.dataset.part,
      n = flipDlg.querySelector(`[data-fx-name="${k}"]`).value.trim();
    if (!n) return;
    const m = INDEX.find(p => p.name === n) || bestPartMatch(n),
      p = f.parts.find(x => x.id === k),
      used = flipDlg.querySelector(`[data-fx-used="${k}"]`).checked;
    flipChange(f, {
      kind: "fix",
      old: k,
      cat: m ? m.cat : p.cat,
      name: m ? m.name : n,
      isNew: !used,
      price: used ? null : priceOf(m ? m.name : n),
    });
  } else if (t.dataset.fx === "undo") flipUnchange(f, t.dataset.k);
  else if (t.dataset.fx === "up" || t.dataset.fx === "plan") {
    const a = flipAdvice(f),
      u = t.dataset.fx === "plan" ? a.plan : a.ups[+t.dataset.k];
    if (!u) return;
    flipApply(f, u.build);
  } else if (t.dataset.fr === "rm") {
    const r = flipBuild(f).find(x => rowKey(x) === t.dataset.k);
    if (r) flipRemove(f, r);
  } else if (t.dataset.fi === "use") {
    const i = flipInventory(f).find(x => x.id === t.dataset.k),
      b = flipBuild(f);
    if (!i || i.taken) return;
    const old = ONE_SLOT.includes(i.cat) ? b.find(p => (i.cat === "CPU Cooler" ? isCooling(p) : p.cat === i.cat)) || null : null;
    flipApply(f, flipApplyItems(b, [{ inv: i, old }]));
  } else if (t.dataset.fa === "ocreset") {
    delete f.ocSet;
  } else if (t.dataset.fa === "refresh") {
    flipCache.key = "";
    toast("Suggestions worked out again");
  } else return;
  flipSave();
  flipRender();
});
// the Profit step's own overclock values: every edit updates the 3DMark / sale / profit estimates
flipDlg.addEventListener("input", e => {
  const f = flipCur,
    t = e.target;
  if (!f || !t.dataset?.oc) return;
  const v = Math.round(+t.value);
  if (!(v > 0)) return; // half-typed / empty: wait
  f.ocSet = { ...(f.ocSet || {}), [t.dataset.oc]: v };
  flipSave();
  flipRender();
});
flipDlg.addEventListener("change", e => {
  const f = flipCur,
    t = e.target;
  if (!f) return;
  if (t.classList.contains("flipnewsw")) {
    f.allowNew = t.checked;
    flipSave();
    flipRender();
    toast(t.checked ? "Suggestions now include NEW parts from your inventory" : "Suggestions use only USED parts again");
    return;
  }
  if (t.dataset.fp === "value") {
    const p = f.parts.find(x => x.id === t.dataset.k);
    p.value = t.value === "" ? null : +t.value;
    if (p.brokenManual == null) markBroken(f);
  } else if (t.dataset.fp === "broken") {
    const p = f.parts.find(x => x.id === t.dataset.k);
    p.broken = t.checked;
    p.brokenManual = t.checked;
    if (!t.checked) f.changes = f.changes.filter(c => !(c.kind === "fix" && c.old === p.id));
  } else if (t.dataset.fi === "used") {
    const i = f.inv.find(x => x.id === t.dataset.k);
    i.used = t.checked;
    f.changes
      .filter(c => c.invId === i.id)
      .forEach(c => {
        c.isNew = !i.used;
        c.price = i.used ? null : priceOf(i.name);
      });
  } else if (t.dataset.fa === "start") f.startValue = t.value === "" ? null : +t.value;
  else if (t.dataset.fa === "score") {
    f.score = t.value === "" ? null : +t.value;
    if (f.score) f.soft.bench = true;
  } else if (t.dataset.fs) {
    f.soft[t.dataset.fs] = t.checked;
    if (t.dataset.fs !== "bench" && t.dataset.fs !== "boot") {
      f.soft.bench = false;
      f.score = null;
    }
  } else return;
  flipSave();
  flipRender();
});
function flipAskFinish() {
  const c = flipDlg.querySelector(".flipconfirm");
  c.hidden = false;
  c.querySelector(".flipno").focus();
}
flipDlg.addEventListener("close", () => {
  flipCur = null;
});

// ---------- screenshots ----------
const flipLast = {}; // newest screenshot per area (in memory only) – read again after "🎯 Adjust area"
async function flipImage(url, kind, again) {
  const f = flipCur;
  if (!f) return;
  const st = flipDlg.querySelector(".fstate");
  if (st) st.textContent = "Reading…";
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    flipLast[kind] = url;
    lastFrame[kind] = url;
    // first capture of this kind: find the window in the big set-up window first (like email / PC Stats)
    if (!areasSet[kind] && !again) {
      openAreas(kind, img, ok => {
        if (ok) flipImage(url, kind, true);
        else if (st) st.textContent = "";
      });
      return;
    }
    if (kind === "resale") {
      const r = parseResale((await readText(cropCanvas(img, crops.resale))).lines);
      if (!r.items.length) {
        if (st)
          st.innerHTML =
            '⚠ No Resale Value window found – is it open in the game (look at the PC)? Box in the wrong place? <button data-fa="adjust-resale">🎯 Adjust area</button>';
        return;
      }
      f.shots = [...(f.shots || []), r.items.map(i => ({ ...i }))];
      const merged = mergePCStats(f.shots),
        typed = f.parts.filter(p => p.src === "typed");
      const keep = new Map(f.parts.map(p => [p.cat + "|" + p.name, p]));
      f.parts = [
        ...merged.map(i => {
          const old = keep.get(i.cat + "|" + i.name);
          return {
            id: old ? old.id : flipUid(),
            cat: i.cat,
            name: i.name,
            value: i.value,
            sure: i.sure,
            src: "capture",
            broken: old ? old.broken : false,
            brokenManual: old ? old.brokenManual : null,
          };
        }),
        ...typed,
      ];
      if (f.startValue == null && r.total != null && f.shots.length === 1) f.startValue = r.total;
      if (r.score && f.step === 4) {
        f.score = r.score;
        f.soft.bench = true;
      }
      markBroken(f);
      f.lastShot = flipThumb(img);
      toast(`Read ${r.items.length} parts${r.total != null ? ` · resale value $${r.total}` : ""}`);
    } else {
      const items = await readInventory(img, crops.inv, (i, n) => {
        if (st) st.textContent = `Reading the inventory… column ${i} of ${n}`;
      });
      if (!items.length) {
        if (st)
          st.innerHTML =
            '⚠ No inventory cards found – is the Inventory open in the game? Box in the wrong place? <button data-fa="adjust-inv">🎯 Adjust area</button>';
        return;
      }
      const at = Date.now();
      items.forEach((i, n) =>
        f.inv.push({
          id: flipUid(),
          cat: i.cat,
          name: i.name,
          used: i.used,
          broken: !!i.broken,
          price: i.price,
          src: "capture",
          at,
          n,
        })
      );
      // switch to the tab of what was scanned (one category per screenshot; the most common one if it's mixed)
      const cnt = {};
      for (const i of items) cnt[i.cat] = (cnt[i.cat] || 0) + 1;
      flipInvTab = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
      const nb = items.filter(i => i.broken).length,
        nn = items.filter(i => !i.used && !i.broken).length;
      toast(
        `Added ${items.length} part${items.length > 1 ? "s" : ""} from the inventory${nn ? ` · ${nn} new` : ""}${nb ? ` · ${nb} broken (can't be used)` : ""}`
      );
    }
    flipSave();
    flipRender();
  } catch (err) {
    if (st) st.textContent = "⚠ " + (err.message || "Couldn't read the screenshot");
  }
}
// 🎯 Adjust area: the set-up window on the newest screenshot (or the live screen); then that screenshot is read again
async function flipAdjust(kind) {
  let src = flipLast[kind] || null;
  if (!src && typeof stream !== "undefined" && stream) src = (await grabFrame()).url;
  if (!src && lastFrame[kind]) src = lastFrame[kind];
  if (!src) {
    areasSet[kind] = false;
    LS.set("pcbs.areasSet", areasSet);
    renderAreaStatus();
    toast(`No screenshot yet – the ${AREA_NAME[kind]} area is set up on your next capture.`);
    return;
  }
  const im = new Image();
  im.src = src;
  await im.decode().catch(() => {});
  openAreas(kind, im, ok => {
    if (ok && flipLast[kind]) flipImage(flipLast[kind], kind, true);
  });
}
function flipThumb(img) {
  const c = document.createElement("canvas"),
    w = 320;
  c.width = w;
  c.height = Math.round((img.naturalHeight / img.naturalWidth) * w);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}
async function flipCapture(kind) {
  if (!stream) {
    toast("Connect the game screen first – or paste / drop a screenshot here.");
    return;
  }
  const fr = await grabFrame();
  flipImage(fr.url, kind);
}
// paste / drop while the window is open: step 1 = Resale Value window, otherwise the inventory
function flipTakeImage(url) {
  if (!flipDlg.open || !flipCur) return false;
  flipImage(url, flipCur.step === 1 ? "resale" : "inv");
  return true;
}

// a whole inventory screenshot (browser): the 3 card columns of the "inv" area → [{name, cat, price, used, broken}]
async function readInventory(img, grid, onStep) {
  const W = img.naturalWidth || img.width,
    H = img.naturalHeight || img.height,
    fc = document.createElement("canvas");
  fc.width = W;
  fc.height = H;
  const fg = fc.getContext("2d", { willReadFrequently: true });
  fg.drawImage(img, 0, 0);
  const pd = fg.getImageData(0, 0, W, H).data;
  const px = (x, y) => {
    const i = (Math.min(H - 1, Math.max(0, Math.round(y * H))) * W + Math.min(W - 1, Math.max(0, Math.round(x * W)))) * 4;
    return [pd[i], pd[i + 1], pd[i + 2]];
  };
  const items = [];
  const cols = invColumns(grid);
  for (const [ci, b] of cols.entries()) {
    if (onStep) onStep(ci + 1, cols.length);
    const c = cropCanvas(img, b),
      got = parseInventoryColumn((await readText(c)).lines);
    for (const it of got) {
      if (it.nameY != null) {
        const L = cardLabels(px, b.x, b.w, b.y + (it.nameY / c.height) * b.h, W, H);
        it.used = L.used;
        it.broken = L.broken;
        // not broken but the price reads far too low → misread, the used value it must be
        const u = usedValue(it.name);
        if (!it.broken && u != null && it.price <= u * 0.4) it.price = u;
      } else it.used = true;
      items.push(it);
    }
  }
  return items;
}
