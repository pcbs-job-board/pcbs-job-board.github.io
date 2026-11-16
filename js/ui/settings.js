/* PCBS Job Board – Settings window: DLC / content packs, game version, career level, keyboard on/off, changelog window, help, reset. */
// ================= settings: New Job / Edit Job window switches (0.16.1, both on by default) =================
let autoSwaps = LS.get("pcbs.autoSwaps", true), // suggested part swaps in the New / Edit Job window
  hiddenDetect = LS.get("pcbs.hiddenDetect", true); // hidden objectives from the email's keywords
function setJobWindowSwitch(id, on) {
  if (id === "autoSwaps") LS.set("pcbs.autoSwaps", (autoSwaps = !!on));
  else LS.set("pcbs.hiddenDetect", (hiddenDetect = !!on));
}
// ================= settings: content packs (DLC) + rules =================
// DLC that only add workshops, modes or music – listed for information, no parts to filter
const DLC_NO_PARTS = [
  "Career Power Pack",
  "Esports Expansion",
  "NZXT Workshop",
  "Republic of Gamers Workshop",
  "Fractal Design Workshop",
  "AORUS Workshop",
  "EVGA Workshop",
  "Overclockers UK Workshop",
  "Razer Workshop",
  "PC Building Simulator Soundtrack",
];
// 📜 Changelog window: CHANGELOG.md from the site itself (published with the app – always the same file as on GitHub)
function changelogHtml(md) {
  const out = [];
  let list = null;
  const inline = t =>
    esc(t)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  const close = () => {
    if (list) {
      out.push(`<ul>${list.join("")}</ul>`);
      list = null;
    }
  };
  let first = true;
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+)$/),
      li = line.match(/^\s*[-*]\s+(.+)$/);
    if (/^#\s/.test(line)) continue; // the file's own title
    if (h) {
      close();
      out.push(
        `${first ? "" : "</section>"}<section class="clver"><h4>${inline(h[1])}${h[1].trim() === (window.PCBS_CONFIG || {}).version ? ' <span class="clnow">your version</span>' : ""}</h4>`
      );
      first = false;
    } else if (li) (list = list || []).push(`<li>${inline(li[1])}</li>`);
    else if (line.trim()) {
      close();
      out.push(`<p class="hint">${inline(line.trim())}</p>`);
    }
  }
  close();
  if (!first) out.push("</section>");
  return out.join("");
}
async function openChangelog(e) {
  e?.preventDefault?.();
  const dlg = $("#dlgChangelog"),
    body = $("#clBody");
  try {
    const r = await fetch("CHANGELOG.md", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    body.innerHTML = changelogHtml(await r.text());
  } catch {
    window.open(changelogUrl(), "_blank", "noopener");
    return;
  } // e.g. opened as a local file
  if (!dlg.open) dlg.showModal();
  body.scrollTo(0, 0);
}
function changelogUrl() {
  const r = reportRepo();
  return r ? `https://github.com/${r}/blob/main/CHANGELOG.md` : "CHANGELOG.md";
}
function renderSettings() {
  const m = window.PARTS_META || {};
  const row = d => {
    const n = dlcCount(d.key);
    return `<label class="dlcrow"><input type="checkbox" class="switch" data-dlc="${esc(d.key)}" ${dlcOn[d.key] ? "checked" : ""}><span><b>${esc(d.label)}</b> <small>${n} parts</small><br><small>${esc(d.note)}</small></span></label>`;
  };
  const withParts = DLCS.filter(d => dlcCount(d.key) > 0);
  $("#dlcList").innerHTML = withParts.map(row).join("") || `<p class="hint">None.</p>`;
  $("#dlcOther").textContent =
    "No extra parts (workshops, game modes, music – nothing to switch): " + DLC_NO_PARTS.join(", ") + ".";
  $("#gameVersion").innerHTML = VERSIONS.slice()
    .reverse()
    .map(v => `<option value="${esc(v.v)}" ${v.v === gameVersion ? "selected" : ""}>${esc(v.label)}</option>`)
    .join("");
  $("#appVersion").textContent = "PCBS Job Board v" + ((window.PCBS_CONFIG || {}).version || "?");
  $("#appVersion").href = changelogUrl();
  $("#appVersion").onclick = openChangelog;
  if (typeof keysOn !== "undefined") $("#keysToggle").checked = keysOn;
  $("#compactStatus").checked = compactStatus;
  $("#compactSwaps").checked = compactSwaps;
  $("#autoSwaps").checked = autoSwaps;
  $("#hiddenDetect").checked = hiddenDetect;
  $("#btnRules").disabled = !hiddenDetect;
  $("#btnRules").title = hiddenDetect ? "" : "Turn on hidden objective detection to edit the keyword rules";
  $("#dbInfo").textContent = m.counts
    ? `${Object.values(m.counts).reduce((a, b) => a + b, 0)} parts in the database (built ${m.built}). ${INDEX.filter(p => !p.hist).length} shown with your current settings.`
    : "Parts database not loaded.";
}
$("#btnSettings").onclick = () => {
  renderSettings();
  $("#dlgSettings").showModal();
};
// ❓ Help window: "How to use it" + keyboard shortcuts (0.16.1), one page per <section data-hsec> – opened by the
// ? button and the ? key, both on the keyboard shortcuts page. Pictures are only downloaded the first time a page shows.
function showHelpPage(k) {
  const secs = [...document.querySelectorAll("#dlgHelp [data-hsec]")];
  if (!secs.some(x => x.dataset.hsec === k)) k = secs[0].dataset.hsec;
  $("#helpPages").innerHTML = secs
    .map(
      x =>
        `<button class="pdbpage${x.dataset.hsec === k ? " on" : ""}" data-hpage="${esc(x.dataset.hsec)}" aria-pressed="${x.dataset.hsec === k}">${esc(x.dataset.htitle)}</button>`
    )
    .join("");
  for (const x of secs) {
    x.hidden = x.dataset.hsec !== k;
    if (!x.hidden)
      x.querySelectorAll("img[data-src]").forEach(i => {
        i.src = i.dataset.src;
        i.removeAttribute("data-src");
      });
  }
  if (k === "keys") $("#keysBody").innerHTML = keysHelpHtml();
  $("#dlgHelp .dlg-b").scrollTop = 0;
}
function openHelp(k) {
  showHelpPage(k);
  if (!$("#dlgHelp").open) $("#dlgHelp").showModal();
}
$("#btnHelp").onclick = () => openHelp("keys"); // keyboard shortcuts: the page that opens (Mariusz 2026-11-16)
$("#helpPages").addEventListener("click", e => {
  const b = e.target.closest("[data-hpage]");
  if (b) showHelpPage(b.dataset.hpage);
});
$("#btnKeysFromSettings").onclick = () => {
  $("#dlgSettings").close();
  openHelp("keys");
};
// career level + % in the top bar; the tooltip says what it does and how many parts are unlocked
function careerInfo() {
  const n = INDEX.filter(p => !p.hist).length,
    ok = INDEX.filter(p => !p.hist && unlocked(p)).length;
  $("#careerBar").title =
    "Your career level and % through it (in-game, top right under the stars). Part-swap suggestions only show parts you have unlocked.\n" +
    (career.level == null ? "Not set – every part is suggested." : `${ok} of ${n} parts unlocked.`);
  $("#careerBar").classList.toggle("set", career.level != null);
  if (typeof flipBtnUpdate === "function") flipBtnUpdate();
}
function showCareer() {
  $("#careerLevel").value = career.level ?? "";
  $("#careerPct").value = career.level == null || !career.pct ? "" : career.pct;
  careerInfo();
}
// typing a level / % saves straight away; empty level = not set
// (the job cards follow: overclocking help and custom water cooling parts wait for their in-game unlock)
let careerRender = null;
["#careerLevel", "#careerPct"].forEach(id =>
  $(id).addEventListener("input", () => {
    setCareer($("#careerLevel").value, $("#careerPct").value);
    careerInfo();
    clearTimeout(careerRender);
    careerRender = setTimeout(render, 400);
  })
);
$("#btnUnlocks .ulic").innerHTML = UL_ICON;
// tidy the fields when leaving them (e.g. 150 % → 100), empty % = 0
$("#careerLevel").addEventListener("change", () => {
  $("#careerLevel").value = career.level ?? "";
});
$("#careerPct").addEventListener("change", () => {
  $("#careerPct").value = career.pct ? career.pct : "";
});
// factory reset: every saved key of this tool, the screen share, then a fresh start
$("#btnResetAll").onclick = () => {
  $("#resetSure").checked = false;
  $("#resetGo").disabled = true;
  $("#dlgSettings").close();
  $("#dlgReset").showModal();
};
$("#resetSure").onchange = e => {
  $("#resetGo").disabled = !e.target.checked;
};
$("#resetGo").onclick = () => {
  if (!$("#resetSure").checked) return;
  try {
    if (stream) stream.getTracks().forEach(t => t.stop());
  } catch {}
  Object.keys(localStorage)
    .filter(k => k.startsWith("pcbs."))
    .forEach(k => localStorage.removeItem(k));
  LS.set("pcbs.seenVersion", (window.PCBS_CONFIG || {}).version || ""); // no "what's new" right after a reset
  location.reload();
};
$("#dlgSettings").addEventListener("change", e => {
  if (e.target.id === "keysToggle") {
    setKeys(e.target.checked);
    return;
  }
  if (e.target.id === "autoSwaps" || e.target.id === "hiddenDetect") {
    setJobWindowSwitch(e.target.id, e.target.checked);
    renderSettings();
    return;
  }
  if (e.target.id === "compactStatus" || e.target.id === "compactSwaps") {
    setCompact(e.target.id === "compactStatus" ? "status" : "swaps", e.target.checked);
    return;
  }
  const k = e.target.dataset.dlc;
  if (k) {
    setDlc(k, e.target.checked);
    renderSettings();
    careerInfo();
  } else if (e.target.id === "gameVersion") {
    setGameVersion(e.target.value);
    renderSettings();
    careerInfo();
  }
});
