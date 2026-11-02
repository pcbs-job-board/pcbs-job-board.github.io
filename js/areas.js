/* Finding the email window and the PC Stats popup in a screenshot – by colour, no OCR needed.
   Works on a small copy of the frame (AREA_W pixels wide); returns a box as fractions of the
   frame { x, y, w, h } (the same format as the saved crop areas), or null.
   - Email: the reading pane is a light grey "paper" column right of the inbox. Its left/right
     edges are where long empty paper runs start and end; it reaches from the black title bar
     down to the dark task bar (it holds the blue Labour band, the objectives and the buttons).
   - PC Stats: the popup is the brightest large panel (everything behind it is dimmed). */
const AREA_W = 800;
const px = (d, w, x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
const isPaper = ([r, g, b]) => Math.min(r, g, b) > 215 && Math.max(r, g, b) - Math.min(r, g, b) < 14;     // email page
const isBright = ([r, g, b]) => Math.min(r, g, b) > 243 && Math.max(r, g, b) - Math.min(r, g, b) < 14;    // PC Stats panel
const isDark = ([r, g, b]) => Math.max(r, g, b) < 75;                                                      // title / task bar
const isBand = ([r, g, b]) => b > 110 && b - r > 60 && r < 90 && g < 120;                                // Labour / Budget band

// outermost edge that enough rows agree on (rows with text or pictures start later / end sooner)
function edge(vals, step, side) {
  const c = new Map(); for (const v of vals) { const k = Math.round(v / step); c.set(k, (c.get(k) || 0) + 1); }
  const need = Math.max(4, vals.length * 0.06), ks = [...c].filter(([, n]) => n >= need).map(([k]) => k * step);
  return ks.length ? { v: side === "left" ? Math.min(...ks) : Math.max(...ks) } : null;
}
// most common value (rounded to `step`) – robust against rows where text splits a run
function modeOf(vals, step) {
  const c = new Map(); for (const v of vals) { const k = Math.round(v / step); c.set(k, (c.get(k) || 0) + 1); }
  let best = null, n = 0; for (const [k, m] of c) if (m > n) { n = m; best = k; }
  return best == null ? null : { v: best * step, n };
}
// horizontal runs of pixels passing `test` that are at least `minLen` long, per row
function runs(img, test, minLen, y0 = 0, y1 = img.height) {
  const { data: d, width: w } = img, out = [];
  for (let y = y0; y < y1; y++) {
    let s = -1;
    for (let x = 0; x <= w; x++) {
      const ok = x < w && test(px(d, w, x, y));
      if (ok && s < 0) s = x;
      if (!ok && s >= 0) { if (x - s >= minLen) out.push({ y, x0: s, x1: x }); s = -1; }
    }
  }
  return out;
}

function findEmail(img) {
  const { width: w, height: h, data: d } = img;
  // 1. pane edges: long paper runs in the right part of the frame (the inbox list is on the left)
  const rs = runs(img, isPaper, w * 0.18).filter(r => (r.x0 + r.x1) / 2 > w * 0.4);
  if (rs.length < 8) return null;
  const L = modeOf(rs.map(r => r.x0), 3), R = modeOf(rs.map(r => r.x1), 3);
  if (!L || !R || R.v - L.v < w * 0.2) return null;
  // the blue Labour band confirms it is the email (rows mostly band-coloured between the edges)
  let band = 0;
  for (let y = 0; y < h; y++) { let n = 0; for (let x = L.v; x < R.v; x += 2) if (isBand(px(d, w, x, y))) n++; if (n > (R.v - L.v) / 2 * 0.6) band++; }
  // 2. top / bottom: walk up and down a column just inside the left edge until the dark bars
  const cx = Math.min(w - 1, L.v + 4), paperYs = rs.filter(r => Math.abs(r.x0 - L.v) <= 6).map(r => r.y);
  const mid = paperYs[Math.floor(paperYs.length / 2)];
  let top = mid, bot = mid, gap = 0;
  for (let y = mid; y >= 0; y--) { if (isDark(px(d, w, cx, y))) { if (++gap > 2) break; } else { gap = 0; top = y; } }
  gap = 0;
  for (let y = mid; y < h; y++) { if (isDark(px(d, w, cx, y))) { if (++gap > 2) break; } else { gap = 0; bot = y; } }
  if (bot - top < h * 0.3) return null;
  const pad = 2;
  return { box: frac(L.v - pad, top, R.v + pad * 3, bot + 1, w, h), sure: band >= 4 };
}

function findStats(img) {
  const { width: w, height: h, data: d } = img;
  const rs = runs(img, isBright, w * 0.12).filter(r => r.x0 < w * 0.75);
  if (rs.length < 8) return null;
  const L = edge(rs.map(r => r.x0), 3, "left"), R = edge(rs.map(r => r.x1), 3, "right");
  if (!L || !R || R.v - L.v < w * 0.12) return null;
  // rows where most of the panel width is bright = the popup (item pictures leave the text side bright)
  const rowOk = y => { let n = 0, t = 0; for (let x = L.v; x < R.v; x += 2) { t++; if (isBright(px(d, w, x, y))) n++; } return n / t > 0.45; };
  const ys = []; for (let y = 0; y < h; y++) if (rowOk(y)) ys.push(y);
  if (!ys.length) return null;
  // longest stretch of panel rows, allowing small gaps (separator line, item pictures)
  let best = [ys[0], ys[0]], cur = [ys[0], ys[0]];
  for (const y of ys.slice(1)) { if (y - cur[1] <= h * 0.06) cur[1] = y; else cur = [y, y]; if (cur[1] - cur[0] > best[1] - best[0]) best = [...cur]; }
  if (best[1] - best[0] < h * 0.3) return null;
  const [x0, x1] = widen(img, isBright, L.v, R.v, best[0], best[1]);
  return { box: frac(x0 - 1, best[0], x1 + 2, best[1] + 2, w, h), sure: true };
}
// push a left / right edge outwards while that column is still mostly panel-coloured
function widen(img, test, x0, x1, y0, y1) {
  const { data: d, width: w } = img, step = Math.max(1, Math.floor((y1 - y0) / 120));
  const colOk = x => { let n = 0, t = 0; for (let y = y0; y < y1; y += step) { t++; if (test(px(d, w, x, y))) n++; } return n / t > 0.5; };
  // look a little further out too: a column of item pictures can sit between the text and the panel's edge
  const far = (from, dir, reach) => {
    let best = from, run = 0;
    for (let x = from + dir, n = 0; x >= 0 && x < w && n < reach; x += dir, n++) {
      if (colOk(x)) { if (++run >= 3) best = x; } else run = 0;
    }
    return best;
  };
  return [far(x0, -1, Math.round(w * 0.1)), far(x1, 1, Math.round(w * 0.05))];
}
const frac = (x0, y0, x1, y1, w, h) => {
  const c = (v, m) => Math.max(0, Math.min(m, v));
  x0 = c(x0, w); x1 = c(x1, w); y0 = c(y0, h); y1 = c(y1, h);
  return { x: x0 / w, y: y0 / h, w: (x1 - x0) / w, h: (y1 - y0) / h };
};
// kind: "email" | "stats"  →  { box, sure } or null
function detectArea(img, kind) { return kind === "stats" ? findStats(img) : findEmail(img); }
// browser helper: <img>/<canvas> → small ImageData
function areaImage(src) {
  const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height, h = Math.round(AREA_W * sh / sw);
  const c = document.createElement("canvas"); c.width = AREA_W; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(src, 0, 0, AREA_W, h);
  return g.getImageData(0, 0, AREA_W, h);
}
if (typeof module !== "undefined") module.exports = { detectArea, AREA_W };

// ================= "Set up screen areas" window (browser only) =================
// Hidden "set up" flag per area. Boxes that were moved before this existed count as set up.
let areasSet = typeof LS !== "undefined" ? LS.get("pcbs.areasSet", null) : null;
if (typeof LS !== "undefined" && !areasSet) {
  const saved = LS.get("pcbs.crops", null), moved = k => !!saved?.[k] && JSON.stringify(saved[k]) !== JSON.stringify(DEFAULT_CROPS[k]);
  areasSet = { email: moved("email"), stats: moved("stats") }; LS.set("pcbs.areasSet", areasSet);
}
const AREA_NAME = { email: "email", stats: "PC Stats" };
let areaEd = null; // { kind, img, box, done }
const lastFrame = {}; // newest screenshot per area – used by "Set up again" in Settings

// open the window for one area; done(confirmed) is called when it closes
function openAreas(kind, src, done) {
  areaEd = { kind, box: null, done, confirmed: false };
  lastFrame[kind] = src.currentSrc || src.src || lastFrame[kind];
  const dlg = $("#dlgAreas"), im = $("#areaImg");
  $("#areaTitle").textContent = `🎯 Set up the ${AREA_NAME[kind]} area`;
  dlg.classList.toggle("stats", kind === "stats");
  im.onload = () => { detectNow(); };
  im.src = lastFrame[kind];
  if (!dlg.open) dlg.showModal();
  if (im.complete && im.naturalWidth) detectNow();
}
function detectNow() {
  const k = areaEd.kind, im = $("#areaImg");
  let r = null; try { r = detectArea(areaImage(im), k); } catch { }
  const msg = $("#areaMsg");
  if (r) {
    areaEd.box = r.box;
    msg.className = "areamsg ok";
    msg.innerHTML = k === "email" ? "✓ Found the email window. Check the box covers the whole email – from the sender at the top to the Accept / Go to PC buttons – then press <b>Use this area</b>."
      : "✓ Found the PC Stats window. Check the box covers it from “PC for …” down to the last part, then press <b>Use this area</b>.";
  } else {
    areaEd.box = structuredClone(crops[k]);
    msg.className = "areamsg bad";
    msg.innerHTML = k === "email" ? "Couldn't find the email window on this screenshot. Is an email open in-game? You can also drag a box over it yourself."
      : "Couldn't find the PC Stats window. Open it in-game (<b>PC Stats</b> button in the email) and capture again – or drag a box over it yourself.";
  }
  drawAreaBox();
}
function drawAreaBox() {
  const el = $("#areaBox"), b = areaEd?.box;
  el.hidden = !b; $("#areaUse").disabled = !b;
  if (b) Object.assign(el.style, { left: b.x * 100 + "%", top: b.y * 100 + "%", width: b.w * 100 + "%", height: b.h * 100 + "%" });
}
// drag inside the box = move, drag a corner/edge handle = resize, drag elsewhere = draw a new box
(() => {
  if (typeof document === "undefined") return;
  const wrap = $("#areaWrap"); let drag = null;
  const pos = e => { const r = wrap.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  wrap.addEventListener("pointerdown", e => {
    if (!areaEd) return; e.preventDefault(); wrap.setPointerCapture(e.pointerId);
    const p = pos(e), h = e.target.dataset.h, b = areaEd.box;
    drag = h ? { mode: h, p0: p, b0: { ...b } } : e.target.closest("#areaBox") ? { mode: "move", p0: p, b0: { ...b } } : { mode: "draw", p0: p, b0: b };
  });
  wrap.addEventListener("pointermove", e => {
    if (!drag) return; const p = pos(e), { p0, b0 } = drag, dx = p.x - p0.x, dy = p.y - p0.y;
    let b;
    if (drag.mode === "draw") b = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(dx), h: Math.abs(dy) };
    else if (drag.mode === "move") b = { ...b0, x: Math.min(1 - b0.w, Math.max(0, b0.x + dx)), y: Math.min(1 - b0.h, Math.max(0, b0.y + dy)) };
    else {
      let x0 = b0.x, y0 = b0.y, x1 = b0.x + b0.w, y1 = b0.y + b0.h; const m = drag.mode;
      if (m.includes("w")) x0 = Math.min(x1 - .02, b0.x + dx); if (m.includes("e")) x1 = Math.max(x0 + .02, b0.x + b0.w + dx);
      if (m.includes("n")) y0 = Math.min(y1 - .02, b0.y + dy); if (m.includes("s")) y1 = Math.max(y0 + .02, b0.y + b0.h + dy);
      b = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    areaEd.box = b; drawAreaBox();
  });
  wrap.addEventListener("pointerup", () => {
    if (!drag) return;
    if (drag.mode === "draw" && (areaEd.box.w < .03 || areaEd.box.h < .03)) areaEd.box = drag.b0 || null;
    drag = null; drawAreaBox();
  });
  $("#areaUse").onclick = () => {
    const k = areaEd.kind; crops[k] = areaEd.box; LS.set("pcbs.crops", crops);
    areasSet[k] = true; LS.set("pcbs.areasSet", areasSet); areaEd.confirmed = true;
    $("#dlgAreas").close(); if (typeof drawCrops === "function") drawCrops(); renderAreaStatus();
    toast(`${AREA_NAME[k][0].toUpperCase() + AREA_NAME[k].slice(1)} area saved`);
  };
  $("#areaRedetect").onclick = detectNow;
  $("#areaDraw").onclick = () => {
    areaEd.box = null; drawAreaBox();
    $("#areaMsg").className = "areamsg"; $("#areaMsg").innerHTML = `Drag over the ${AREA_NAME[areaEd.kind]} window on the picture to draw the box.`;
  };
  $("#dlgAreas").addEventListener("close", () => { const a = areaEd; areaEd = null; a?.done?.(a.confirmed); });
})();
// Settings → Screen areas
function renderAreaStatus() {
  const el = $("#areaStatus"); if (!el) return;
  el.innerHTML = ["email", "stats"].map(k => `<div class="arearow"><span>${k === "email" ? "✉ Email area" : "🧩 PC Stats area"}</span>
    <b class="${areasSet[k] ? "ok" : "no"}">${areasSet[k] ? "✓ set up" : "not set up yet"}</b><button data-areaagain="${k}">${areasSet[k] ? "Set up again" : "Set up now"}</button></div>`).join("");
}
if (typeof document !== "undefined") {
  $("#areaStatus").addEventListener("click", async e => {
    const k = e.target.dataset.areaagain; if (!k) return;
    let src = null;
    if (typeof stream !== "undefined" && stream) { const f = await grabFrame(); src = f.url; }
    else if (lastFrame[k]) src = lastFrame[k];
    if (!src) {
      areasSet[k] = false; LS.set("pcbs.areasSet", areasSet); renderAreaStatus();
      toast(`No screen connected – the ${AREA_NAME[k]} area will be set up on your next ${k === "email" ? "capture" : "PC parts capture"}.`); return;
    }
    const im = new Image(); im.src = src; await im.decode().catch(() => { });
    openAreas(k, im, () => { });
  });
  renderAreaStatus();
}
