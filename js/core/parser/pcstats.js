// PC Stats screenshot text → the PC's parts (brand list, OCR slips, one part per line, category).
const BRANDS = [
  "Mortoni",
  "Shean",
  "DFL",
  "FSP",
  "GamerStorm",
  "Kolink",
  "Open Benchtable",
  "Fractal Design",
  "Team Group",
  "EVGA",
  "NZXT",
  "Intel",
  "AMD",
  "Cryorig",
  "SilverStone",
  "G.SKILL",
  "ASUS",
  "ASRock",
  "Seagate",
  "Corsair",
  "Cooler Master",
  "MSI",
  "Gigabyte",
  "GIGABYTE",
  "AORUS",
  "ZOTAC",
  "Sapphire",
  "XFX",
  "PowerColor",
  "Western Digital",
  "WD",
  "Samsung",
  "Crucial",
  "Kingston",
  "HyperX",
  "Thermaltake",
  "Fractal",
  "Phanteks",
  "be quiet!",
  "Noctua",
  "Deepcool",
  "Raijintek",
  "In Win",
  "InWin",
  "Lian Li",
  "Antec",
  "Razer",
  "Patriot",
  "Team",
  "Toshiba",
  "Adata",
  "ADATA",
  "Arctic",
  "Ballistix",
  "Biostar",
  "Enermax",
  "Inno3D",
  "PNY",
  "Palit",
  "Zalman",
  "Scythe",
  "Bitfenix",
  "BitFenix",
  "Rosewill",
  "Seasonic",
  "SuperFlower",
  "Super Flower",
  "Kolink",
  "Xigmatek",
  "Mushkin",
  "OCZ",
  "Intel Optane",
  "Optane",
  "Gamdias",
  "Hyte",
  "Cougar",
  "Cryorig",
  "Alphacool",
  "EK",
  "Bykski",
  "Barrow",
  "Geil",
  "GeIL",
  "Galax",
  "KFA2",
  "Gainward",
  "Colorful",
  "EKWB",
  "Generic",
  "GALAX",
  "Asus",
  "Msi",
  "Kingston",
];
const OCR_FIX = [
  [/^[©@®Cc6]\.?\s?SKILL/i, "G.SKILL"],
  [/^G\s?\.\s?SKILL/i, "G.SKILL"],
  [/^lntel/, "Intel"],
  [/^1ntel/, "Intel"],
  [/^NZXT/i, "NZXT"],
];
function categorize(name) {
  const n = name.toLowerCase();
  if (/tower|case|chassis|h\d{3}|mid tower|full tower|cube/.test(n) && !/cooler|fan/.test(n)) return "Case";
  if (/geforce|gtx|rtx|radeon|\brx\b|vega|titan|quadro|\bgt\s?\d/.test(n)) return "GPU";
  if (/core i\d|ryzen|threadripper|pentium|celeron|athlon|xeon|fx-\d/.test(n)) return "CPU";
  if (/\d+\s?gb\s?\d{3,4}\s?mhz|ddr\d|trident|vengeance|ripjaws|dominator|fury|ballistix|memory/.test(n)) return "RAM";
  if (/\b[zhbx]\d{3}[a-z]?\b|\bam4\b|motherboard|mainboard|prime|tuf|aorus|tomahawk|mortar|strix [zbx]/.test(n))
    return "Motherboard";
  if (/\d+\s?(tb|gb)\b|ssd|hdd|barracuda|nvme|m\.2|evo|caviar|blue|firecuda|ironwolf|mx\d{3}|optane/.test(n)) return "Storage";
  if (/psu|\d{3,4}\s?w\b|watt|power|st\d\d|supernova|rm\d{3}|hx\d{3}|cx\d{3}|focus|toughpower|smartpower|strider/.test(n))
    return "PSU";
  if (/cooler|h7|hyper|nh-|lumi|aio|kraken|liquid|frost|dark rock|freezer|tower cooler/.test(n)) return "CPU Cooler";
  if (/fan|ll\d{3}|ql\d{3}|ml\d{3}|sp\d{3}|af\d{3}/.test(n)) return "Case Fan";
  return "Other";
}
function cleanPartLine(line) {
  let l = line
    // a thin "I" after a hyphen read as a symbol ("Z370-|", "Z370-!", "X470-]") – before the symbols are blanked
    .replace(/(\w-)[|!\[\]\/](?=\s|$)/g, "$1I")
    .replace(/[|\[\]{}‘’'`~_—–]+/g, " ")
    .replace(/\s+[-:.,;=]+\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  for (const [re, rep] of OCR_FIX) l = l.replace(re, rep);
  // find earliest brand occurrence and cut leading icon noise
  let best = -1;
  for (const b of BRANDS) {
    const re = new RegExp("(^|\\s)" + b.replace(/[.*+?^${}()|[\]\\!]/g, "\\$&") + "(\\s|$)", "i");
    const m = re.exec(l);
    if (m) {
      const idx = m.index + m[1].length;
      if (best < 0 || idx < best) best = idx;
    }
  }
  const fixG = l.match(/[©@®Cc6]\.?SKILL/i);
  if (fixG) {
    l = l.replace(fixG[0], "G.SKILL");
    if (best < 0 || fixG.index < best) best = fixG.index;
  }
  return { text: best >= 0 ? l.slice(best).trim() : l, branded: best >= 0 };
}
// raw candidate lines of the PC Stats list ({text, branded}); joining is done later against the parts database
function componentLines(text) {
  const lines = text
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
  const start = lines.findIndex(l => /components/i.test(l));
  const out = [];
  for (const raw of start >= 0 ? lines.slice(start + 1) : lines) {
    if (/^\W*(ok|pc status|benchmark|invoiceable)\b/i.test(raw)) continue;
    const { text: t, branded } = cleanPartLine(raw);
    let txt = branded
      ? t
      : t
          .replace(/^[^A-Za-z0-9(]+/, "")
          .replace(/^(?:[a-z]{1,2}|[^A-Za-z0-9\s]+)\s+(?=[A-Z0-9])/, "")
          .replace(/\s+[^A-Za-z0-9)]{1,2}$/, "")
          .trim();
    // short lines are crumbs – except a bare model number wrapped onto its own line ("Cooler Master MWE Bronze" / "450");
    // whether it really ends the name above is decided later against the parts database
    if (/^(?=.*\d)[\dOo]{3}$/.test(txt)) txt = txt.replace(/[Oo]/g, "0"); // "45O" = 450
    if ((txt.match(/[A-Za-z0-9]/g) || []).length < 4 && !/^\d{3}$/.test(txt)) continue;
    out.push({ text: txt, branded });
  }
  return out;
}
function parseComponents(text) {
  const lines = text
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
  const start = lines.findIndex(l => /components/i.test(l));
  const body = start >= 0 ? lines.slice(start + 1) : lines;
  const parts = [];
  for (const raw of body) {
    if (/^(ok|pc status|benchmark|invoiceable)/i.test(raw)) continue;
    const { text, branded } = cleanPartLine(raw);
    const letters = (text.match(/[A-Za-z0-9]/g) || []).length;
    if (letters < 4) continue;
    if (branded) {
      parts.push(text);
      continue;
    }
    // continuation line (e.g. "16 GB 4000 MHz", "VEGA64 OC Edition")
    const cont = text
      .replace(/^[^A-Za-z0-9]+/, "")
      .replace(/^(?:[a-z]{1,2}|[^A-Za-z0-9\s]+)\s+(?=[A-Z0-9])/, "")
      .replace(/\s+[^A-Za-z0-9]{1,2}$/, "")
      .trim();
    const words = cont.split(" ").filter(w => /[A-Za-z0-9]{2,}/.test(w));
    if (parts.length && words.length >= 2 && words.length === cont.split(" ").length) parts[parts.length - 1] += " " + cont;
  }
  return parts.map(name => ({ name, cat: categorize(name) }));
}
