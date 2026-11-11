/* PCBS Job Board – The new-job / Edit window: screenshots, the job's fields, one field per part type, saving the job. */
// ================= review dialog =================
// rev.shots: [{url, kind: "email"|"parts", text}] – the email is read first; each
// "Add PC parts capture" adds a frame whose PC Stats popup is read and merged into the parts list.
let rev = null;
function openReview(dataUrl, editJob, forJob) {
  const dlg = $("#dlgReview");
  if (editJob) forJob = editJob; // 0.13.0: one Edit window for the job's details AND its parts (the old Parts window is gone)
  rev = { editJob, forJob, shots: [], cur: -1, draft: editJob ? structuredClone(editJob) : blankDraft() };
  if (editJob) {
    // the job's tasks back into the form's three lists
    const t = editJob.tasks || [];
    rev.draft.objectives = t.filter(x => x.src === "obj").map(x => x.text);
    rev.draft.hidden = t.filter(x => x.src === "hid").map(x => ({ task: x.text, because: [], keep: true }));
    rev.draft.extra = t.filter(x => x.src !== "obj" && x.src !== "hid").map(x => x.text);
  }
  if (forJob) rev.draft.components = structuredClone(forJob.components || []);
  // parts that came from a PC Stats capture are replaced by a new capture (typed ones are kept);
  // jobs saved before 0.11.1 don't know which were captured – all their parts count as captured
  const known = forJob || editJob;
  rev.autoNames = new Set(known ? (known.capNames || (known.components || []).map(c => c.name)).map(n => n.toLowerCase()) : []);
  // a new capture in a saved job's Parts window adds to the parts captured before instead of standing next to them
  rev.prevCap = forJob
    ? (forJob.components || []).filter(c => rev.autoNames.has(c.name.toLowerCase())).map(({ cat, name }) => ({ cat, name }))
    : [];
  $("#revTitle").textContent = editJob
    ? `Edit job: ${editJob.sender || "unknown customer"}`
    : dataUrl
      ? "New job from capture"
      : "New job";
  $("#rawTxt").textContent = "";
  $("#prog").style.width = "0";
  $("#ocrState").textContent = "";
  renderForm();
  showBlack(false);
  renderShots();
  dlg.showModal();
  warmReader();
  $("#fSender")?.focus({ preventScroll: true }); // not the ✕ in the corner (Enter would close the window)
  if (dataUrl) addShot(dataUrl, forJob ? "parts" : "email");
}
// a warning under the screenshot with a shortcut to the set-up window – nothing is changed automatically
function areaWarn(msg) {
  $("#ocrState").innerHTML = `<div class="areawarn">⚠ ${esc(msg)} <button id="warnAdjust">🎯 Adjust areas</button></div>`;
  $("#warnAdjust").onclick = adjustArea;
}
// ★ required stars: from whichever email screenshot shows the blue Labour / Budget band; no star line = 0
function starsOfShots(p) {
  const n = rev.shots.filter(s => s.kind === "email" && s.stars != null).map(s => s.stars);
  if (n.length) return Math.max(...n);
  return p.noStars ? 0 : null;
}
function blankDraft() {
  return {
    id: uid(),
    sender: "",
    subject: "",
    labour: null,
    budget: null,
    level: null,
    stars: null,
    deadline: "",
    suspect: "",
    table: 0,
    tasks: [],
    swaps: [],
    components: [],
    hidden: [],
    objectives: [],
  };
}
function addShot(url, kind) {
  rev.shots.push({ url, kind, text: "" });
  showShot(rev.shots.length - 1, true);
}
function showShot(i, read) {
  rev.cur = i;
  const sh = rev.shots[i];
  mode = sh.kind === "parts" ? "stats" : "email";
  renderShots();
  const im = $("#shot");
  im.onload = () => {
    drawCrops();
    if (read) runOcr();
  };
  im.src = sh.url;
  $("#rawTxt").textContent = sh.text || "";
}
function renderShots() {
  const has = rev && rev.shots.length;
  const dlg = $("#dlgReview");
  dlg.querySelector(".review").style.gridTemplateColumns = has || $("#revJob").innerHTML.trim() ? "" : "1fr"; // job fields left, parts right
  $("#shotPane").hidden = !has;
  $("#shotTabs").innerHTML = has
    ? rev.shots
        .map((sh, i) => {
          const n = rev.shots.slice(0, i + 1).filter(x => x.kind === "parts").length;
          const e = rev.shots.slice(0, i + 1).filter(x => x.kind === "email").length;
          return `<button class="${i === rev.cur ? "sel" : ""}" data-shot="${i}">${sh.kind === "email" ? "✉ Email " + e : "🧩 Parts " + n}</button>`;
        })
        .join("")
    : "";
  const k = rev && rev.cur >= 0 ? rev.shots[rev.cur].kind : "email";
  $("#cropEmail").hidden = k !== "email";
  $("#cropStats").hidden = k !== "parts";
  $("#areaHint").innerHTML =
    k === "email"
      ? "Blue box = the email text, budget and objectives."
      : "Orange box = the <b>PC Stats</b> popup (Components list). Scroll it in-game and capture again for more parts.";
}
$("#shotTabs").addEventListener("click", e => {
  const b = e.target.closest("[data-shot]");
  if (b) showShot(+b.dataset.shot, false);
});
async function capture(kind) {
  syncComps();
  if (!stream) {
    toast("No screen connected – connect screen 1, or paste a screenshot (Ctrl+V) while this window is open.");
    return;
  }
  const f = await grabFrame();
  addShot(f.url, kind);
  showBlack(f.black);
}
const capParts = () => capture("parts"),
  capEmail = () => capture("email");
