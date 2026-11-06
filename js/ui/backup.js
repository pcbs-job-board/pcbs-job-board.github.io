/* PCBS Job Board – Backup: export / import of all jobs and settings as one JSON file. */
// ================= export / import =================
$("#btnExport").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(
      [JSON.stringify({ version: 2, jobs, rules, smart, crops, partsHistory, dlc: dlcOn, gameVersion, career }, null, 1)],
      { type: "application/json" }
    )
  );
  a.download = "pcbs-jobs-backup.json";
  a.click();
};
$("#btnImport").onclick = () => $("#importFile").click();
$("#importFile").onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  f.text().then(t => {
    try {
      const d = JSON.parse(t);
      jobs = d.jobs || [];
      if (d.rules) rules = d.rules;
      if (d.smart) {
        smart = Object.assign({}, SMART_DEFAULT, d.smart);
        LS.set("pcbs.smart", smart);
      }
      if (d.crops) {
        crops = Object.assign(structuredClone(DEFAULT_CROPS), d.crops);
        areasSet = { email: true, stats: true, resale: !!d.crops.resale, inv: !!d.crops.inv };
        LS.set("pcbs.areasSet", areasSet);
        renderAreaStatus();
      }
      if (d.career) {
        setCareer(d.career.level, d.career.pct);
        showCareer();
      }
      if (d.dlc) {
        Object.assign(dlcOn, d.dlc);
        LS.set("pcbs.dlc", dlcOn);
      }
      if (d.gameVersion && typeof setGameVersion === "function") setGameVersion(d.gameVersion);
      if (d.partsHistory) partsHistory = d.partsHistory.map(p => (typeof p === "string" ? { name: p, cat: categorize(p) } : p));
      const seen = new Set();
      jobs.forEach(j => {
        if (j.table && seen.has(j.table)) j.table = 0;
        else if (j.table) seen.add(j.table);
      });
      LS.set("pcbs.rules", rules);
      LS.set("pcbs.crops", crops);
      LS.set("pcbs.partsHistory", partsHistory);
      buildIndex();
      save();
      render();
      if ($("#dlgSettings").open) renderSettings();
      toast("Backup imported");
    } catch {
      toast("That file isn't a valid backup");
    }
  });
  e.target.value = "";
};
