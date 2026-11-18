/* 📦 PC Bay build card on the board (0.17.0): what the build's current step needs, kept about as small as a job card –
   1 Parts: the parts as bought (broken ones marked), 2 Fix: each broken part with its replacement or how many parts in
   the inventory could replace it, 3 Hardware: the PC now with the parts put in + the assistant's remaining changes and
   what they gain, 4 Profit: the finished PC and the steps in the game (boot, XMP, overclock, 3DMark) – tickable here. */
const FC_ROWS = 9; // part rows shown before "+ N more"
// one line per part; the same part twice → "2 ×"
function fcParts(rows) {
  const out = [];
  for (const r of rows) {
    const k = [r.cat, r.name, r.cls, r.tag].join("|"),
      same = out.find(o => o.k === k);
    if (same) same.n++;
    else out.push({ ...r, k, n: 1 });
  }
  const shown = out.slice(0, out.length > FC_ROWS ? FC_ROWS - 1 : FC_ROWS),
    rest = out.slice(shown.length).reduce((t, r) => t + r.n, 0);
  return `<div class="fcparts">${shown
    .map(
      r =>
        `<div class="fcrow ${r.cls || ""}"><span class="cat">${esc(CAT_LABEL[r.cat] || r.cat)}</span><span class="nm"><span class="n">${r.n > 1 ? `<b>${r.n} ×</b> ` : ""}${esc(r.name)}</span>${r.tag || ""}</span>${r.val != null ? `<span class="v">${money(r.val)}</span>` : ""}</div>`
    )
    .join(
      ""
    )}${rest ? `<div class="fcmore">+ ${rest} more part${rest > 1 ? "s" : ""} – open the build to see all</div>` : ""}</div>`;
}
const fcTag = (t, txt) => `<span class="tag ${t}">${txt || t.toUpperCase()}</span>`;
// the PC as it is now: parts put in shown in green with what they replaced
function fcBuild(f, st) {
  return fcParts(
    [...st.build].sort(byCat).map(r => {
      const c = r.changed && f.changes.find(x => x.id === r.changed);
      return {
        cat: r.cat,
        name: r.name,
        cls: r.broken ? "broken" : c ? "put" : "",
        tag: r.broken ? fcTag("broken") : c ? fcTag(c.isNew ? "new" : "used") : "",
      };
    })
  );
}
// the assistant's plan for a card: worked out once per build state (several cards on the board share no cache)
const fcPlans = new Map();
function fcPlan(f) {
  const key = JSON.stringify([f.parts, f.inv, f.changes, career.level, !!f.allowNew]);
  const c = fcPlans.get(f.id);
  if (c && c.key === key) return c.plan;
  let plan = null;
  try {
    plan = flipPlan(f);
  } catch {
    plan = null;
  }
  fcPlans.set(f.id, { key, plan });
  return plan;
}
function fcStep1(f) {
  if (!f.parts.length)
    return `<div class="fcempty">No parts yet – open the build and capture the PC's <b>Resale Value</b> window.</div>`;
  const broken = f.parts.filter(p => p.broken).length;
  return `<div class="fch">Parts as bought <small>${f.parts.length} part${f.parts.length > 1 ? "s" : ""}${broken ? ` · <span class="bad">${broken} broken</span>` : " · nothing broken"}</small></div>
    ${fcParts(
      [...f.parts]
        .sort((a, b) => b.broken - a.broken || byCat(a, b))
        .map(p => ({
          cat: p.cat,
          name: p.name,
          cls: p.broken ? "broken" : "",
          tag: p.broken ? fcTag("broken") : "",
          val: p.value,
        }))
    )}`;
}
function fcStep2(f, st) {
  const broken = f.parts.filter(p => p.broken);
  if (!broken.length) return `<div class="fcok">✓ Nothing broken – go on to Hardware.</div>`;
  const inv = flipInventory(f),
    done = broken.length - st.unfixed.length;
  return `<div class="fch">Broken parts <small>${done} of ${broken.length} fixed</small></div><div class="fcfix">${broken
    .map(p => {
      const fix = f.changes.find(c => c.kind === "fix" && c.old === p.id),
        gone = f.changes.find(c => c.kind === "rm" && c.old === p.id);
      const free = inv.filter(i => i.cat === p.cat && !i.taken),
        used = free.filter(i => i.used).length,
        n = f.allowNew ? free.length : used,
        newOnly = free.length - used;
      const what = fix
        ? `<span class="good">${SWAP_ARROW} ${esc(fix.name)}</span> ${fcTag(fix.isNew ? "new" : "used")}`
        : gone
          ? `<span class="good">Removed – no replacement needed</span>`
          : n
            ? `<span class="warn">${n} repair option${n > 1 ? "s" : ""} in your inventory${f.allowNew && newOnly ? ` (${newOnly} new)` : ""}</span>`
            : `<span class="bad">No ${esc(CAT_LABEL[p.cat] || p.cat)} in your inventory${newOnly ? ` – ${newOnly} new one${newOnly > 1 ? "s" : ""} left out` : " yet"}</span>`;
      return `<div class="fcfixrow ${fix || gone ? "done" : ""}"><span class="ic">${fix || gone ? "✓" : "🔧"}</span><div><span class="cat">${esc(CAT_LABEL[p.cat] || p.cat)}</span> <s>${esc(p.name)}</s><br>${what}</div></div>`;
    })
    .join("")}</div>`;
}
function fcStep3(f, st) {
  const chk = flipCheck(st.build),
    plan = fcPlan(f),
    sc = v => (v == null ? "–" : "~" + v.toLocaleString());
  const put = f.changes.filter(c => c.kind !== "rm").length;
  const left = plan && plan.changes.length;
  const gains = plan
    ? left
      ? `<div class="fcgain"><b>${left} suggested change${left > 1 ? "s" : ""} left</b><ul>${plan.changes
          .slice(0, 3)
          .map(x => `<li>${esc(x.text)}</li>`)
          .join(
            ""
          )}${left > 3 ? `<li class="more">+ ${left - 3} more</li>` : ""}</ul><small>3DMark ${sc(plan.from.score)} → <b>${sc(plan.score)}</b> · sale ~${money(plan.from.value)} → <b>~${money(plan.value)}</b> · profit <b class="${plan.gain >= 0 ? "good" : "bad"}">${plan.gain >= 0 ? "+" : ""}${money(plan.gain)}</b></small></div>`
      : `<div class="fcok">✓ ${chk.ok ? "Nothing in your inventory makes it worth more." : "No suggested change left."}</div>`
    : "";
  // what still stops the Profit step, one short line each (the window has the details)
  const gaps = chk.ok
    ? ""
    : `<ul class="fcwarn">${[
        chk.missing.length && "Missing: " + chk.missing.join(", "),
        ...chk.broken.map(x => "Broken: " + x),
        ...chk.issues.map(x => "Doesn't fit – " + x),
        ...chk.extra.map(x => "Too many: " + x),
        chk.power && "Power: " + chk.power,
      ]
        .filter(Boolean)
        .map(x => `<li>⚠ ${esc(x)}</li>`)
        .join("")}</ul>`;
  return `<div class="fch">This PC now <small>${put ? `${put} part${put > 1 ? "s" : ""} put in · ` : ""}3DMark ${sc(st.best)}</small></div>${fcBuild(f, st)}${gaps}${gains}`;
}
function fcStep4(f, st) {
  const chk = flipCheck(st.build);
  if (!chk.ok) return `<div class="fcwarn">⚠ The PC isn't complete – go back to Hardware.</div>${fcBuild(f, st)}`;
  const s = f.soft,
    steps = [
      ["boot", "Boot to the OS", "+$100"],
      ["xmp", "Turn on XMP", ""],
      st.can.ocCpu && ["ocCpu", "Overclock the CPU", ""],
      st.can.ocGpu && ["ocGpu", "Overclock the GPU", ""],
      [
        "bench",
        "Run 3DMark",
        s.bench && f.score ? f.score.toLocaleString() + " points" : st.best ? `~${st.best.toLocaleString()} expected` : "",
      ],
    ].filter(Boolean);
  const done = steps.filter(([k]) => s[k]).length;
  return `<div class="fch">Finished PC <small>${st.build.length} parts</small></div>${fcBuild(f, st)}
    <div class="fch">In the game <small>${done} of ${steps.length} done</small></div><div class="fcsoft">${steps
      .map(
        ([k, t, note]) =>
          `<label class="fcs ${s[k] ? "done" : ""}"><input type="checkbox" data-fcs="${k}" data-id="${f.id}" ${s[k] ? "checked" : ""} style="accent-color:var(--good)"><span>${t}</span>${note ? `<small>${esc(note)}</small>` : ""}</label>`
      )
      .join("")}</div>`;
}
function flipCard(f) {
  const st = flipState(f),
    body = [fcStep1, fcStep2, fcStep3, fcStep4][f.step - 1](f, st);
  // the four steps as a bar: done ones filled, the current one lit
  const bar = FLIP_STEPS.map(
    (s, i) => `<span class="${i + 1 < f.step ? "done" : i + 1 === f.step ? "cur" : ""}"><i></i>${i + 1}. ${s}</span>`
  ).join("");
  return `<article class="job flip" draggable="true" data-job="${f.id}" style="--c:${TCOL[f.table || 0]}">
    <div class="fliptag">📦 PC Bay build</div>
    <div class="top"><div class="who"><b>${esc(flipName(f))}</b><small>Step ${f.step} of 4: ${FLIP_STEPS[f.step - 1]}${st.unfixed.length ? ` · ${st.unfixed.length} broken part${st.unfixed.length > 1 ? "s" : ""} to fix` : ""}</small></div><div class="topbtns">${hintBtn(f)}</div></div>
    <div class="chips"><span class="chip">Bought ${money(st.start)}</span><span class="chip">Now ${money(st.value)}</span>${st.estValue != null && !st.scored ? `<span class="chip" title="${EST_NOTE}">Sale ~${money(st.estValue)}</span>` : ""}${st.profit != null ? `<span class="chip ${st.profit >= 0 ? "profit" : "loss"}">${st.scored ? "Profit" : "Profit ~"} ${st.profit >= 0 ? "+" : ""}${money(st.profit)}</span>` : ""}</div>
    ${tableBtns(f)}
    <div class="fcbar" role="img" aria-label="Step ${f.step} of 4: ${FLIP_STEPS[f.step - 1]}">${bar}</div>
    <div class="fcbody">${body}</div>
    <div class="foot"><button class="primary" data-flip="open" data-id="${f.id}">📦 Open build</button><button data-flip="finish" data-id="${f.id}" title="Remove this build and its saved inventory">✔ Finish</button></div>
  </article>`;
}
// Profit step on the card: ticking a step in the game is the same as in the window
document.addEventListener("change", e => {
  const c = e.target.closest?.("[data-fcs]");
  if (!c) return;
  const f = flipJob(c.dataset.id);
  if (!f) return;
  f.soft[c.dataset.fcs] = c.checked;
  save();
  render();
});