// keep what the user typed in the parts box before anything re-renders the form
function syncComps() {
  const ta = $("#fComps");
  if (ta && rev) rev.draft.components = parseCompText(ta.value);
}
// parts list = best of all PC Stats screenshots + anything the user typed in themselves
function rebuildParts() {
  syncComps();
  const prevAuto = rev.autoNames || new Set();
  const lists = rev.shots.filter(s => s.kind === "parts" && s.parts).map(s => s.parts);
  // the earlier captured parts come first: a category is only replaced when a new screenshot shows more of it
  const auto = mergePCStats(rev.prevCap?.length ? [rev.prevCap, ...lists] : lists).filter(
    p => !rev.dropAuto?.has(p.name.toLowerCase())
  );
  // the game's "Benchmark:" number checks the names read (a GPU that lost its "Ti")
  const bm = rev.shots.map(s => s.kind === "parts" && (s.text || "").match(/Benchmark[:;]?\s*([\d,]+)/i)).find(Boolean);
  rev.benchFixed = bm ? benchFix(auto, +bm[1].replace(/,/g, "")) : [];
  rev.autoNames = new Set(auto.map(p => p.name.toLowerCase()));
  const manual = rev.draft.components.filter(
    c => !prevAuto.has(c.name.toLowerCase()) && !rev.autoNames.has(c.name.toLowerCase())
  );
  rev.draft.components = [...auto.map(({ name, cat }) => ({ name, cat })), ...manual];
  const ta = $("#fComps");
  if (ta) {
    ta.value = rev.draft.components.map(c => c.cat + ": " + c.name).join("\n");
    renderPartFields();
  }
  renderSuggestions(); // setting the box from code fires no "input" event
  return auto;
}
async function runOcr() {
  if (!rev || rev.cur < 0) return;
  const sh = rev.shots[rev.cur];
  try {
    if (sh.kind === "auto") {
      // pasted screenshot: PC Stats popup or more of the email? (by colour first – fast)
      let k = null;
      try {
        const im = areaImage($("#shot"));
        k = detectArea(im, "stats") ? "parts" : detectArea(im, "email") ? "email" : null;
      } catch {}
      if (!k) {
        const t = await ocr($("#shot"), "parts");
        k = /components|pc for|benchmark/i.test(t) ? "parts" : "email";
      }
      sh.kind = k;
      showShot(rev.cur, false);
    }
    // first capture of this kind: set up the area in the big window first, then read
    const ak = sh.kind === "parts" ? "stats" : "email";
    lastFrame[ak] = sh.url;
    if (!areasSet[ak] && !sh.areaAsked) {
      sh.areaAsked = true;
      openAreas(ak, $("#shot"), () => runOcr());
      return;
    }
    const text = await ocr($("#shot"), sh.kind);
    sh.text = text;
    sh.conf = lastConf;
    sh.stars = lastStars;
    $("#rawTxt").textContent = text;
    // career level / % from the HUD – only after the main reading is done, never waited for, errors ignored
    if (!sh.careerDone) {
      sh.careerDone = true;
      setTimeout(() => autoCareer(sh.url).catch(() => {}), 0);
    }
    if (sh.kind === "parts") {
      const ok = /components|pc for|benchmark/i.test(text);
      sh.parts = ok ? resolvePCStats(text) : null;
      const total = rebuildParts();
      if (!rev.forJob && !rev.draft.sender) {
        const m = text.match(/PC for\s+(\S+@\S+)/i);
        if (m && $("#fSender") && !$("#fSender").value) $("#fSender").value = m[1];
      }
      const unsure = (sh.parts || []).filter(p => !p.sure).length;
      $("#ocrState").textContent = ok
        ? `Read ${sh.parts.length} parts here · list now has ${total.length}.${unsure ? ` ${unsure} not found in the parts database – check them.` : ""}${rev.benchFixed?.length ? ` Corrected by the Benchmark number: ${rev.benchFixed.map(c => c.from + " → " + c.to).join(", ")}.` : ""} Several RAM sticks / GPUs / drives / fans must be on one screenshot to be counted.`
        : "";
      if (!ok)
        areaWarn(
          "This doesn't look like the PC Stats window. Is it open in-game (PC Stats button)? If it is, the box may be in the wrong place."
        );
      return;
    }
    syncComps();
    const emails = rev.shots.filter(s => s.kind === "email" && s.text).map(s => ({ text: s.text, conf: s.conf }));
    const keep = { extra: $("#fExtra")?.value, table: $("#fTable")?.value };
    const p = parseEmail(emails.length > 1 ? mergeTexts(emails) : text, rules, smart);
    p.hidden.forEach(h => {
      if (h.brand && !h.avoid) {
        const c = brandCategories(h.brand);
        if (c.length) h.task += " (makes: " + c.join(", ") + ")";
      }
    });
    // suggest matching in-game cable sets for cable colour requests
    // coolant: name a matching coolant from the game ("Blue Clear Coolant")
    p.hidden.forEach(h => {
      if (h.coolant) {
        const c = h.coolant,
          ex = INDEX.filter(
            x => x.cat === "Water Cooling" && /^coolant/i.test(x.spec || "") && !/not in shop/i.test(x.spec || "")
          )
            .map(x => x.name)
            .find(n =>
              c.col === "clear"
                ? /^clear coolant$/i.test(n)
                : new RegExp("^" + c.col.replace(/\s+/g, " ") + "\\b" + (c.kind ? ".*" + c.kind : ""), "i").test(n)
            );
        if (ex) h.task += " (e.g. " + ex + ")";
      }
    });
    p.hidden.forEach(h => {
      if (h.want) {
        const ex = h.want.flatMap(w => cableExamples(w));
        if (ex.length) h.task += " (e.g. " + ex.join(", ") + ")";
      }
    });
    Object.assign(rev.draft, {
      sender: p.sender,
      subject: p.subject,
      labour: p.labour,
      budget: p.budget,
      level: p.level,
      stars: starsOfShots(p),
      deadline: p.deadline,
      softDeadline: !!p.softDeadline,
      suspect: p.suspect,
      objectives: p.objectives,
      hidden: p.hidden,
      body: p.body,
      signature: p.signature,
      noStars: p.noStars,
      words: p.words,
    });
    // story job? known from the list (sender email / subject / name) or looks like one (no star requirement, long text)
    const sm = storyMatch(p, window.STORY_JOBS || []),
      sl = storyLooks(p);
    rev.draft.storyKnown = !sm
      ? ""
      : sm.newEmail
        ? `${sm.entry.sender_name || sm.entry.email} – a known story customer; this email isn't in the story list yet (📖 Report story job)`
        : sm.entry.story || sm.entry.sender_name || "known story job";
    rev.draft.storyWhy = sm ? "" : sl.why.join(" · ");
    if (!rev.storyTouched) rev.draft.story = !!sm || sl.looks;
    renderForm();
    if (keep.extra && $("#fExtra")) $("#fExtra").value = keep.extra;
    if (keep.table && $("#fTable")) $("#fTable").value = keep.table;
    $("#ocrState").textContent =
      (emails.length > 1 ? `Joined ${emails.length} email screenshots. ` : "") +
      "Check the fields. Long email? Scroll it in-game and press “📸 Add email capture”. Repair job? Open PC Stats and press “📸 Add PC parts capture”.";
    // gentle warning: none of the words every job email has
    if (!/labou?r|budget|objectives|[\w.]+@[\w-]+\.|regards|thanks/i.test(text))
      areaWarn("This doesn't look like a job email. Is an email open in-game? If it is, the box may be in the wrong place.");
  } catch (err) {
    $("#ocrState").textContent = "⚠ " + err.message;
  }
}
// the PC's parts, one field per part type (the hidden #fComps text box stays the single source for the rest of the app)
const PART_SLOTS = [
  { k: "Case", label: "Case", max: 1 },
  { k: "Motherboard", label: "Motherboard", max: 1 },
  { k: "CPU", label: "CPU", max: 1 },
  { k: "CPU Cooler", label: "CPU Cooling", max: 1 },
  { k: "RAM", label: "RAM", max: 4 },
  { k: "GPU", label: "GPU", max: 2, hint: "💧 = watercooled" },
  { k: "PSU", label: "PSU", max: 1 },
  { k: "Storage", label: "Storage", max: 99, hint: "HDD, SSD, M.2" },
  { k: "Case Fan", label: "Case Fans", max: 99, opt: true },
  { k: "WC:Reservoir", label: "Reservoir", max: 1, opt: true, hint: "custom water cooling" },
  { k: "WC:Radiator", label: "Radiator", max: 1, opt: true },
  { k: "WC:CPU Block", label: "CPU Block", max: 1, opt: true },
  {
    k: "Other",
    label: "Other",
    max: 99,
    other: true,
    onlyIfUsed: true,
    hint: "parts of no other type – shown only when there are some",
  },
];
// "Other" = every category no other field takes (case fans, cables, custom water cooling…)
const OTHER_CATS = () =>
  CATS.filter(c => c !== "Cables" && c !== "Water Cooling" && !PART_SLOTS.some(sl => !sl.other && sl.k === c)).join("|");
