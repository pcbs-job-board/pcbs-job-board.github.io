// ===== PCBS job parser (pure functions, no DOM) =====
// One rule = task + keywords. A keyword starting with "-" is an exception: that phrase is
// ignored before matching (e.g. "-clean install" so "clean" still catches "never cleaned it").
const RULES_VERSION = 2;
const DEFAULT_RULES = [
  { task: "Clean dust with compressed air", keys: ["dusty", "dust", "on the floor", "lives on the floor", "clean", "dirty", "filthy", "grimy", "cobweb", "pet hair", "cat hair", "dog hair", "my cat", "my dog", "smoker", "smokes", "cigarette", "not much air", "no air", "air coming out", "airflow", "air flow", "blocked", "clogged", "weak air", "-clean install", "-clean copy", "-clean windows", "-clean os", "-clean look", "-clean build", "-clean cable", "-cleanly"] },
  { task: "Run antivirus scan", keys: ["dodgy site", "dodgy website", "dodgy link", "virus", "malware", "pop-up", "pop up", "popup", "adverts", "ads keep", "slow", "sluggish", "not as quick", "not as fast", "quick as it used", "fast as it used", "weird", "strange things", "acting up", "hacked", "downloaded something", "clicked a link", "clicked on something", "clicked something", "something bad", "bad link", "suspicious", "dodgy"] },
  { task: "NEW parts only – no used/PC Bay parts", keys: ["used parts", "don't do that", "shiny new", "new components", "new parts", "brand new", "second hand", "second-hand", "like new things", "only new", "nothing used"] },
  { task: "Install custom cables (check PC Bay)", keys: ["pc bay", "sleeved cable", "custom cable", "cablemod"] },
  { task: "Find the burnt part (smoke) – check PSU first", keys: ["smoke came", "smoke coming", "white smoke", "black smoke", "some smoke", "of smoke", "burning smell", "smells burnt", "smell of burning", "burnt smell", "sparks", "loud bang", "went bang"] },
  { task: "Check temps / reapply thermal paste / cooler", keys: ["overheat", "too hot", "really hot", "gets hot", "getting hot", "bit hot", "running hot", "very hot", "so hot", "burning hot", "thermal", "shuts down", "shuts off", "turns off by itself", "turns itself off"] },
  { task: "Check PSU & temps (random reboots / shutdowns)", keys: ["reboot", "restarting", "restarts", "random restart", "keeps restarting", "blue screen", "bsod", "crashes", "crashing"] },
  { task: "Look for a damaged part (something was forced in)", keys: ["forced it", "forced in", "wouldn't fit", "didn't fit", "jammed it", "pushed really hard", "bent a pin", "bent pins"] },
  { task: "Check fans (noise)", keys: ["noisy", "loud", "noise", "rattl", "whir", "buzz", "-loud bang"] },
  { task: "Check / install OS", keys: ["operating system", "windows", "os ", "reinstall", "wiped", "format", "clean install"] },
  { task: "Check storage drive", keys: ["hard drive", "storage", "files", "photos", "lost my", "won't boot", "doesn't boot"] },
  { task: "Overclock", keys: ["overclock", "faster than stock", "push it further"] },
  { task: "Lighting / RGB requested", keys: ["rgb", "lights", "lighting", "glow", "colourful", "colorful"] },
  { task: "Water cooling requested", keys: ["water cool", "liquid cool", "custom loop", "aio"] },
];
// keywords taken out of the defaults in a later version (removed from saved rules too)
const RULES_REMOVED = { "Clean dust with compressed air": ["smoke", "cleaning", "a bit of a clean", "need a clean", "needs a clean"], "Check temps / reapply thermal paste / cooler": ["burning"], "Look for a damaged part (something was forced in)": ["snapped"], "Run antivirus scan": ["viruses", "popups"] };
function ruleHits(rule, text) {
  let t = text;
  for (const k of rule.keys) if (k.startsWith("-") && k.length > 1) t = t.split(k.slice(1).toLowerCase()).join(" ");
  return rule.keys.filter(k => k && !k.startsWith("-") && t.includes(k.toLowerCase()));
}
// "Who makes RAM that fragile anyway?!" → the RAM is probably broken
const BLAME_PARTS = [["RAM", "ram|memory|ram sticks?"], ["GPU", "gpu|graphics card|video card|graphics"], ["CPU", "cpu|processor"], ["PSU", "psu|power supply"], ["Storage", "hard drive|hdd|ssd|m\\.2"], ["Motherboard", "motherboard|mobo|main board"], ["CPU Cooler", "cpu cooler|cooler|cpu fan"], ["Case fans", "case fans?|fans"]];
const BLAME_WORDS = /\b(fragile|flimsy|broke|broken|breaks|dead|died|dying|fried|cheap|rubbish|snapped|cracked|faulty|busted|blown|blew|kaput|stopped working|not working|isn't working|doesn't work|gave up|packed in|crap|junk)\b/i;
function detectBlamedParts(body) {
  const out = [];
  for (const s of String(body || "").split(/(?<=[.?!;])\s+/)) {
    if (!BLAME_WORDS.test(s)) continue;
    for (const [part, src] of BLAME_PARTS) {
      if (new RegExp("\\b(?:" + src + ")\\b", "i").test(s) && !out.some(o => o.part === part)) out.push({ part, quote: s.trim().slice(0, 110) });
    }
  }
  return out;
}
// OCR noise (status bar, buttons) must not be glued onto an objective
function looksLikeText(l) {
  const w = l.split(/\s+/).filter(Boolean); if (!w.length || w.length > 12) return false;
  if (/\d/.test(l.replace(/\d{1,2}\/\d{1,2}\/\d{4}|\(\d+ days?\)/g, ""))) return false;
  const short = w.filter(x => x.replace(/[^a-z]/gi, "").length <= 2).length;
  const odd = w.filter(x => /[a-z][A-Z]|^[A-Z]{2,}$/.test(x)).length;
  return short / w.length <= 0.25 && odd <= 1;
}

