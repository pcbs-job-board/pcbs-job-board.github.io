# PCBS Job Board – handover (core, read this first)

Last updated: 2026-11-11 · live **0.15.2** · work branch `dev-0.15.3` (from live 0.15.2: GPU table layout fix, PC Bay NEW parts, file-structure refactor – not released).
Then read `TODO.md` (open items). Open the topic files below **only when your task needs them**.

**What**: static web app (no build, no server) that reads PC Building Simulator 1 (PS5, base game, no DLC) screens
with OCR and plans jobs. Live https://pcbs-job-board.github.io/ (public repo `pcbs-job-board/pcbs-job-board.github.io`,
`main` only). Private dev repo `mariusz-przeczek/pcbs-job-board-dev`: `dev-X.Y.Z`, `backup-<ver>`, `tests`, `todo`.
**Who**: Mariusz (Germany, Europe/Berlin), side project, learning Android/Kotlin – his GitHub may be seen by
employers: keep everything public clean and professional. His email must never be visible to site users.

## Standing rules
1. **Nothing on the ToDo is started without Mariusz's go-ahead.** "Add to ToDo" = notes only.
2. After adding a ToDo item, report how many **small fixes** and **bigger updates** are listed. Done items are
   removed from TODO.md (the changelog keeps them).
3. **Release only when he says "release"** (or "push it to live"); batch about one a day.
4. "Don't push" = don't push main / live. Dev, `tests`, `todo` branches are always pushed; push TODO.md after every change.
5. Tests minimal: `node quick.js --app <app>` + one unit test per fix. `--all` / screenshots only when asked.
6. **Never `prettier --write` index.html.** Code must pass GitHub "Checks" (ESLint + Prettier + parts-db up to date).
7. Nothing legally gray (no game images in the app). Stop background servers when done.
8. Ask before anything hard to undo; one short question when a request can be read two ways.
9. Reports come as screenshots: find the cause in the code, write the item (sender / subject, cause, planned fix).
10. Commits: user "Mariusz Przeczek" + the session's attribution lines (see `handover/repos-and-setup.md`).

## Topic index – open what the task needs
| Task | Read |
|---|---|
| Branches, commit identity, new environment | `handover/repos-and-setup.md` |
| Release, version bump, changelog, code style, tests | `handover/process.md` |
| Jobs, hidden objectives, story jobs, "or better" | `handover/game-rules.md` |
| 3DMark, overclocking, PC Bay | `handover/bench-oc-flip.md` |
| Parts database, compat fields, cables | `handover/parts-db.md` |
| Which file does what in `js/core`, `js/ui` | `handover/app-map.md` |
| Road to 1.0, Steam guide | `handover/plans.md` (details in TODO.md) |
| Overclock temperature research | `notes/oc-temperature.md` |

Thread / model routing lives in project memory (not here).
