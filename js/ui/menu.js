/* The top bar never wraps (0.16.1). Small screens (0.16.0): the top bar keeps the title, Capture job, PC Bay and the
   notifications; the other buttons (marked data-menu in index.html) move into a menu that slides in from the side.
   Wider windows: only as many of them as don't fit move into the menu, the last ones first, and back when there's room. */
const MENU_MQ = window.matchMedia("(max-width: 700px)");
const menuSpots = new Map(); // button → the placeholder where it sits in the top bar
function menuOpen(on) {
  const m = $("#hMenu"),
    bg = $("#hMenuBg");
  if (on) {
    m.hidden = bg.hidden = false;
    requestAnimationFrame(() => m.classList.add("open"));
  } else {
    m.classList.remove("open");
    bg.hidden = true;
    setTimeout(() => {
      if (!m.classList.contains("open")) m.hidden = true;
    }, 200);
  }
  $("#btnMenu").setAttribute("aria-expanded", String(on));
}
function menuPlace() {
  const m = $("#hMenu"),
    h = $("header");
  // everything back into the top bar first, then measure
  for (const [el, spot] of menuSpots) spot.replaceWith(el);
  menuSpots.clear();
  const items = [...h.querySelectorAll("[data-menu]")],
    move = el => {
      const spot = document.createComment("menu");
      el.replaceWith(spot);
      menuSpots.set(el, spot);
      m.prepend(el); // the last ones go first, so the menu keeps the top bar's order
    };
  document.body.classList.toggle("hmenu-on", MENU_MQ.matches);
  if (MENU_MQ.matches) items.reverse().forEach(move);
  else {
    const over = () => h.scrollWidth > h.clientWidth + 1;
    if (over()) document.body.classList.add("hmenu-on"); // the ☰ button takes room too
    for (const el of items.reverse()) {
      if (!over()) break;
      move(el);
    }
    if (!menuSpots.size) document.body.classList.remove("hmenu-on");
  }
  if (!menuSpots.size) menuOpen(false);
}
$("#btnMenu").onclick = () => menuOpen($("#btnMenu").getAttribute("aria-expanded") !== "true");
$("#hMenuBg").onclick = () => menuOpen(false);
// a button in the menu does its job and closes the menu (the career fields stay open for typing)
$("#hMenu").addEventListener("click", e => {
  if (e.target.closest("button")) menuOpen(false);
});
// Esc closes the menu first (before the board's own Esc)
window.addEventListener(
  "keydown",
  e => {
    if (e.key === "Escape" && $("#hMenu").classList.contains("open")) {
      menuOpen(false);
      e.stopImmediatePropagation();
    }
  },
  true
);
MENU_MQ.addEventListener("change", menuPlace);
let menuT = 0;
window.addEventListener("resize", () => {
  clearTimeout(menuT);
  menuT = setTimeout(menuPlace, 60);
});
// buttons that show up later (PC Bay at career level 9, the connected-screen chip) can make the bar too wide
new MutationObserver(() => {
  clearTimeout(menuT);
  menuT = setTimeout(menuPlace, 60);
}).observe($("header"), { attributes: true, attributeFilter: ["hidden"], subtree: true });
menuPlace();
