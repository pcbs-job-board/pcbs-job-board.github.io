/* PCBS Job Board – Text reading (Tesseract.js): starts the reader early in the background, shows when a capture waits for it, crops and reads screenshots. */
// ================= OCR =================
let worker = null,
  workerP = null;
// "working on it" line of whichever window is reading: the job window (#ocrState) or the PC Bay window (.fstate)
function ocrNote(msg) {
  if ($("#dlgReview").open) $("#ocrState").textContent = msg;
  const fs = $("#dlgFlip").open && $("#dlgFlip .fstate");
  if (fs) fs.textContent = msg;
}
// the text reader starts once per visit (the first time it also downloads a few MB, then the browser keeps them);
// it is started early in the background (screen connected, job / PC Bay window opened) so a capture doesn't wait for it
function getWorker(quiet) {
  if (worker) return Promise.resolve(worker);
  if (!workerP) {
    if (!window.Tesseract)
      return Promise.reject(new Error("Text reader didn't load – check internet connection (needed the first time)."));
    const first = !LS.get("pcbs.ocrUsed", false);
    workerP = (async () => {
      const w = await Tesseract.createWorker("eng", 1, {
        logger: m => {
          if (m.status === "recognizing text") $("#prog").style.width = Math.round(m.progress * 100) + "%";
          else if (/^loading/.test(m.status) && !workerQuiet)
            ocrNote(
              `⏳ ${first ? "Downloading" : "Starting"} the text reader${first ? " (first time only, a few MB)" : ""}… ${m.progress ? Math.round(m.progress * 100) + "%" : ""}`
            );
        },
      });
      await w.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "0" });
      LS.set("pcbs.ocrUsed", true);
      worker = w;
      return w;
    })().catch(e => {
      workerP = null;
      throw e;
    });
  }
  if (!quiet) {
    workerQuiet = false;
    ocrNote("⏳ Starting the text reader…");
  } // a capture is waiting for it: say so
  return workerP;
}
let workerQuiet = true; // messages only once a capture waits for the reader
const warmReader = () => {
  if (window.Tesseract) getWorker(true).catch(() => {});
}; // background start, no messages
// people who have captured before get the reader started right after the page has loaded
if (LS.get("pcbs.ocrUsed", false)) setTimeout(() => (window.requestIdleCallback || setTimeout)(warmReader), 1500);
function cropCanvas(img, r) {
  const W = img.naturalWidth,
    H = img.naturalHeight,
    sx = r.x * W,
    sy = r.y * H,
    sw = r.w * W,
    sh = r.h * H;
  const scale = sw < 1300 ? Math.min(2.5, 1300 / sw) : 1;
  const c = document.createElement("canvas");
  c.width = sw * scale;
  c.height = sh * scale;
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.filter = "grayscale(1) contrast(1.15)";
  g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}
// text + every line with its certainty (0–100). Since tesseract.js 6 only the plain text comes back
// unless more is asked for, so the lines are taken from the "blocks" output (block → paragraph → line).
// several pictures at once (the 3 inventory columns): extra readers next to the main one, started only when a read
// would otherwise wait – each runs in its own thread, so 3 columns take about as long as 1
const READERS = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
const extra = [],
  idle = new Set(),
  waiting = [];
let starting = 0;
async function takeReader() {
  const main = await getWorker();
  if (!main.busy) {
    main.busy = true; // marked here, so two reads starting together never share it
    return main;
  }
  const free = extra.find(w => idle.has(w));
  if (free) {
    idle.delete(free);
    return free;
  }
  if (extra.length + starting + 1 < READERS) {
    starting++;
    try {
      const w = await Tesseract.createWorker("eng", 1);
      await w.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "0" });
      extra.push(w);
      return w;
    } catch {
      // no extra reader (memory etc.): wait for one that is running
    } finally {
      starting--;
    }
  }
  return new Promise(res => waiting.push(res));
}
function giveBack(w) {
  const next = waiting.shift();
  if (next) return next(w);
  if (w === worker) w.busy = false;
  else idle.add(w);
}
async function readText(canvas) {
  const w = await takeReader();
  let d;
  try {
    d = (await w.recognize(canvas, {}, { text: true, blocks: true })).data;
  } finally {
    giveBack(w);
  }
  const lines = [];
  for (const b of d.blocks || [])
    for (const p of b.paragraphs || [])
      for (const l of p.lines || []) lines.push([String(l.text || "").trim(), l.confidence, l.bbox]); // bbox: where on the (cropped) picture
  return { text: d.text || "", lines };
}
let lastConf = null;
async function ocr(img, kind) {
  await getWorker();
  $("#ocrState").textContent = `Reading ${kind === "email" ? "email" : "PC Stats"}…`;
  $("#prog").style.width = "0";
  const r = await readText(cropCanvas(img, crops[kind === "parts" ? "stats" : kind]));
  lastConf = r.lines; // per-line certainty, used when joining screenshots
  $("#prog").style.width = "100%";
  return r.text;
}
