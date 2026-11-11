// Hidden objectives from the email body: rule hits (rules.js), the parts the customer suspects, favourite / disliked
// brands, cable and coolant colours.
// ---- Customer suspects: "Who makes RAM that fragile anyway?!", "It has to be CPU, right?" ----
// more specific names first: once "CPU cooler" is found, its "CPU" is not counted again
const SUSPECT_PARTS = [
  ["CPU Cooler", "cpu coolers?|cpu fans?|heat ?sinks?|coolers?"],
  ["Case fans", "case fans?|fans"],
  ["RAM", "ram|memory|ram sticks?|dimms?"],
  ["GPU", "gpu|graphics ?cards?|video ?cards?|graphics"],
  ["CPU", "cpu|processor"],
  ["PSU", "psu|power ?supply|power unit"],
  ["Storage", "hard ?drives?|hdd|ssd|m\\.2|storage|disk"],
  ["Motherboard", "motherboard|mobo|main ?board"],
];
// broken: said outright, or the customer handled it badly – "RAM had to go in one way around", "there were clips for
// the RAM, and I got a bit violent", "I waggled the RAM a bit too hard" – or asks for it to be fixed ("Please fix my PSU!")
const BLAME_WORDS =
  /\b(fragile|flimsy|broke|broken|breaks|dead|died|dying|fried|cheap|rubbish|snapped|cracked|faulty|busted|blown|blew|kaput|stopped working|not working|isn'?t working|doesn'?t work|gave up|packed in|crap|junk|useless|failed|failing|bust|violent|violently|waggled|wiggled|wobbled|yanked|forced|too hard|bent|one way (?:a)?round|the right way (?:a)?round|the wrong way|wrong way (?:a)?round|backwards|upside down|(?:fix|repair) (?:my|the|this|our|his|her)|hoover(?:ed)?|vacuum(?:ed)?|vacuum cleaner)\b/i;
const SUSPECT_WORDS =
  /\b(has to be|have to be|had to be|got to be|gotta be|must be|must have|sure it'?s|sure the|certain|bet it'?s|bet the|i think|i reckon|reckon|probably|maybe|might be|could it be|could be|is it the|guess|suspect|blame|it'?s the|it is the|sure it is|definitely|obviously|surely|i thought|is it (?:a|an) (?:problem|issue|fault) with|(?:a |any )?(?:problem|issue|fault) with (?:the|my)|something wrong with|is it my)\b|\bi(?:'?m| am) (?:\d+ ?% |pretty |quite |fairly |really |very |absolutely |100% )?sure\b|,\s*right\s*\?|\bright\?/i;
