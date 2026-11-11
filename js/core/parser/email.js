// Email screenshot text → job (parseEmail), plus story jobs (known senders / subjects from data/story-jobs.csv).
// strip OCR crumbs at the end of a line: "Diagnose and fix ls", "Diagnose and fix ‘S", "help plz G"
function trimJunk(s) {
  const w = String(s).trim().split(/\s+/);
  while (
    w.length > 1 &&
    /^(?:[^A-Za-z0-9(]+|[^A-Za-z0-9(]*[a-z]{1,2}[^A-Za-z0-9)]*|[‘'`|;:,.~_][A-Za-z]{1,2})$/.test(w[w.length - 1]) &&
    !/^(it|up|on|in|me|my|pc|os|ok)$/i.test(w[w.length - 1])
  )
    w.pop();
  return w.join(" ");
}
// a crumb of the icon / bullet in front of the first word: "s3DMark score" → "3DMark score",
// "eA Computer has gone crazy" → "Computer has gone crazy" (but "iPhone", "eBay" stay)
function trimLead(s) {
  let t = String(s)
    .trim()
    .replace(/^[\]\[|{}~_=:;,.]+\s+(?=\S)/, ""); // "] UPGRADES?" → "UPGRADES?"
  const w = t.split(/\s+/);
  if (w.length > 1 && /^[^A-Za-z0-9(]*[a-z][A-Z]?[^A-Za-z0-9]*$/.test(w[0]) && !/^a$/.test(w[0]) && /^[A-Z0-9]/.test(w[1]))
    t = w.slice(1).join(" ");
  else if (/^[a-z](?=\d|[A-Z]{2})/.test(t)) t = t.slice(1);
  return t;
}
// OCR noise (status bar, buttons) must not be glued onto an objective
function looksLikeText(l) {
  const w = l.split(/\s+/).filter(Boolean);
  if (!w.length || w.length > 12) return false;
  if (w.some(x => /^\W*\d+\W*$/.test(x) && !/^\(?\d+ days?\)?$/.test(x)) && !/\(\d+ days?\)/.test(l)) return false; // bare numbers = OCR noise ("4k", "1080p" are fine)
  const short = w.filter(x => !/\d/.test(x) && x.replace(/[^a-z]/gi, "").length <= 2).length;
  const odd = w.filter(x => /[a-z][A-Z]|^[A-Z]{2,}$/.test(x)).length;
  return short / w.length <= 0.25 && odd <= 1;
}
function parseEmail(text, rules, smart) {
  rules = rules || DEFAULT_RULES;
  const raw = text.replace(/\r/g, "");
  // a box wider than the email also catches the inbox's date column: "6/12/2018 I hate using…"
  // stray picture crumbs glued to the "@" of an address: "TinyAunt@]JulieBrewing.ly" → "TinyAunt@JulieBrewing.ly"
  const lines = raw
    .split("\n")
    .map(s =>
      s
        .trim()
        .replace(/(\w)(?:\s?[\[\]|{}()]\s?@\s?[\[\]|{}()]?|@\s?[\[\]|{}()]\s?)(?=\w)/g, "$1@")
        .replace(/^\d{1,2}\/\d{1,2}\/\d{4}\s*(?=\S{3}|$)/, "")
        .replace(/^\d{1,4}\s*[|]?\s+(?=\S)/, "")
        .replace(/^[|=]\s*/, "")
        .trim()
    )
    .filter(Boolean);
  const job = {
    sender: "",
    subject: "",
    labour: null,
    budget: null,
    level: null,
    deadline: "",
    objectives: [],
    hidden: [],
    suspect: "",
    body: "",
    components: [],
  };
  // sender = the last address above the greeting (inbox entries come first when the box is too big)
  const startB0 = lines.findIndex(l =>
    /you work with computers|^(hi|hello|hey|dear|good (day|morning|afternoon|evening))\b/i.test(l)
  );
  const mailIdx = lines
    .map((l, i) => (/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(l) && !/^pc for/i.test(l) ? i : -1))
    .filter(i => i >= 0);
  const emailLineIdx = startB0 > 0 ? (mailIdx.filter(i => i < startB0).pop() ?? mailIdx[0] ?? -1) : (mailIdx[0] ?? -1);
  if (emailLineIdx >= 0) {
    job.sender = lines[emailLineIdx].match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/i)[0];
    const nxt = lines[emailLineIdx + 1];
    if (nxt && !/you work with|labour|objectives|@/i.test(nxt) && emailLineIdx + 1 !== startB0)
      job.subject = trimLead(trimJunk(nxt.replace(/^Ineed/, "I need")));
  }
  const emailDate =
    (emailLineIdx >= 0 &&
      (lines[emailLineIdx].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/) ||
        (lines[emailLineIdx + 1] || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) ||
    raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const pcFor = raw.match(/PC for\s+([\w.+-]+@[\w-]+(\.[\w-]+)+)/i);
  if (!job.sender && pcFor) job.sender = pcFor[1];
  // "Labouk $249" – a letter hidden by the mouse pointer: any "Lab…" word followed by a $ amount
  const lab = raw.match(/Labou?r[:;]?\s*\$?\s*([\d,]+)/i) || raw.match(/\bLab\w{1,4}[:;]?\s*\$\s*([\d,]+)/i);
  if (lab) job.labour = +lab[1].replace(/,/g, "");
  const bud = raw.match(/Budget[:;]?\s*\$?\s*([\d,]+)/i);
  if (bud) job.budget = +bud[1].replace(/,/g, "");
  const lev = raw.match(/Level\s*(\d+)/i);
  if (lev) job.level = +lev[1];

  // objectives: bullet lines after the header; junk lines in between are skipped, not fatal
  const oi = lines.findIndex(l => /^\W{0,3}objectives\b/i.test(l));
  if (oi >= 0) {
    let junk = 0;
    for (let i = oi + 1; i < lines.length && junk < 4; i++) {
      const l = lines[i];
      if (/^\W{0,3}(reject|accept|pc status|pc stats|in transit|go ?to (pc|whiteboard)|quit|labou?r)\b/i.test(l)) break;
      const m = l.match(/^\W{0,3}?[•*+·°»«©¢®\-–\[\]{}|:;]\s*(.+)/) || l.match(/^[oe]\s+([A-Z0-9].+)/);
      // real objectives always have a word of 4+ letters – "[fae se ee ee]" is the button bar read as text;
      // a lone capital at the end is a crumb ("Diagnose and fix R")
      if (m) {
        const o = trimLead(trimJunk(m[1].replace(/\s+PC Stats$/i, "").replace(/^[^A-Za-z0-9(]+/, ""))).replace(/\s+[A-Z]$/, "");
        if (o.length > 2 && (/[A-Za-z]{4,}/.test(o) || /^OC\s+(CPU|GPU|RAM)\b/i.test(o))) {
          // "OC CPU to 4000MHz" has no long word
          job.objectives.push(o);
          junk = 0;
          continue;
        }
      }
      if (job.objectives.length && /^[a-z(]/.test(l) && l.length > 3 && looksLikeText(l)) {
        job.objectives[job.objectives.length - 1] += " " + trimJunk(l);
        continue;
      }
      junk++;
    }
    // the same objective read twice (e.g. once cut off at the edge) → keep the better reading
    const objs = [];
    for (const o of job.objectives) {
      const k = objs.findIndex(x => lineSim(x, o) >= 0.75);
      if (k < 0) objs.push(o);
      else if (lineQuality({ t: o }) > lineQuality({ t: objs[k] })) objs[k] = o;
    }
    // the reader sometimes drops the "or" of "… or better" ("…K| NGP|N GAMING better")
    job.objectives = objs.map(o => o.replace(/^(\W*install\s+.+?)(?<!\bor)\s+better\s*$/i, "$1 or better"));
  }
  const dl =
    raw.match(/Complete by[^\n]*?(\d{1,2}\/\d{1,2}\/\d{4})/i) || raw.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*\(?(Tomorrow|Today)/i);
  if (dl) job.deadline = dl[1];

  // body = text between greeting and money panel
  const startB = startB0;
  const endB = lines.findIndex(l => /labou?r|budget/i.test(l));
  const bodyLines = lines.slice(startB >= 0 ? startB : emailLineIdx + 2, endB > 0 ? endB : undefined);
  job.body = bodyLines.join(" ").replace(/\s+/g, " ").trim();
  // story-job signals: the name the email is signed with, no star requirement in the blue band, a long text
  job.signature = bodyLines
    .slice(-3)
    .map(l =>
      l
        .replace(/^[-–—~\s]+/, "")
        .replace(/[,.!]+$/, "")
        .trim()
    )
    .filter(l => l && l.split(/\s+/).length <= 4 && !/regards|thanks|cheers|best|sincerely/i.test(l));
  job.words = job.body ? job.body.split(/\s+/).length : 0;
  const band = /labou?r/i.test(raw) && /budget/i.test(raw);
  job.noStars = band ? /Re[qga]\s*[:;.]?\s*Level/i.test(raw) && (raw.match(/\bRe[qga]\s*[:;.]/gi) || []).length < 2 : null; // OCR reads "Req" as "Rea" too

  const det = detectHidden(job.body, rules, smart, job.objectives, emailDate, !!job.deadline);
  job.hidden = det.hidden;
  job.suspect = det.suspect;
  if (det.softDeadline) {
    job.deadline = det.softDeadline;
    job.softDeadline = true;
  }
  return job;
}
// ---- story jobs (career story customers): known ones from data/story-jobs.csv, others by their look ----
const normStory = s =>
  String(s || "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9@.' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
// which list entry this email belongs to, and what matched. A name alone only counts when the email also
// looks like a story job – random customers sign with first names too.
function storyMatch(job, list) {
  const e = normStory(job.sender),
    sub = normStory(job.subject),
    sig = (job.signature || []).map(normStory);
  // the same customer can have several story jobs (HRH The Queen) – the one with this subject too comes first
  // (a subject with a few misread letters still counts)
  const sameSub = st =>
    st.subject &&
    sub &&
    (normStory(st.subject) === sub || editDist(normStory(st.subject), sub) <= Math.max(1, Math.floor(sub.length / 12)));
  const mine = (list || []).filter(st => st.email && e && normStory(st.email) === e);
  const both = mine.find(sameSub);
  if (both) return { entry: both, by: "email" };
  // a known story customer, but this email isn't in the list yet: don't show another of their jobs' story
  if (mine.length && sub && mine.every(st => st.subject))
    return { entry: { sender_name: mine[0].sender_name, email: mine[0].email, story: "" }, by: "sender", newEmail: true };
  for (const st of list || []) {
    if (st.email && e && normStory(st.email) === e) return { entry: st, by: "email" };
    if (st.subject && sub && normStory(st.subject) === sub) return { entry: st, by: "subject" };
  }
  const looks = storyLooks(job).looks;
  for (const st of list || [])
    if (looks && st.sender_name && sig.includes(normStory(st.sender_name))) return { entry: st, by: "name" };
  return null;
}
// unknown story job? no star requirement (random jobs always have one) or a very long email without a deadline
function storyLooks(job) {
  const long = (job.words || 0) >= 100;
  const why = [];
  if (job.noStars) why.push("no star requirement");
  if (long) why.push("long, story-like email");
  return { looks: !!job.noStars || (long && !job.deadline), why };
}
// story job with the budget written in the objectives → the budget does count
const budgetInObjectives = objs => (objs || []).some(o => /budget|\$\s?\d/i.test(typeof o === "string" ? o : o.text));
