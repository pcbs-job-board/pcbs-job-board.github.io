// 📦 PC Bay – reading the screenshots: Resale Value panel and inventory card grid (plain text in, so it can be tested
// without pictures). Where the windows are: the screen areas "resale" and "inv" – found automatically on the first
// capture, like the email / PC Stats areas (js/ui/areas.js), adjustable in Settings.
const RESALE_PRICE = /^(.*?)[\s|]*\$\s?(\d[\d,]*)\s*$/;
const cleanName = t =>
  String(t)
    .replace(/^[^A-Za-z0-9(]+/, "")
    .replace(/^[A-Za-z0-9]{0,3}[\][|{}]+\s+/, "") // a category icon read as letters: "mS] Raijintek…"
    .trim(); // icon crumbs: "[=] NZXT…", "® Low-Profile"
// Resale Value panel: "NZXT H210i (Black + White) $40", names wrap onto a 2nd line (the $ can be on either)
function parseResale(lines) {
  lines = lines.map(l => (Array.isArray(l) ? { text: l[0], conf: l[1] } : typeof l === "string" ? { text: l, conf: 100 } : l));
  const out = { total: null, status: "", items: [] };
  let on = false;
  const segs = [];
  for (const { text, conf } of lines) {
    const t = String(text).trim();
    if (!t) continue;
    const tot = t.match(/resale\s+value:?\s*\$\s?(\d[\d,]*)/i);
    if (tot) {
      out.total = +tot[1].replace(/,/g, "");
      on = true;
      continue;
    }
    if (/pc\s+status/i.test(t)) {
      on = false;
      continue;
    }
    if (!on) {
      const st = t.match(/broken part\(?s?\)?|ready to boot|no os|not booted|overheat\w*|diagnose problem|unstable/i);
      if (st && !out.status) out.status = st[0];
      const sc = t.match(/(\d{3,5})\s*$/);
      if (st && sc) out.score = +sc[1]; // the 3DMark circle next to "Ready to boot"
      continue;
    }
    const m = t.match(RESALE_PRICE);
    if (m) segs.push({ name: cleanName(m[1]), value: +m[2].replace(/,/g, "") });
    else if (conf >= 50 && /[A-Za-z0-9]{2}/.test(t)) segs.push({ name: cleanName(t), value: null });
  }
  // a line without a price belongs to the item above (name wrapped) or below (price on its 2nd line) – the parts database decides
  const sc = t => (bestPartMatch(t) || { score: 0 }).score;
  const items = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.value != null) {
      items.push({ ...s, pre: [] });
      continue;
    }
    const prev = items[items.length - 1],
      next = segs.slice(i + 1).find(x => x.value != null),
      nextIdx = next ? segs.indexOf(next) : -1;
    const gainPrev = prev ? sc(prev.name + " " + s.name) - sc(prev.name) : -1;
    const gainNext = next && nextIdx === i + 1 ? sc(s.name + " " + next.name) - sc(next.name) : -1;
    if (gainNext > gainPrev && gainNext > 0) next.name = s.name + " " + next.name;
    else if (prev && gainPrev > -0.02) prev.name += " " + s.name;
  }
  for (const it of items) {
    const m = bestPartMatch(it.name);
    if (m && !m.amb && m.score >= 0.6) out.items.push({ name: m.name, cat: m.cat, value: it.value, sure: true });
    else if (it.name.length > 3) out.items.push({ name: it.name, cat: categorize(it.name), value: it.value, sure: false });
  }
  return out;
}
// Inventory (one card column): name (1–2 lines) → feature bullets → "$218" (with "Auction on PC Bay" / "Sell")
// middle of the name: its lines from the last one up, while they follow each other (a red INCOMPATIBLE label above is left out)
function nameMid(bs) {
  let i = bs.length - 1;
  while (i > 0 && bs[i].y0 - bs[i - 1].y1 < (bs[i].y1 - bs[i].y0) * 0.8) i--;
  return (bs[i].y0 + bs[bs.length - 1].y1) / 2;
}
// a graphics card's name read as another card ("…Radeon RX 560 OC Edition" → "…RX VEGA64 OC Edition" when a name line
// went missing): its specs on the card (length, VRAM, core clock) must agree with the part – if they don't, the card
// whose specs agree and whose name is closest to what was read; none → kept, marked for checking
function gpuBySpecs(c) {
  const sp = c.spec,
    facts = n => {
      const ix = ixByName(n) || {};
      return {
        l: +(compatOf(n) || {}).l || null,
        core: (ocOf(n) || {}).core ?? null,
        vram: +(String(ix.det || "").match(/(\d+) GB/) || [])[1] || null,
      };
    },
    fits = n => {
      const f = facts(n);
      return (
        (!sp.length || !f.l || Math.abs(f.l - sp.length) <= 2) &&
        (!sp.vram || !f.vram || f.vram === sp.vram) &&
        (!sp["core frequency"] || f.core == null || Math.abs(f.core - sp["core frequency"]) <= 5)
      );
    };
  if (Object.keys(sp).length < 2 || fits(c.name)) return;
  const tri = trigrams(normP(c.read || c.name)),
    alt = fullIndex()
      .filter(p => p.cat === "GPU" && fits(p.name))
      .map(p => ({ p, sc: dice(tri, p.tri) }))
      .sort((a, b) => b.sc - a.sc);
  if (alt.length && alt[0].sc >= 0.4) {
    c.unsure = alt.length > 1 && alt[0].sc - alt[1].sc < 0.05;
    c.name = alt[0].p.name;
  } else c.unsure = true;
}
// cards whose specs and price were read but not the name (the name line got mixed with picture crumbs): where the
// name should be – right above the first spec line, up to 3 lines (y in the column picture's pixels)
function invNameGaps(lines, found) {
  const L = lines
    .map(l => (Array.isArray(l) ? { text: String(l[0]).trim(), conf: l[1], bbox: l[2] } : l))
    .filter(l => l.bbox && l.text);
  // a real spec line ("• VRAM: 4 GB"), read clearly – not a crumb of the picture starting with « or *
  const isSpec = l => (l.conf ?? 100) >= 60 && /^\W{0,3}[A-Za-z][A-Za-z -]{1,24}:/.test(l.text) && !/\$/.test(l.text),
    isPrice = t => /\$\s?\d/.test(t);
  const specs = L.filter(isSpec),
    lh = specs.length ? specs.map(l => l.bbox.y1 - l.bbox.y0).sort((a, b) => a - b)[specs.length >> 1] : 0;
  if (!lh) return [];
  const gaps = [];
  let open = true; // at the top, or after a price: the next spec line starts a card
  for (const l of L) {
    if (isPrice(l.text)) open = true;
    else if (open && isSpec(l)) {
      open = false;
      const y0 = l.bbox.y0,
        top = y0 - 3.4 * lh;
      if (top < 0) continue; // a card cut off at the top – its name isn't on the screenshot
      if (found.some(it => it.nameY != null && it.nameY > y0 - 4.5 * lh && it.nameY < y0)) continue;
      const price = L.find(x => x.bbox.y0 > y0 && isPrice(x.text));
      gaps.push({ top, bottom: y0 - 0.1 * lh, price: price ? +price.text.match(/\$\s?(\d[\d,]*)/)[1].replace(/,/g, "") : null });
    }
  }
  return gaps;
}
function parseInventoryColumn(lines) {
  lines = lines.map(l =>
    Array.isArray(l) ? { text: l[0], conf: l[1], bbox: l[2] } : typeof l === "string" ? { text: l, conf: 100 } : l
  );
  const out = [];
  let name = [],
    box = [],
    cur = null;
  // the sell price shown is the used value (⅓ of the shop price) – when the "$" line can't be read, that's used instead;
  // a BROKEN part shows ~10 % of it
  const done = c => {
    if (c.cat === "GPU" && c.spec) gpuBySpecs(c);
    const price = c.price ?? usedValue(c.name),
      u = usedValue(c.name);
    out.push({ ...c, price, broken: c.price != null && u != null && u >= 8 && c.price <= u * 0.4 });
  };
  // where the name sits (middle of its lines, in pixels of the column picture) – the USED / BROKEN labels are found from it
  const flush = () => {
    if (!name.length) return;
    const t = name.join(" "),
      bs = box;
    name = [];
    box = [];
    const m = bestPartMatch(t);
    // a name close to two parts (a letter misread) is kept as the closest one, marked for checking – never dropped
    if (m && m.score >= 0.7) {
      if (cur) done(cur);
      cur = {
        name: m.name,
        cat: m.cat,
        price: null,
        nameY: bs.length ? nameMid(bs) : null,
        read: t,
        ...(m.amb ? { unsure: true } : {}),
      };
    }
  };
  let pend = null; // a spec whose value wrapped onto the next line ("• Core Frequency:" / "1275 MHz")
  for (const { text, conf, bbox } of lines) {
    const t = String(text).trim();
    if (!t) continue;
    // the card's specs (length, VRAM, core clock) – they check the name read (a GPU card)
    if (cur) {
      const kv = t.match(/(length|vram|core frequency)\s*:\s*(\d+)?/i);
      if (kv) {
        if (kv[2]) (cur.spec ||= {})[kv[1].toLowerCase()] = +kv[2];
        else pend = kv[1].toLowerCase();
      } else if (pend && /^\d{3,5}\s*mhz/i.test(t)) {
        (cur.spec ||= {})[pend] = +t.match(/\d+/)[0];
        pend = null;
        continue;
      } else pend = null;
    }
    // "$65" – sometimes read as "365" / "S65" (the $ taken for a 3, 5, 8 or S): the parts database decides
    const pr = t.match(/\$\s?(\d[\d,]*)/) || (cur && t.match(/(?:auction on|sell)\D{0,3}([358S]?\d{1,4})\s*$/i));
    if (pr) {
      flush();
      if (cur) {
        const raw = pr[1].replace(/,/g, ""),
          u = usedValue(cur.name),
          n = +raw.replace(/^S/, "");
        const alt = /^[358S]\d+$/.test(raw) && !/\$/.test(t) ? +raw.slice(1) : null;
        cur.price = alt != null && u != null && Math.abs(alt - u) < Math.abs(n - u) ? alt : n;
        done(cur);
        cur = null;
      }
      continue;
    }
    if (/^\W{0,2}(auction|pc\s?bay|sell|used|incompatible|broken)\b/i.test(t) || /:/.test(t) || /^[*«»+•·-]/.test(t)) {
      flush();
      continue;
    }
    if (conf < 60) {
      flush();
      continue;
    }
    if (/[A-Za-z]{2}/.test(t) || /\d/.test(t)) {
      name.push(t);
      if (bbox) box.push(bbox);
    }
  }
  flush();
  if (cur) done(cur);
  return out;
}
// USED (dark letters, top right of the card picture) and BROKEN (red letters under it), by colour – measured from the
// part's name in *card widths* (colW), so it fits any capture: a full-screen 16:9 one or a window with a title bar and
// black bars around the game (a 1512 × 948 Mac capture; screen-height units missed the labels there and hit the
// selected card's black frame instead). From the name up: USED at 0.97–1.04 card widths, BROKEN at 0.82–0.89.
// BROKEN must stand out from the rows just above and below it (red text on the picture), so a red fan or a red heatsink
// – red all the way down the picture – doesn't count. A yellow "Property of …" note top left → property (a customer's
// part: can't be used for a PC Bay build). px(x, y) → [r, g, b] (0–1 coords)
function cardLabels(px, colX, colW, nameMidY, W, H) {
  const cw = colW * W,
    // share of the pixels in rows k0..k1 (card widths above the name) and x0..x1 (share of the card width) passing test
    band = (k0, k1, x0, x1, test) => {
      let n = 0,
        t = 0;
      for (let y = nameMidY * H - k1 * cw; y <= nameMidY * H - k0 * cw; y++)
        for (let x = (colX + colW * x0) * W; x < (colX + colW * x1) * W; x++) {
          t++;
          if (test(px(x / W, y / H))) n++;
        }
      return t ? n / t : 0;
    },
    isDark = ([r, g, b]) => (r + g + b) / 3 < 90,
    isRed = ([r, g, b]) => r > 170 && g < 80 && b < 80;
  // USED: dark text at the picture's top right. The name's middle can be off by half a line (a name line not read:
  // "DFL Radeon R9 290" without "GR8"), so the band is tried a little higher / lower – a spot counts only with plain
  // card background right above it (so never the dark graphics card in the picture below the label)
  // (a shifted spot needs real text – ≥ 0.15, a label reads 0.2–0.27 – and never reaches the card's top edge, where a
  // selected card's black frame is: a NEW Ryzen read 0.11 there)
  let dark = band(0.97, 1.04, 0.62, 0.92, isDark);
  for (const d of [-0.06, -0.04, -0.02, 0.02, 0.04]) {
    const v = band(0.97 + d, 1.04 + d, 0.62, 0.92, isDark);
    if (v >= 0.15 && v > dark && band(1.045 + d, 1.075 + d, 0.62, 0.92, isDark) < 0.02) dark = v;
  }
  const red = band(0.82, 0.89, 0.2, 0.8, isRed),
    around = Math.max(band(0.75, 0.81, 0.2, 0.8, isRed), band(0.9, 0.96, 0.2, 0.8, isRed));
  // a yellow sticky note "Property of <customer email>" at the picture's top left: a customer's part, not ours
  const note = band(0.6, 1.12, 0.04, 0.38, ([r, g, b]) => r > 200 && g > 190 && b < 150 && r - b > 80);
  // cards with a note: 0.31–0.61 of the patch yellow, every other card: 0
  // BROKEN: red text on a light grey band – real labels have ≤ 0.01 red just above / below it, a red fan reaching
  // into the band (ARCTIC ONE (Red): 0.195 in it, 0.112 around) has red around it too
  return { used: dark > 0.05, broken: red > 0.1 && around < 0.05, property: note > 0.15, dark, red, around, note };
}
