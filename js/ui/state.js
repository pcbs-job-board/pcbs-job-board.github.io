/* PCBS Job Board – Saved state of the board: jobs, hidden-objective rules, built-in detections, screen areas (all in this browser's localStorage). */
// ================= state =================
// eslint-disable-next-line prefer-const -- replaced by a backup import (ui/backup.js)
let jobs = LS.get("pcbs.jobs", []);
let rules = LS.get("pcbs.rules", null);
// saved rules from an older version
if (rules && LS.get("pcbs.rulesVer", 1) < RULES_VERSION) {
  if (LS.get("pcbs.rulesVer", 1) < 3) {
    // before the rules table (v3): the old default rules are replaced by the current set, own rules kept
    const defaults = new Set([...OLD_DEFAULT_TASKS, ...DEFAULT_RULES.map(d => d.task)]);
    rules = [...structuredClone(DEFAULT_RULES), ...rules.filter(r => !defaults.has(r.task))];
  } else {
    // since the rules table the user may have edited the defaults: only add the new words to them
    for (const d of DEFAULT_RULES) {
      const r = rules.find(x => x.task === d.task);
      if (!r) continue; // deleted on purpose → stays deleted
      for (const k of d.keys) if (!r.keys.includes(k)) r.keys.push(k);
    }
  }
  LS.set("pcbs.rules", rules);
}
LS.set("pcbs.rulesVer", RULES_VERSION);
if (!rules) rules = DEFAULT_RULES;
// eslint-disable-next-line prefer-const -- replaced by a backup import (ui/backup.js)
let smart = Object.assign({}, SMART_DEFAULT, LS.get("pcbs.smart", {})); // built-in detections on/off
// resale = PC Bay's Resale Value panel, inv = the inventory's card grid (3 columns) – both found automatically too
const DEFAULT_CROPS = {
  email: { x: 0.5, y: 0.14, w: 0.42, h: 0.68 },
  stats: { x: 0.015, y: 0.1, w: 0.265, h: 0.76 },
  resale: { x: 0.725, y: 0.1, w: 0.264, h: 0.647 },
  inv: { x: 0.337, y: 0.24, w: 0.493, h: 0.731 },
};
// eslint-disable-next-line prefer-const -- replaced by a backup import (ui/backup.js)
let crops = Object.assign(structuredClone(DEFAULT_CROPS), LS.get("pcbs.crops", {}));
// v1 → v2 migration: tables can hold only one job each
(() => {
  const seen = new Set();
  jobs.forEach(j => {
    if (j.table && seen.has(j.table)) j.table = 0;
    else if (j.table) seen.add(j.table);
  });
})();
// 0.15.2: cable sets renamed to their shop names ("Ribbon Plastic Duo Black Red" → "Ribbon Plastic Duo Red")
jobs.forEach(j => (j.swaps || []).forEach(s => ((s.old = renamedPart(s.old)), (s.new = renamedPart(s.new)))));
const save = () => LS.set("pcbs.jobs", jobs);
const TCOL = ["var(--t0)", "var(--t1)", "var(--t2)", "var(--t3)"];