const BRANDS = ["EVGA","NZXT","Intel","AMD","Cryorig","SilverStone","G.SKILL","ASUS","ASRock","Seagate","Corsair","Cooler Master","MSI","Gigabyte","GIGABYTE","AORUS","ZOTAC","Sapphire","XFX","PowerColor","Western Digital","WD","Samsung","Crucial","Kingston","HyperX","Thermaltake","Fractal","Phanteks","be quiet!","Noctua","Deepcool","Raijintek","In Win","InWin","Lian Li","Antec","Razer","Patriot","Team","Toshiba","Adata","ADATA","Arctic","Ballistix","Biostar","Enermax","Inno3D","PNY","Palit","Zalman","Scythe","Bitfenix","BitFenix","Rosewill","Seasonic","SuperFlower","Super Flower","Kolink","Xigmatek","Mushkin","OCZ","Intel Optane","Optane","Gamdias","Hyte","Cougar","Cryorig","Alphacool","EK","Bykski","Barrow","Geil","GeIL","Galax","KFA2","Gainward","Colorful","EKWB","Generic","GALAX","Asus","Msi","Kingston"];
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
      const avoid = BRAND_DISLIKE.test(ctx), like = BRAND_LIKE.test(ctx);
      if (!avoid && !like) continue;
      const quote = ctx.trim().replace(/\s+/g, " ");
      out.push({ brand, avoid, quote: quote.length > 110 ? quote.slice(0, 107) + "…" : quote });
    }
  });
  return out;
}

