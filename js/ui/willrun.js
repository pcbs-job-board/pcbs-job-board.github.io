/* 🎮 Will it run? page of the 📖 Game Wiki window (0.16.1) – the game's "Will it run?" app as a table:
   minimum / recommended / recommended 4K spec of each app and game (window.WILL_IT_RUN from data/will-it-run.csv,
   taken from the game wiki). The same rules as the "PC can run X (Y Spec)" objective (js/core/suggest/run.js). */
const WIR_TIERS = [
  ["min", "Minimum Spec"],
  ["rec", "Recommended Spec"],
  ["rec4k", "Recommended 4k Spec"],
];
const wir = { dlc: "" }; // DLC filter: "" = all, "-" = base game only, else the DLC name
const wirGB = gb => (+gb >= 1000 ? `${+gb / 1000} TB` : `${gb} GB`);
// one spec cell: CPU, GPU + VRAM, RAM + storage
function wirCell(s) {
  if (!s) return `<span class="hint">–</span>`;
  const [cpu, gpu, ram, vram, storage] = s;
  return [
    `<b>CPU</b> ${esc(cpu)}`,
    `<b>GPU</b> ${esc(gpu)}${vram ? ` · ${esc(vram)} GB VRAM` : ""}`,
    `<b>RAM</b> ${esc(wirGB(ram || 0))} · <b>Storage</b> ${esc(wirGB(storage || 0))}`,
  ].join("<br>");
}
function renderWillRun() {
  const all = window.WILL_IT_RUN || [],
    q = $("#pdbFilter").value.trim().toLowerCase().split(/\s+/).filter(Boolean),
    dlcs = [...new Set(all.map(a => a.dlc).filter(Boolean))].sort();
  $("#pdbFilters").innerHTML =
    `<label class="pdbf">DLC <select data-wirdlc><option value="">All</option><option value="-"${wir.dlc === "-" ? " selected" : ""}>Base game</option>` +
    dlcs.map(d => `<option${wir.dlc === d ? " selected" : ""}>${esc(d)}</option>`).join("") +
    `</select></label>`;
  const rows = all.filter(a => {
    const text = `${a.app} ${a.based || ""}`.toLowerCase();
    return q.every(w => text.includes(w)) && (!wir.dlc || (wir.dlc === "-" ? !a.dlc : a.dlc === wir.dlc));
  });
  $("#pdbCount").textContent = `${rows.length} of ${all.length} apps and games`;
  $("#pdbNote").textContent =
    'A spec is met with the listed CPU or better and the listed GPU chip or better (by part ranking, not 3DMark), at least the listed VRAM, and at least the listed RAM and storage in total. Jobs ask for it as "PC can run X (Minimum Spec)", "(Recommended Spec)" or "(Recommended 4k Spec)".';
  $("#pdbTable").innerHTML =
    `<thead><tr><th>App / game</th>${WIR_TIERS.map(([, l]) => `<th>${esc(l)}</th>`).join("")}</tr></thead>
    <tbody>${
      rows
        .map(
          a =>
            `<tr><td class="pdbname">${esc(a.app)}${a.dlc ? `<br><small class="hint">${esc(a.dlc)} DLC</small>` : ""}${a.based ? `<br><small class="hint">like ${esc(a.based)}</small>` : ""}</td>${WIR_TIERS.map(([k]) => `<td class="wircell">${wirCell(a[k])}</td>`).join("")}</tr>`
        )
        .join("") || `<tr><td colspan="4" class="hint">No app or game matches.</td></tr>`
    }</tbody>`;
}
$("#pdbFilters").addEventListener("change", e => {
  const s = e.target.closest("[data-wirdlc]");
  if (!s) return;
  wir.dlc = s.value;
  renderWillRun();
  $("#pdbWrap").scrollTo(0, 0);
});