const NOT_SUSPECT = /\b(upgrade|install|add|want|need|buy|new|faster|better|two|dual|more)\b/i;
function partsIn(s) {
  const found = [];
  let t = s;
  for (const [part, src] of SUSPECT_PARTS) {
    const re = new RegExp("\\b(?:" + src + ")\\b", "ig");
    if (re.test(t)) {
      found.push(part);
      t = t.replace(re, " ");
    }
  }
  return found;
}
function detectSuspects(body) {
  const out = [];
  let prev = "";
  for (const s of String(body || "")
    .replace(/[’`]/g, "'")
    .split(/(?<=[.?!;])\s+/)) {
    const before = prev;
    prev = s;
    const broken = BLAME_WORDS.test(s),
      guess = SUSPECT_WORDS.test(s);
    if (!broken && !guess) continue;
    // "I thought the motherboard was dirty so I cleaned it. With the hoover." – the blame names no part: the part is
    // in the sentence before
    if (broken && !partsIn(s).length && partsIn(before).length) {
      for (const part of partsIn(before)) {
        const o = out.find(x => x.part === part);
        if (o) o.broken = true;
        else out.push({ part, broken: true, quote: (before + " " + s).trim().slice(0, 110) });
      }
      continue;
    }
    if (!broken && NOT_SUSPECT.test(s) && !/\b(has|got|must) to be|must be|sure|reckon|blame|right\s*\?/i.test(s)) continue; // "maybe add more RAM" is a wish, not a suspect
    // "I was putting in a new CPU cooler and I think I broke some RAM": only the part in the
    // same clause as the blame counts. Without such a clause, the whole sentence is used.
    const clauses = s.split(/\s+(?:and|but|so|while|when|because|then)\s+|\s+[-–—]\s+|,\s*(?!right\b)/i);
    const hot = clauses.filter(c => (BLAME_WORDS.test(c) || SUSPECT_WORDS.test(c)) && partsIn(c).length);
    const parts = hot.length ? [...new Set(hot.flatMap(partsIn))] : partsIn(s);
    for (const part of parts) if (!out.some(o => o.part === part)) out.push({ part, broken, quote: s.trim().slice(0, 110) });
  }
  // "cooler" also matches inside "CPU cooler" – keep the more specific entry only once
  return out;
}
// Manufacturers in the game. [display name, regex source, case-sensitive?]
// Case-sensitive entries are also everyday words (colorful, patriot, arctic).
const BRANDS_PREF = [
  ["ADATA", "adata|xpg"],
  ["AMD", "amd|ryzen|radeon|team red"],
  ["ARCTIC", "ARCTIC|Arctic", true],
  ["ASRock", "asrock"],
  ["ASUS", "asus|rog|republic of gamers"],
  ["Alphacool", "alphacool"],
  ["Antec", "antec"],
  ["CORSAIR", "corsair"],
  ["Colorful", "Colorful|COLORFUL|iGame", true],
  ["Cooler Master", "cooler ?master"],
  ["Cryorig", "cryorig"],
  ["DFL", "DFL", true],
  ["Deepcool", "deep ?cool"],
  ["EKWB", "ekwb|ek water ?blocks"],
  ["EVGA", "evga"],
  ["FSP", "FSP", true],
  ["Fractal Design", "fractal(?: design)?"],
  ["G.SKILL", "g\\.? ?skill"],
  ["GIGABYTE", "gigabyte|aorus"],
  ["GamerStorm", "gamer ?storm"],
  ["HyperX", "hyper ?x"],
  ["InWin", "in ?win"],
  ["Intel", "intel|team blue"],
  ["Kingston", "kingston"],
  ["Kolink", "kolink"],
  ["Lian Li", "lian ?li"],
  ["MSI", "msi"],
  ["Mortoni", "mortoni"],
  ["NVIDIA", "nvidia|geforce|team green"],
  ["NZXT", "nzxt"],
  ["Patriot", "Patriot|PATRIOT", true],
  ["Raijintek", "raijintek"],
  ["Seagate", "seagate"],
  ["Shean", "Shean|SHEAN", true],
  ["SilverStone", "silver ?stone"],
  ["Team Group", "team ?group|t-?force"],
  ["Thermaltake", "thermaltake"],
  ["ZOTAC", "zotac"],
  ["be quiet!", "be quiet!|bequiet"],
];
const BRAND_KNOWN =
  /\b(my|our)\s+(brother|sister|mate|mates|friend|friends|buddy|pal|dad|father|mum|mom|mother|son|daughter|cousin|uncle|aunt|colleague|coworker|boss|girlfriend|boyfriend|wife|husband|partner|kid|kids|neighbou?r|flatmate|roommate|teacher|grandad|grandpa|gran|grandma)\b|\b(heard|uses|using|use|has|had|got|recommend(?:s|ed)?|said|says|told me|swears)\b/i;
const BRAND_LIKE =
  /\b(fan|fanboy|fangirl|love[sd]?|lov(?:e|ing)|adore|like[sd]?|into|bomb|good|great|best|awesome|amazing|brilliant|excellent|top[- ]notch|rocks?|favou?rite|prefer(?:red)?|swear by|recommend(?:ed)?|only (?:use|buy|trust)|big on|obsessed|can'?t get enough|trust|loyal|guy|girl|the business|legit)\b/i;
const BRAND_DISLIKE =
  /\b(hate[sd]?|avoid|don'?t (?:like|want|trust)|do not (?:like|want|trust)|can'?t stand|terrible|awful|rubbish|garbage|trash|crap|never again|not a fan|no more|stay away|steer clear|sick of|keep .{0,15} away|anything but|anything except|not (?:any|one single) )\b/i;
function detectBrands(body) {
  const out = [];
  const sentences = String(body || "")
    .replace(/[’`]/g, "'")
    .split(/(?<=[.?;\n])\s+|(?<=!)\s+(?=[A-Z])/);
  sentences.forEach((s, i) => {
    // "Have you heard of FSP? They're meant to be pretty good." – the follow-up sentence counts too
    const next = sentences[i + 1] || "";
    const follow = /^\s*(they|they're|theyre|their|them|it|it's|its|those|these|apparently|i hear|i've heard|supposedly)\b/i.test(
      next
    )
      ? " " + next
      : "";
    const ctx = s + follow;
    for (const [brand, src, cs] of BRANDS_PREF) {
      const re = new RegExp("(^|[^A-Za-z0-9])(?:" + src + ")(?![A-Za-z0-9])", cs ? "" : "i");
      if (!re.test(s)) continue;
      if (BRAND_DISLIKE.test(ctx) || BLAME_WORDS.test(s)) continue; // "not a fan of X", "my X card broke" – no brand request
      if (!BRAND_LIKE.test(ctx) && !BRAND_KNOWN.test(ctx)) continue;
      if (out.some(o => o.brand === brand)) continue;
      const quote = ctx.trim().replace(/\s+/g, " ");
      out.push({ brand, quote: quote.length > 110 ? quote.slice(0, 107) + "…" : quote });
    }
  });
  return out;
}
// ---- Cables: colour and/or type ("Plastic Yellow", "plain red", "braided cables", "I love yellow cables") ----
const CABLE_COL =
  "red|blue|green|yellow|orange|purple|pink|white|black|gray|grey|silver|gold|cyan|teal|brown|lime|magenta|violet|navy|beige|turquoise|aqua|rainbow";
const CABLE_SHADE = "(?:(?:light|dark|bright|pale|deep|neon|sky|baby|royal|hot)\\s+)?";
const CABLE_TYPE = "plastic|braided|plain|sleeved|ribbon|duo|loose|tight";
// ---- Coolant colour (custom water cooling): "blue coolant", "clear coolant", "green opaque coolant" ----
// The game's coolants are "<Colour> <Clear|Flecked|Opaque> Coolant" (+ "Clear Coolant")
function detectCoolant(body) {
  const b =
    " " +
    String(body || "")
      .toLowerCase()
      .replace(/[’`]/g, "'") +
    " ";
  const m = b.match(
    new RegExp(
      "\\b(" + CABLE_SHADE + "(?:" + CABLE_COL + "|clear))\\s+(?:(clear|flecked|opaque|see-through|transparent)\\s+)?coolant\\b"
    )
  );
  if (!m) return null;
  const col = m[1].trim(),
    kind = m[2] && m[2] !== "see-through" && m[2] !== "transparent" ? m[2] : m[2] ? "clear" : "";
  const label =
    col === "clear"
      ? "Clear"
      : col.replace(/\b\w/g, x => x.toUpperCase()) + (kind ? " " + kind[0].toUpperCase() + kind.slice(1) : "");
  return { label, col, kind, quote: m[0].trim() };
}
function detectCables(body) {
  const b =
    " " +
    String(body || "")
      .toLowerCase()
      .replace(/[’`]/g, "'") +
    " ";
  const types = new Set(),
    cols = [],
    quotes = [];
  const add = (t, c, q) => {
    if (t)
      t.split(/\s+/)
        .filter(Boolean)
        .forEach(x => types.add(x));
    // one colour group per wish; a group inside one already found ("yellow" of "white yellow") adds nothing
    c = c && c.replace(/\s+/g, " ").trim();
    if (c && !cols.some(x => (" " + x + " ").includes(" " + c + " "))) {
      for (let i = cols.length - 1; i >= 0; i--) if ((" " + c + " ").includes(" " + cols[i] + " ")) cols.splice(i, 1);
      cols.push(c);
    }
    if (q) quotes.push(q.trim());
  };
  // 1–4 colour words in a row are ONE wish (0.15.2): "plastic white yellow" = a set with both colours, not two options
  const COL1 = CABLE_SHADE + "(?:" + CABLE_COL + ")",
    GROUP = "(" + COL1 + "(?:\\s+" + COL1 + "){0,3})";
  // type + colour(s), in either order: "plastic yellow", "braided dark grey", "plastic white yellow", "yellow braided"
  for (const m of b.matchAll(new RegExp("\\b((?:(?:" + CABLE_TYPE + ")\\s+)+)" + GROUP + "\\b", "g")))
    add(m[1].trim(), m[2], m[0]);
  for (const m of b.matchAll(new RegExp("\\b" + GROUP + "\\s+((?:plastic|braided|sleeved|ribbon)\\b)", "g")))
    add(m[2], m[1], m[0]);
  // only with the word cable(s) and a wish in the sentence: "I love yellow cables", "braided cables please"
  for (const s of b.split(/[.!?]/)) {
    if (!/\b(cables?|wires?|cabling)\b/.test(s)) continue;
    const wish =
      /\b(like|love|nice|want|would like|prefer|please|cool|awesome|great|lovely|pretty|amazing|fan of|into|fancy|go for|use|need)\b|on pc ?bay/.test(
        s
      );
    if (!wish) continue;
    for (const m of s.matchAll(
      new RegExp("\\b" + GROUP + "\\s+(?:(?:" + CABLE_TYPE + ")\\s+)?(?:cables?|wires?|cabling)\\b", "g")
    ))
      add("", m[1], m[0]);
    for (const m of s.matchAll(/\b(plastic|braided|sleeved|ribbon)\s+(?:cables?|wires?|cabling)\b/g)) add(m[1], "", m[0]);
  }
  const pcbay = /saw (?:some |these |those |the |a set of )?[a-z0-9 .+\-]{0,40}?cables? on pc ?bay/.test(b);
  if (!types.size && !cols.length && !pcbay) return null;
  const cap = s => s.replace(/\b\w/g, c => c.toUpperCase()).replace(/Gray/g, "Grey");
  const typeTxt = [...types]
    .filter(t => t !== "plain" || types.size === 1)
    .map(cap)
    .join(" ");
  const want = cols.length ? cols.map(c => (typeTxt + " " + cap(c)).trim()) : [typeTxt].filter(Boolean);
  return {
    want,
    label: want.length ? want.join(" / ") : "the cables seen on PC Bay",
    quotes: [...new Set(quotes)].slice(0, 3),
    pcbay,
  };
}
// Built-in ("smart") detections that can be switched off in the rules window
const SMART_DEFAULT = { cables: true, coolant: true, brands: true, broken: true };
// hidden objectives for an email body – also used by the "Try it" box in the rules window
function detectHidden(body, rules, smart, objectives, emailDate, hasDeadline) {
  rules = rules || DEFAULT_RULES;
  smart = Object.assign({}, SMART_DEFAULT, smart);
  objectives = objectives || [];
  let hidden = [];
  const out = { hidden, suspect: "", softDeadline: "" };
  const b =
    " " +
    String(body || "")
      .toLowerCase()
      .replace(/[’`]/g, "'") +
    " ";
  for (const r of rules) {
    if (r.off) continue;
    const hits = ruleHits(r, b);
    if (hits.length) {
      const already = objectives.some(o => o.toLowerCase().includes(r.task.toLowerCase().slice(0, 12)));
      if (!already) hidden.push({ task: r.task, because: hits.slice(0, 3) });
    }
  }
  // "used parts are fine" cancels the new-parts rule
  if (/used parts (are|is) (fine|ok|okay)|don't mind used|happy with used|used is fine/.test(b))
    hidden = hidden.filter(h => !/new parts only/i.test(h.task));
  // "Install Parts with Lights: N coloured" already in the objectives → the RGB hint adds nothing
  if (objectives.some(o => /parts with lights?/i.test(o))) hidden = hidden.filter(h => !/\brgb\b/i.test(h.task));
  // 3DMark already in the listed objectives → no extra hint
  if (objectives.some(o => /3d ?mark|benchmark/i.test(o))) hidden = hidden.filter(h => !/3dmark/i.test(h.task));
  // (a speed complaint keeps the virus hint even on a 3DMark job: Conrad "not as quick as it used to be" + 3DMark score of 3972
  // had a virus in the game – a hint too many beats a missed one)
  // urgent without an explicit deadline → soft deadline 2 days after the email date
  const urg = hidden.find(h => /^urgent/i.test(h.task));
  if (urg) {
    if (hasDeadline) hidden = hidden.filter(h => h !== urg);
    else if (emailDate) {
      const d = emailDate,
        t = new Date(Date.UTC(+d[3], +d[1] - 1, +d[2] + 2));
      out.softDeadline = `${t.getUTCMonth() + 1}/${t.getUTCDate()}/${t.getUTCFullYear()}`;
      urg.task += ` – by ${out.softDeadline}`;
    }
  }
  // cables: colour and/or type, all in one task
  const cab = smart.cables && detectCables(body);
  if (cab)
    hidden.unshift({
      task: "Change all cables → " + cab.label,
      because: cab.quotes.length ? cab.quotes : ["cables on PC Bay"],
      want: cab.want,
      smart: "cables",
    });
  // coolant colour (custom loop): its own task, like the cables
  const cool = smart.coolant !== false && detectCoolant(body);
  if (cool)
    hidden.unshift({
      task: "Fill the loop with " + cool.label + " coolant",
      because: [cool.quote],
      coolant: cool,
      smart: "coolant",
    });
  // brand: "I'm a total NZXT fanboy", "my brother swears by MSI", "Have you heard of FSP?"
  if (smart.brands)
    for (const p of detectBrands(body))
      hidden.push({ task: `Use ${p.brand} for as many parts as possible`, because: [p.quote], brand: p.brand, smart: "brands" });
  // customer suspects: broken-sounding parts become a task, all guesses fill the field
  const sus = detectSuspects(body);
  if (smart.broken)
    for (const s of sus.filter(s => s.broken))
      hidden.push({
        task: `Check / replace the ${s.part} – customer hints it's broken`,
        because: [s.quote],
        part: s.part,
        smart: "broken",
      });
  if (sus.length) out.suspect = sus.map(s => s.part).join(", ");
  out.hidden = hidden;
  return out;
}
