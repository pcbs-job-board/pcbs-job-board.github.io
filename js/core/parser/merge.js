// ---------- joining several email screenshots ----------
// Screenshots can be taken in any order (scrolled down first, then up), and a line cut by the
// edge of the window is often misread ("Upgrade" → "Unarade"). So the lines of each screenshot
// are aligned with the text so far by similarity, not exact match; for each pair of matching
// lines the better reading is kept, and the rest is slotted in where it belongs.
const lineKey = l => l.toLowerCase().replace(/[^a-z0-9]/g, "");
function editDist(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function lineSim(a, b) {
  const x = lineKey(a),
    y = lineKey(b);
  if (!x || !y) return 0;
  if (x.length < 5 || y.length < 5) return x === y ? 1 : 0;
  return 1 - editDist(x, y) / Math.max(x.length, y.length);
}
// words that appear in job emails – a correctly read line contains more of them
const KNOWN_WORDS = new Set(
  (
    "a an the to of for and or in on at by with my your it is be can if not no so i i'm i've need want " +
    "upgrade upgraded install replace repair remove fix build complete completed end day today tomorrow score 3dmark benchmark " +
    "gb tb mhz ram memory cpu gpu psu ssd hdd storage drive case fan fans cooler cooling water cables cable graphics card cards " +
    "motherboard processor power supply overclock overclocked lighting rgb led use used new parts part any all least more than " +
    "labour labor budget objectives req level kind regards hi hey hello thanks thank you pc computer please"
  ).split(" ")
);
function lineQuality(e) {
  const words = e.t
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
  const known = words.filter(w => KNOWN_WORDS.has(w) || /^\d+$/.test(w)).length;
  const odd = (e.t.match(/[^\w\s.,!?'’"$:;/()&%#+\-–•*@]/g) || []).length;
  return known * 10 - odd * 5 + (e.conf != null ? e.conf / 10 : 0) - (e.edge ? 12 : 0);
}
function shotLines(s) {
  const text = typeof s === "string" ? s : s.text;
  const conf = typeof s === "string" ? null : s.conf; // [[line text, confidence]] from the OCR, if known
  const ls = text
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);
  return ls.map((t, i) => {
    const c = conf && conf.find(([ct]) => ct.trim() === t);
    return { t, edge: i === 0 || i === ls.length - 1, conf: c ? c[1] : null };
  });
}
function mergeTexts(shots) {
  let acc = null;
  for (const s of shots) {
    const ls = shotLines(s);
    if (!acc) {
      acc = ls;
      continue;
    }
    // longest chain of similar lines, in order (like a diff)
    const n = acc.length,
      m = ls.length,
      L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    const sim = (i, j) => lineSim(acc[i].t, ls[j].t) >= 0.75;
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--) L[i][j] = sim(i, j) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const pairs = [];
    for (let i = 0, j = 0; i < n && j < m; ) {
      if (sim(i, j) && L[i][j] === L[i + 1][j + 1] + 1) {
        pairs.push([i, j]);
        i++;
        j++;
      } else if (L[i + 1][j] >= L[i][j + 1]) i++;
      else j++;
    }
    const out = [];
    // lines between two matches: when both screenshots have some, a line at a screenshot's
    // edge is a cut-off copy of what the other one shows in full – drop it
    // before the first / after the last match, the screenshot reaching further out goes outermost
    // …but at the very start / end only the screenshot that does NOT reach further out has a cut copy there;
    // the edge line of the one reaching further out is kept when it's clean text (or the sender's address).
    // E.g. the last objective of a build request, when the buttons below it weren't read – fix / upgrade
    // emails always have the "PC Status" bar below the objectives instead.
    const clean = e =>
      /@[\w-]+\./.test(e.t) || (e.conf != null && e.conf >= 80 && (e.t.match(/[A-Za-z]{3,}/g) || []).length >= 2);
    const gap = (A, B, where) => {
      if (A.length && B.length) {
        const outer = where === "mid" || A.length === B.length ? null : A.length > B.length ? "A" : "B";
        const keep = (e, side) => !e.edge || (side === outer && clean(e));
        A = A.filter(e => keep(e, "A"));
        B = B.filter(e => keep(e, "B") && !A.some(a => lineSim(a.t, e.t) >= 0.5));
      }
      const swap = where === "start" ? B.length > A.length : where === "end" ? A.length > B.length : false;
      out.push(...(swap ? [...B, ...A] : [...A, ...B]));
    };
    // no line in common: the screenshots meet edge to edge (scrolled exactly one screen). The half with the sender /
    // subject goes first, the one with Labour / Objectives last; edge lines stay when they're whole text or a bullet
    if (!pairs.length) {
      const head = l => l.slice(0, 3).some(e => /@[\w-]+\./.test(e.t)),
        tail = l => l.some(e => /^(objectives|labou?r)\b/i.test(e.t)),
        bFirst = (head(ls) && !head(acc)) || (tail(acc) && !tail(ls)),
        whole = e => !e.edge || clean(e) || /^[*+•·-]\s*\w/.test(e.t) || (e.conf != null && e.conf >= 70);
      acc = (bFirst ? [...ls, ...acc] : [...acc, ...ls]).filter(whole);
      continue;
    }
    let pi = 0,
      pj = 0;
    for (const [i, j] of pairs) {
      gap(acc.slice(pi, i), ls.slice(pj, j), out.length ? "mid" : "start");
      const a = acc[i],
        b = ls[j];
      out.push(lineQuality(b) > lineQuality(a) ? { ...b, edge: a.edge && b.edge } : { ...a, edge: a.edge && b.edge });
      pi = i + 1;
      pj = j + 1;
    }
    gap(acc.slice(pi), ls.slice(pj), "end");
    acc = out;
  }
  return (acc || []).map(e => e.t).join("\n");
}