const slotOf = (cat, name) =>
  PART_SLOTS.find(sl => sl.k === (cat === "Water Cooling" ? catKey({ name, cat }) : cat) && !sl.other) ||
  PART_SLOTS[PART_SLOTS.length - 1];
let DBNAMES = null;
function inPartsDb(name) {
  // exactly a part of the database (any DLC / version – a customer PC can have anything)
  if (!DBNAMES) {
    DBNAMES = new Set();
    for (const c in window.PARTS_DB || {}) for (const r of window.PARTS_DB[c]) DBNAMES.add(r[0].toLowerCase());
  }
  return DBNAMES.has(
    String(name || "")
      .trim()
      .toLowerCase()
  );
}
// RAM sticks in one PC are all the same size and speed – an odd one out is often another part read as RAM
// (a 960GB SSD became a "32 GB" RAM stick once). Returns the names that don't match the most common size + speed.
function oddRam(names) {
  const key = n => {
    const c = (typeof compatOf === "function" && compatOf(n)) || {};
    const t = String(n);
    return `${c.gb || (t.match(/(\d+)\s*GB/i) || [])[1] || "?"}/${c.mhz || (t.match(/(\d+)\s*MHz/i) || [])[1] || "?"}`;
  };
  const keys = names.map(key),
    count = {};
  keys.forEach(k => (count[k] = (count[k] || 0) + 1));
  if (Object.keys(count).length < 2) return new Set(); // one stick, or all the same
  const top = Math.max(...Object.values(count)),
    common = Object.keys(count).filter(k => count[k] === top);
  return new Set(names.filter((n, i) => common.length > 1 || keys[i] !== common[0])); // a tie: check all of them
}
function partFieldsHtml(comps) {
  const ramOdd = oddRam(comps.filter(c => c.name && slotOf(c.cat, c.name).k === "RAM").map(c => c.name));
  return `<div id="fParts">${PART_SLOTS.map(sl => {
    const rows = comps.filter(c => slotOf(c.cat, c.name) === sl),
      shown = rows.length || sl.other ? rows : [{ cat: sl.k, name: "" }];
    if (sl.onlyIfUsed && !rows.length) return "";
    const row = c =>
      `<div class="prow"><input data-ac data-ac-cat="${sl.other ? OTHER_CATS() : esc(sl.k)}" data-slot="${esc(sl.k)}" data-cat="${esc(c.cat)}" value="${esc(c.name)}" placeholder="${sl.other ? "add a part…" : "(empty)"}" autocomplete="off">${c.name && !inPartsDb(c.name) ? `<span class="pwarn" title="Not found in the parts database – check the name (the text reader may have misread it)">!</span>` : sl.k === "RAM" && ramOdd.has(c.name) ? `<span class="pwarn" title="RAM sticks differ in size or speed – check this one (another part may have been read as RAM)">!</span>` : ""}${c.name ? `<button class="ghost px" data-prm title="Remove" aria-label="Remove ${esc(c.name)}">✕</button>` : ""}</div>`;
    const more =
      sl.other || rows.length < sl.max
        ? rows.length
          ? `<button class="ghost padd" data-padd="${esc(sl.k)}">＋ add${sl.max < 99 ? ` (max ${sl.max})` : ""}</button>`
          : sl.other
            ? row({ cat: "Other", name: "" })
            : ""
        : "";
    return `<div class="pslot${!sl.other && !sl.opt && !rows.length ? " pempty" : ""}" data-slotk="${esc(sl.k)}"><label>${esc(sl.label)}${sl.hint ? ` <small>(${esc(sl.hint)})</small>` : ""}${sl.max > 1 && sl.max < 99 ? ` <small>${rows.length}/${sl.max}</small>` : ""}</label>${shown.map(row).join("")}${more}</div>`;
  }).join("")}</div>`;
}
// fields → hidden text box (+ "input" so the suggestions follow); text box → fields
function partsFromFields() {
  const ta = $("#fComps"),
    box = $("#fParts");
  if (!ta || !box) return;
  const list = [...box.querySelectorAll("input[data-slot]")]
    .map(i => {
      const v = i.value.trim();
      if (!v) return null;
      const m =
        INDEX.find(p => p.name.toLowerCase() === v.toLowerCase()) || (inPartsDb(v) ? { name: v, cat: categorize(v) } : null);
      const cat =
        i.dataset.slot === "Other"
          ? (m && m.cat) || (i.dataset.cat !== "Other" ? catData(i.dataset.cat) : categorize(v))
          : catData(i.dataset.slot);
      return { cat, name: m ? m.name : v };
    })
    .filter(Boolean);
  // a captured part the user changed or removed must not come back with the next capture
  if (rev) {
    const now = new Set(list.map(c => c.name.toLowerCase()));
    rev.dropAuto = rev.dropAuto || new Set();
    for (const n of rev.autoNames || []) if (!now.has(n)) rev.dropAuto.add(n);
  }
  ta.value = list.map(c => c.cat + ": " + c.name).join("\n");
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}
// replacing the fields takes focus out of one → its "change" can ask for a redraw while this one runs: redraw once more after
let pfBusy = false,
  pfAgain = false;
