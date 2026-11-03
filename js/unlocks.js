/* In-game unlocks by career level (programs, tools, shops) – the "Tools & Software" list of the game.
   3DMark isn't bought: it's there from the start. Some help in this app waits for the matching unlock, so it never
   suggests something the player can't do in the game yet (career level not set = everything allowed). */
const UNLOCKS = [
  [1, ["E-mail", "Shop", "System Info", "Will it run?", "Part Ranking", "3DMark", "Cloud Notes", "Compressed Air", "Thermal Paste", "OS Installation USB Drive 1"]],
  [2, ["Auto-Connect Tool"]],
  [3, ["Bongle"]],
  [4, ["Quick-Screw Tool", "OS Installation USB Drive 2"]],
  [5, ["Peripheral Shop"]],
  [6, ["OCCT", "Quick-Cable Tool"]],
  [8, ["Auto-Standoff Tool", "OS Installation USB Drive 3"]],
  [9, ["PC Bay"]],
  [11, ["Market"]],
  [12, ["Faster Installation Upgrade"]],
  [13, ["GPU Tuner"]],
  [14, ["Auto-Screw Tool"]],
  [16, ["Custom Water Cooling Shop", "Auto-Cable Tool"]],
];
// app features that wait for an unlock
const GATES = {
  cpuOC: { lvl: 6, tool: "OCCT", what: "CPU overclocking help" },
  pcBay: { lvl: 9, tool: "PC Bay", what: "PC Bay (coming later)" },
  gpuOC: { lvl: 13, tool: "GPU Tuner", what: "GPU overclocking help" },
  customWC: { lvl: 16, tool: "Custom Water Cooling Shop", what: "custom water cooling parts in suggestions" },
};
function hasUnlock(k) { return career.level == null || career.level >= GATES[k].lvl; }
function gateMsg(k) { return `${GATES[k].what.replace(/ help$/, "")} needs <b>${GATES[k].tool}</b> – unlocks at career level ${GATES[k].lvl}${career.level != null ? ` (you're level ${career.level})` : ""}`; }
const UL_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7.5 13.5 12 9l4.5 4.5M7.5 17.5 12 13l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
function unlocksHtml() {
  const lv = career.level, appFor = name => Object.values(GATES).find(g => g.tool === name);
  return `<div class="ulbox"><div class="ulhead">Career unlocks <small>${lv == null ? "– set your career level to see what's unlocked" : `– you're level ${lv}`}</small></div>
    ${UNLOCKS.map(([l, names]) => { const ok = lv == null || lv >= l; return `<div class="ulrow ${ok ? "ok" : "no"}${lv === l ? " now" : ""}"><b class="ullv">Lv ${l}</b><div class="ulnames">${names.map(n => { const g = appFor(n); return `<span class="ul">${ok ? "✓" : "🔒"} ${esc(n)}${g ? ` <small>→ ${esc(g.what)}</small>` : ""}</span>`; }).join("")}</div></div>`; }).join("")}</div>`;
}
if (typeof module !== "undefined") module.exports = { UNLOCKS, GATES, hasUnlock };
