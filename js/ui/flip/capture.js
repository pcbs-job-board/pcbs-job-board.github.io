/* 📦 PC Bay build window – screenshots: Resale Value panel and inventory, read with the text reader. */
// ---------- screenshots ----------
const flipLast = {}; // newest screenshot per area (in memory only) – read again after "🎯 Adjust area"
async function flipImage(url, kind, again) {
  const f = flipCur;
  if (!f) return;
  const st = flipDlg.querySelector(".fstate");
  if (st) st.textContent = "Reading…";
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    flipLast[kind] = url;
    lastFrame[kind] = url;
    // first capture of this kind: find the window in the big set-up window first (like email / PC Stats)
    if (!areasSet[kind] && !again) {
      openAreas(kind, img, ok => {
        if (ok) flipImage(url, kind, true);
        else if (st) st.textContent = "";
      });
      return;
    }
    if (kind === "resale") {
      const r = parseResale((await readText(cropCanvas(img, crops.resale))).lines);
      if (!r.items.length) {
        if (st)
          st.innerHTML =
            '⚠ No Resale Value window found – is it open in the game (look at the PC)? Box in the wrong place? <button data-fa="adjust-resale">🎯 Adjust area</button>';
        return;
      }
      f.shots = [...(f.shots || []), r.items.map(i => ({ ...i }))];
      const merged = mergePCStats(f.shots),
        typed = f.parts.filter(p => p.src === "typed");
      // the n-th identical part (3 × the same case fan) gets the n-th old one – each keeps its own id and broken tick
      const keep = new Map();
      for (const p of f.parts) {
        const k = p.cat + "|" + p.name;
        if (!keep.has(k)) keep.set(k, []);
        keep.get(k).push(p);
      }
      f.parts = [
        ...merged.map(i => {
          const old = keep.get(i.cat + "|" + i.name)?.shift();
          return {
            id: old ? old.id : flipUid(),
            cat: i.cat,
            name: i.name,
            value: i.value,
            sure: i.sure,
            src: "capture",
            broken: old ? old.broken : false,
            brokenManual: old ? old.brokenManual : null,
          };
        }),
        ...typed,
      ];
      if (f.startValue == null && r.total != null && f.shots.length === 1) f.startValue = r.total;
      if (r.score && f.step === 4) {
        f.score = r.score;
        f.soft.bench = true;
      }
      markBroken(f);
      f.lastShot = flipThumb(img);
      toast(`Read ${r.items.length} parts${r.total != null ? ` · resale value $${r.total}` : ""}`);
    } else {
      const items = await readInventory(img, crops.inv, (i, n) => {
        if (st) st.textContent = `Reading the inventory… ${i} of ${n} columns done`;
      });
      const cust = items.skipped
        ? ` · ${items.skipped} customer's part${items.skipped > 1 ? "s" : ""} ("Property of …") left out`
        : "";
      if (!items.length && items.skipped) {
        toast(`Only customers' parts here ("Property of …") – they can't go into a PC Bay build`);
        return;
      }
      if (!items.length) {
        if (st)
          st.innerHTML =
            '⚠ No inventory cards found – is the Inventory open in the game? Box in the wrong place? <button data-fa="adjust-inv">🎯 Adjust area</button>';
        return;
      }
      const at = Date.now();
      flipShine = at;
      items.forEach((i, n) =>
        f.inv.push({
          id: flipUid(),
          cat: i.cat,
          name: i.name,
          used: i.used,
          broken: !!i.broken,
          price: i.price,
          src: "capture",
          at,
          n,
          ...(i.unsure ? { unsure: true, read: i.read } : {}),
        })
      );
      // switch to the tab of what was scanned (one category per screenshot; the most common one if it's mixed)
      const cnt = {};
      for (const i of items) cnt[i.cat] = (cnt[i.cat] || 0) + 1;
      flipInvTab = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
      const nb = items.filter(i => i.broken).length,
        nn = items.filter(i => !i.used && !i.broken).length,
        nu = items.filter(i => i.unsure).length;
      toast(
        `Added ${items.length} part${items.length > 1 ? "s" : ""} from the inventory${nn ? ` · ${nn} new` : ""}${nb ? ` · ${nb} broken (can't be used)` : ""}${nu ? ` · ${nu} read unclearly – check` : ""}${cust}`
      );
    }
    flipSave();
    flipRender();
  } catch (err) {
    if (st) st.textContent = "⚠ " + (err.message || "Couldn't read the screenshot");
  }
}
// 🎯 Adjust area: the set-up window on the newest screenshot (or the live screen); then that screenshot is read again
async function flipAdjust(kind) {
  let src = flipLast[kind] || null;
  if (!src && typeof stream !== "undefined" && stream) src = (await grabFrame()).url;
  if (!src && lastFrame[kind]) src = lastFrame[kind];
  if (!src) {
    areasSet[kind] = false;
    LS.set("pcbs.areasSet", areasSet);
    renderAreaStatus();
    toast(`No screenshot yet – the ${AREA_NAME[kind]} area is set up on your next capture.`);
    return;
  }
  const im = new Image();
  im.src = src;
  await im.decode().catch(() => {});
  openAreas(kind, im, ok => {
    if (ok && flipLast[kind]) flipImage(flipLast[kind], kind, true);
  });
}
function flipThumb(img) {
  const c = document.createElement("canvas"),
    w = 320;
  c.width = w;
  c.height = Math.round((img.naturalHeight / img.naturalWidth) * w);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}
