/* Hidden-objective rules window – a simple table instead of one big text box.
   Each rule is still stored as { task, keys: ["word", "-exception"], off? }, so saved rules,
   backups and the parser are unchanged: "add when" = keys, "ignore when" = keys starting with "-". */
const SMART_ROWS = [
  ["cables", "🔌 Cable requests", "“braided red cables”, “saw … cables on PC Bay” → change all cables"],
  ["coolant", "💧 Coolant colour", "“blue coolant”, “green opaque coolant” → fill the custom loop with that coolant"],
  ["brands", "★ Favourite brands", "“total NZXT fanboy”, “my brother swears by MSI” → use that brand"],
  ["broken", "🛠️ Broken parts", "“I think I broke some RAM” → check / replace that part"],
];
const addKeys = r => r.keys.filter(k => !k.startsWith("-"));
const skipKeys = r => r.keys.filter(k => k.startsWith("-")).map(k => k.slice(1));
const defaultOf = r => DEFAULT_RULES.find(d => d.task.toLowerCase() === r.task.toLowerCase());
const sameRule = (a, b) => a.task === b.task && a.keys.join("|") === b.keys.join("|") && !a.off === !b.off;

function saveRules(msg) {
  LS.set("pcbs.rules", rules);
  LS.set("pcbs.rulesVer", RULES_VERSION);
  $("#rulesSaved")?.remove();
  const s = document.createElement("span");
  s.id = "rulesSaved";
  s.className = "saved";
  s.textContent = "✓ " + (msg || "Saved");
  $("#dlgRules .dlg-h h3").after(s);
  setTimeout(() => s.remove(), 1600);
  runTry();
}
const chipHtml = w =>
  `<span class="kw ${tooShort(w) ? "short" : ""}" ${tooShort(w) ? 'title="Very short – may match too often"' : ""}>${esc(w)}<button class="ghost" data-delkw="${esc(w)}" title="Remove" aria-label="Remove ${esc(w)}">×</button></span>`;
function chipsHtml(words, i, kind) {
  return `<div class="chips-in ${kind}" data-i="${i}" data-kind="${kind}">${words
    .map((w, n) => chipHtml(w))
    .join(
      ""
    )}<input data-kwin placeholder="${kind === "add" ? "add a word…" : "add an exception…"}" aria-label="${kind === "add" ? "Add a word that suggests this objective" : "Add a word that stops this objective"}"></div>`;
}
function renderRules(focus) {
  $("#rulesTable").innerHTML =
    `<div class="rrow rhead"><span title="On / off">On</span><span>Objective to add</span><span>Add it when the email says…</span><span>…but not when it says…</span><span></span></div>` +
    rules
      .map((r, i) => {
        const d = defaultOf(r),
          changed = d && !sameRule(r, d);
        return `<div class="rrow ${r.off ? "off" : ""}" data-i="${i}">
        <label class="rtoggle" title="${r.off ? "Off – click to turn on" : "On – click to turn off"}"><input type="checkbox" data-ron ${r.off ? "" : "checked"}></label>
        <input class="rtask" data-rtask value="${esc(r.task)}" placeholder="e.g. Clean with compressed air" aria-label="Objective">
        ${chipsHtml(addKeys(r), i, "add")}
        ${chipsHtml(skipKeys(r), i, "skip")}
        <span class="ract">${changed ? `<button class="ghost" data-rreset title="Back to the original words for this objective">↺</button>` : ""}<button class="ghost" data-rdel title="Delete this objective">🗑</button></span>
      </div>`;
      })
      .join("");
  $("#smartList").innerHTML = SMART_ROWS.map(
    ([k, name, ex]) =>
      `<label class="smartrow"><input type="checkbox" data-smart="${k}" ${smart[k] ? "checked" : ""}><b>${name}</b><small>${esc(ex)}</small></label>`
  ).join("");
  if (focus) {
    const el = document.querySelector(`#rulesTable .rrow[data-i="${focus.i}"] ${focus.sel}`);
    el?.focus();
  }
}
// add typed word(s) – "dust, dirty" adds both
function addWords(box, text, quiet) {
  const i = +box.dataset.i,
    kind = box.dataset.kind,
    r = rules[i];
  const words = text
    .split(/[,;\n]/)
    .map(normKeyword)
    .filter(Boolean);
  if (!words.length) return;
  const have = new Set(kind === "add" ? addKeys(r) : skipKeys(r));
  const fresh = words.filter(w => !have.has(w));
  r.keys =
    kind === "add"
      ? [...addKeys(r), ...fresh, ...skipKeys(r).map(k => "-" + k)]
      : [...addKeys(r), ...[...skipKeys(r), ...fresh].map(k => "-" + k)];
  if (quiet) {
    // leaving the field: add the chips in place, so a click elsewhere is not lost to a redraw
    const inp = box.querySelector("[data-kwin]");
    inp.value = "";
    fresh.forEach(w => inp.insertAdjacentHTML("beforebegin", chipHtml(w)));
    saveRules();
    return;
  }
  renderRules({ i, sel: `.chips-in.${kind} [data-kwin]` });
  saveRules(fresh.length ? "Saved" : "Already there");
}
function openRules() {
  rules = structuredClone(rules); // never edit the built-in defaults in place
  $("#dlgSettings").close();
  renderRules();
  $("#ruleTry").value = "";
  runTry();
  $("#dlgRules").showModal();
}
// 🔎 Try it – shows what an email with this text would get
function runTry() {
  const t = $("#ruleTry").value.trim(),
    out = $("#ruleTryOut");
  if (!t) {
    out.innerHTML = "";
    return;
  }
  const h = detectHidden(t, rules, smart).hidden;
  out.innerHTML = h.length
    ? h
        .map(
          x =>
            `<div class="tryhit">✓ <b>${esc(x.task)}</b> <small>because: ${x.because.map(b => "“" + esc(b) + "”").join(", ")}</small></div>`
        )
        .join("")
    : `<div class="tryno">Nothing would be suggested for this text.</div>`;
}

