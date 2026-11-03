/**
 * PCBS Job Board – report inbox (Google Apps Script).
 * Receives "Report story job" / "Report missing part" from the website, adds a row to this
 * spreadsheet and emails the owner "Story Quest Report #N" / "Missing Part Report #N".
 * The owner's address comes from the Google account the script runs as – it is never in the website.
 *
 * Several Google accounts in one browser? Apps Script often fails with "Datei kann derzeit nicht
 * geöffnet werden" / "unable to open the file" for any account that isn't the first one signed in.
 * Do the whole set-up in a private / incognito window signed in ONLY to the account that should
 * receive the reports.
 *
 * Set-up (once, ~10 min):
 *  1. Open https://sheets.new (a new Google Sheet), name it e.g. "PCBS reports".
 *  2. Extensions → Apps Script. Delete the sample code, paste this whole file, press Save (💾).
 *  3. Deploy → New deployment → ⚙ Select type: Web app.
 *       Description: PCBS reports · Execute as: Me · Who has access: Anyone → Deploy.
 *  4. Allow access when Google asks (Advanced → Go to … (unsafe) is normal for your own script).
 *     Works the same for a script created on its own in Google Drive (New → More → Google Apps Script):
 *     it then creates a "PCBS reports" spreadsheet by itself. Run "setup" once (▶ Run) to get a test email.
 *  5. Copy the "Web app URL" (https://script.google.com/macros/s/…/exec) and put it in
 *     js/config.js → reportEndpoint.
 * After editing this script later: Deploy → Manage deployments → ✎ → Version: New version → Deploy
 * (the URL stays the same).
 */
const MAX_PER_HOUR = 40;               // simple flood protection for the public form
const KINDS = {
  story: { sheet: "Story jobs", title: "Story Quest Report", cols: ["Report #", "Received", "Sender email", "Subject", "Signed name", "Details", "App version"] },
  part: { sheet: "Missing parts", title: "Missing Part Report", cols: ["Report #", "Received", "Part name", "Category", "Content", "Level", "Price", "Notes", "App version", "Level %"] },
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
      const ss = reportBook();
      let sh = ss.getSheetByName(kind.sheet);
      if (!sh) { sh = ss.insertSheet(kind.sheet); sh.appendRow(kind.cols); sh.setFrozenRows(1); }
      // a sheet made by an older version of this script: add the new heading(s) at the end
      else if (sh.getLastColumn() < kind.cols.length) sh.getRange(1, 1, 1, kind.cols.length).setValues([kind.cols]);
      const cut = v => String(v == null ? "" : v).slice(0, 5000);
      const row = d.kind === "story"
        ? [number, new Date(), cut(d.email), cut(d.subject), cut(d.name), cut(d.details), cut(d.version)]
        : [number, new Date(), cut(d.name), cut(d.cat), cut(d.dlc), cut(d.level), cut(d.price), cut(d.notes), cut(d.version), cut(d.pct)];   // Level % last – older sheets keep their columns
      sh.appendRow(row);
    } finally { lock.releaseLock(); }

    const body = d.kind === "story"
      ? `Sender's email: ${d.email || "?"}\nSubject: ${d.subject || "?"}\nSigned: ${d.name || "?"}\n\n${d.details || ""}\n\n(PCBS Job Board ${d.version || ""})`
      : `Part: ${d.name || "?"}\nCategory: ${d.cat || "?"}\nContent: ${d.dlc || "?"}\nLevel: ${d.level || "?"}${d.pct ? " (" + d.pct + "%)" : ""}\nPrice: ${d.price || "?"}\nNotes: ${d.notes || "-"}\n\n(PCBS Job Board ${d.version || ""})`;
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), `${kind.title} #${number}`, body);
    return reply({ ok: true, number });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}
// The spreadsheet for the reports: the one this script is attached to, or – for a script created on its
// own in Google Drive – a "PCBS reports" spreadsheet it creates the first time (and remembers).
function reportBook() {
  const bound = SpreadsheetApp.getActiveSpreadsheet();
  if (bound) return bound;
  const props = PropertiesService.getScriptProperties(), id = props.getProperty("sheet_id");
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { } }
  const ss = SpreadsheetApp.create("PCBS reports");
  props.setProperty("sheet_id", ss.getId());
  return ss;
}
// Run this once from the editor (select "setup" at the top, press ▶ Run): asks for the permissions,
// creates / finds the reports spreadsheet and sends you a test email.
function setup() {
  const ss = reportBook();
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), "PCBS report inbox is ready", "Reports will be saved here: " + ss.getUrl());
  Logger.log("Reports spreadsheet: " + ss.getUrl());
}
function doGet() { return reply({ ok: true, info: "PCBS Job Board report inbox is running." }); }
function reply(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
