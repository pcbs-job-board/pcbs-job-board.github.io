/* PCBS Job Board – Reports → GitHub issues: missing parts and story jobs (no account needed). */
// ================= missing-part reports → GitHub issues =================
function reportRepo() {
  const cfg = (window.PCBS_CONFIG || {}).repo;
  if (cfg) return cfg;
  const m = location.hostname.match(/^([\w-]+)\.github\.io$/i);
  const repo = location.pathname.split("/").filter(Boolean)[0];
  return m ? `${m[1]}/${repo && !/\.html?$/i.test(repo) ? repo : m[1] + ".github.io"}` : ""; // site at the root: OWNER.github.io
}
function openReport(pre = {}) {
  $("#rName").value = pre.name || "";
  $("#rCat").value = CATS.includes(pre.cat) && pre.cat !== "Other" ? pre.cat : "";
  $("#rDlc").innerHTML =
    `<option value="Base game">Base game</option>` +
    DLCS.map(d => `<option>${esc(d.label)}</option>`).join("") +
    `<option>Other / not sure</option>`;
  ["#rLevel", "#rPct", "#rPrice", "#rNotes"].forEach(id => ($(id).value = ""));
  const direct = !!(window.PCBS_CONFIG || {}).reportEndpoint;
  $("#rDirect").hidden = !direct;
  $("#rSend").hidden = direct;
  $("#rCopy").hidden = direct;
  $("#rRepoHint").textContent = direct
    ? ""
    : reportRepo()
      ? `Opens a pre-filled report on github.com/${reportRepo()} (needs a free GitHub account).`
      : "No GitHub repository set – use “Copy report” and post it yourself, or set repo in js/config.js.";
  $("#dlgReport").showModal();
  $("#rName").focus();
}
function reportData() {
  return {
    name: $("#rName").value.trim(),
    cat: $("#rCat").value,
    dlc: $("#rDlc").value,
    level: $("#rLevel").value.trim(),
    pct: $("#rPct").value.trim(),
    price: $("#rPrice").value.trim(),
    notes: $("#rNotes").value.trim(),
  };
}
function reportText(r) {
  return `Missing part: ${r.name}\nCategory: ${r.cat || "?"}\nContent: ${r.dlc}\nUnlock level: ${r.level || "?"}${r.pct ? " (" + r.pct + "%)" : ""}\nPrice: ${r.price ? "$" + r.price : "?"}\nNotes: ${r.notes || "-"}\n(PCBS Job Board ${(window.PCBS_CONFIG || {}).version || ""}, database ${(window.PARTS_META || {}).built || "?"})`;
}
$("#rSend").onclick = () => {
  const r = reportData();
  if (!r.name) {
    $("#rName").focus();
    return;
  }
  const repo = reportRepo();
  if (!repo) {
    $("#rCopy").click();
    return;
  }
  const q = new URLSearchParams({
    template: "missing-part.yml",
    title: `[Missing part] ${r.name}`,
    part_name: r.name,
    category: r.cat,
    content: r.dlc,
    level: r.level + (r.pct ? ` (${r.pct}%)` : ""),
    price: r.price,
    notes: r.notes,
    app_version: `${(window.PCBS_CONFIG || {}).version || ""} / db ${(window.PARTS_META || {}).built || ""}`,
  });
  window.open(`https://github.com/${repo}/issues/new?${q}`, "_blank", "noopener");
  const log = LS.get("pcbs.reports", []);
  log.unshift({ ...r, at: Date.now() });
  LS.set("pcbs.reports", log.slice(0, 100));
  $("#dlgReport").close();
  toast("Report opened on GitHub – press “Create” there to submit");
};
$("#rDirect").onclick = async () => {
  const r = reportData();
  if (!r.name) {
    $("#rName").focus();
    return;
  }
  if (await sendReport("part", r, "#rDirect")) {
    const log = LS.get("pcbs.reports", []);
    log.unshift({ ...r, at: Date.now() });
    LS.set("pcbs.reports", log.slice(0, 100));
    $("#dlgReport").close();
  }
};
$("#rCopy").onclick = async () => {
  const r = reportData();
  if (!r.name) {
    $("#rName").focus();
    return;
  }
  try {
    await navigator.clipboard.writeText(reportText(r));
    toast("Report copied to clipboard");
  } catch {
    prompt("Copy this report:", reportText(r));
  }
};