$("#btnRules").onclick = openRules;
const rt = $("#rulesTable");
rt.addEventListener("keydown", e => {
  const inp = e.target.closest("[data-kwin]");
  if (!inp) return;
  const box = inp.closest(".chips-in");
  if ((e.key === "Enter" || e.key === ",") && inp.value.trim()) {
    e.preventDefault();
    addWords(box, inp.value);
  } else if (e.key === "Backspace" && !inp.value) {
    const last = box.querySelector(".kw:last-of-type [data-delkw]");
    if (last) {
      e.preventDefault();
      last.click();
      box.querySelector("[data-kwin]")?.focus();
    }
  }
});
// a word typed but not confirmed with Enter is still kept when leaving the field
rt.addEventListener("focusout", e => {
  const inp = e.target.closest?.("[data-kwin]");
  if (inp && inp.value.trim()) addWords(inp.closest(".chips-in"), inp.value, true);
});
rt.addEventListener("paste", e => {
  const inp = e.target.closest("[data-kwin]");
  if (!inp) return;
  const t = e.clipboardData.getData("text");
  if (/[,;\n]/.test(t)) {
    e.preventDefault();
    addWords(inp.closest(".chips-in"), inp.value + "," + t);
  }
});
rt.addEventListener("click", e => {
  const row = e.target.closest(".rrow[data-i]");
  if (!row) return;
  const i = +row.dataset.i,
    r = rules[i];
  const del = e.target.closest("[data-delkw]");
  if (del) {
    const box = del.closest(".chips-in"),
      kind = box.dataset.kind,
      w = del.dataset.delkw;
    let add = addKeys(r),
      skip = skipKeys(r);
    if (kind === "add") add = add.filter(k => k !== w);
    else skip = skip.filter(k => k !== w);
    r.keys = [...add, ...skip.map(k => "-" + k)];
    renderRules({ i, sel: `.chips-in.${kind} [data-kwin]` });
    saveRules();
    return;
  }
  if (e.target.closest(".chips-in") && !e.target.closest("button")) {
    e.target.closest(".chips-in").querySelector("[data-kwin]").focus();
    return;
  }
  if (e.target.closest("[data-rdel]")) {
    const gone = rules.splice(i, 1)[0];
    renderRules();
    saveRules("Deleted");
    toast(`Deleted: ${gone.task || "objective"}`, () => {
      rules.splice(i, 0, gone);
      renderRules();
      saveRules("Restored");
    });
    return;
  }
  if (e.target.closest("[data-rreset]")) {
    rules[i] = structuredClone(defaultOf(r));
    renderRules();
    saveRules("Original words restored");
  }
});
rt.addEventListener("change", e => {
  const row = e.target.closest(".rrow[data-i]");
  if (!row) return;
  const r = rules[+row.dataset.i];
  if (e.target.matches("[data-ron]")) {
    if (e.target.checked) delete r.off;
    else r.off = true;
    row.classList.toggle("off", !!r.off);
    renderRules();
    saveRules(r.off ? "Turned off" : "Turned on");
  }
  if (e.target.matches("[data-rtask]")) {
    const v = e.target.value.trim();
    if (v) {
      r.task = v;
      saveRules();
    } else e.target.value = r.task;
  }
});
$("#ruleAdd").onclick = () => {
  rules.push({ task: "", keys: [] });
  renderRules({ i: rules.length - 1, sel: "[data-rtask]" });
  $("#rulesTable").lastElementChild.scrollIntoView({ block: "nearest" });
};
$("#rulesReset").onclick = () => {
  if (!confirm("Put back the original objectives and words? Objectives you added yourself are removed.")) return;
  const before = rules;
  rules = structuredClone(DEFAULT_RULES);
  renderRules();
  saveRules("Defaults restored");
  toast("All rules reset to defaults", () => {
    rules = before;
    renderRules();
    saveRules("Restored");
  });
};
$("#smartList").addEventListener("change", e => {
  const k = e.target.dataset.smart;
  if (!k) return;
  smart[k] = e.target.checked;
  LS.set("pcbs.smart", smart);
  saveRules(e.target.checked ? "Turned on" : "Turned off");
});
$("#ruleTry").addEventListener("input", runTry);
// empty objectives are dropped when the window closes
$("#dlgRules").addEventListener("close", () => {
  const n = rules.length;
  rules = rules.filter(r => r.task.trim());
  if (rules.length !== n) saveRules();
});
