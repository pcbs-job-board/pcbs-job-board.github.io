/* The board: moving jobs between tables, clicks and keys on the cards, drag & drop, Undo notices (toast). */
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
      cat0 = catData(f.querySelector('[data-f="cat"]').value);
    if (!nw) {
      f.querySelector('[data-f="new"]').focus();
      return;
    }
    let ed = f.dataset.edit && j.swaps.find(x => x.id === f.dataset.edit);
    let old = ed && o === "keep" ? ed.old : j.components[o]?.name || "";
    // CPU cooler ↔ CPU block (custom water cooling): picking one replaces the other, the PC has only one of the two
    const cooling = c => c && (c.cat === "CPU Cooler" || wcKind(c) === "CPU Block");
    let cat = cat0;
    const nwIx = ixByName(nw);
    if (cooling(nwIx)) {
      cat = nwIx.cat;
      const cur = j.components.find(cooling);
      if (!old && cur && cur.name !== nw) old = cur.name;
    }
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
