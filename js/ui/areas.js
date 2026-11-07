/* Finding the email window and the PC Stats popup in a screenshot – by colour, no OCR needed.
   Works on a small copy of the frame (AREA_W pixels wide); returns a box as fractions of the
   frame { x, y, w, h } (the same format as the saved crop areas), or null.
   - Email: the reading pane is a light grey "paper" column right of the inbox. Its left/right
     edges are where long empty paper runs start and end; it reaches from the black title bar
     down to the dark task bar (it holds the blue Labour band, the objectives and the buttons).
   - PC Stats: the popup is the brightest large panel (everything behind it is dimmed). */
const AREA_W = 800;
const px = (d, w, x, y) => {
  const i = (y * w + x) * 4;
  return [d[i], d[i + 1], d[i + 2]];
};
const isPaper = ([r, g, b]) => Math.min(r, g, b) > 215 && Math.max(r, g, b) - Math.min(r, g, b) < 14; // email page
const isBright = ([r, g, b]) => Math.min(r, g, b) > 243 && Math.max(r, g, b) - Math.min(r, g, b) < 14; // PC Stats panel
const isDark = ([r, g, b]) => Math.max(r, g, b) < 75; // title / task bar
const isBand = ([r, g, b]) => b > 110 && b - r > 60 && r < 90 && g < 120; // Labour / Budget band

// outermost edge that enough rows agree on (rows with text or pictures start later / end sooner)
function edge(vals, step, side) {
  const c = new Map();
  for (const v of vals) {
    const k = Math.round(v / step);
    c.set(k, (c.get(k) || 0) + 1);
  }
  const need = Math.max(4, vals.length * 0.06),
    ks = [...c].filter(([, n]) => n >= need).map(([k]) => k * step);
  return ks.length ? { v: side === "left" ? Math.min(...ks) : Math.max(...ks) } : null;
}
// most common value (rounded to `step`) – robust against rows where text splits a run
function modeOf(vals, step) {
  const c = new Map();
  for (const v of vals) {
    const k = Math.round(v / step);
    c.set(k, (c.get(k) || 0) + 1);
  }
  let best = null,
    n = 0;
  for (const [k, m] of c)
    if (m > n) {
      n = m;
      best = k;
    }
  return best == null ? null : { v: best * step, n };
}
// horizontal runs of pixels passing `test` that are at least `minLen` long, per row
function runs(img, test, minLen, y0 = 0, y1 = img.height) {
  const { data: d, width: w } = img,
    out = [];
  for (let y = y0; y < y1; y++) {
    let s = -1;
    for (let x = 0; x <= w; x++) {
      const ok = x < w && test(px(d, w, x, y));
      if (ok && s < 0) s = x;
      if (!ok && s >= 0) {
        if (x - s >= minLen) out.push({ y, x0: s, x1: x });
        s = -1;
      }
    }
  }
  return out;
}

function findEmail(img) {
  const { width: w, height: h, data: d } = img;
  // 1. pane edges: long paper runs in the right part of the frame (the inbox list is on the left)
  const rs = runs(img, isPaper, w * 0.18).filter(r => (r.x0 + r.x1) / 2 > w * 0.4);
  if (rs.length < 8) return null;
  const L = modeOf(
      rs.map(r => r.x0),
      3
    ),
    R = modeOf(
      rs.map(r => r.x1),
      3
    );
  if (!L || !R || R.v - L.v < w * 0.2) return null;
  // the blue Labour band confirms it is the email (rows mostly band-coloured between the edges)
  let band = 0;
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = L.v; x < R.v; x += 2) if (isBand(px(d, w, x, y))) n++;
    if (n > ((R.v - L.v) / 2) * 0.6) band++;
  }
  // 2. top / bottom: walk up and down a column just inside the left edge until the dark bars
  const cx = Math.min(w - 1, L.v + 4),
    paperYs = rs.filter(r => Math.abs(r.x0 - L.v) <= 6).map(r => r.y);
  const mid = paperYs[Math.floor(paperYs.length / 2)];
  let top = mid,
    bot = mid,
    gap = 0;
  for (let y = mid; y >= 0; y--) {
    if (isDark(px(d, w, cx, y))) {
      if (++gap > 2) break;
    } else {
      gap = 0;
      top = y;
    }
  }
  gap = 0;
  for (let y = mid; y < h; y++) {
    if (isDark(px(d, w, cx, y))) {
      if (++gap > 2) break;
    } else {
      gap = 0;
      bot = y;
    }
  }
  if (bot - top < h * 0.3) return null;
  const pad = 2;
  return { box: frac(L.v - pad, top, R.v + pad * 3, bot + 1, w, h), sure: band >= 4 };
}

