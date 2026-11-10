/* Keyboard shortcuts – based on a two-level idea: pick a job card with the arrow keys,
   then act on it with single keys. Shortcuts never fire while typing in a field. */
const KEYMAP = [
  {
    group: "Anywhere",
    keys: [
      ["C", "Capture job (reads the email)"],
      ["M", "New manual job"],
      ["Shift + C", "Connect / change screen"],
      ["B", "📖 Parts database"],
      ["U", "Career unlocks"],
      ["L", "📜 Changelog – what's new"],
      ["S", "Settings"],
      ["?", "Show this list"],
      ["Esc", "Close window · close a popup · leave a text field"],
    ],
  },
  {
    group: "Choosing a job",
    keys: [
      ["← → ↑ ↓", "Move between job cards (tables and open jobs)"],
      ["Home / End", "First / last job"],
    ],
  },
  {
    group: "Selected job",
    keys: [
      ["1 / 2 / 3", "Put on Table 1 / 2 / 3 (again = back to open jobs)"],
      ["0", "Back to open jobs"],
      ["H", "Tick the next hidden objective"],
      ["N", "Type a new task"],
      ["R", "Add part replacement"],
      ["E", "✎ Edit job – details, tasks and parts · 📦 open a PC Bay build"],
      ["P", "✎ Edit job and capture PC Stats right away"],
      [
        "Enter",
        "Go into the card – job focus: other jobs dimmed, status and swaps in full (Esc leaves) · 📦 open a PC Bay build",
      ],
      ["D", "Job completed (Undo stays available)"],
    ],
  },
  {
    group: "Inside a card",
    keys: [
      ["↑ ↓", "Previous / next line (objective, task, swap, Status tiles, button…)"],
      ["← →", "Previous / next item on the line · change a dropdown that is alone on its line"],
      ["Space / Enter", "Tick the box · press the button · show a Status tile's details"],
      ["Delete", "Remove the line (objective, task, swap) – Undo stays available"],
      ["Alt + ↑ / Alt + ↓", "Move a part swap up / down (higher wins when parts don't fit together)"],
      ["Esc", "Close the details popup · back to choosing jobs"],
      ["", "Job keys (1 2 3 0, H, N, R, E, P, D) work after Esc – never while you are inside a card"],
    ],
  },
  {
    group: "New job window",
    keys: [
      ["Ctrl + Enter", "Create / save the job"],
      ["Alt + E", "📸 Add email capture"],
      ["Alt + P", "📸 Add PC parts capture"] /* also shown on those buttons (js/app.js .capkey) */,
      ["Alt + A", "🎯 Adjust areas"],
    ],
  },
  {
    group: "Screen area window",
    keys: [
      ["Ctrl + Enter", "✓ Use this area"],
      ["Esc", "Skip for now"],
    ],
  },
];
let keysOn = LS.get("pcbs.keys", true);
let selJob = null;