function renderPartFields() {
  if (pfBusy) return void (pfAgain = true);
  pfBusy = true;
  try {
    do {
      pfAgain = false;
      const ta = $("#fComps"),
        box = $("#fParts");
      if (ta && box?.isConnected) box.outerHTML = partFieldsHtml(parseCompText(ta.value));
    } while (pfAgain);
  } finally {
    pfBusy = false;
  }
}
function bindPartFields() {
  const wrap = $("#revForm");
  wrap.addEventListener("change", e => {
    if (e.target.matches("#fParts input[data-slot]")) {
      partsFromFields();
      renderPartFields();
    }
  });
  wrap.addEventListener("input", e => {
    if (e.target.matches("#fParts input[data-slot]")) {
      clearTimeout(bindPartFields.t);
      bindPartFields.t = setTimeout(partsFromFields, 400);
    }
  });
  wrap.addEventListener("click", e => {
    const rm = e.target.closest("[data-prm]");
    if (rm) {
      rm.closest(".prow").querySelector("input").value = "";
      partsFromFields();
      renderPartFields();
      return;
    }
    const add = e.target.closest("[data-padd]");
    if (add) {
      add.insertAdjacentHTML(
        "beforebegin",
        `<div class="prow"><input data-ac data-ac-cat="${add.dataset.padd === "Other" ? OTHER_CATS() : esc(add.dataset.padd)}" data-slot="${esc(add.dataset.padd)}" data-cat="${esc(add.dataset.padd)}" placeholder="(empty)" autocomplete="off"></div>`
      );
      add.previousElementSibling.querySelector("input").focus();
      if (add.closest(".pslot").querySelectorAll(".prow").length >= slotOf(add.dataset.padd).max) add.remove();
    }
  });
}
function renderForm() {
  const d = rev.draft,
    f = $("#revForm"),
    jb = $("#revJob");
  const parts = `<button id="btnCapParts" class="capparts captop">📸 Add PC parts capture <small>open PC Stats in-game first · repeat after scrolling</small><kbd class="capkey" title="Keyboard shortcut">(Alt+P)</kbd></button>
    <label>Parts of this PC</label>${partFieldsHtml(d.components)}<textarea id="fComps" hidden>${esc(d.components.map(c => c.cat + ": " + c.name).join("\n"))}</textarea>`;
  const emailAdder = `<button id="btnCapEmail" class="capparts capemail captop">📸 Add email capture <small>long email? scroll it in-game first – text is joined</small><kbd class="capkey" title="Keyboard shortcut">(Alt+E)</kbd></button>`;
  if (rev.forJob && !rev.editJob) {
    // (no longer opened – kept for safety)
    jb.innerHTML = "";
    $("#revCapE").innerHTML = "";
    f.innerHTML = `${parts}
      <p class="hint">New captures add to the parts captured before (a part type is replaced when a screenshot shows more of it); parts you typed yourself are kept.</p><div id="fSugg"></div><button class="primary big" id="fSave" style="width:100%;margin-top:10px">Save parts</button>`;
  } else {
    const isEdit = !!rev.editJob;
    $("#revCapE").innerHTML = emailAdder;
    jb.innerHTML = `<div class="grid2"><div><label>Customer</label><input id="fSender" value="${esc(d.sender)}"></div><div><label>Subject</label><input id="fSubject" value="${esc(d.subject)}"></div></div>
      <div class="grid3"><div><label>Labour $</label><input id="fLabour" type="number" value="${d.labour ?? ""}"></div><div><label>Budget $</label><input id="fBudget" type="number" value="${d.budget ?? ""}"></div><div><label>Deadline</label><input id="fDeadline" value="${esc(d.deadline)}"></div></div>
      <div class="grid2"><div><label>Req. level</label><input id="fLevel" type="number" min="1" max="99" value="${d.level ?? ""}"></div><div><label>Req. stars</label><select id="fStars"><option value="">—</option>${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}" ${d.stars === n ? "selected" : ""}>${n ? "★".repeat(n) : "none"}</option>`).join("")}</select></div></div>
      <label class="dlcrow storyrow"><input type="checkbox" class="switch" id="fStory" ${d.story ? "checked" : ""}><span><b>📖 Story job</b><br><small>Career story customer: no hidden objectives, and the budget doesn't count unless an objective mentions it.</small></span></label>
      <div class="grid2"><div><label>Customer suspects</label><input id="fSuspect" value="${esc(d.suspect)}" placeholder="(often wrong – verify)"></div><div><label>Put on</label><select id="fTable"><option value="0">Open jobs</option>${[
        1, 2, 3,
      ]
        .map(n => {
          const o = jobs.find(j => j.table === n && j.id !== d.id);
          return `<option value="${n}" ${d.table === n ? "selected" : ""}>Table ${n}${o ? " (busy – swaps)" : ""}</option>`;
        })
        .join("")}</select></div></div>
      <label>Objectives (one per line)</label><textarea id="fObj" rows="3">${esc((d.objectives || []).join("\n"))}</textarea>
      ${storyBanner(d)}
      <label>${isEdit ? "Hidden objectives (untick to remove)" : "Hidden objectives found in email"}${d.story && !isEdit ? " <small>(story job – not ticked)</small>" : ""}</label><div id="fHidden">${(d.hidden || []).length ? d.hidden.map((h, i) => `<div class="hidrow"><input type="checkbox" ${h.keep || !d.story ? "checked" : ""} data-h="${i}"><div>${esc(h.task)}${h.because && h.because.length ? `<br><small>because: “${esc(h.because.join("”, “"))}”</small>` : ""}</div></div>`).join("") : `<div class="hint">${isEdit ? "None." : "None detected."}</div>`}</div>${(d.hidden || []).length ? `<div class="hint hidnote">These are guessed from the email's wording – some might not be required. Check them against the email and untick any that don't apply.</div>` : ""}
      <label>Extra tasks (one per line)</label><textarea id="fExtra" rows="2">${esc((d.extra || []).join("\n"))}</textarea>`;
    f.innerHTML = `${parts}
      <div id="fSugg"></div>
      ${d.body ? `<details style="margin-top:8px"><summary>Email text</summary><div class="rawtxt">${esc(d.body)}</div></details>` : ""}
      <button class="primary big" id="fSave" style="width:100%;margin-top:12px">${isEdit ? "Save changes" : "Create job"}</button>`;
  }
  if (!f.dataset.pf) {
    f.dataset.pf = "1";
    bindPartFields();
  }
  $("#fSave").onclick = saveReview;
  // switching "Story job" unticks / ticks the hidden objectives in one go
  $("#fStory")?.addEventListener("change", e => {
    rev.storyTouched = true;
    rev.draft.story = e.target.checked;
    document.querySelectorAll("#fHidden input").forEach(c => (c.checked = !e.target.checked));
    const b = $("#storyBanner");
    if (b) b.outerHTML = storyBanner(rev.draft);
    bindStoryBanner();
  });
  bindStoryBanner();
  $("#btnCapParts").onclick = capParts;
  if ($("#btnCapEmail")) $("#btnCapEmail").onclick = capEmail;
  // suggested swaps follow what is typed / ticked in the form
  let t = null;
  const later = () => {
    clearTimeout(t);
    t = setTimeout(renderSuggestions, 350);
  };
  ["#fComps", "#fObj", "#fBudget", "#fSuspect"].forEach(id => $(id)?.addEventListener("input", later));
  $("#fHidden")?.addEventListener("change", renderSuggestions);
  $("#fStory")?.addEventListener("change", renderSuggestions);

  renderSuggestions();
}
// crop drawing
let mode = "email"; // which crop box the current screenshot uses
function drawCrops() {
  for (const k of ["email", "stats"]) {
    const el = $(k === "email" ? "#cropEmail" : "#cropStats"),
      r = crops[k];
    Object.assign(el.style, { left: r.x * 100 + "%", top: r.y * 100 + "%", width: r.w * 100 + "%", height: r.h * 100 + "%" });
  }
}
$("#btnReOcr").onclick = runOcr;
// 🎯 Adjust areas: the big set-up window for the screenshot being looked at, then read it again
function adjustArea() {
  if (!rev || rev.cur < 0) return;
  const k = rev.shots[rev.cur].kind === "parts" ? "stats" : "email";
  openAreas(k, $("#shot"), ok => {
    if (ok) runOcr();
  });
}
$("#btnAdjust").onclick = adjustArea;
// every window's ✕ / Cancel button with data-close
document.querySelectorAll("[data-close]").forEach(b => (b.onclick = () => b.closest("dialog").close()));
$("#dlgReview").addEventListener("close", () => {
  acEl.hidden = true;
  document.body.append(acEl);
});