async function flipCapture(kind) {
  if (!stream) {
    toast("Connect the game screen first – or paste / drop a screenshot here.");
    return;
  }
  const fr = await grabFrame();
  flipImage(fr.url, kind);
}
// paste / drop while the window is open: step 1 = Resale Value window, otherwise the inventory
function flipTakeImage(url) {
  if (!flipDlg.open || !flipCur) return false;
  flipImage(url, flipCur.step === 1 ? "resale" : "inv");
  return true;
}
// a whole inventory screenshot (browser): the 3 card columns of the "inv" area → [{name, cat, price, used, broken}]
async function readInventory(img, grid, onStep) {
  const W = img.naturalWidth || img.width,
    H = img.naturalHeight || img.height,
    fc = document.createElement("canvas");
  fc.width = W;
  fc.height = H;
  const fg = fc.getContext("2d", { willReadFrequently: true });
  fg.drawImage(img, 0, 0);
  const pd = fg.getImageData(0, 0, W, H).data;
  let skipped = 0; // customers' parts ("Property of …") left out
  const px = (x, y) => {
    const i = (Math.min(H - 1, Math.max(0, Math.round(y * H))) * W + Math.min(W - 1, Math.max(0, Math.round(x * W)))) * 4;
    return [pd[i], pd[i + 1], pd[i + 2]];
  };
  const items = [];
  const cols = invColumns(grid);
  // the columns are read at the same time (several readers), then handled left to right
  let done = 0;
  if (onStep) onStep(0, cols.length);
  const read = await Promise.all(
    cols.map(async b => {
      const c = cropCanvas(img, b),
        r = await readText(c),
        got = parseInventoryColumn(r.lines);
      if (onStep) onStep(++done, cols.length);
      return { b, c, got, lines: r.lines };
    })
  );
  // a card with its specs and price read but no name: read just its name area (without the picture's crumbs)
  for (const col of read)
    for (const g of invNameGaps(col.lines, col.got)) {
      const cc = document.createElement("canvas");
      cc.width = col.c.width;
      cc.height = Math.round(g.bottom - g.top);
      cc.getContext("2d").drawImage(col.c, 0, g.top, cc.width, cc.height, 0, 0, cc.width, cc.height);
      const t = (await readText(cc)).lines
        .filter(l => l[1] >= 50 && /[A-Za-z]{2}|\d/.test(l[0]))
        .map(l => String(l[0]).trim())
        .join(" ");
      const m = t && bestPartMatch(t);
      if (!m || m.score < 0.7) continue;
      const u = usedValue(m.name),
        price = g.price ?? u;
      col.got.push({
        name: m.name,
        cat: m.cat,
        price,
        nameY: (g.top + g.bottom) / 2,
        broken: g.price != null && u != null && u >= 8 && price <= u * 0.4,
        ...(m.amb ? { unsure: true, read: t } : {}),
      });
      col.got.sort((a, b2) => (a.nameY ?? 0) - (b2.nameY ?? 0));
    }
  // cards fill a row left to right: a column with fewer cards than the one to its right (or none while others have
  // some) was read badly – read it once more (a Celeron went missing in a live capture, 0.14.8) and keep the better read
  for (let i = 0; i < read.length; i++) {
    const right = read.slice(i + 1).reduce((m, r) => Math.max(m, r.got.length), 0),
      any = read.some(r => r.got.length);
    if (read[i].got.length < right || (!read[i].got.length && any)) {
      const again = parseInventoryColumn((await readText(read[i].c)).lines);
      if (again.length > read[i].got.length) read[i].got = again;
    }
  }
  for (const { b, c, got } of read) {
    for (const it of got) {
      if (it.nameY != null) {
        const L = cardLabels(px, b.x, b.w, b.y + (it.nameY / c.height) * b.h, W, H);
        if (L.property) {
          skipped++; // "Property of <customer>": a job's part, not ours – left out
          continue;
        }
        it.used = L.used;
        it.broken = L.broken;
        // not broken but the price reads far too low → misread, the used value it must be
        const u = usedValue(it.name);
        if (!it.broken && u != null && it.price <= u * 0.4) it.price = u;
      } else it.used = true;
      items.push(it);
    }
  }
  items.skipped = skipped;
  return items;
}