function keysHelpHtml() {
  return KEYMAP.map(
    g =>
      `<h4 class="sub">${esc(g.group)}</h4><table class="keys">${g.keys
        .map(([k, d]) =>
          !k
            ? `<tr><td colspan="2" class="hint">${esc(d)}</td></tr>`
            : `<tr><td>${k
                .split(" / ")
                .map(x =>
                  x
                    .split(" + ")
                    .map(y => `<kbd>${esc(y)}</kbd>`)
                    .join(" + ")
                )
                .join(" / ")}</td><td>${esc(d)}</td></tr>`
        )
        .join("")}</table>`
  ).join("");
}
function cards() {
  return [...document.querySelectorAll("#tables .job, #queue .job")];
}
function markSel() {
  document.querySelectorAll(".job.kbsel").forEach(c => c.classList.remove("kbsel"));
  if (!selJob) return;
  const el = document.querySelector(`.job[data-job="${selJob}"]`);
  if (el) el.classList.add("kbsel");
  else selJob = null;
  if (selJob) foldSwaps(selJob); // the previously selected card shows its swaps folded again
}
function selectCard(el) {
  if (!el) return;
  selJob = el.dataset.job;
  markSel();
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
// spatial move: the nearest card in the pressed direction – first among the cards in the same row (← →) / column (↑ ↓),
// so a tall card next to short ones isn't skipped; the centre-to-centre score only when nothing lines up
function moveSel(dir) {
  const list = cards();
  if (!list.length) return;
  const cur = list.find(c => c.dataset.job === selJob);
  if (!cur) {
    selectCard(list[0]);
    return;
  }
  const a = cur.getBoundingClientRect(),
    ax = a.left + a.width / 2,
    ay = a.top + a.height / 2,
    side = dir === "left" || dir === "right";
  const cand = list
    .filter(c => c !== cur)
    .map(c => {
      const b = c.getBoundingClientRect(),
        dx = b.left + b.width / 2 - ax,
        dy = b.top + b.height / 2 - ay;
      // lined up: the cards overlap across the direction of travel (same row for ← →, same column for ↑ ↓)
      const lined = side ? b.top < a.bottom - 4 && b.bottom > a.top + 4 : b.left < a.right - 4 && b.right > a.left + 4;
      // how far in the pressed direction, from the facing edges
      const gap =
        dir === "left"
          ? a.left - b.right
          : dir === "right"
            ? b.left - a.right
            : dir === "up"
              ? a.top - b.bottom
              : b.top - a.bottom;
      const ok = dir === "left" ? dx < -10 : dir === "right" ? dx > 10 : dir === "up" ? dy < -10 : dy > 10;
      return { c, ok, lined, gap, score: (side ? Math.abs(dx) : Math.abs(dy)) + (side ? Math.abs(dy) : Math.abs(dx)) * 2.5 };
    })
    .filter(x => x.ok);
  const row = cand.filter(x => x.lined).sort((p, q) => p.gap - q.gap);
  const best = row[0] || cand.sort((p, q) => p.score - q.score)[0];
  if (best) selectCard(best.c);
}
const clickIn = sel => {
  const el = document.querySelector(`.job[data-job="${selJob}"] ${sel}`);
  if (el) {
    el.click();
    return el;
  }
};
const typing = el =>
  el &&
  (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) &&
  !(el.tagName === "INPUT" && /checkbox|radio|button/.test(el.type));

// ---- moving inside a card: the card is split into lines (rows), each with one or more controls ----
const ROW_SEL =
  ".top, .tables, .stiles, label.hid, ul.mainobj li, .task, .addrow:not(.swapform .addrow), .swap, .swapmore, .swapform > select, .swapform > .grid2, .swapform > .addrow, [data-act='openSwap'], details > summary, .foot";
const CTRL_SEL = "input, select, button, summary";
const DEL_SEL = '[data-act="delTask"], [data-act="delSwap"]'; // ✕ buttons: skipped by the arrows – Delete removes the line instead
const SWAP_ORDER = ["toggleSwap", "editSwap", "setPrice"];
const shown = el => !el.closest("[hidden]") && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"; // folded swaps: hidden
function cardRows(card) {
  return [...card.querySelectorAll(ROW_SEL)]
    .filter(shown)
    .map(r => {
      if (r.matches(CTRL_SEL)) return [r];
      const c = [...r.querySelectorAll(CTRL_SEL)].filter(x => shown(x) && !x.matches(DEL_SEL));
      if (r.matches(".swap")) c.sort((a, b) => SWAP_ORDER.indexOf(a.dataset.act) - SWAP_ORDER.indexOf(b.dataset.act));
      return c.length ? c : r.hasAttribute("tabindex") ? [r] : [];
    })
    .filter(r => r.length);
}
function posOf(el) {
  const card = el?.closest?.(".job");
  if (!card) return null;
  const rows = cardRows(card);
  for (let r = 0; r < rows.length; r++) {
    const c = rows[r].indexOf(el);
    if (c >= 0) return { card, rows, r, c };
  }
  return null;
}
function focusCtrl(el) {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest" });
  document.querySelectorAll(".kbrow").forEach(x => x.classList.remove("kbrow"));
  (el.closest(ROW_SEL.replace(/, \[data-act='openSwap'\]|, details > summary/g, "")) || el).classList.add("kbrow");
}
function enterCard(card) {
  if (card.classList.contains("flip")) {
    card.querySelector('[data-flip="open"]')?.click();
    return;
  } // 📦 PC Bay build: open its window
  setFocusJob(card.dataset.job); // job focus: other jobs dimmed, Status and Part swaps in full (redraws the card)
  card = document.querySelector(`.job[data-job="${card.dataset.job}"]`) || card;
  const rows = cardRows(card);
  if (!rows.length) return;
  const first =
    card.querySelector("label.hid input:not(:checked)") ||
    card.querySelector(".task input[type=checkbox]:not(:checked)") ||
    card.querySelector('[data-act="openSwap"]:not([hidden])');
  focusCtrl(first && shown(first) ? first : rows[0][0]);
}
// how to find the same control again after the board is redrawn
function ctrlId(el) {
  const d = el.dataset;
  if (d.act === "saveSwap" || d.act === "cancelSwap") return `[data-act="openSwap"]`; // ready to add the next one
  if (d.act && d.k) return `[data-act="${d.act}"][data-k="${d.k}"]`;
  if (d.act === "table") return `[data-act="table"][data-n="${d.n}"]`;
  if (d.act) return `[data-act="${d.act}"]`;
  if (d.input) return `[data-input="${d.input}"]`;
  if (d.line) return `[data-line="${d.line}"]`;
  if (d.f) return `[data-f="${d.f}"]`;
  return null;
}
let restore = null;
function rememberFocus() {
  const p = posOf(document.activeElement);
  restore = p ? { job: p.card.dataset.job, id: ctrlId(document.activeElement), r: p.r, c: p.c } : null;
}
function restoreFocus() {
  if (!restore) return;
  const f = restore;
  restore = null;
  const card = document.querySelector(`.job[data-job="${f.job}"]`);
  if (!card) return;
  const el = f.id && card.querySelector(f.id);
  if (el && shown(el)) return focusCtrl(el);
  const rows = cardRows(card);
  if (!rows.length) return;
  const row = rows[Math.min(f.r, rows.length - 1)];
  focusCtrl(row[Math.min(f.c, row.length - 1)]);
}
// keys while a control inside a card has focus; returns true when handled
function inCardKey(e) {
  const t = e.target,
    p = posOf(t);
  if (!p) return false;
  const text = t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && !/checkbox|radio|button/.test(t.type));
  const go = (r, c) => {
    e.preventDefault();
    const row = p.rows[r];
    if (row) focusCtrl(row[Math.max(0, Math.min(c, row.length - 1))]);
  };
  // up / down land on the line's text field if it has one, otherwise on its first item
  const vert = r => {
    e.preventDefault();
    const row = p.rows[r];
    if (!row) return;
    const f = row.findIndex(x => x.tagName === "INPUT" && !/checkbox|radio|button/.test(x.type));
    go(r, f >= 0 ? f : 0);
  };
  switch (e.key) {
    case "ArrowDown":
      if (p.r < p.rows.length - 1) vert(p.r + 1);
      else e.preventDefault();
      return true;
    case "ArrowUp":
      if (p.r > 0) vert(p.r - 1);
      else e.preventDefault();
      return true;
    case "ArrowLeft":
    case "ArrowRight": {
      const d = e.key === "ArrowRight" ? 1 : -1;
      if (t.tagName === "SELECT" && p.rows[p.r].length === 1) {
        // dropdown alone on its line: change it without opening it
        e.preventDefault();
        const i = t.selectedIndex + d;
        if (i >= 0 && i < t.options.length) {
          t.selectedIndex = i;
          t.dataset.kb = "1";
          t.dispatchEvent(new Event("change", { bubbles: true }));
          delete t.dataset.kb;
        }
        return true;
      }
      if (text && t.value && !(d < 0 ? t.selectionStart === 0 && t.selectionEnd === 0 : t.selectionStart === t.value.length))
        return true; // move the caret
      go(p.r, p.c + d);
      return true;
    }
    case "Enter":
      if (t.type === "checkbox") {
        e.preventDefault();
        t.click();
      }
      return true;
    case "Delete": {
      if (text) return true; // deleting characters
      const del = t.closest("label.hid, ul.mainobj li, .task, .swap")?.querySelector(DEL_SEL);
      if (del) {
        e.preventDefault();
        del.click();
      }
      return true;
    }
    case "Escape":
      e.preventDefault();
      t.blur();
      document.querySelectorAll(".kbrow").forEach(x => x.classList.remove("kbrow"));
      setFocusJob(null);
      selectCard(document.querySelector(`.job[data-job="${p.card.dataset.job}"]`) || p.card);
      return true;
  }
  return false;
}

