/* PCBS Job Board – Suggested swaps in the job window: worked out from the form (with a "working on it" line, reused when nothing changed) and ticked into the job. */
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
    if (!o || sg.key === skipKey || sg.key === "plan") return;
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
  let list = [],
    plan = null;
  try {
    if (input) list = suggestSwaps(input.job, input.opts);
    if (input) plan = suggestPlan(input.job, input.opts);
  } catch (e) {
    console.warn("suggestions", e);
  }
  // 0.15.0: one set for the whole job first; the options for each objective fold away under it when the set covers
  // everything (still there to pick from), and stay open when it can't
  const pi = list.length;
  rev.sugg = plan ? [...list, plan] : list;
  rev.suggKey = key;
  if (!list.length) {
    box.innerHTML = "";
    return;
  }
  const money = o => (o.total != null ? "$" + o.total.toLocaleString() : "");
  const planHtml = plan
    ? `<div class="sugg splan"><div class="sreason">for: <b>${esc(plan.reason)}</b></div>${planOptHtml(plan.options[0], pi, 0, "plan|" + plan.options[0].swaps.map(x => x.new).join("+"), keep)}
      ${plan.met.map(m => `<small class="smet">✓ ${esc(m.reason)} – ${esc(m.note)}</small>`).join("")}
      ${plan.left.map(m => `<small class="sleft">✗ not in the set: <b>${esc(m.reason)}</b>${m.why ? " – " + esc(m.why) : ""}</small>`).join("")}</div>`
    : "";
  const fold = plan && !plan.left.length;
  box.innerHTML =
    `<div class="sugghead"><label>💡 Suggested swaps <small>(tick one to add it – nothing is added by itself)</small></label><button class="ghost" id="suggRefresh" title="Work out all suggestions again">↻ Refresh</button></div>` +
    planHtml +
    (fold
      ? `<details class="sothers"><summary>Options for each objective (${list.length})</summary>`
      : plan
        ? `<div class="sothhead">Options for each objective</div>`
        : "") +
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
      ${rankHtml(o.rank)}
      ${o.removeOld?.length ? `<small class="sextra">+ take out ${o.removeOld.length} old stick${o.removeOld.length > 1 ? "s" : ""}</small>` : ""}</span><b class="sprice">${money(o)}</b></label>`;
            })
            .join("")
        : `<div class="hint ${sg.met ? "smetline" : ""}" style="margin:2px 0">${sg.met ? "✓ " : ""}${esc(sg.hint || "No unlocked part fits – check the budget, your career level or the parts list.")}</div>`
    }</div>`
      )
      .join("") +
    (fold ? "</details>" : "");
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
      // the whole-job set and the single suggestions would add the same parts twice: one or the other
      if (c.checked && plan)
        box
          .querySelectorAll(+c.dataset.sg === pi ? `input[data-sg]:not([data-sg="${pi}"])` : `input[data-sg="${pi}"]`)
          .forEach(o => (o.checked = false));
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
// "X or better": the in-game part ranking of the part asked for, the customer's and the suggested one
function rankHtml(r) {
  if (!r) return "";
  const n = x => (x == null ? "?" : x.toLocaleString());
  return `<small class="srank">Part ranking: ${r.want != null ? `asked for <b>${n(r.want)}</b>` : ""}${r.cur != null ? `${r.want != null ? " · " : ""}current <b>${n(r.cur)}</b>` : ""} · new <b class="${r.now >= (r.want ?? r.cur ?? 0) ? "ok" : "bad"}">${n(r.now)}</b></small>`;
}
// the whole-job set: every part with the objective(s) it is for
function planOptHtml(o, i, k, pick, keep) {
  return `<label class="sopt multi plan ${o.over ? "over" : ""}"><input type="checkbox" data-sg="${i}" data-so="${k}" data-pick="${esc(pick)}" ${keep.has(pick) ? "checked" : ""}>
    <span><span class="sname"><b>${esc(o.name)}</b>${o.score != null ? ` → score <b class="bscore">${o.score.toLocaleString()}</b>` : ""}</span>
    <small class="stag">${o.nParts > 1 ? `one tick adds <b>all ${o.nParts} parts</b> below` : o.nParts ? "one tick adds the part below" : "no parts needed"}${o.lvl ? ` · up to Lv ${o.lvl}` : ""}${o.over ? ` · <b class="overtag">over budget</b>` : ""}</small>
    <ul class="sset">${o.parts.map(x => `<li><span class="scat">${esc(x.cat)}</span> ${x.old ? `<span class="old">${esc(x.old)}</span> → ` : `<span class="old">(add)</span> `}<span class="new">${esc(x.new)}</span>${x.price != null ? ` <small>$${x.price}</small>` : ""}${x.for.length ? `<small class="sfor">for: ${esc(x.for.join(" · "))}${x.note ? ` <i>(${esc(x.note)})</i>` : ""}</small>` : ""}${rankHtml(x.rank)}</li>`).join("")}</ul>
    ${(o.tasks || []).map(t => `<small class="sextra">+ task: ${esc(t)}</small>`).join("")}${o.removeOld?.length ? `<small class="sextra">+ take out ${o.removeOld.length} old stick${o.removeOld.length > 1 ? "s" : ""}</small>` : ""}</span><b class="sprice">${o.total ? "$" + o.total.toLocaleString() : "free"}</b></label>`;
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
    fj.swaps = replaceSwaps(fj.swaps, picked.swaps).swaps; // a ticked part for a slot with a planned swap takes its place
    fj.tasks.push(...picked.tasks);
  } else {
    const fields = {
      sender: $("#fSender").value.trim(),
      subject: $("#fSubject").value.trim(),
      labour: $("#fLabour").value === "" ? null : +$("#fLabour").value,
      budget: $("#fBudget").value === "" ? null : +$("#fBudget").value,
      level: $("#fLevel").value === "" ? null : +$("#fLevel").value,
      stars: $("#fStars").value === "" ? null : +$("#fStars").value,
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
      target.swaps = replaceSwaps(target.swaps, picked.swaps).swaps;
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
      target = { ...fields, table: 0, id: d.id, tasks, swaps: picked.swaps, brands, created: Date.now() };
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