function parseEmail(text, rules) {
  rules = rules || DEFAULT_RULES;
  const raw = text.replace(/\r/g, "");
  const lines = raw.split("\n").map(s => s.trim()).filter(Boolean);
  const job = { sender: "", subject: "", labour: null, budget: null, level: null, deadline: "", objectives: [], hidden: [], suspect: "", body: "", components: [] };
  const emailLineIdx = lines.findIndex(l => /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(l) && !/^pc for/i.test(l));
  if (emailLineIdx >= 0) {
    job.sender = lines[emailLineIdx].match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/i)[0];
    const nxt = lines[emailLineIdx + 1];
    if (nxt && !/you work with|labour|objectives/i.test(nxt)) job.subject = nxt.replace(/^Ineed/, "I need").replace(/\s+\S{1,2}$/, "").trim();
  }
  const pcFor = raw.match(/PC for\s+([\w.+-]+@[\w-]+(\.[\w-]+)+)/i);
  if (!job.sender && pcFor) job.sender = pcFor[1];
  const lab = raw.match(/Labou?r[:;]?\s*\$?\s*([\d,]+)/i); if (lab) job.labour = +lab[1].replace(/,/g, "");
  const bud = raw.match(/Budget[:;]?\s*\$?\s*([\d,]+)/i); if (bud) job.budget = +bud[1].replace(/,/g, "");
  const lev = raw.match(/Level\s*(\d+)/i); if (lev) job.level = +lev[1];

  const oi = lines.findIndex(l => /^objectives/i.test(l));
  if (oi >= 0) {
    for (let i = oi + 1; i < lines.length; i++) {
      const l = lines[i];
      if (/^(reject|accept|pc status|pc stats)/i.test(l)) break;
      const m = l.match(/^[•*+·°o»\-]\s*(.+)/);
      if (m) job.objectives.push(m[1].replace(/\s+PC Stats$/i, "").replace(/^[^A-Za-z0-9(]+/, "").trim());
      else if (job.objectives.length && /^[a-z(]/.test(l) && l.length > 3 && looksLikeText(l)) job.objectives[job.objectives.length - 1] += " " + l;
      else break;
    }
  }
  const dl = raw.match(/Complete by[^\n]*?(\d{1,2}\/\d{1,2}\/\d{4})/i) || raw.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*\(?(Tomorrow|Today)/i);
  if (dl) job.deadline = dl[1];

  // body = text between greeting and money panel
  const startB = lines.findIndex(l => /you work with computers|^hi\b|^hello|^hey/i.test(l));
  const endB = lines.findIndex(l => /labou?r|budget/i.test(l));
  const bodyLines = lines.slice(startB >= 0 ? startB : emailLineIdx + 2, endB > 0 ? endB : undefined);
  job.body = bodyLines.join(" ").replace(/\s+/g, " ").trim();
  const b = " " + job.body.toLowerCase().replace(/[’`]/g, "'") + " ";

  for (const r of rules) {
    const hits = ruleHits(r, b);
    if (hits.length) {
      const already = job.objectives.some(o => o.toLowerCase().includes(r.task.toLowerCase().slice(0, 12)));
      if (!already) job.hidden.push({ task: r.task, because: hits.slice(0, 3) });
    }
  }
  // "used parts" rule only if customer objects (not "used parts are fine")
  if (/used parts (are|is) (fine|ok|okay)|don't mind used|happy with used/.test(b)) job.hidden = job.hidden.filter(h => !/no used/i.test(h.task));
  const cab = b.match(/saw (?:some |these |those |the |a set of )?([a-z0-9 .+\-]{2,40}?) cables? on pc ?bay/);
  if (cab) { job.hidden = job.hidden.filter(h => !/cables/i.test(h.task)); job.hidden.unshift({ task: "Install " + cab[1].trim() + " cables (from PC Bay)", because: ["saw … cables on PC Bay"] }); }
  // "plain red", "braided dark gray" … → replace ALL cables
  const COL = "red|blue|green|yellow|orange|purple|pink|white|black|gray|grey|silver|gold|cyan|teal|brown|lime|magenta|violet|navy|beige|turquoise|aqua|rainbow";
  // style words as in the game's cable names: Loose/Ribbon/Sleeved/Tight, Plastic/Braided, Plain/Duo…
  const STYLE = "(?:(?:plain|braided|sleeved|plastic|ribbon|loose|tight|duo)\\s+)+";
  const SHADE = "(?:(?:light|dark|bright|pale|deep|neon|matte|sky|baby|royal|hot)\\s+)?";
  const cre = new RegExp("\\b(" + STYLE + ")(" + SHADE + "(?:" + COL + "))\\b", "gi");
  const want = [...b.matchAll(cre)].map(m => (m[1].trim() + " " + m[2]));
  // "those yellow cables look really nice" – colour + cables, only when the customer likes / wants them
  const cre2 = new RegExp("\\b(" + SHADE + "(?:" + COL + "))\\s+(?:cables?|wires?|cabling)\\b", "gi");
  for (const s of b.split(/[.!?]/)) if (/\b(like|love|nice|want|would like|cool|awesome|great|prefer|lovely|pretty|amazing)\b/.test(s)) for (const m of s.matchAll(cre2)) if (!want.some(w => w.endsWith(m[1]))) want.push(m[1]);
  want.splice(0, want.length, ...new Set(want.map(w => w.replace(/\s+/g, " ").replace(/\b\w/g, c => c.toUpperCase()).replace(/Gray/g, "Grey"))));
  if (want.length) {
    job.hidden = job.hidden.filter(h => !/cables/i.test(h.task));
    job.hidden.unshift({ task: "Replace ALL cables → " + want.join(" / ") + " cables", because: want.map(w => w.toLowerCase()), want });
  }
  // brand preferences: "I'm a total NZXT fanboy", "MSI parts are the bomb", "not a fan of Corsair"
  for (const p of detectBrands(job.body)) {
    if (job.hidden.some(h => h.brand === p.brand && h.avoid === p.avoid)) continue;
    job.hidden.push({ task: (p.avoid ? "Avoid " : "Use ") + p.brand + " parts" + (p.avoid ? "" : " where possible"), because: [p.quote], brand: p.brand, avoid: p.avoid });
  }
  for (const bp of detectBlamedParts(job.body)) {
    job.hidden.push({ task: `Check / replace the ${bp.part} – customer hints it's broken`, because: [bp.quote], part: bp.part });
    if (!job.suspect) job.suspect = bp.part;
  }
  const sus = b.match(/(?:it's|its|it is|got to be|must be|probably|sure it's|think it's) (?:got to be )?(?:the )?(cpu|gpu|graphics card|ram|memory|psu|power supply|motherboard|hard drive|ssd|storage|cooler|fan)/);
  if (sus) job.suspect = sus[1].toUpperCase();
  return job;
}

if (typeof module !== "undefined") module.exports = { parseEmail, parseComponents, DEFAULT_RULES, RULES_VERSION, RULES_REMOVED, categorize, detectBrands, detectBlamedParts, looksLikeText };
