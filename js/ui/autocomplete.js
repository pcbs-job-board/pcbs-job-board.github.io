/* PCBS Job Board – part name autocomplete: the dropdown under any input with data-ac (↑ ↓ Enter Esc, 5 rows, opens upwards when needed). */
let acEl = null,
  acInput = null,
  acItems = [],
  acSel = 0;
function acCat(inp) {
  if (inp.dataset.acCat) return inp.dataset.acCat;
  const f = inp.closest("[data-swapform]");
  return f ? f.querySelector('[data-f="cat"]').value : "";
}
// the PC the swap form plans for: without the swap being edited (✎) and without a swap already planned for the
// chosen part – the new part takes their place, so their price and watts don't count (replaceSwaps)
function swapFormPlan(job, form) {
  const ed = form.dataset.edit,
    edited = ed && job.swaps.find(s => s.id === ed),
    o = form.querySelector('[data-f="old"]').value,
    old = o === "keep" ? edited?.old || "" : job.components[o]?.name || "";
  const others = job.swaps.filter(s => s.id !== ed),
    r = replaceSwaps(others, [{ old, new: "" }]);
  const swaps = r.swaps.filter(s => s.new !== ""),
    replace = r.dropped.length ? r.dropped[0].old || null : old || null;
  const spent = swaps.reduce((t, s) => t + ((s.price ?? priceOf(s.new)) || 0), 0);
  return { job: { ...job, swaps }, replace, left: job.budget == null ? null : job.budget - spent };
}
function acShow(inp) {
  acInput = inp;
  const q = inp.value.trim(),
    cat = acCat(inp);
  if (q.length < 2) {
    acEl.hidden = true;
    return;
  }
  const brands = (inp.closest("[data-brands]")?.dataset.brands || "").split("|").filter(Boolean);
  const buy = !!inp.closest("[data-swapform]"); // a part to buy → only what the player has unlocked
  acItems = searchParts(q, cat, buy ? 30 : 14, brands, buy);
  acSel = 0;
  // planning a swap: parts that fit the planned PC first, the others with a warning
  const form = inp.closest("[data-swapform]"),
    job = form && jobs.find(j => j.id === form.dataset.swapform),
    plan = job && swapFormPlan(job, form);
  if (plan && typeof compatRank === "function") acItems = compatRank(plan.job, plan.replace, acItems).slice(0, 14);
  const lockedN = searchParts.hidden;
  const toks = normP(q).split(" ").filter(Boolean);
  const hl = s => {
    let h = esc(s);
    toks.forEach(t => {
      h = h.replace(new RegExp("(" + reEsc(t) + ")", "ig"), "\u0001$1\u0002");
    });
    return h.replace(/\u0001/g, "<mark>").replace(/\u0002/g, "</mark>");
  };
  const info = p =>
    p.hist
      ? "typed before"
      : [
          p.det ? "" : p.spec,
          p.lvl != null ? "Lv " + p.lvl + (p.pct > 1 ? " · " + p.pct + "%" : "") : "",
          p.price != null ? "$" + p.price : "",
        ]
          .filter(Boolean)
          .join(" · ");
  const leftAttr = inp.closest("[data-left]")?.dataset.left,
    left = leftAttr == null ? null : plan ? plan.left : +leftAttr;
  const overB = p => left != null && p.price != null && p.price > left;
  acEl.innerHTML =
    `<div class="aclist">` +
    acItems
      .map(
        (p, i) =>
          `<div data-i="${i}" class="${i ? "" : "sel"} ${overB(p) ? "overb" : ""}" ${overB(p) ? `title="$${p.price - left} over the remaining budget"` : ""}><span>${brands.some(b => brandMatch(p, b)) ? '<em class="fav" title="Customer\'s preferred brand">★</em> ' : ""}${hl(p.name)}${p.dlc ? ` <em class="dlc">${esc(DLC_LABEL[p.dlc] || p.dlc)}</em>` : ""}${p.det ? `<i class="det">${esc(p.det)}</i>` : ""}${p.warn?.length ? `<i class="cwarn">⚠ ${esc(p.warn.join(" · "))}</i>` : ""}</span><small>${esc(info(p))}${!cat || cat === "Other" ? " · " + esc(p.cat) : ""}${overB(p) ? ` · <b class="overtag">over budget</b>` : ""}</small></div>`
      )
      .join("") +
    `</div><div class="acmore" data-more hidden></div>` +
    (lockedN
      ? `<div class="aclocked">🔒 ${lockedN} more need a higher career level (Lv ${career.level}${career.pct ? " · " + career.pct + "%" : ""} – change it in Settings)</div>`
      : "") +
    `<div class="report" data-report>🚩 Can't find it? Report “${esc(q)}” as a missing part</div>`;
  const host = inp.closest("dialog") || document.body;
  if (acEl.parentNode !== host) host.append(acEl);
  acEl.hidden = false;
  acPlace();
}
// show 5 parts at a time (scroll for more) and open upwards when there is no room below
const AC_ROWS = 5;
function acPlace() {
  if (!acInput || acEl.hidden) return;
  const r = acInput.getBoundingClientRect(),
    w = Math.max(r.width, 380),
    list = acEl.querySelector(".aclist");
  Object.assign(acEl.style, {
    left: Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px",
    width: w + "px",
    top: "",
    bottom: "",
    maxHeight: "",
  });
  const rows = [...list.children].slice(0, AC_ROWS);
  list.style.maxHeight = rows.length ? rows.reduce((h, d) => h + d.offsetHeight, 0) + 1 + "px" : "";
  const h = acEl.offsetHeight,
    below = innerHeight - r.bottom - 8,
    above = r.top - 8;
  const up = h > below && above > below;
  if (up) acEl.style.bottom = innerHeight - r.top + 3 + "px";
  else acEl.style.top = r.bottom + 3 + "px";
  const room = (up ? above : below) - 3;
  if (h > room) list.style.maxHeight = Math.max(40, room - (h - list.offsetHeight)) + "px"; // tiny window: shrink further
  acEl.classList.toggle("up", up);
  acMore();
}
// "▼ 9 more" line, so it is obvious at once that the list goes on
function acMore() {
  const list = acEl.querySelector(".aclist"),
    more = acEl.querySelector("[data-more]");
  if (!list || !more) return;
  const rows = [...list.children],
    bottom = list.scrollTop + list.clientHeight;
  const below = rows.filter(d => d.offsetTop + d.offsetHeight / 2 > bottom).length;
  list.classList.toggle("scrolls", list.scrollHeight > list.clientHeight + 1);
  more.hidden = !below;
  more.textContent = `▼ ${below} more – scroll or use ↓`;
}
function acPick(i) {
  const p = acItems[i];
  if (!p || !acInput) return;
  acInput.value = p.name;
  const f = acInput.closest("[data-swapform]");
  if (f && p.cat && CATS.includes(p.cat)) f.querySelector('[data-f="cat"]').value = catKey(p);
  acEl.hidden = true;
  acInput.focus();
  acInput.dispatchEvent(new Event("change", { bubbles: true }));
}
function initAutocomplete() {
  acEl = $("#ac");
  document.addEventListener("input", e => {
    if (e.target.matches("[data-ac]")) acShow(e.target);
  });
  document.addEventListener("focusin", e => {
    if (e.target.matches("[data-ac]") && !e.target.dataset.noAc && e.target.value.length >= 2) acShow(e.target);
  });
  document.addEventListener(
    "keydown",
    e => {
      if (acEl.hidden || e.target !== acInput) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!acItems.length) return;
        acSel = (acSel + (e.key === "ArrowDown" ? 1 : -1) + acItems.length) % acItems.length;
        acEl.querySelectorAll("[data-i]").forEach((d, i) => {
          d.classList.toggle("sel", i === acSel);
          if (i === acSel) {
            const L = d.parentNode;
            if (d.offsetTop < L.scrollTop) L.scrollTop = d.offsetTop;
            else if (d.offsetTop + d.offsetHeight > L.scrollTop + L.clientHeight)
              L.scrollTop = d.offsetTop + d.offsetHeight - L.clientHeight;
          }
          acMore();
        });
      } else if ((e.key === "Enter" || e.key === "Tab") && acItems.length) {
        e.preventDefault();
        e.stopPropagation();
        acPick(acSel);
      } else if (e.key === "Escape") {
        acEl.hidden = true;
      }
    },
    true
  );
  acEl.addEventListener("scroll", acMore, true);
  acEl.addEventListener("mousedown", e => {
    if (e.target.closest("[data-more]")) {
      e.preventDefault();
      const L = acEl.querySelector(".aclist");
      L.scrollBy({ top: L.clientHeight - 20, behavior: "smooth" });
      return;
    }
    if (e.target.closest("[data-report]")) {
      e.preventDefault();
      const q = acInput.value.trim(),
        cat = acCat(acInput);
      acEl.hidden = true;
      openReport({ name: q, cat });
      return;
    }
    const d = e.target.closest("[data-i]");
    if (d) {
      e.preventDefault();
      acPick(+d.dataset.i);
    }
  });
  document.addEventListener("focusout", e => {
    if (e.target === acInput)
      setTimeout(() => {
        if (document.activeElement !== acInput) acEl.hidden = true;
      }, 120);
  });
  // scrolling the page closes it; scrolling the list itself does not
  window.addEventListener(
    "scroll",
    e => {
      if (!acEl.hidden && !acEl.contains(e.target)) acEl.hidden = true;
    },
    true
  );
  window.addEventListener("resize", acPlace);
}
