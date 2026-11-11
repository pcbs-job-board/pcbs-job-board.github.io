/* 📦 PC Bay build window – clicks, inputs and closing (the steps are drawn in window.js). */
// ---------- events in the window ----------
const flipDlg = $("#dlgFlip");
flipDlg.addEventListener(
  "toggle",
  e => {
    const g = e.target.dataset?.fg;
    if (g) e.target.open ? flipOpenGroups.add(g) : flipOpenGroups.delete(g);
  },
  true
);
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
  else if (t.dataset.fx === "newopt") {
    const o = flipAdvice(f).opts[+t.dataset.k];
    if (o) flipApply(f, o.build);
  } else if (t.dataset.fx === "up" || t.dataset.fx === "plan") {
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
  } else if (t.dataset.fa === "ocenough") {
    // the "just enough for 10,000" values: into the "Couldn't reach it?" fields, and the ticks to match
    const st2 = flipState(f),
      e = flipEnough(st2.build, st2.can);
    if (e && !e.none && !e.unreachable) {
      // a part left at stock gets its stock values, so every estimate (the header too) leaves its overclock out
      const cd = ocOf(st2.build.find(p => p.cat === "CPU")?.name || ""),
        gd = ocOf(st2.build.find(p => p.cat === "GPU")?.name || "");
      f.ocSet = {};
      if (e.mult) f.ocSet.mult = e.mult;
      else if (st2.can.ocCpu && cd && cd.mhz) f.ocSet.mult = Math.floor(cd.mhz / 100);
      if (e.core) Object.assign(f.ocSet, { core: e.core, mem: e.mem });
      else if (st2.can.ocGpu && gd && gd.core != null) Object.assign(f.ocSet, { core: gd.core, mem: gd.mem });
      f.soft.ocCpu = !!e.mult;
      f.soft.ocGpu = !!e.core;
    }
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