function findStats(img) {
  const { width: w, height: h, data: d } = img;
  const rs = runs(img, isBright, w * 0.12).filter(r => r.x0 < w * 0.75);
  if (rs.length < 8) return null;
  const L = edge(
      rs.map(r => r.x0),
      3,
      "left"
    ),
    R = edge(
      rs.map(r => r.x1),
      3,
      "right"
    );
  if (!L || !R || R.v - L.v < w * 0.12) return null;
  // rows where most of the panel width is bright = the popup (item pictures leave the text side bright)
  const rowOk = y => {
    let n = 0,
      t = 0;
    for (let x = L.v; x < R.v; x += 2) {
      t++;
      if (isBright(px(d, w, x, y))) n++;
    }
    return n / t > 0.45;
  };
  const ys = [];
  for (let y = 0; y < h; y++) if (rowOk(y)) ys.push(y);
  if (!ys.length) return null;
  // longest stretch of panel rows, allowing small gaps (separator line, item pictures)
  let best = [ys[0], ys[0]],
    cur = [ys[0], ys[0]];
  for (const y of ys.slice(1)) {
    if (y - cur[1] <= h * 0.06) cur[1] = y;
    else cur = [y, y];
    if (cur[1] - cur[0] > best[1] - best[0]) best = [...cur];
  }
  if (best[1] - best[0] < h * 0.3) return null;
  const [x0, x1] = widen(img, isBright, L.v, R.v, best[0], best[1]);
  return { box: frac(x0 - 1, best[0], x1 + 2, best[1] + 2, w, h), sure: true };
}
// push a left / right edge outwards while that column is still mostly panel-coloured
function widen(img, test, x0, x1, y0, y1) {
  const { data: d, width: w } = img,
    step = Math.max(1, Math.floor((y1 - y0) / 120));
  const colOk = x => {
    let n = 0,
      t = 0;
    for (let y = y0; y < y1; y += step) {
      t++;
      if (test(px(d, w, x, y))) n++;
    }
    return n / t > 0.5;
  };
  // look a little further out too: a column of item pictures can sit between the text and the panel's edge
  const far = (from, dir, reach) => {
    let best = from,
      run = 0;
    for (let x = from + dir, n = 0; x >= 0 && x < w && n < reach; x += dir, n++) {
      if (colOk(x)) {
        if (++run >= 3) best = x;
      } else run = 0;
    }
    return best;
  };
  return [far(x0, -1, Math.round(w * 0.1)), far(x1, 1, Math.round(w * 0.05))];
}
const frac = (x0, y0, x1, y1, w, h) => {
  const c = (v, m) => Math.max(0, Math.min(m, v));
  x0 = c(x0, w);
  x1 = c(x1, w);
  y0 = c(y0, h);
  y1 = c(y1, h);
  return { x: x0 / w, y: y0 / h, w: (x1 - x0) / w, h: (y1 - y0) / h };
};
// PC Bay – Resale Value panel: the bright panel on the right of the screen (look at a PC: name / value list + PC Status)
function findResale(img) {
  const { width: w, height: h, data: d } = img;
  const rs = runs(img, isBright, w * 0.12).filter(r => r.x0 > w * 0.55);
  if (rs.length < 8) return null;
  const L = edge(
      rs.map(r => r.x0),
      3,
      "left"
    ),
    R = edge(
      rs.map(r => r.x1),
      3,
      "right"
    );
  if (!L || !R || R.v - L.v < w * 0.12) return null;
  const rowOk = y => {
    let n = 0,
      t = 0;
    for (let x = L.v; x < R.v; x += 2) {
      t++;
      if (isLight(px(d, w, x, y))) n++;
    }
    return n / t > 0.45;
  };
  const ys = [];
  for (let y = 0; y < h; y++) if (rowOk(y)) ys.push(y);
  if (!ys.length) return null;
  let best = [ys[0], ys[0]],
    cur = [ys[0], ys[0]];
  for (const y of ys.slice(1)) {
    if (y - cur[1] <= h * 0.012) cur[1] = y;
    else cur = [y, y];
    if (cur[1] - cur[0] > best[1] - best[0]) best = [...cur];
  }
  if (best[1] - best[0] < h * 0.3) return null;
  return { box: frac(L.v - 2, best[0], R.v + 2, best[1] + 2, w, h), sure: true };
}
// PC Bay – Inventory window: the big light window in the middle; the box is its grid of part cards (3 columns)
function findInventory(img) {
  const { width: w, height: h } = img;
  // rows where the window is light all the way across (its header strip and the bottom margin)
  const rs = runs(img, isLight, w * 0.55);
  if (rs.length < 3) return null;
  const L = modeOf(
      rs.map(r => r.x0),
      3
    ),
    R = modeOf(
      rs.map(r => r.x1),
      3
    );
  if (!L || !R || R.v - L.v < w * 0.5) return null;
  const ys = rs.filter(r => Math.abs(r.x0 - L.v) <= 6 && Math.abs(r.x1 - R.v) <= 6).map(r => r.y);
  const top = Math.min(...ys),
    bot = Math.max(...ys);
  if (bot - top < h * 0.6) return null;
  // the card grid sits at fixed places inside the window (left of it: categories, above it: search + tabs)
  const ww = R.v - L.v,
    wh = bot - top;
  return {
    box: frac(
      L.v + ww * INV_GRID.x,
      top + wh * INV_GRID.y,
      L.v + ww * (INV_GRID.x + INV_GRID.w),
      top + wh * (INV_GRID.y + INV_GRID.h),
      w,
      h
    ),
    sure: true,
    win: frac(L.v, top, R.v, bot, w, h),
  };
}
const isLight = ([r, g, b]) => Math.min(r, g, b) > 205 && Math.max(r, g, b) - Math.min(r, g, b) < 20; // inventory window / cards
const INV_GRID = { x: 0.27, y: 0.185, w: 0.685, h: 0.8 };
// the inventory grid → its 3 card columns (each column is read on its own)
function invColumns(b) {
  return [0, 1, 2].map(i => ({ x: b.x + b.w * i * 0.3442, y: b.y, w: b.w * 0.3157, h: b.h }));
}
// ---- career level bar (top-right HUD: stars, "LEVEL 20", green progress bar under them) ----
// img = the top-right corner of the frame at full resolution, starting at (ox, oy) of a W×H frame.
// Finds the green fill, then walks right through the light track to the bar's grey outline.
// Returns how full the bar is (0–1) and where the level number is written (fractions of the frame).
const isBarGreen = ([r, g, b]) => g > 130 && g - r > 50 && g - b > 50;
const lum = ([r, g, b]) => (r + g + b) / 3;
// a near-empty bar on a small capture (1512 px wide, ~1 %) is only a 3 px green stub: a second, finer look only when
// the usual one finds nothing (finer from the start picks up other small green bits on some screenshots)
function findLevelBar(img, ox = 0, oy = 0, W = img.width, H = img.height) {
  return levelBarAt(img, ox, oy, W, H, Math.max(4, W * 0.0025)) || levelBarAt(img, ox, oy, W, H, 3);
}
function levelBarAt(img, ox, oy, W, H, minRun) {
  const { width: w, data: d } = img;
  // green runs, grouped into bars (same left end, rows next to each other)
  // short runs too: at ~0 % only a small green stub is left at the left end (smaller screenshots: a few pixels)
  const rs = runs(img, isBarGreen, minRun);
  const groups = [];
  for (const r of rs) {
    const g = groups.find(g => Math.abs(g.x0 - r.x0) <= 4 && r.y - g.y1 <= 2);
    if (g) {
      g.y1 = r.y;
      g.rows.push(r);
    } else groups.push({ x0: r.x0, y0: r.y, y1: r.y, rows: [r] });
  }
  let best = null;
  for (const g of groups) {
    const bh = g.y1 - g.y0 + 1;
    if (bh < 3 || bh > H * 0.03) continue; // a thin bar, not a big green sign
    const mid = g.rows[Math.floor(g.rows.length / 2)],
      y = mid.y;
    const fill = g.rows.map(r => r.x1).sort((a, b) => a - b)[Math.floor(g.rows.length / 2)];
    let x = fill;
    for (let k = 0; k < 4 && x < w - 1 && lum(px(d, w, x, y)) < 200; k++) x++; // blended edge pixels
    while (x < w - 1 && lum(px(d, w, x, y)) >= 200) x++; // light track up to the outline
    const len = x - g.x0;
    if (len < W * 0.05 || len > W * 0.3 || x >= w - 1) continue;
    if (x - fill < 6) continue; // a bar is never 100 % full – green up to a dark edge is a sign or a logo
    if (!best || g.rows.length > best.rows) best = { x0: g.x0, x1: x, fill, y0: g.y0, y1: g.y1, rows: g.rows.length };
  }
  if (!best) return null;
  const bw = best.x1 - best.x0,
    bh = best.y1 - best.y0 + 1,
    fx = v => (v + ox) / W,
    fy = v => (v + oy) / H;
  return {
    full: Math.max(0, Math.min(1, (best.fill - best.x0) / bw)),
    bar: { x: fx(best.x0), y: fy(best.y0), w: bw / W, h: bh / H },
    // "LEVEL 20" sits above the right end of the bar
    // (sized from the bar's width – its measured height varies a little between screenshots)
    digits: { x: fx(best.x0 + bw * 0.62), y: fy(Math.max(0, best.y0 - bw * 0.155)), w: (bw * 0.41) / W, h: (bw * 0.145) / H },
  };
}
// kind: "email" | "stats" | "resale" | "inv"  →  { box, sure } or null
function detectArea(img, kind) {
  return kind === "stats"
    ? findStats(img)
    : kind === "resale"
      ? findInventory(img)
        ? null
        : findResale(img)
      : kind === "inv"
        ? findInventory(img)
        : findEmail(img);
}
// browser helper: <img>/<canvas> → small ImageData
function areaImage(src) {
  const sw = src.naturalWidth || src.width,
    sh = src.naturalHeight || src.height,
    h = Math.round((AREA_W * sh) / sw);
  const c = document.createElement("canvas");
  c.width = AREA_W;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, 0, 0, AREA_W, h);
  return g.getImageData(0, 0, AREA_W, h);
}
if (typeof module !== "undefined") module.exports = { detectArea, findLevelBar, AREA_W, invColumns };

