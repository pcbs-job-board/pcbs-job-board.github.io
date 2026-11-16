/* Small screens (0.16.0): the top bar keeps the title, Capture job, PC Bay and the notifications; the other buttons
   (marked data-menu in index.html) move into a menu that slides in from the side, and back when the window is wider. */
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
  const m = $("#hMenu");
  if (MENU_MQ.matches)
    for (const el of document.querySelectorAll("header [data-menu]")) {
      const spot = document.createComment("menu");
      el.replaceWith(spot);
      menuSpots.set(el, spot);
      m.append(el);
    }
  else {
    for (const [el, spot] of menuSpots) spot.replaceWith(el);
    menuSpots.clear();
    menuOpen(false);
  }
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
menuPlace();
