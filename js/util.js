/* Small shared helpers. Everything the user creates is stored only in this browser (localStorage). */
const LS = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};
// did this browser use the tool before? (checked before any script saves something)
const RETURNING = (() => {
  try {
    return Object.keys(localStorage).some(k => k.startsWith("pcbs."));
  } catch {
    return false;
  }
})();
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const CATS = [
  "CPU",
  "CPU Cooler",
  "Motherboard",
  "RAM",
  "GPU",
  "Storage",
  "PSU",
  "Case",
  "Case Fan",
  "Cables",
  "Water Cooling",
  "Other",
];
