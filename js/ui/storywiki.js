/* 📨 Story jobs page of the 📖 Game Wiki window (0.17.0) – every known story job (window.STORY_JOBS from
   data/story-jobs.csv), grouped by story chain: standalone jobs first, then the chains by the required level of their
   first mission, then by name. Groups start collapsed; each mission shows sender, subject and required level, and
   the rest (email text, labour, budget, objectives) only after a click on the spoiler bar. */
const STORY_STANDALONE = "Standalone story jobs";
// the groups in page order, each with its missions in quest order
function storyGroups(list) {
  const by = new Map();
  for (const st of list || []) {
    const k = st.chain || "";
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(st);
  }
  const groups = [...by].map(([chain, jobs]) => {
    jobs.sort((a, b) => (a.order || 0) - (b.order || 0) || a.id - b.id);
    return { chain, name: chain || STORY_STANDALONE, jobs, level: jobs[0].level ?? 99 };
  });
  return groups.sort((a, b) => (a.chain ? 1 : 0) - (b.chain ? 1 : 0) || a.level - b.level || a.name.localeCompare(b.name, "en"));
}
const swMoney = v => (v == null ? "?" : `$${Number(v).toLocaleString("en-US")}`);
function storyJobHtml(st, i) {
  const empty = !st.body && !st.objectives.length && st.level == null;
  return `<li class="swjob">
    <div class="swhead"><span class="swnum">${i + 1}.</span><span class="swsubj">${esc(st.subject || "(no subject)")}</span><span class="swlv">Req: Level ${st.level ?? "?"}</span></div>
    <div class="swfrom">${esc(st.email)}${st.signed ? ` · signed ${esc(st.signed)}` : ""}</div>
    <details class="swspoil"><summary>⇊ <b>[Spoiler!]</b> ⇊ Click to see more info ⇊ <b>[Spoiler!]</b> ⇊</summary>
      <div class="swdet">${
        empty
          ? `<p class="swempty">The email text and stats of this job aren't known yet – report them if you see it.</p>`
          : `<p class="swbody">${st.body ? esc(st.body) : `<span class="swempty">Email text not known yet.</span>`}</p>
        <div class="swmoney"><span><b>Labour</b> ${swMoney(st.labour)}</span><span><b>Budget</b> ${swMoney(st.budget)}</span></div>
        <div class="swobjh">Objectives</div><ul>${st.objectives.map(o => `<li>${esc(o)}</li>`).join("") || `<li class="swempty">not known yet</li>`}</ul>`
      }</div>
    </details>
  </li>`;
}
function renderStoryWiki() {
  const all = window.STORY_JOBS || [],
    q = $("#pdbFilter").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  $("#pdbFilters").innerHTML = `<button data-swreport>📖 Report missing or incorrect story</button>`;
  // the filter looks at what the page shows before a spoiler: sender, signed name, subject, group name
  const hit = st => {
    const t = `${st.email} ${st.signed} ${st.subject} ${st.chain || STORY_STANDALONE}`.toLowerCase();
    return q.every(w => t.includes(w));
  };
  const groups = storyGroups(all)
    .map(g => ({ ...g, shown: g.jobs.filter(hit) }))
    .filter(g => g.shown.length);
  const n = groups.reduce((s, g) => s + g.shown.length, 0);
  $("#pdbCount").textContent = `${n} of ${all.length} story jobs`;
  $("#pdbNote").textContent =
    "Story jobs come from career story customers: no hidden objectives, no star requirement, and the budget only counts when an objective mentions it. Missions are in quest order – for a few the order is a best guess.";
  $("#pdbStory").innerHTML =
    groups
      .map(
        g =>
          `<details class="swgroup"${q.length ? " open" : ""}><summary>${esc(g.name)} <small>${g.jobs.length} ${g.jobs.length === 1 ? "mission" : "missions"}${g.chain ? ` · starts at Level ${g.jobs[0].level ?? "?"}` : ""}</small></summary>
          <ol class="swlist">${g.jobs.map((st, i) => (g.shown.includes(st) ? storyJobHtml(st, i) : "")).join("")}</ol></details>`
      )
      .join("") || `<p class="hint">No story job matches.</p>`;
}
$("#pdbFilters").addEventListener("click", e => {
  if (e.target.closest("[data-swreport]")) openStoryReport({});
});