// ================= "Set up screen areas" window (browser only) =================
// Hidden "set up" flag per area. Boxes that were moved before this existed count as set up.
let areasSet = typeof LS !== "undefined" ? LS.get("pcbs.areasSet", null) : null;
if (typeof LS !== "undefined" && !areasSet) {
  const saved = LS.get("pcbs.crops", null),
    moved = k => !!saved?.[k] && JSON.stringify(saved[k]) !== JSON.stringify(DEFAULT_CROPS[k]);
  areasSet = { email: moved("email"), stats: moved("stats") };
  LS.set("pcbs.areasSet", areasSet);
}
if (areasSet) {
  areasSet.resale ??= false;
  areasSet.inv ??= false;
}
const AREA_NAME = { email: "email", stats: "PC Stats", resale: "Resale Value", inv: "Inventory" };
let areaEd = null; // { kind, img, box, done }
const lastFrame = {}; // newest screenshot per area – used by "Set up again" in Settings

// open the window for one area; done(confirmed) is called when it closes
function openAreas(kind, src, done) {
  areaEd = { kind, box: null, done, confirmed: false };
  lastFrame[kind] = src.currentSrc || src.src || lastFrame[kind];
  const dlg = $("#dlgAreas"),
    im = $("#areaImg");
  $("#areaTitle").textContent = `🎯 Set up the ${AREA_NAME[kind]} area`;
  dlg.classList.toggle("stats", kind !== "email");
  im.onload = () => {
    detectNow();
  };
  im.src = lastFrame[kind];
  if (!dlg.open) dlg.showModal();
  if (im.complete && im.naturalWidth) detectNow();
}
function detectNow() {
  const k = areaEd.kind,
    im = $("#areaImg");
  let r = null;
  try {
    r = detectArea(areaImage(im), k);
  } catch {}
  const msg = $("#areaMsg");
  if (r) {
    areaEd.box = r.box;
    msg.className = "areamsg ok";
    msg.innerHTML =
      k === "email"
        ? "✓ Found the email window. Check the box covers the whole email – from the sender at the top to the Accept / Go to PC buttons – then press <b>Use this area</b>."
        : k === "resale"
          ? "✓ Found the Resale Value window. Check the box covers it from “Resale Value” down to the PC Status, then press <b>Use this area</b>."
          : k === "inv"
            ? "✓ Found the inventory. Check the box covers the three columns of part cards (not the categories on the left), then press <b>Use this area</b>."
            : "✓ Found the PC Stats window. Check the box covers it from “PC for …” down to the last part, then press <b>Use this area</b>.";
  } else {
    areaEd.box = structuredClone(crops[k]);
    msg.className = "areamsg bad";
    msg.innerHTML =
      k === "email"
        ? "Couldn't find the email window on this screenshot. Is an email open in-game? You can also drag a box over it yourself."
        : k === "resale"
          ? "Couldn't find the Resale Value window. Look at the PC in-game so the window shows on the right, capture again – or drag a box over it yourself."
          : k === "inv"
            ? "Couldn't find the inventory. Open it in-game and capture again – or drag a box over the three columns of part cards yourself."
            : "Couldn't find the PC Stats window. Open it in-game (<b>PC Stats</b> button in the email) and capture again – or drag a box over it yourself.";
  }
  drawAreaBox();
}
function drawAreaBox() {
  const el = $("#areaBox"),
    b = areaEd?.box;
  el.hidden = !b;
  $("#areaUse").disabled = !b;
  if (b)
    Object.assign(el.style, { left: b.x * 100 + "%", top: b.y * 100 + "%", width: b.w * 100 + "%", height: b.h * 100 + "%" });
}
// drag inside the box = move, drag a corner/edge handle = resize, drag elsewhere = draw a new box
(() => {
  if (typeof document === "undefined") return;
  const wrap = $("#areaWrap");
  let drag = null;
  const pos = e => {
    const r = wrap.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  wrap.addEventListener("pointerdown", e => {
    if (!areaEd) return;
    e.preventDefault();
    wrap.setPointerCapture(e.pointerId);
    const p = pos(e),
      h = e.target.dataset.h,
      b = areaEd.box;
    drag = h
      ? { mode: h, p0: p, b0: { ...b } }
      : e.target.closest("#areaBox")
        ? { mode: "move", p0: p, b0: { ...b } }
        : { mode: "draw", p0: p, b0: b };
  });
  wrap.addEventListener("pointermove", e => {
    if (!drag) return;
    const p = pos(e),
      { p0, b0 } = drag,
      dx = p.x - p0.x,
      dy = p.y - p0.y;
    let b;
    if (drag.mode === "draw") b = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(dx), h: Math.abs(dy) };
    else if (drag.mode === "move")
      b = { ...b0, x: Math.min(1 - b0.w, Math.max(0, b0.x + dx)), y: Math.min(1 - b0.h, Math.max(0, b0.y + dy)) };
    else {
      let x0 = b0.x,
        y0 = b0.y,
        x1 = b0.x + b0.w,
        y1 = b0.y + b0.h;
      const m = drag.mode;
      if (m.includes("w")) x0 = Math.min(x1 - 0.02, b0.x + dx);
      if (m.includes("e")) x1 = Math.max(x0 + 0.02, b0.x + b0.w + dx);
      if (m.includes("n")) y0 = Math.min(y1 - 0.02, b0.y + dy);
      if (m.includes("s")) y1 = Math.max(y0 + 0.02, b0.y + b0.h + dy);
      b = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    areaEd.box = b;
    drawAreaBox();
  });
  wrap.addEventListener("pointerup", () => {
    if (!drag) return;
    if (drag.mode === "draw" && (areaEd.box.w < 0.03 || areaEd.box.h < 0.03)) areaEd.box = drag.b0 || null;
    drag = null;
    drawAreaBox();
  });
  $("#areaUse").onclick = () => {
    const k = areaEd.kind;
    crops[k] = areaEd.box;
    LS.set("pcbs.crops", crops);
    areasSet[k] = true;
    LS.set("pcbs.areasSet", areasSet);
    areaEd.confirmed = true;
    $("#dlgAreas").close();
    if (typeof drawCrops === "function") drawCrops();
    renderAreaStatus();
    toast(`${AREA_NAME[k][0].toUpperCase() + AREA_NAME[k].slice(1)} area saved`);
  };
  $("#areaRedetect").onclick = detectNow;
  $("#areaDraw").onclick = () => {
    areaEd.box = null;
    drawAreaBox();
    $("#areaMsg").className = "areamsg";
    $("#areaMsg").innerHTML = `Drag over the ${AREA_NAME[areaEd.kind]} window on the picture to draw the box.`;
  };
  $("#dlgAreas").addEventListener("close", () => {
    const a = areaEd;
    areaEd = null;
    a?.done?.(a.confirmed);
  });
})();
// Settings → Screen areas
function renderAreaStatus() {
  const el = $("#areaStatus");
  if (!el) return;
  const label = {
    email: "✉ Email area",
    stats: "🧩 PC Stats area",
    resale: "📦 Resale Value area (PC Bay)",
    inv: "📦 Inventory area (PC Bay)",
  };
  el.innerHTML = ["email", "stats", "resale", "inv"]
    .map(
      k => `<div class="arearow"><span>${label[k]}</span>
    <b class="${areasSet[k] ? "ok" : "no"}">${areasSet[k] ? "✓ set up" : "not set up yet"}</b><button data-areaagain="${k}">${areasSet[k] ? "Set up again" : "Set up now"}</button></div>`
    )
    .join("");
}
if (typeof document !== "undefined") {
  $("#areaStatus").addEventListener("click", async e => {
    const k = e.target.dataset.areaagain;
    if (!k) return;
    let src = null;
    if (typeof stream !== "undefined" && stream) {
      const f = await grabFrame();
      src = f.url;
    } else if (lastFrame[k]) src = lastFrame[k];
    if (!src) {
      areasSet[k] = false;
      LS.set("pcbs.areasSet", areasSet);
      renderAreaStatus();
      toast(
        `No screen connected – the ${AREA_NAME[k]} area will be set up on your next ${k === "email" ? "capture" : k === "stats" ? "PC parts capture" : AREA_NAME[k] + " capture"}.`
      );
      return;
    }
    const im = new Image();
    im.src = src;
    await im.decode().catch(() => {});
    openAreas(k, im, () => {});
  });
  renderAreaStatus();
}

// ================= career level from the HUD (browser only) =================
// Runs after an email / PC Stats capture has been read – separately, with its own small OCR worker,
// so a problem here can never affect reading the email or the parts.
let levelWorker = null;
async function getLevelWorker() {
  if (!levelWorker) {
    levelWorker = await Tesseract.createWorker("eng", 1);
    await levelWorker.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789" });
  }
  return levelWorker;
}
// level digits → a clean black-on-white picture of just the big digits (drops "LEVEL" and the $ coin)
function levelDigitsCanvas(src, b) {
  const W = src.naturalWidth || src.width,
    H = src.naturalHeight || src.height;
  const sx = Math.round(b.x * W),
    sy = Math.round(b.y * H),
    w = Math.max(4, Math.round(b.w * W)),
    h = Math.max(4, Math.round(b.h * H));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, sx, sy, w, h, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data,
    L = new Uint8Array(w * h);
  let lo = 255,
    hi = 0;
  for (let i = 0; i < w * h; i++) {
    const v = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
    L[i] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi - lo < 60) return null;
  const th = (lo + hi) / 2,
    ink = i => L[i] < th,
    seen = new Uint8Array(w * h),
    comps = [];
  for (let i = 0; i < w * h; i++) {
    if (!ink(i) || seen[i]) continue;
    let x0 = w,
      y0 = h,
      x1 = 0,
      y1 = 0,
      n = 0;
    const st = [i];
    seen[i] = 1;
    while (st.length) {
      const j = st.pop(),
        x = j % w,
        y = (j - x) / w;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1])
        if (k >= 0 && !seen[k] && ink(k)) {
          seen[k] = 1;
          st.push(k);
        }
    }
    comps.push({ x0, y0, x1, y1, n });
  }
  if (!comps.length) return null;
  const top = Math.max(...comps.map(c => c.y1 - c.y0));
  const tall = comps
    .filter(c => c.y1 - c.y0 >= 0.6 * top && c.n > 20 && c.x0 > 0 && c.y0 > 0)
    .map(c => (c.x1 - c.x0 > 0.95 * (c.y1 - c.y0) ? { ...c, x1: Math.min(c.x1, c.x0 + Math.round(0.72 * (c.y1 - c.y0))) } : c)) // digit merged with the coin
    .sort((a, b) => a.x0 - b.x0);
  if (!tall.length) return null;
  const groups = [[tall[0]]];
  for (const c of tall.slice(1)) {
    if (c.x0 - groups.at(-1).at(-1).x1 < 0.6 * top) groups.at(-1).push(c);
    else groups.push([c]);
  }
  const grp = groups.reduce((a, b) => (b.length > a.length ? b : a));
  const bx0 = Math.min(...grp.map(c => c.x0)),
    by0 = Math.min(...grp.map(c => c.y0)),
    bx1 = Math.max(...grp.map(c => c.x1)),
    by1 = Math.max(...grp.map(c => c.y1));
  const pad = Math.max(3, Math.round((by1 - by0) / 4)),
    gh = by1 - by0 + 1,
    scale = 64 / (gh + pad * 2);
  const o = document.createElement("canvas");
  o.width = Math.round((bx1 - bx0 + 1 + pad * 2) * scale);
  o.height = 64;
  const og = o.getContext("2d"),
    oi = og.createImageData(o.width, o.height);
  for (let y = 0; y < o.height; y++)
    for (let x = 0; x < o.width; x++) {
      const X = Math.floor(x / scale) - pad + bx0,
        Y = Math.floor(y / scale) - pad + by0,
        k = (y * o.width + x) * 4;
      const v = X >= bx0 && X <= bx1 && Y >= by0 && Y <= by1 && ink(Y * w + X) ? 0 : 255;
      oi.data[k] = oi.data[k + 1] = oi.data[k + 2] = v;
      oi.data[k + 3] = 255;
    }
  og.putImageData(oi, 0, 0);
  return o;
}
// → { level, pct } (pct rounded down to 5 %), or null when the HUD can't be read
async function readCareer(src) {
  const W = src.naturalWidth || src.width,
    H = src.naturalHeight || src.height;
  const ox = Math.round(W * 0.45),
    cw = W - ox,
    ch = Math.round(H * 0.22);
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, ox, 0, cw, ch, 0, 0, cw, ch);
  const bar = findLevelBar(g.getImageData(0, 0, cw, ch), ox, 0, W, H);
  if (!bar) return null;
  const pct = Math.floor((bar.full * 100) / 5) * 5;
  const dc = levelDigitsCanvas(src, bar.digits);
  if (!dc || !window.Tesseract) return null;
  const t = (await (await getLevelWorker()).recognize(dc)).data.text.replace(/\D/g, "");
  const level = parseInt(t, 10);
  return level >= 1 && level <= 99 ? { level, pct } : null;
}
// called after a capture was read; updates the top bar when the HUD shows a newer career state
let careerBusy = false;
async function autoCareer(url) {
  if (careerBusy || !url) return;
  careerBusy = true;
  try {
    const src = new Image();
    src.src = url;
    await src.decode();
    const r = await readCareer(src);
    if (!r) return;
    const cur = { ...career };
    // never backwards on a misread: the level only stays or goes up; the % only drops together with a level-up
    if (cur.level != null && (r.level < cur.level || (r.level === cur.level && r.pct <= cur.pct))) return;
    setCareer(r.level, r.pct);
    showCareer();
    toast(`Career level updated from the screenshot: Lv ${r.level} · ${r.pct}%`, () => {
      setCareer(cur.level, cur.pct);
      showCareer();
    });
  } catch {
  } finally {
    careerBusy = false;
  }
}
