/**
 * PCBS Job Board – report inbox (Google Apps Script).
 * Receives "Report story job" / "Report missing part" from the website, adds a row to this
 * spreadsheet and emails the owner "Story Quest Report #N" / "Missing Part Report #N".
 * The owner's address comes from the Google account the script runs as – it is never in the website.
 *
 * Set-up (once, ~10 min):
 *  1. Open https://sheets.new (a new Google Sheet), name it e.g. "PCBS reports".
 *  2. Extensions → Apps Script. Delete the sample code, paste this whole file, press Save (💾).
 *  3. Deploy → New deployment → ⚙ Select type: Web app.
 *       Description: PCBS reports · Execute as: Me · Who has access: Anyone → Deploy.
 *  4. Allow access when Google asks (Advanced → Go to … (unsafe) is normal for your own script).
 *  5. Copy the "Web app URL" (https://script.google.com/macros/s/…/exec) and put it in
 *     js/config.js → reportEndpoint.
 * After editing this script later: Deploy → Manage deployments → ✎ → Version: New version → Deploy
 * (the URL stays the same).
 */
const MAX_PER_HOUR = 40;               // simple flood protection for the public form
const KINDS = {
  story: { sheet: "Story jobs", title: "Story Quest Report", cols: ["Report #", "Received", "Sender email", "Subject", "Signed name", "Details", "App version"] },
  part: { sheet: "Missing parts", title: "Missing Part Report", cols: ["Report #", "Received", "Part name", "Category", "Content", "Level", "Price", "Notes", "App version"] },
};

function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const kind = KINDS[d.kind];
    if (!kind) return reply({ ok: false, error: "unknown report type" });
    if (d.website) return reply({ ok: true, number: 0 });            // honeypot field filled → a bot
    const cache = CacheService.getScriptCache(), n = Number(cache.get("count") || 0);
    if (n >= MAX_PER_HOUR) return reply({ ok: false, error: "Too many reports right now – please try again later." });
    cache.put("count", String(n + 1), 3600);

    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    let number;
    try {
      const props = PropertiesService.getScriptProperties(), key = "next_" + d.kind;
      number = Number(props.getProperty(key) || 1); props.setProperty(key, String(number + 1));
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sh = ss.getSheetByName(kind.sheet);
      if (!sh) { sh = ss.insertSheet(kind.sheet); sh.appendRow(kind.cols); sh.setFrozenRows(1); }
      const cut = v => String(v == null ? "" : v).slice(0, 5000);
      const row = d.kind === "story"
        ? [number, new Date(), cut(d.email), cut(d.subject), cut(d.name), cut(d.details), cut(d.version)]
        : [number, new Date(), cut(d.name), cut(d.cat), cut(d.dlc), cut(d.level), cut(d.price), cut(d.notes), cut(d.version)];
      sh.appendRow(row);
    } finally { lock.releaseLock(); }

    const body = d.kind === "story"
      ? `Sender's email: ${d.email || "?"}\nSubject: ${d.subject || "?"}\nSigned: ${d.name || "?"}\n\n${d.details || ""}\n\n(PCBS Job Board ${d.version || ""})`
      : `Part: ${d.name || "?"}\nCategory: ${d.cat || "?"}\nContent: ${d.dlc || "?"}\nLevel: ${d.level || "?"}\nPrice: ${d.price || "?"}\nNotes: ${d.notes || "-"}\n\n(PCBS Job Board ${d.version || ""})`;
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), `${kind.title} #${number}`, body);
    return reply({ ok: true, number });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}
function doGet() { return reply({ ok: true, info: "PCBS Job Board report inbox is running." }); }
function reply(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
