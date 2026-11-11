# Repositories, branches, setup

| Where | What | Who sees it |
|---|---|---|
| `pcbs-job-board/pcbs-job-board.github.io` (org repo) | `main` only = the live site (GitHub Pages) | public |
| `mariusz-przeczek/pcbs-job-board-dev` | `dev-X.Y.Z` work branches, `backup-<version>` of each released main, `tests`, `todo` | private |

- `todo` branch: `TODO.md`, `HANDOVER.md`, `handover/`, `notes/`, `help-assets/`, `todo-files/`. Pushed after every change – Mariusz checks it there.
- `tests` branch: test suites, real game screenshots (`fixtures/`, can't be published), `quick.js`, `release.sh`, `hooks/`. Kept as separate worktrees next to the app checkout.
- Commits: `-c user.name="Mariusz Przeczek" -c user.email="przeczek.mariusz@gmail.com"` + the session's attribution lines. The email may be in the repos, but **never visible to site users** (e.g. "send by email" must not show it).
- All dev branches and backups live in the private repo; the public repo only gets `main`.
- GitHub "Checks" also run on every `dev-*` push (from dev-0.15.2 on) – a red check is fixed before asking to release.

## Setting up a new environment
```
git clone https://github.com/mariusz-przeczek/pcbs-job-board-dev app && cd app
git remote rename origin dev && git remote add origin https://github.com/pcbs-job-board/pcbs-job-board.github.io.git
git checkout <dev-X.Y.Z or a new one from origin/main> && npm install
git worktree add ../tests tests && git worktree add ../todo todo
cp ../tests/hooks/* .git/hooks/          # formatting / lint on commit, Prettier check on push to main
cd ../tests && node quick.js --app ../app
```
Playwright + Chromium are needed for the browser suites; the text reader runs from `tests/vendor` (no CDN).
