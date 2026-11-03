// ===== PCBS job parser (pure functions, no DOM) =====
// One rule = task + keywords. A keyword starting with "-" is an exception: that phrase is
// ignored before matching (e.g. "-clean install" so "clean" still catches "never cleaned it").
const RULES_VERSION = 4;
// Hints from the PCBS community list – one rule per solution (hints with the same solution are merged).
const DEFAULT_RULES = [
  { task: "Run the virus scanner and remove viruses", keys: [
    "slow", "sluggish", "takes ages", "takes forever", "laggy", "lagging", "not as quick", "not as fast", "quick as it used", "fast as it used",
    "strange", "weird", "acting up", "behaving", "infected", "virus", "malware", "hacked",
    "pop-up", "pop up", "popup", "adverts", "ads keep", "suspicious", "dodgy", "shady", "sketchy", "unsafe", "clicked on", "clicked a", "clicked something", "something bad", "downloaded something", "torrent",
    "my kid", "my son", "my daughter", "my child", "children", "the kids", "grandkid", "grandson", "granddaughter", "little brother", "little sister", "nephew", "niece",
    "-not slow", "-strangely enough"] },
  { task: "Clean with compressed air", keys: [
    "dust", "dirty", "filthy", "grimy", "grubby", "cobweb", "clean", "on the floor", "on the carpet", "vents", "clogged", "blocked", "not much air", "no air", "airflow", "air flow",
    "pet hair", "cat hair", "dog hair", "fur", "smoker", "cigarette",
    "-clean install", "-clean copy", "-clean windows", "-clean os", "-clean look", "-clean build", "-clean cable", "-cleanly"] },
  { task: "Use new parts only – no used parts", keys: [
    "used parts", "used components", "used hardware", "second hand", "second-hand", "secondhand", "pre-owned", "preowned", "refurbished", "brand new", "new parts", "new components", "shiny new", "only new", "nothing used", "anything used"] },
  { task: "Run 3DMark after the build (again after any change)", keys: [
    "3dmark", "3d mark", "benchmark", "stability test", "stress test", "performance test", "test the performance", "test it properly", "run some tests"] },
  { task: "Urgent – finish ASAP (aim for 2 days)", keys: [
    "urgent", "asap", "a.s.a.p", "priority", "as soon as possible", "as quick as possible", "as fast as possible", "as quickly as possible", "in a hurry", "hurry", "rush",
    "need it fast", "need this fast", "need it quick", "need this quick", "need it back fast", "need it back quick", "need it soon", "need this soon", "need it back soon", "right away", "straight away", "pretty soon",
    "quickly", "done quick", "done fast", "done soon", "quick as you can", "fast as you can", "soon as you can", "quick turnaround", "in a rush", "no time to lose",
    "-boots quickly", "-boots up quickly", "-boot quickly", "-starts quickly", "-starts up quickly", "-loads quickly", "-runs quickly", "-ran quickly", "-more quickly", "-so quickly", "-too quickly", "-heats up quickly", "-gets hot quickly", "-dies quickly", "-crashes quickly"] },
  { task: "Add RGB lighting", keys: ["rgb", "lights", "lighting", "glow", "colourful", "colorful", "led", "-lights turn on", "-lights come on", "-lights are on", "-power light", "-lights on the"] },
  { task: "Water cooling requested", keys: ["water cool", "watercool", "water-cool", "liquid cool", "custom loop", "aio", "radiator"] },
];
// task names of earlier default rule sets – replaced when a saved rule list is upgraded
const OLD_DEFAULT_TASKS = ["Clean dust with compressed air", "Run antivirus scan", "NEW parts only – no used/PC Bay parts", "Install custom cables (check PC Bay)", "Find the burnt part (smoke) – check PSU first", "Check temps / reapply thermal paste / cooler", "Check PSU & temps (random reboots / shutdowns)", "Look for a damaged part (something was forced in)", "Check fans (noise)", "Check / install OS", "Check storage drive", "Overclock", "Lighting / RGB requested", "Water cooling requested"];
function ruleHits(rule, text) {
  let t = text;
  for (const k of rule.keys) if (k.startsWith("-") && k.length > 1) t = t.split(k.slice(1).toLowerCase()).join(" ");
  // a keyword must start a word ("led" is not in "failed"); very short ones must be the whole word
  return rule.keys.filter(k => {
    if (!k || k.startsWith("-")) return false;
    const kk = k.toLowerCase(), e = kk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(?<![a-z0-9])" + e + (kk.length <= 3 ? "(?![a-z0-9])" : ""), "i").test(t);
  });
}
// ---- Customer suspects: "Who makes RAM that fragile anyway?!", "It has to be CPU, right?" ----
// more specific names first: once "CPU cooler" is found, its "CPU" is not counted again
const SUSPECT_PARTS = [["CPU Cooler", "cpu coolers?|cpu fans?|heat ?sinks?|coolers?"], ["Case fans", "case fans?|fans"], ["RAM", "ram|memory|ram sticks?|dimms?"], ["GPU", "gpu|graphics ?cards?|video ?cards?|graphics"], ["CPU", "cpu|processor"], ["PSU", "psu|power ?supply|power unit"],
  ["Storage", "hard ?drives?|hdd|ssd|m\\.2|storage|disk"], ["Motherboard", "motherboard|mobo|main ?board"]];
