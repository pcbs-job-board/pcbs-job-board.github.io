/* The board: the Status tiles' details popup (hover / keyboard focus / tap). */
// the popup with a tile's details: shown after ~0.5 s of hover or keyboard focus, never focusable itself;
// leaving the tile, moving with the keyboard or clicking elsewhere closes it (a click / tap on the tile opens it at once)
const stip = Object.assign(document.createElement("div"), { id: "stip", className: "stip", role: "tooltip", hidden: true });
document.body.append(stip);
let stipTimer = null,
  stipFor = null;
function stipShow(tile) {
  clearTimeout(stipTimer);
  stipFor = tile;
  const big = tile.id === "btnUnlocks"; // the career unlocks list: wider and taller than a Status tile's details
  stip.innerHTML = big ? unlocksHtml() : tile.querySelector("template").innerHTML;
  stip.hidden = false;
  tile.setAttribute("aria-describedby", "stip");
  stip.classList.toggle("big", big);
  stip.classList.toggle("tips", tile.classList.contains("hintbtn"));
  // always fully inside the window: width capped, pushed in from the left / right edge, below the tile or – when
  // there is more room – above it; taller than the room on that side (or than 260 px) → cut to fit with a note (the popup can't scroll)
  const r = tile.getBoundingClientRect(),
    M = 8,
    w = Math.min(big ? 540 : 340, innerWidth - 2 * M);
  Object.assign(stip.style, { width: w + "px", maxHeight: "", left: "0px", top: "0px" });
  stip.classList.remove("cut");
  const roomBelow = innerHeight - r.bottom - 6 - M,
    roomAbove = r.top - 6 - M,
    h = stip.offsetHeight;
  const below = h <= roomBelow || roomBelow >= roomAbove,
    room = Math.min(big ? 640 : tile.classList.contains("hintbtn") ? 480 : 260, Math.max(60, below ? roomBelow : roomAbove));
  if (h > room) {
    stip.style.maxHeight = room + "px";
    stip.classList.add("cut");
  }
  const hh = Math.min(h, room);
  stip.style.left = Math.max(M, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - M)) + "px";
  stip.style.top = Math.max(M, Math.min(below ? r.bottom + 6 : r.top - 6 - hh, innerHeight - hh - M)) + "px";
}
function stipHide() {
  clearTimeout(stipTimer);
  if (stipFor) stipFor.removeAttribute("aria-describedby");
  stipFor = null;
  stip.hidden = true;
}
const stipLater = tile => {
  clearTimeout(stipTimer);
  stipTimer = setTimeout(() => stipShow(tile), 500);
};
document.addEventListener("mouseover", e => {
  const t = e.target.closest?.(".stile,.ulbtn,.hintbtn");
  if (t && t !== stipFor) stipLater(t);
});
document.addEventListener("mouseout", e => {
  const t = e.target.closest?.(".stile,.ulbtn,.hintbtn");
  if (t && !t.contains(e.relatedTarget)) {
    if (document.activeElement !== t) stipHide();
    else clearTimeout(stipTimer);
  }
});
document.addEventListener("focusin", e => {
  const t = e.target.closest?.(".stile,.ulbtn,.hintbtn");
  if (t) stipLater(t);
  else stipHide();
});
document.addEventListener("focusout", e => {
  if (e.target.closest?.(".stile,.ulbtn,.hintbtn")) stipHide();
});
// any key closes the details popup; Esc only does that (it doesn't also leave the card / close the window)
document.addEventListener(
  "keydown",
  e => {
    if (!stip.hidden || stipTimer) {
      const was = !stip.hidden;
      stipHide();
      if (was && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  },
  true
);
document.addEventListener("click", e => {
  const t = e.target.closest?.(".stile,.ulbtn,.hintbtn");
  if (t) {
    if (stipFor === t && !stip.hidden) stipHide();
    else stipShow(t);
  } else if (!e.target.closest?.("#stip")) stipHide();
});
// scrolling / resizing closes an open popup but doesn't cancel one about to open
// (keyboard moves scroll the focused tile into view – the popup is placed after that)
const stipClose = () => {
  if (!stip.hidden) stipHide();
};
addEventListener("scroll", stipClose, true);
addEventListener("resize", stipClose);
