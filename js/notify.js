/* 🔔 in the top bar – only shown when there is something to tell:
   - a newer version of the tool is online (checked on load, every 30 min and when the tab is opened again)
   - the tool was updated since the last visit – a short "what's new" from CHANGELOG.md
   Both need the page to be served (GitHub Pages); opened from disk the bell simply never appears. */
const APP_VER = (window.PCBS_CONFIG || {}).version || "";
const verCmp = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
const noti = { newer: null, updated: null, whatsNew: null, more: 0 };

// first visit ever → nothing to announce; an existing user without the marker → they just got this update
(() => {
  const seen = LS.get("pcbs.seenVersion", null);
  if (seen === null) {
    if (RETURNING) noti.updated = APP_VER; else LS.set("pcbs.seenVersion", APP_VER);
  } else if (seen && APP_VER && verCmp(APP_VER, seen) > 0) noti.updated = APP_VER;
})();

async function loadWhatsNew() {
  try {
    const t = await (await fetch("CHANGELOG.md", { cache: "no-store" })).text();
    const m = t.split(/\n(?=## )/).find(s => s.startsWith("## " + APP_VER));
    const items = m ? m.split("\n").filter(l => l.startsWith("- ")).map(l => l.slice(2).trim()) : [];
    noti.whatsNew = items.slice(0, 4); noti.more = Math.max(0, items.length - 4);
  } catch { noti.whatsNew = []; }
  renderNotify();
}
let lastCheck = 0;
async function checkForUpdate() {
  if (location.protocol === "file:" || Date.now() - lastCheck < 5 * 60e3) return;
  lastCheck = Date.now();
  try {
    const t = await (await fetch("js/config.js?t=" + Date.now(), { cache: "no-store" })).text();
    const v = (t.match(/version:\s*["']([\d.]+)["']/) || [])[1];
    if (v && APP_VER && verCmp(v, APP_VER) > 0 && noti.newer !== v) { noti.newer = v; renderNotify(); }
  } catch { }
}
function renderNotify() {
  const box = $("#notify"), panel = $("#notiPanel"), items = [];
  if (noti.newer) items.push(`<div class="noti new"><b>⬆ New version ${esc(noti.newer)} is available</b>
    <small>Reload to get it – your jobs and settings stay as they are.</small>
    <div class="btnrow"><button class="primary" id="notiReload">↻ Reload now</button></div></div>`);
  if (noti.updated) items.push(`<div class="noti upd"><b>✨ Updated to version ${esc(noti.updated)}</b>
    ${noti.whatsNew?.length ? `<ul>${noti.whatsNew.map(w => `<li>${esc(w)}</li>`).join("")}</ul>${noti.more ? `<small>…and ${noti.more} more.</small>` : ""}` : ""}
    <div class="btnrow"><a href="${esc(changelogUrl())}" id="notiLog">📜 Full changelog</a><span class="spacer"></span><button id="notiSeen">Got it</button></div></div>`);
  box.hidden = !items.length;
  if (!items.length) { panel.hidden = true; return; }
  panel.innerHTML = items.join("");
  $("#btnNotify").title = items.length + " notification" + (items.length > 1 ? "s" : "");
  // a one-off address skips every cached copy of the page; the start-up code below removes it from the address bar again
  $("#notiReload")?.addEventListener("click", () => { location.href = location.pathname + "?fresh=" + Date.now(); });
  $("#notiLog")?.addEventListener("click", e => openChangelog(e));
  $("#notiSeen")?.addEventListener("click", () => { LS.set("pcbs.seenVersion", APP_VER); noti.updated = null; renderNotify(); });
}
$("#btnNotify").onclick = e => { e.stopPropagation(); $("#notiPanel").hidden = !$("#notiPanel").hidden; };
document.addEventListener("click", e => { if (!e.target.closest("#notify")) $("#notiPanel").hidden = true; });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#notiPanel").hidden) $("#notiPanel").hidden = true; });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkForUpdate(); });
setInterval(checkForUpdate, 30 * 60e3);
if (noti.updated) loadWhatsNew(); else renderNotify();
checkForUpdate();

// ---- never run on a stale stylesheet / address ----
// 1) "?v=0.12.2" / "?fresh=…" in the address only forced a fresh load – remove it, so a bookmark or a restored tab
//    never keeps pointing at an old version's address
if (/[?&](v|fresh)=/.test(location.search) && history.replaceState) history.replaceState(null, "", location.pathname + location.hash);
// 2) the stylesheet carries its version (--css-ver); if the browser handed us an older cached one, load it again fresh
(function cssCheck() {
  const link = document.querySelector('link[rel="stylesheet"][href*="style.css"]'); if (!link || !APP_VER) return;
  const ok = () => getComputedStyle(document.documentElement).getPropertyValue("--css-ver").replace(/["'\s]/g, "") === APP_VER;
  const fix = () => { if (ok()) return; const n = link.cloneNode(); n.href = "css/style.css?v=" + APP_VER + "&t=" + Date.now(); n.onload = () => link.remove(); link.after(n); };
  if (link.sheet) fix(); else link.addEventListener("load", fix, { once: true });
})();