const BLAME_WORDS = /\b(fragile|flimsy|broke|broken|breaks|dead|died|dying|fried|cheap|rubbish|snapped|cracked|faulty|busted|blown|blew|kaput|stopped working|not working|isn'?t working|doesn'?t work|gave up|packed in|crap|junk|useless|failed|failing|bust)\b/i;
const SUSPECT_WORDS = /\b(has to be|have to be|had to be|got to be|gotta be|must be|must have|sure it'?s|sure the|certain|bet it'?s|bet the|i think|i reckon|reckon|probably|maybe|might be|could it be|could be|is it the|guess|suspect|blame|it'?s the|it is the|sure it is|definitely|obviously|surely)\b|\bi(?:'?m| am) (?:\d+ ?% |pretty |quite |fairly |really |very |absolutely |100% )?sure\b|,\s*right\s*\?|\bright\?/i;
const NOT_SUSPECT = /\b(upgrade|install|add|want|need|buy|new|faster|better|two|dual|more)\b/i;
function partsIn(s) {
  const found = []; let t = s;
  for (const [part, src] of SUSPECT_PARTS) {
    const re = new RegExp("\\b(?:" + src + ")\\b", "ig");
    if (re.test(t)) { found.push(part); t = t.replace(re, " "); }
  }
  return found;
}
function detectSuspects(body) {
  const out = [];
  for (const s of String(body || "").replace(/[’`]/g, "'").split(/(?<=[.?!;])\s+/)) {
    const broken = BLAME_WORDS.test(s), guess = SUSPECT_WORDS.test(s);
    if (!broken && !guess) continue;
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
// strip OCR crumbs at the end of a line: "Diagnose and fix ls", "Diagnose and fix ‘S", "help plz G"
function trimJunk(s) {
  let w = String(s).trim().split(/\s+/);
  while (w.length > 1 && /^(?:[^A-Za-z0-9(]+|[^A-Za-z0-9(]*[a-z]{1,2}[^A-Za-z0-9)]*|[‘'`|;:,.~_][A-Za-z]{1,2})$/.test(w[w.length - 1]) && !/^(it|up|on|in|me|my|pc|os|ok)$/i.test(w[w.length - 1])) w.pop();
  return w.join(" ");
}
// a crumb of the icon / bullet in front of the first word: "s3DMark score" → "3DMark score",
// "eA Computer has gone crazy" → "Computer has gone crazy" (but "iPhone", "eBay" stay)
function trimLead(s) {
  let t = String(s).trim().replace(/^[\]\[|{}~_=:;,.]+\s+(?=\S)/, "");   // "] UPGRADES?" → "UPGRADES?"
  const w = t.split(/\s+/);
  if (w.length > 1 && /^[^A-Za-z0-9(]*[a-z][A-Z]?[^A-Za-z0-9]*$/.test(w[0]) && !/^a$/.test(w[0]) && /^[A-Z0-9]/.test(w[1])) t = w.slice(1).join(" ");
  else if (/^[a-z](?=\d|[A-Z]{2})/.test(t)) t = t.slice(1);
  return t;
}
// OCR noise (status bar, buttons) must not be glued onto an objective
function looksLikeText(l) {
  const w = l.split(/\s+/).filter(Boolean); if (!w.length || w.length > 12) return false;
  if (w.some(x => /^\W*\d+\W*$/.test(x) && !/^\(?\d+ days?\)?$/.test(x)) && !/\(\d+ days?\)/.test(l)) return false; // bare numbers = OCR noise ("4k", "1080p" are fine)
  const short = w.filter(x => !/\d/.test(x) && x.replace(/[^a-z]/gi, "").length <= 2).length;
  const odd = w.filter(x => /[a-z][A-Z]|^[A-Z]{2,}$/.test(x)).length;
  return short / w.length <= 0.25 && odd <= 1;
}

const BRANDS = ["Mortoni","Shean","DFL","FSP","GamerStorm","Kolink","Open Benchtable","Fractal Design","Team Group","EVGA","NZXT","Intel","AMD","Cryorig","SilverStone","G.SKILL","ASUS","ASRock","Seagate","Corsair","Cooler Master","MSI","Gigabyte","GIGABYTE","AORUS","ZOTAC","Sapphire","XFX","PowerColor","Western Digital","WD","Samsung","Crucial","Kingston","HyperX","Thermaltake","Fractal","Phanteks","be quiet!","Noctua","Deepcool","Raijintek","In Win","InWin","Lian Li","Antec","Razer","Patriot","Team","Toshiba","Adata","ADATA","Arctic","Ballistix","Biostar","Enermax","Inno3D","PNY","Palit","Zalman","Scythe","Bitfenix","BitFenix","Rosewill","Seasonic","SuperFlower","Super Flower","Kolink","Xigmatek","Mushkin","OCZ","Intel Optane","Optane","Gamdias","Hyte","Cougar","Cryorig","Alphacool","EK","Bykski","Barrow","Geil","GeIL","Galax","KFA2","Gainward","Colorful","EKWB","Generic","GALAX","Asus","Msi","Kingston"];
const OCR_FIX = [[/^[©@®Cc6]\.?\s?SKILL/i, "G.SKILL"], [/^G\s?\.\s?SKILL/i, "G.SKILL"], [/^lntel/, "Intel"], [/^1ntel/, "Intel"], [/^NZXT/i, "NZXT"]];

function categorize(name) {
  const n = name.toLowerCase();
  if (/tower|case|chassis|h\d{3}|mid tower|full tower|cube/.test(n) && !/cooler|fan/.test(n)) return "Case";
  if (/geforce|gtx|rtx|radeon|\brx\b|vega|titan|quadro|\bgt\s?\d/.test(n)) return "GPU";
  if (/core i\d|ryzen|threadripper|pentium|celeron|athlon|xeon|fx-\d/.test(n)) return "CPU";
  if (/\d+\s?gb\s?\d{3,4}\s?mhz|ddr\d|trident|vengeance|ripjaws|dominator|fury|ballistix|memory/.test(n)) return "RAM";
  if (/\b[zhbx]\d{3}[a-z]?\b|\bam4\b|motherboard|mainboard|prime|tuf|aorus|tomahawk|mortar|strix [zbx]/.test(n)) return "Motherboard";
  if (/\d+\s?(tb|gb)\b|ssd|hdd|barracuda|nvme|m\.2|evo|caviar|blue|firecuda|ironwolf|mx\d{3}|optane/.test(n)) return "Storage";
  if (/psu|\d{3,4}\s?w\b|watt|power|st\d\d|supernova|rm\d{3}|hx\d{3}|cx\d{3}|focus|toughpower|smartpower|strider/.test(n)) return "PSU";
  if (/cooler|h7|hyper|nh-|lumi|aio|kraken|liquid|frost|dark rock|freezer|tower cooler/.test(n)) return "CPU Cooler";
  if (/fan|ll\d{3}|ql\d{3}|ml\d{3}|sp\d{3}|af\d{3}/.test(n)) return "Case Fan";
  return "Other";
}

function cleanPartLine(line) {
  let l = line.replace(/[|\[\]{}‘’'`~_—–]+/g, " ").replace(/\s+[-:.,;=]+\s*$/, "").replace(/\s{2,}/g, " ").trim();
  for (const [re, rep] of OCR_FIX) l = l.replace(re, rep);
  // find earliest brand occurrence and cut leading icon noise
  let best = -1;
  for (const b of BRANDS) {
    const re = new RegExp("(^|\\s)" + b.replace(/[.*+?^${}()|[\]\\!]/g, "\\$&") + "(\\s|$)", "i");
    const m = re.exec(l);
    if (m) { const idx = m.index + m[1].length; if (best < 0 || idx < best) best = idx; }
  }
  const fixG = l.match(/[©@®Cc6]\.?SKILL/i);
  if (fixG) { l = l.replace(fixG[0], "G.SKILL"); if (best < 0 || fixG.index < best) best = fixG.index; }
  return { text: best >= 0 ? l.slice(best).trim() : l, branded: best >= 0 };
}

// raw candidate lines of the PC Stats list ({text, branded}); joining is done later against the parts database
function componentLines(text) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const start = lines.findIndex(l => /components/i.test(l));
  const out = [];
  for (const raw of start >= 0 ? lines.slice(start + 1) : lines) {
    if (/^\W*(ok|pc status|benchmark|invoiceable)\b/i.test(raw)) continue;
    const { text: t, branded } = cleanPartLine(raw);
    const txt = branded ? t : t.replace(/^[^A-Za-z0-9(]+/, "").replace(/^(?:[a-z]{1,2}|[^A-Za-z0-9\s]+)\s+(?=[A-Z0-9])/, "").replace(/\s+[^A-Za-z0-9)]{1,2}$/, "").trim();
    if ((txt.match(/[A-Za-z0-9]/g) || []).length < 4) continue;
    out.push({ text: txt, branded });
  }
  return out;
}
function parseComponents(text) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const start = lines.findIndex(l => /components/i.test(l));
  const body = start >= 0 ? lines.slice(start + 1) : lines;
  const parts = [];
  for (const raw of body) {
    if (/^(ok|pc status|benchmark|invoiceable)/i.test(raw)) continue;
    const { text, branded } = cleanPartLine(raw);
    const letters = (text.match(/[A-Za-z0-9]/g) || []).length;
    if (letters < 4) continue;
    if (branded) { parts.push(text); continue; }
    // continuation line (e.g. "16 GB 4000 MHz", "VEGA64 OC Edition")
    const cont = text.replace(/^[^A-Za-z0-9]+/, "").replace(/^(?:[a-z]{1,2}|[^A-Za-z0-9\s]+)\s+(?=[A-Z0-9])/, "").replace(/\s+[^A-Za-z0-9]{1,2}$/, "").trim();
    const words = cont.split(" ").filter(w => /[A-Za-z0-9]{2,}/.test(w));
    if (parts.length && words.length >= 2 && words.length === cont.split(" ").length) parts[parts.length - 1] += " " + cont;
  }
  return parts.map(name => ({ name, cat: categorize(name) }));
}

// Manufacturers in the game. [display name, regex source, case-sensitive?]
// Case-sensitive entries are also everyday words (colorful, patriot, arctic).
const BRANDS_PREF = [
  ["ADATA", "adata|xpg"], ["AMD", "amd|ryzen|radeon|team red"], ["ARCTIC", "ARCTIC|Arctic", true], ["ASRock", "asrock"],
  ["ASUS", "asus|rog|republic of gamers"], ["Alphacool", "alphacool"], ["Antec", "antec"], ["CORSAIR", "corsair"],
  ["Colorful", "Colorful|COLORFUL|iGame", true], ["Cooler Master", "cooler ?master"], ["Cryorig", "cryorig"],
  ["DFL", "DFL", true], ["Deepcool", "deep ?cool"], ["EKWB", "ekwb|ek water ?blocks"], ["EVGA", "evga"], ["FSP", "FSP", true],
  ["Fractal Design", "fractal(?: design)?"], ["G.SKILL", "g\\.? ?skill"], ["GIGABYTE", "gigabyte|aorus"], ["GamerStorm", "gamer ?storm"],
  ["HyperX", "hyper ?x"], ["InWin", "in ?win"], ["Intel", "intel|team blue"], ["Kingston", "kingston"], ["Kolink", "kolink"],
  ["Lian Li", "lian ?li"], ["MSI", "msi"], ["Mortoni", "mortoni"], ["NVIDIA", "nvidia|geforce|team green"], ["NZXT", "nzxt"],
  ["Patriot", "Patriot|PATRIOT", true], ["Raijintek", "raijintek"], ["Seagate", "seagate"], ["Shean", "Shean|SHEAN", true],
  ["SilverStone", "silver ?stone"], ["Team Group", "team ?group|t-?force"], ["Thermaltake", "thermaltake"],
  ["ZOTAC", "zotac"], ["be quiet!", "be quiet!|bequiet"],
];
const BRAND_KNOWN = /\b(my|our)\s+(brother|sister|mate|mates|friend|friends|buddy|pal|dad|father|mum|mom|mother|son|daughter|cousin|uncle|aunt|colleague|coworker|boss|girlfriend|boyfriend|wife|husband|partner|kid|kids|neighbou?r|flatmate|roommate|teacher|grandad|grandpa|gran|grandma)\b|\b(heard|uses|using|use|has|had|got|recommend(?:s|ed)?|said|says|told me|swears)\b/i;
const BRAND_LIKE = /\b(fan|fanboy|fangirl|love[sd]?|lov(?:e|ing)|adore|like[sd]?|into|bomb|good|great|best|awesome|amazing|brilliant|excellent|top[- ]notch|rocks?|favou?rite|prefer(?:red)?|swear by|recommend(?:ed)?|only (?:use|buy|trust)|big on|obsessed|can'?t get enough|trust|loyal|guy|girl|the business|legit)\b/i;
const BRAND_DISLIKE = /\b(hate[sd]?|avoid|don'?t (?:like|want|trust)|do not (?:like|want|trust)|can'?t stand|terrible|awful|rubbish|garbage|trash|crap|never again|not a fan|no more|stay away|steer clear|sick of|keep .{0,15} away|anything but|anything except|not (?:any|one single) )\b/i;
function detectBrands(body) {
  const out = [];
  const sentences = String(body || "").replace(/[’`]/g, "'").split(/(?<=[.?;\n])\s+|(?<=!)\s+(?=[A-Z])/);
  sentences.forEach((s, i) => {
    // "Have you heard of FSP? They're meant to be pretty good." – the follow-up sentence counts too
    const next = sentences[i + 1] || "";
    const follow = /^\s*(they|they're|theyre|their|them|it|it's|its|those|these|apparently|i hear|i've heard|supposedly)\b/i.test(next) ? " " + next : "";
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
const CABLE_COL = "red|blue|green|yellow|orange|purple|pink|white|black|gray|grey|silver|gold|cyan|teal|brown|lime|magenta|violet|navy|beige|turquoise|aqua|rainbow";
const CABLE_SHADE = "(?:(?:light|dark|bright|pale|deep|neon|sky|baby|royal|hot)\\s+)?";
const CABLE_TYPE = "plastic|braided|plain|sleeved|ribbon|duo|loose|tight";
function detectCables(body) {
  const b = " " + String(body || "").toLowerCase().replace(/[’`]/g, "'") + " ";
  const types = new Set(), cols = [], quotes = [];
  const add = (t, c, q) => { if (t) t.split(/\s+/).filter(Boolean).forEach(x => types.add(x)); if (c && !cols.includes(c)) cols.push(c); if (q) quotes.push(q.trim()); };
  // type + colour, in either order: "plastic yellow", "braided dark grey", "yellow braided"
  for (const m of b.matchAll(new RegExp("\\b((?:(?:" + CABLE_TYPE + ")\\s+)+)(" + CABLE_SHADE + "(?:" + CABLE_COL + "))\\b", "g"))) add(m[1].trim(), m[2], m[0]);
  for (const m of b.matchAll(new RegExp("\\b(" + CABLE_SHADE + "(?:" + CABLE_COL + "))\\s+((?:plastic|braided|sleeved|ribbon)\\b)", "g"))) add(m[2], m[1], m[0]);
  // only with the word cable(s) and a wish in the sentence: "I love yellow cables", "braided cables please"
  for (const s of b.split(/[.!?]/)) {
    if (!/\b(cables?|wires?|cabling)\b/.test(s)) continue;
    const wish = /\b(like|love|nice|want|would like|prefer|please|cool|awesome|great|lovely|pretty|amazing|fan of|into|fancy|go for|use|need)\b|on pc ?bay/.test(s);
    if (!wish) continue;
    for (const m of s.matchAll(new RegExp("\\b(" + CABLE_SHADE + "(?:" + CABLE_COL + "))\\s+(?:(?:" + CABLE_TYPE + ")\\s+)?(?:cables?|wires?|cabling)\\b", "g"))) add("", m[1], m[0]);
    for (const m of s.matchAll(/\b(plastic|braided|sleeved|ribbon)\s+(?:cables?|wires?|cabling)\b/g)) add(m[1], "", m[0]);
  }
  const pcbay = /saw (?:some |these |those |the |a set of )?[a-z0-9 .+\-]{0,40}?cables? on pc ?bay/.test(b);
  if (!types.size && !cols.length && !pcbay) return null;
  const cap = s => s.replace(/\b\w/g, c => c.toUpperCase()).replace(/Gray/g, "Grey");
  const typeTxt = [...types].filter(t => t !== "plain" || types.size === 1).map(cap).join(" ");
  const want = cols.length ? cols.map(c => (typeTxt + " " + cap(c)).trim()) : [typeTxt].filter(Boolean);
  return { want, label: want.length ? want.join(" / ") : "the cables seen on PC Bay", quotes: [...new Set(quotes)].slice(0, 3), pcbay };
}

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
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function lineSim(a, b) {
  const x = lineKey(a), y = lineKey(b);
  if (!x || !y) return 0;
  if (x.length < 5 || y.length < 5) return x === y ? 1 : 0;
  return 1 - editDist(x, y) / Math.max(x.length, y.length);
}
// words that appear in job emails – a correctly read line contains more of them
const KNOWN_WORDS = new Set(("a an the to of for and or in on at by with my your it is be can if not no so i i'm i've need want "
  + "upgrade upgraded install replace repair remove fix build complete completed end day today tomorrow score 3dmark benchmark "
  + "gb tb mhz ram memory cpu gpu psu ssd hdd storage drive case fan fans cooler cooling water cables cable graphics card cards "
  + "motherboard processor power supply overclock overclocked lighting rgb led use used new parts part any all least more than "
  + "labour labor budget objectives req level kind regards hi hey hello thanks thank you pc computer please").split(" "));
function lineQuality(e) {
  const words = e.t.toLowerCase().replace(/[’`]/g, "'").split(/[^a-z0-9']+/).filter(Boolean);
  const known = words.filter(w => KNOWN_WORDS.has(w) || /^\d+$/.test(w)).length;
  const odd = (e.t.match(/[^\w\s.,!?'’"$:;/()&%#+\-–•*@]/g) || []).length;
  return known * 10 - odd * 5 + (e.conf != null ? e.conf / 10 : 0) - (e.edge ? 12 : 0);
}
function shotLines(s) {
  const text = typeof s === "string" ? s : s.text;
  const conf = typeof s === "string" ? null : s.conf;   // [[line text, confidence]] from the OCR, if known
  const ls = text.split("\n").map(l => l.trim()).filter(Boolean);
  return ls.map((t, i) => {
    const c = conf && conf.find(([ct]) => ct.trim() === t);
    return { t, edge: i === 0 || i === ls.length - 1, conf: c ? c[1] : null };
  });
}
function mergeTexts(shots) {
  let acc = null;
  for (const s of shots) {
    const ls = shotLines(s);
    if (!acc) { acc = ls; continue; }
    // longest chain of similar lines, in order (like a diff)
    const n = acc.length, m = ls.length, L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    const sim = (i, j) => lineSim(acc[i].t, ls[j].t) >= 0.75;
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      L[i][j] = sim(i, j) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const pairs = [];
    for (let i = 0, j = 0; i < n && j < m;) {
      if (sim(i, j) && L[i][j] === L[i + 1][j + 1] + 1) { pairs.push([i, j]); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
    }
    const out = [];
    // lines between two matches: when both screenshots have some, a line at a screenshot's
    // edge is a cut-off copy of what the other one shows in full – drop it
    // before the first / after the last match, the screenshot reaching further out goes outermost
    // …but at the very start / end only the screenshot that does NOT reach further out has a cut copy there;
    // the edge line of the one reaching further out is kept when it's clean text (or the sender's address).
    // E.g. the last objective of a build request, when the buttons below it weren't read – fix / upgrade
    // emails always have the "PC Status" bar below the objectives instead.
    const clean = e => /@[\w-]+\./.test(e.t) || (e.conf != null && e.conf >= 80 && (e.t.match(/[A-Za-z]{3,}/g) || []).length >= 2);
    const gap = (A, B, where) => {
      if (A.length && B.length) {
        const outer = where === "mid" || A.length === B.length ? null : A.length > B.length ? "A" : "B";
        const keep = (e, side) => !e.edge || (side === outer && clean(e));
        A = A.filter(e => keep(e, "A")); B = B.filter(e => keep(e, "B") && !A.some(a => lineSim(a.t, e.t) >= 0.5));
      }
      const swap = where === "start" ? B.length > A.length : where === "end" ? A.length > B.length : false;
      out.push(...(swap ? [...B, ...A] : [...A, ...B]));
    };
    let pi = 0, pj = 0;
    for (const [i, j] of pairs) {
      gap(acc.slice(pi, i), ls.slice(pj, j), out.length ? "mid" : "start");
      const a = acc[i], b = ls[j];
      out.push(lineQuality(b) > lineQuality(a) ? { ...b, edge: a.edge && b.edge } : { ...a, edge: a.edge && b.edge });
      pi = i + 1; pj = j + 1;
    }
    gap(acc.slice(pi), ls.slice(pj), "end");
    acc = out;
  }
  return (acc || []).map(e => e.t).join("\n");
}

function parseEmail(text, rules, smart) {
  rules = rules || DEFAULT_RULES;
  const raw = text.replace(/\r/g, "");
  // a box wider than the email also catches the inbox's date column: "6/12/2018 I hate using…"
  // stray picture crumbs glued to the "@" of an address: "TinyAunt@]JulieBrewing.ly" → "TinyAunt@JulieBrewing.ly"
  const lines = raw.split("\n").map(s => s.trim().replace(/(\w)(?:\s?[\[\]|{}()]\s?@\s?[\[\]|{}()]?|@\s?[\[\]|{}()]\s?)(?=\w)/g, "$1@").replace(/^\d{1,2}\/\d{1,2}\/\d{4}\s*(?=\S{3}|$)/, "").replace(/^\d{1,4}\s*[|]?\s+(?=\S)/, "").replace(/^[|=]\s*/, "").trim()).filter(Boolean);
  const job = { sender: "", subject: "", labour: null, budget: null, level: null, deadline: "", objectives: [], hidden: [], suspect: "", body: "", components: [] };
  // sender = the last address above the greeting (inbox entries come first when the box is too big)
  const startB0 = lines.findIndex(l => /you work with computers|^(hi|hello|hey|dear|good (day|morning|afternoon|evening))\b/i.test(l));
  const mailIdx = lines.map((l, i) => /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(l) && !/^pc for/i.test(l) ? i : -1).filter(i => i >= 0);
  const emailLineIdx = startB0 > 0 ? (mailIdx.filter(i => i < startB0).pop() ?? mailIdx[0] ?? -1) : (mailIdx[0] ?? -1);
  if (emailLineIdx >= 0) {
    job.sender = lines[emailLineIdx].match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/i)[0];
    const nxt = lines[emailLineIdx + 1];
    if (nxt && !/you work with|labour|objectives|@/i.test(nxt) && emailLineIdx + 1 !== startB0) job.subject = trimLead(trimJunk(nxt.replace(/^Ineed/, "I need")));
  }
  const emailDate = (emailLineIdx >= 0 && (lines[emailLineIdx].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/) || (lines[emailLineIdx + 1] || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) || raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const pcFor = raw.match(/PC for\s+([\w.+-]+@[\w-]+(\.[\w-]+)+)/i);
  if (!job.sender && pcFor) job.sender = pcFor[1];
  // "Labouk $249" – a letter hidden by the mouse pointer: any "Lab…" word followed by a $ amount
  const lab = raw.match(/Labou?r[:;]?\s*\$?\s*([\d,]+)/i) || raw.match(/\bLab\w{1,4}[:;]?\s*\$\s*([\d,]+)/i); if (lab) job.labour = +lab[1].replace(/,/g, "");
  const bud = raw.match(/Budget[:;]?\s*\$?\s*([\d,]+)/i); if (bud) job.budget = +bud[1].replace(/,/g, "");
  const lev = raw.match(/Level\s*(\d+)/i); if (lev) job.level = +lev[1];

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
      if (m) { const o = trimLead(trimJunk(m[1].replace(/\s+PC Stats$/i, "").replace(/^[^A-Za-z0-9(]+/, ""))).replace(/\s+[A-Z]$/, ""); if (o.length > 2 && (/[A-Za-z]{4,}/.test(o) || /^OC\s+(CPU|GPU|RAM)\b/i.test(o))) {   // "OC CPU to 4000MHz" has no long word
        job.objectives.push(o); junk = 0; continue; } }
      if (job.objectives.length && /^[a-z(]/.test(l) && l.length > 3 && looksLikeText(l)) { job.objectives[job.objectives.length - 1] += " " + trimJunk(l); continue; }
      junk++;
    }
    // the same objective read twice (e.g. once cut off at the edge) → keep the better reading
    const objs = [];
    for (const o of job.objectives) {
      const k = objs.findIndex(x => lineSim(x, o) >= 0.75);
      if (k < 0) objs.push(o); else if (lineQuality({ t: o }) > lineQuality({ t: objs[k] })) objs[k] = o;
    }
    job.objectives = objs;
  }
  const dl = raw.match(/Complete by[^\n]*?(\d{1,2}\/\d{1,2}\/\d{4})/i) || raw.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*\(?(Tomorrow|Today)/i);
  if (dl) job.deadline = dl[1];

  // body = text between greeting and money panel
  const startB = startB0;
  const endB = lines.findIndex(l => /labou?r|budget/i.test(l));
  const bodyLines = lines.slice(startB >= 0 ? startB : emailLineIdx + 2, endB > 0 ? endB : undefined);
  job.body = bodyLines.join(" ").replace(/\s+/g, " ").trim();
  // story-job signals: the name the email is signed with, no star requirement in the blue band, a long text
  job.signature = bodyLines.slice(-3).map(l => l.replace(/^[-–—~\s]+/, "").replace(/[,.!]+$/, "").trim()).filter(l => l && l.split(/\s+/).length <= 4 && !/regards|thanks|cheers|best|sincerely/i.test(l));
  job.words = job.body ? job.body.split(/\s+/).length : 0;
  const band = /labou?r/i.test(raw) && /budget/i.test(raw);
  job.noStars = band ? /Re[qga]\s*[:;.]?\s*Level/i.test(raw) && (raw.match(/\bRe[qga]\s*[:;.]/gi) || []).length < 2 : null; // OCR reads "Req" as "Rea" too

  const det = detectHidden(job.body, rules, smart, job.objectives, emailDate, !!job.deadline);
  job.hidden = det.hidden; job.suspect = det.suspect;
  if (det.softDeadline) { job.deadline = det.softDeadline; job.softDeadline = true; }
  return job;
}

// ---- story jobs (career story customers): known ones from data/story-jobs.csv, others by their look ----
const normStory = s => String(s || "").toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9@.' ]+/g, " ").replace(/\s+/g, " ").trim();
// which list entry this email belongs to, and what matched. A name alone only counts when the email also
// looks like a story job – random customers sign with first names too.
function storyMatch(job, list) {
  const e = normStory(job.sender), sub = normStory(job.subject), sig = (job.signature || []).map(normStory);
  for (const st of list || []) {
    if (st.email && e && normStory(st.email) === e) return { entry: st, by: "email" };
    if (st.subject && sub && normStory(st.subject) === sub) return { entry: st, by: "subject" };
  }
  const looks = storyLooks(job).looks;
  for (const st of list || []) if (looks && st.sender_name && sig.includes(normStory(st.sender_name))) return { entry: st, by: "name" };
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

// Built-in ("smart") detections that can be switched off in the rules window
const SMART_DEFAULT = { cables: true, brands: true, broken: true };
// hidden objectives for an email body – also used by the "Try it" box in the rules window
function detectHidden(body, rules, smart, objectives, emailDate, hasDeadline) {
  rules = rules || DEFAULT_RULES; smart = Object.assign({}, SMART_DEFAULT, smart); objectives = objectives || [];
  let hidden = []; const out = { hidden, suspect: "", softDeadline: "" };
  const b = " " + String(body || "").toLowerCase().replace(/[’`]/g, "'") + " ";
  for (const r of rules) {
    if (r.off) continue;
    const hits = ruleHits(r, b);
    if (hits.length) {
      const already = objectives.some(o => o.toLowerCase().includes(r.task.toLowerCase().slice(0, 12)));
      if (!already) hidden.push({ task: r.task, because: hits.slice(0, 3) });
    }
  }
  // "used parts are fine" cancels the new-parts rule
  if (/used parts (are|is) (fine|ok|okay)|don't mind used|happy with used|used is fine/.test(b)) hidden = hidden.filter(h => !/new parts only/i.test(h.task));
  // 3DMark already in the listed objectives → no extra hint
  if (objectives.some(o => /3d ?mark|benchmark/i.test(o))) hidden = hidden.filter(h => !/3dmark/i.test(h.task));
  // …and "slow" is then about the score, not viruses: the virus hint stays only when something else points to viruses
  // (pop-ups, "acting weird", "my kids used it"…) – DullGirl: "PC is super slow… benchmarked 5660!!"
  const SPEED = /^(slow|sluggish|takes ages|takes forever|laggy|lagging|not as quick|not as fast|quick as it used|fast as it used)$/i;
  if (objectives.some(o => /3d ?mark/i.test(o))) hidden = hidden.filter(h => !/virus/i.test(h.task) || h.because.some(q => !SPEED.test(String(q).trim())));
  // urgent without an explicit deadline → soft deadline 2 days after the email date
  const urg = hidden.find(h => /^urgent/i.test(h.task));
  if (urg) {
    if (hasDeadline) hidden = hidden.filter(h => h !== urg);
    else if (emailDate) { const d = emailDate, t = new Date(Date.UTC(+d[3], +d[1] - 1, +d[2] + 2)); out.softDeadline = `${t.getUTCMonth() + 1}/${t.getUTCDate()}/${t.getUTCFullYear()}`; urg.task += ` – by ${out.softDeadline}`; }
  }
  // cables: colour and/or type, all in one task
  const cab = smart.cables && detectCables(body);
  if (cab) hidden.unshift({ task: "Change all cables → " + cab.label, because: cab.quotes.length ? cab.quotes : ["cables on PC Bay"], want: cab.want, smart: "cables" });
  // brand: "I'm a total NZXT fanboy", "my brother swears by MSI", "Have you heard of FSP?"
  if (smart.brands) for (const p of detectBrands(body)) hidden.push({ task: `Use ${p.brand} for as many parts as possible`, because: [p.quote], brand: p.brand, smart: "brands" });
  // customer suspects: broken-sounding parts become a task, all guesses fill the field
  const sus = detectSuspects(body);
  if (smart.broken) for (const s of sus.filter(s => s.broken)) hidden.push({ task: `Check / replace the ${s.part} – customer hints it's broken`, because: [s.quote], part: s.part, smart: "broken" });
  if (sus.length) out.suspect = sus.map(s => s.part).join(", ");
  out.hidden = hidden;
  return out;
}

// tidy a keyword typed in the rules window: lower case, one kind of apostrophe, single spaces
function normKeyword(k) { return String(k || "").toLowerCase().replace(/[’`´]/g, "'").replace(/\s+/g, " ").trim(); }
// keywords this short match too much ("it", "ok") – the rules window warns about them
const tooShort = k => k.replace(/[^a-z0-9]/g, "").length < 3;

if (typeof module !== "undefined") module.exports = { parseEmail, detectHidden, storyMatch, storyLooks, budgetInObjectives, SMART_DEFAULT, normKeyword, parseComponents, DEFAULT_RULES, RULES_VERSION, OLD_DEFAULT_TASKS, categorize, detectBrands, detectSuspects, detectCables, looksLikeText };
