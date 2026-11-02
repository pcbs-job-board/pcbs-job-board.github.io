/* Story jobs: the banner in the new-job window and "Report story job" (GitHub issue or email).
   Known story jobs come from data/story-jobs.csv (built into data/parts-db.js as window.STORY_JOBS). */

// banner above the hidden objectives: known story job / looks like one / nothing
function storyBanner(d) {
  if (d.storyKnown) return `<div class="storybanner known" id="storyBanner">📖 <b>Story job</b> – ${esc(d.storyKnown)}. Story jobs have no hidden objectives, and the budget only counts when an objective mentions it.</div>`;
  if (d.story && !d.storyWhy) return `<div class="storybanner" id="storyBanner">📖 <b>Marked as a story job</b> – it isn't in the list of known story jobs yet. Help other players by reporting it.
    <div class="btnrow"><button id="storyReportFromCapture">📖 Report story job</button></div></div>`;
  if (d.story && d.storyWhy) return `<div class="storybanner" id="storyBanner">📖 <b>Looks like a story job</b> <small>(${esc(d.storyWhy)})</small> – it isn't in the list of known story jobs yet. Help other players by reporting it.
    <div class="btnrow"><button id="storyReportFromCapture">📖 Report story job</button></div></div>`;
  return `<span id="storyBanner" hidden></span>`;
}
function bindStoryBanner() { const b = $("#storyReportFromCapture"); if (b) b.onclick = () => openStoryReport(storyDraftFromForm()); }
function storyDraftFromForm() {
  const d = rev?.draft || {};
  return { email: $("#fSender")?.value.trim() || d.sender || "", subject: $("#fSubject")?.value.trim() || d.subject || "", name: (d.signature || []).slice(-1)[0] || "",
    labour: $("#fLabour")?.value || "", budget: $("#fBudget")?.value || "", level: d.level ?? "", objectives: ($("#fObj")?.value || (d.objectives || []).join("\n")).trim(),
    body: d.body || "", noStars: d.noStars, words: d.words };
}
function openStoryReport(pre = {}) {
  $("#sEmail").value = pre.email || ""; $("#sSubject").value = pre.subject || ""; $("#sName").value = pre.name || "";
  $("#sDetails").value = [pre.body && "Email text:\n" + pre.body, pre.objectives && "Objectives:\n" + pre.objectives,
    (pre.labour || pre.budget || pre.level) && `Labour: $${pre.labour || "?"} · Budget: $${pre.budget || "?"} · Req: Level ${pre.level || "?"}${pre.noStars ? " · no star requirement" : ""}`].filter(Boolean).join("\n\n");
  $("#sRepoHint").textContent = reportRepo() ? `GitHub: opens a pre-filled report on github.com/${reportRepo()} (needs a free GitHub account).` : "";
  $("#sEmailBtn").hidden = !(window.PCBS_CONFIG || {}).storyReportEmail;
  $("#dlgStory").showModal(); (pre.email ? $("#sDetails") : $("#sEmail")).focus();
}
function storyReportData() { return { email: $("#sEmail").value.trim(), subject: $("#sSubject").value.trim(), name: $("#sName").value.trim(), details: $("#sDetails").value.trim() }; }
const storyNumber = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
function storyReportText(r) {
  return `Sender's email: ${r.email || "?"}\nSubject: ${r.subject || "?"}\nSigned: ${r.name || "?"}\n\n${r.details || ""}\n\n(PCBS Job Board ${(window.PCBS_CONFIG || {}).version || ""})`;
}
function storyValid(r) { if (r.email || r.subject || r.name) return true; $("#sEmail").focus(); toast("Fill in at least the sender's email, the subject or the name"); return false; }
$("#sGitHub").onclick = () => {
  const r = storyReportData(); if (!storyValid(r)) return;
  const repo = reportRepo(); if (!repo) { $("#sCopy").click(); return; }
  const q = new URLSearchParams({ template: "story-job.yml", title: `Story Quest Report: ${r.subject || r.email || r.name}`, email: r.email, subject: r.subject, sender_name: r.name,
    details: r.details.slice(0, 5000), app_version: (window.PCBS_CONFIG || {}).version || "" });
  window.open(`https://github.com/${repo}/issues/new?${q}`, "_blank", "noopener");
  $("#dlgStory").close(); toast("Report opened on GitHub – press “Create” there to send it");
};
$("#sEmailBtn").onclick = () => {
  const r = storyReportData(); if (!storyValid(r)) return;
  const to = (window.PCBS_CONFIG || {}).storyReportEmail, subject = `Story Quest Report #${storyNumber()}`;
  location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(storyReportText(r).slice(0, 1800))}`;
  $("#dlgStory").close(); toast("Your email app opened with the report – press Send there");
};
$("#sCopy").onclick = async () => { const r = storyReportData(); if (!storyValid(r)) return; try { await navigator.clipboard.writeText(storyReportText(r)); toast("Report copied"); } catch { prompt("Copy this report:", storyReportText(r)); } };
$("#btnStory").onclick = () => openStoryReport();
