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
  const lines = [],
    words = [];
  for (const b of d.blocks || [])
    for (const p of b.paragraphs || [])
      for (const l of p.lines || []) {
        lines.push([String(l.text || "").trim(), l.confidence, l.bbox]); // bbox: where on the (cropped) picture
        for (const w of l.words || []) words.push({ text: String(w.text || ""), bbox: w.bbox });
      }
  return { text: d.text || "", lines, words };
}
// PC Stats: a name on two lines whose 2nd line the reader skipped ("MSI Radeon RX 580" / "GAMING X+ 8G" – the 1st line
// alone fits 6 cards): the line under it is read on its own and put in after it, when the two together name one part (0.16.0)
async function readStats(cv) {
  const r = await readText(cv),
    L = r.lines.filter(l => l[2]);
  if (!L.length) return r;
  const hs = L.map(l => l[2].y1 - l[2].y0).sort((a, b) => a - b),
    lh = hs[hs.length >> 1];
  const lines = r.text.split("\n");
  for (let i = 0; i < L.length; i++) {
    const [t, , b] = L[i],
      c = cleanPartLine(t);
    if (!c.branded) continue;
    const m = bestPartMatch(c.text);
    if (!m || !m.amb) continue;
    const next = L[i + 1];
    if (next && next[2].y0 - b.y1 < lh * 0.8) continue; // a line was read right under it
    // from the name's first word (not the picture's crumbs on its left) to the right edge, one line high
    // (the line's own box can reach into the 2nd line – the picture next to it is taller – so the word's box is used)
    const first = c.text.split(" ")[0],
      w0 = r.words.find(w => w.bbox && w.text.includes(first) && w.bbox.y0 >= b.y0 - 2 && w.bbox.y1 <= b.y1 + 2);
    if (!w0) continue;
    const wb = w0.bbox,
      wh = wb.y1 - wb.y0,
      x0 = Math.max(0, Math.round(wb.x0 - wh * 0.3)),
      y0 = Math.round(wb.y1 + wh * 0.15),
      y1 = Math.min(cv.height, Math.round(wb.y1 + wh * 1.6));
    if (y1 - y0 < wh * 0.8) continue;
    const cc = document.createElement("canvas");
    cc.width = cv.width - x0;
    cc.height = y1 - y0;
    cc.getContext("2d").drawImage(cv, x0, y0, cc.width, cc.height, 0, 0, cc.width, cc.height);
    const t2 = (await readText(cc)).lines
      .filter(l => l[1] >= 50)
      .map(l => cleanPartLine(String(l[0])).text.replace(/\s+[^A-Za-z0-9)+]{1,2}$/, ""))
      .join(" ")
      .trim();
    const m2 = t2 && bestPartMatch(c.text + " " + t2);
    if (!m2 || m2.amb || m2.score < m.score) continue;
    const k = lines.findIndex(x => x.trim() === t);
    if (k >= 0) lines.splice(k + 1, 0, t2);
  }
  r.text = lines.join("\n");
  return r;
}
// ★ required stars of an email job: the reader can't read the star signs ("Req: rk %"), so they are counted on the
// picture – the white shapes after the "Req:" above "Req: Level N". null = not found, 0 = no star requirement.
function starsFrom(canvas, words) {
  const req = (words || []).filter(w => /^Re[qga]\b/i.test(w.text) && w.bbox);
  if (!req.length) return null;
  const lvl = (words || []).find(w => /^Level$/i.test(w.text) && w.bbox);
  const near = (a, b) => Math.abs(a.bbox.y0 + a.bbox.y1 - b.bbox.y0 - b.bbox.y1) / 2 < (a.bbox.y1 - a.bbox.y0) * 0.7;
  const lvlReq = lvl && req.find(r => near(r, lvl));
  const star = req.filter(r => r !== lvlReq).sort((a, b) => a.bbox.y0 - b.bbox.y0)[0];
  if (!star) return lvlReq ? 0 : null;
  const b = star.bbox,
    h = b.y1 - b.y0,
    y0 = Math.max(0, Math.round(b.y0 - h * 0.25)),
    y1 = Math.min(canvas.height, Math.round(b.y1 + h * 0.15)),
    x0 = Math.max(0, Math.round(b.x0)),
    xEnd = lvl ? Math.min(canvas.width, Math.round(lvl.bbox.x1 + h * 3)) : canvas.width;
  if (xEnd - x0 < h || y1 - y0 < 4) return null;
  const px = canvas.getContext("2d", { willReadFrequently: true }).getImageData(x0, y0, xEnd - x0, y1 - y0),
    W = px.width,
    H = px.height;
  // bright, grey-ish pixels = the white text / stars on the blue band
  const on = (x, y) => {
    const i = (y * W + x) * 4,
      r = px.data[i],
      g = px.data[i + 1],
      bl = px.data[i + 2];
    return r > 175 && g > 175 && bl > 175 && Math.max(r, g, bl) - Math.min(r, g, bl) < 60;
  };
  const blobs = [];
  let cur = null;
  for (let x = 0; x < W; x++) {
    let top = -1,
      bot = -1;
    for (let y = 0; y < H; y++)
      if (on(x, y)) {
        if (top < 0) top = y;
        bot = y;
      }
    if (top >= 0) {
      if (cur && x - cur.x1 <= 1) {
        cur.x1 = x;
        cur.top = Math.min(cur.top, top);
        cur.bot = Math.max(cur.bot, bot);
      } else blobs.push((cur = { x0: x, x1: x, top, bot }));
    }
  }
  // stars: the run of same-size, wide shapes at the right end (letters of "Req:" are narrower / a different height)
  const big = blobs.filter(o => o.x1 - o.x0 + 1 >= h * 0.45 && o.bot - o.top + 1 >= h * 0.45);
  if (!big.length) return 0;
  const last = big[big.length - 1],
    w0 = last.x1 - last.x0 + 1,
    t0 = last.bot - last.top + 1;
  let n = 0;
  for (let i = big.length - 1; i >= 0; i--) {
    const o = big[i],
      w = o.x1 - o.x0 + 1,
      t = o.bot - o.top + 1;
    if (Math.abs(w - w0) > w0 * 0.25 || Math.abs(t - t0) > t0 * 0.25) break;
    n++;
  }
  return Math.min(5, n);
}
// email text with its paragraphs (0.17.0): a blank line where the gap between two lines is bigger than a line –
// the game leaves an empty line between paragraphs. Only when the lines are the same as the plain text.
function withParagraphs(r) {
  const L = (r.lines || []).filter(l => l[0] && l[2]),
    plain = r.text
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);
  if (L.length < 2 || L.length !== plain.length || L.some((l, i) => l[0] !== plain[i])) return r.text;
  const hs = L.map(l => l[2].y1 - l[2].y0).sort((a, b) => a - b),
    h = hs[hs.length >> 1];
  return L.map((l, i) => (i && l[2].y0 - L[i - 1][2].y1 > h * 0.8 ? "\n" : "") + l[0]).join("\n");
}
let lastConf = null,
  lastStars = null; // ★ counted on the last email screenshot (null = not on it)
async function ocr(img, kind) {
  await getWorker();
  $("#ocrState").textContent = `Reading ${kind === "email" ? "email" : "PC Stats"}…`;
  $("#prog").style.width = "0";
  const cv = cropCanvas(img, crops[kind === "parts" ? "stats" : kind]),
    r = await (kind === "email" ? readText(cv) : readStats(cv));
  lastConf = r.lines; // per-line certainty, used when joining screenshots
  lastStars = kind === "email" ? starsFrom(cv, r.words) : null;
  $("#prog").style.width = "100%";
  return kind === "email" ? withParagraphs(r) : r.text;
}
