/* Story jobs: the banner in the new-job window and "Report story job" (report inbox, GitHub issue or copy).
   Known story jobs come from data/story-jobs.csv (built into data/parts-db.js as window.STORY_JOBS); the Game Wiki
   lists them (js/ui/storywiki.js). */

// banner above the hidden objectives: known story job / looks like one / nothing
function storyBanner(d) {
  if (d.storyKnown)
    return `<div class="storybanner known" id="storyBanner">📖 <b>Story job</b> – ${esc(d.storyKnown)}. Story jobs have no hidden objectives, and the budget only counts when an objective mentions it.</div>`;
  if (d.story && !d.storyWhy)
    return `<div class="storybanner" id="storyBanner">📖 <b>Marked as a story job</b> – it isn't in the list of known story jobs yet. Help other players by reporting it.
    <div class="btnrow"><button id="storyReportFromCapture">📖 Report story job</button></div></div>`;
  if (d.story && d.storyWhy)
    return `<div class="storybanner" id="storyBanner">📖 <b>Looks like a story job</b> <small>(${esc(d.storyWhy)})</small> – it isn't in the list of known story jobs yet. Help other players by reporting it.
    <div class="btnrow"><button id="storyReportFromCapture">📖 Report story job</button></div></div>`;
  return `<span id="storyBanner" hidden></span>`;
}
function bindStoryBanner() {
  const b = $("#storyReportFromCapture");
  if (b) b.onclick = () => openStoryReport(storyDraftFromForm());
}
function storyDraftFromForm() {
  const d = rev?.draft || {};
  return {
    email: $("#fSender")?.value.trim() || d.sender || "",
    subject: $("#fSubject")?.value.trim() || d.subject || "",
    name: (d.signature || []).slice(-1)[0] || "",
    labour: $("#fLabour")?.value || d.labour || "",
    budget: $("#fBudget")?.value || d.budget || "",
    level: d.level ?? "",
    objectives: ($("#fObj")?.value || (d.objectives || []).join("\n")).trim(),
    body: d.bodyText || d.body || "", // with its paragraphs (0.17.0)
  };
}
// the report: every field of a story job (as data/story-jobs.csv keeps it), the email text with its paragraphs
const STORY_FIELDS = [
  ["email", "#sEmail"],
  ["subject", "#sSubject"],
  ["name", "#sName"],
  ["level", "#sLevel"],
  ["labour", "#sLabour"],
  ["budget", "#sBudget"],
  ["body", "#sBody"],
  ["objectives", "#sObjectives"],
  ["notes", "#sNotes"],
];
function openStoryReport(pre = {}) {
  for (const [k, sel] of STORY_FIELDS) $(sel).value = pre[k] ?? "";
  const direct = !!(window.PCBS_CONFIG || {}).reportEndpoint;
  // with the report inbox there is just one button; GitHub / copy are only the fallback without it
  $("#sDirect").hidden = !direct;
  $("#sGitHub").hidden = direct;
  $("#sCopy").hidden = direct;
  $("#sRepoHint").textContent = direct
    ? ""
    : reportRepo()
      ? `Opens a pre-filled report on github.com/${reportRepo()} (needs a free GitHub account).`
      : "";
  $("#dlgStory").showModal();
  (pre.email ? $("#sBody") : $("#sEmail")).focus();
}
function storyReportData() {
  const r = {};
  // trim the ends only – the paragraphs (empty lines) inside the email text stay
  for (const [k, sel] of STORY_FIELDS) r[k] = $(sel).value.replace(/\r/g, "").trim();
  r.objectives = r.objectives
    .split("\n")
    .map(l => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean)
    .join("\n");
  r.details = storyDetails(r);
  return r;
}
// everything after sender / subject / name as one text (the report inbox and GitHub keep it in one field too)
function storyDetails(r) {
  return [
    `Req: Level ${r.level || "?"}\nLabour: $${r.labour || "?"}\nBudget: $${r.budget || "?"}`,
    "Objectives:\n" + (r.objectives ? r.objectives.replace(/^/gm, "- ") : "?"),
    "Email text:\n" + (r.body || "?"),
    r.notes && "Notes:\n" + r.notes,
  ]
    .filter(Boolean)
    .join("\n\n");
}
function storyReportText(r) {
  return `Sender's email: ${r.email || "?"}\nSubject: ${r.subject || "?"}\nSigned: ${r.name || "?"}\n\n${r.details}\n\n(PCBS Job Board ${(window.PCBS_CONFIG || {}).version || ""})`;
}
function storyValid(r) {
  if (r.email || r.subject) return true;
  $("#sEmail").focus();
  toast("Fill in at least the sender's email or the subject");
  return false;
}
$("#sGitHub").onclick = () => {
  const r = storyReportData();
  if (!storyValid(r)) return;
  const repo = reportRepo();
  if (!repo) {
    $("#sCopy").click();
    return;
  }
  const q = new URLSearchParams({
    template: "story-job.yml",
    title: `Story Quest Report: ${r.subject || r.email || r.name}`,
    email: r.email,
    subject: r.subject,
    sender_name: r.name,
    level: r.level,
    labour: r.labour,
    budget: r.budget,
    objectives: r.objectives,
    body: r.body.slice(0, 5000),
    notes: r.notes,
    app_version: (window.PCBS_CONFIG || {}).version || "",
  });
  window.open(`https://github.com/${repo}/issues/new?${q}`, "_blank", "noopener");
  $("#dlgStory").close();
  toast("Report opened on GitHub – press “Create” there to send it");
};
$("#sDirect").onclick = async () => {
  const r = storyReportData();
  if (!storyValid(r)) return;
  if (await sendReport("story", r, "#sDirect")) $("#dlgStory").close();
};
$("#sCopy").onclick = async () => {
  const r = storyReportData();
  if (!storyValid(r)) return;
  try {
    await navigator.clipboard.writeText(storyReportText(r));
    toast("Report copied");
  } catch {
    prompt("Copy this report:", storyReportText(r));
  }
};

// ---- sending a report to the developer's report inbox (Google Apps Script, see tools/report-endpoint.gs) ----
// No account needed and no address shown. The answer carries the report number.
async function sendReport(kind, data, btnSel) {
  const ep = (window.PCBS_CONFIG || {}).reportEndpoint;
  if (!ep) return false;
  const btn = btnSel && $(btnSel),
    label = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Sending…";
  }
  try {
    // text/plain keeps it a "simple" request (no CORS pre-check, which Apps Script doesn't answer)
    const res = await fetch(ep, {
      method: "POST",
      body: JSON.stringify({ kind, ...data, version: (window.PCBS_CONFIG || {}).version || "", website: "" }),
    });
    const out = await res.json().catch(() => ({ ok: res.ok }));
    if (!out.ok) throw new Error(out.error || "not accepted");
    toast(out.number ? `Thanks! Report #${out.number} sent.` : "Thanks! Report sent.");
    return true;
  } catch (e) {
    toast(
      "Couldn't send the report (" + (e.message || "no connection") + "). Please check your internet connection and try again."
    );
    return false;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = label;
    }
  }
}