document.addEventListener("keydown", e => {
  if (!keysOn || e.defaultPrevented) return;
  const t = e.target,
    review = $("#dlgReview").open,
    anyDlg = [...document.querySelectorAll("dialog")].some(d => d.open);
  // screen-area set-up window (opens on top of the new-job window)
  if ($("#dlgAreas").open) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      $("#areaUse").click();
    }
    return;
  }
  // new-job window
  if (review) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      $("#fSave")?.click();
      return;
    }
    if (e.altKey && e.code === "KeyE") {
      e.preventDefault();
      $("#btnCapEmail")?.click();
      return;
    }
    if (e.altKey && e.code === "KeyP") {
      e.preventDefault();
      $("#btnCapParts")?.click();
      return;
    }
    if (e.altKey && e.code === "KeyA") {
      e.preventDefault();
      $("#btnAdjust")?.click();
      return;
    }
    return;
  }
  if (anyDlg) return;
  // Alt + ↑ / ↓ on a part swap: change its place in the list (its compatibility priority)
  if (e.altKey && !e.ctrlKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    const sw = t.closest?.(".swap"),
      j2 = sw && jobs.find(x => x.id === sw.closest(".job").dataset.job);
    if (j2) {
      e.preventDefault();
      const i = j2.swaps.findIndex(s => s.id === sw.dataset.swap);
      moveSwap(j2, sw.dataset.swap, i + (e.key === "ArrowUp" ? -1 : 1));
      return;
    }
  }
  if (!e.ctrlKey && !e.metaKey && !e.altKey && inCardKey(e)) return;
  if (posOf(t) && !typing(t)) return; // inside a card: no single-key job shortcuts (a stray "1" would move the job) – Esc first
  if (typing(t)) {
    if (e.key === "Escape" && !document.querySelector("#ac:not([hidden])")) {
      const card = t.closest(".job");
      t.blur();
      if (card) selectCard(card);
    }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key,
    j = selJob && jobs.find(x => x.id === selJob);
  const act = fn => {
    e.preventDefault();
    fn();
  };
  switch (true) {
    case k === "?":
      return act(openKeysHelp);
    case k === "b":
      return act(openPartsDb);
    case k === "u":
      return act(() => $("#btnUnlocks").click());
    case k === "l":
      return act(openChangelog);
    case k === "c" && e.shiftKey:
      return act(() => $("#btnShare").click());
    case k === "c":
      return act(() => $("#btnCapture").click());
    case k === "m":
      return act(() => $("#btnManual").click());
    case k === "s":
      return act(() => $("#btnSettings").click());
    case k === "ArrowLeft":
      return act(() => moveSel("left"));
    case k === "ArrowRight":
      return act(() => moveSel("right"));
    case k === "ArrowUp":
      return act(() => moveSel("up"));
    case k === "ArrowDown":
      return act(() => moveSel("down"));
    case k === "Home":
      return act(() => selectCard(cards()[0]));
    case k === "End":
      return act(() => selectCard(cards().slice(-1)[0]));
    case k === "Escape":
      if (focusJob) return act(() => setFocusJob(null)); // job focus first, then the selection
      return act(() => {
        selJob = null;
        markSel();
      });
  }
  if (!j) return;
  switch (true) {
    case ["1", "2", "3"].includes(k):
      return act(() => {
        moveToTable(j, +k);
        save();
        render();
      });
    case k === "0":
      return act(() => {
        j.table = 0;
        save();
        render();
      });
    case k === "h":
      return act(() => {
        const t2 = j.tasks.find(x => x.src === "hid" && !x.done);
        if (t2) {
          t2.done = true;
          save();
          render();
          toast(`Done: ${t2.text}`, () => {
            t2.done = false;
            save();
            render();
          });
        }
      });
    case k === "n":
      return act(() => document.querySelector(`.job[data-job="${selJob}"] [data-input="task"]`)?.focus());
    case k === "r":
      return act(() => clickIn('[data-act="openSwap"]:not([hidden])'));
    case k === "p":
      return act(() => {
        if (clickIn('[data-act="edit"]')) setTimeout(() => $("#btnCapParts")?.click(), 0);
      }); // Edit window + PC Stats capture
    case k === "e":
      return act(() => clickIn('[data-act="edit"]') || clickIn('[data-flip="open"]'));
    case k === "d":
      return act(() => clickIn('[data-act="complete"]'));
    case k === "Enter":
      return act(() => {
        const c = document.querySelector(`.job[data-job="${selJob}"]`);
        if (c) enterCard(c);
      });
  }
});
let viaKeys = false; // highlight the line only when the keyboard is being used
document.addEventListener(
  "keydown",
  () => {
    viaKeys = true;
  },
  true
);
document.addEventListener(
  "mousedown",
  () => {
    viaKeys = false;
  },
  true
);
document.addEventListener("focusin", e => {
  const c = e.target.closest?.(".job");
  if (!c || !keysOn) return;
  if (selJob !== c.dataset.job) {
    selJob = c.dataset.job;
    markSel();
  }
  if (viaKeys && !e.target.closest(".kbrow") && posOf(e.target)) focusCtrl(e.target);
});
document.addEventListener("focusout", e => {
  if (e.target.closest?.(".job"))
    setTimeout(() => {
      if (!document.activeElement?.closest?.(".job"))
        document.querySelectorAll(".kbrow").forEach(x => x.classList.remove("kbrow"));
    }, 0);
});
// clicking a card selects it, so the keyboard continues from there
document.addEventListener("mousedown", e => {
  const c = e.target.closest?.(".job");
  if (c && keysOn) {
    selJob = c.dataset.job;
    markSel();
  }
});

function openKeysHelp() {
  $("#keysBody").innerHTML = keysHelpHtml();
  $("#dlgKeys").showModal();
}
function setKeys(v) {
  keysOn = v;
  LS.set("pcbs.keys", v);
  document.body.classList.toggle("keys-off", !v);
  if (!v) {
    selJob = null;
    markSel();
  }
}

// re-apply the selection after every board re-render
const _renderBoard = render;
render = function () {
  rememberFocus();
  _renderBoard();
  markSel();
  restoreFocus();
};
$("#btnKeys").onclick = openKeysHelp;
setKeys(keysOn);
