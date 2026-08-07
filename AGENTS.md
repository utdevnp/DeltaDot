# AGENTS.md

Guide for AI agents and contributors working on **DeltaDot** — an Electron desktop app for monitoring multiple Git repositories under a workspace and reviewing PRs with AI assistance.

## Project Overview

- **What it does**: Scans a workspace folder for Git repos, compares a `base` branch against a `release` branch per repo, shows commits/status, lists pull requests, and runs AI-powered code reviews against the linked Jira ticket.
- **Stack**: Electron + Vite 8 + React 19 + TypeScript (strict). Styling is hand-written CSS variables + inline styles, with **Tailwind CSS v4** available (theme + utilities only, no preflight).
- **Package**: `deltadot-desktop` v1.0.0. Main entry `dist-electron/electron/main.js`.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Builds `dist-electron`, starts Vite dev server (binds **127.0.0.1:5173** — do not change to `localhost`) and launches Electron |
| `npm run build` | `vite build` (renderer → `dist/`) + `tsc -p tsconfig.node.json` (main → `dist-electron/`) |
| `npm run build:renderer` | Renderer only |
| `npm run build:electron` | Main process + core only |
| `npm run package` | `npm run build` + `electron-builder` (DMG/zip) |
| `npm run start` | Run the packaged app from `dist-electron` (production) |

There is **no test suite and no lint script** yet (see ROADMAP).

## Architecture

```
src/                      → React renderer (vite root = src)
  App.tsx                 → root component: state, keyboard shortcuts, views, sync/PR orchestration
  main.tsx                → ReactDOM.createRoot entry
  components/             → view components (RepoList, PRsView, ReviewView, dialogs…)
    review/               → JiraTaskPanel, PRDetailsPanel, AIReviewPanel (review tabs)
  styles/app.css          → single stylesheet: tokens, classes, Tailwind imports
electron/
  main.ts                 → Electron main process: window, all ipcMain handlers
  preload.ts              → contextBridge: exposes window.api (the only renderer↔main channel)
core/                     → Node-side logic compiled into dist-electron (main process)
  git.ts                  → run(cmd), analyzeRepo, fetchCommitDetail   ⚠ Node-only
  config.ts               → ~/.deltadot files (global config, workspaces, cache, active id)
  pr.ts                   → remote owner/repo parsing, PR fetch/comment wrappers
  remote.ts               → getRemoteUrl (lazy git), openInBrowser       ⚠ Node-only
  urls.ts                 → PURE URL helpers (parseRemoteUrl, getPRsUrl…) ✅ renderer-safe
  markdown.ts             → renderMarkdown (pure) ✅ renderer-safe
  utils.ts                → timeAgo, statusIcon, etc. ✅ renderer-safe
  types.ts                → all shared types + config field helpers
  services/
    pr/                   → github.ts, gitlab.ts, bitbucket.ts, index.ts, shared.ts
    ai/review.ts          → streamAIReview, fetchAIReview (SSE streaming)
    tasks/jira.ts         → fetchJiraIssue, extractJiraIssueKey
```

### Critical rule — keep Node built-ins out of the renderer

The renderer must **never** import modules that pull in Node built-ins (`child_process`, `fs`, `path`). Vite externalizes them and the app crashes with a blank window (`Module "child_process" has been externalized…`).

- ✅ Renderer may import: `core/types.js`, `core/urls.js`, `core/markdown.js`, `core/utils.js`
- ⚠️ Never import `core/git.js`, `core/remote.ts`'s git path, or `core/pr.js` from renderer code. If the renderer needs a pure helper, put it in `core/urls.ts` (or another pure module).
- Main process only: everything under `core/` and `electron/`.
- Anything the renderer needs from Node/git/network goes through an **IPC call** in `electron/main.ts` exposed by `electron/preload.ts`.

## Data / Persistence (`~/.deltadot/`)

- `config.json` — **global** config. Theme is global-only; never stored per-workspace.
- `workspaces.json` — list of `Workspace` (`id`, `name`, `displayName`, `path`, `color`, `config`).
- `workspaces/<id>/config.json` — per-workspace overrides (base, release, token, provider, ai…).
- `active-workspace` — id of the last opened workspace (restored on launch).
- `cachePath(workspace)` — per-workspace `.deltadot-cache.json` (repos + PRs snapshot).

On launch the app restores the **last active workspace** via `loadActiveWorkspaceId()` (do not use `loadConfig()` for this — it returns the config object, not an id).

## Key Flows

### Workspace
- `switchWorkspace(ws)` → activates workspace, loads cached repos (shows instantly, **no auto-sync**), resets sync state.
- `handleAddWorkspaceSave` / `handleEditWorkspaceSave` → persist via `saveWorkspaces` (always read fresh list from IPC first; avoid stale closures). Editing can change `name`/`displayName`/`path`.
- `Workspace.name` and `displayName` are kept in sync (single "Workspace Name" in the UI); `getDisplayName = displayName || name`.

### Sync
- `syncAll()` → parallel `syncOneRepo(path, base, release)` for all `repoPaths`; updates `repos`, progress, cache.
- `syncOneRepoDirect(paths, config)` → sequential full sync; also called after **config save** so repos re-sync with the new base/release.
- `syncOne(repoPath)` → single repo.
- Shortcuts: `Shift+S` = sync all (global, any view; refreshes PRs in PR view), `s` = sync selected repo.
- Config save (`handleConfigSave`) strips `theme` before writing the workspace config, then auto-syncs.

### PRs
- `fetchPRsForRepo(repoPath, filter?)` / `fetchAllPRs(filter?, reposOverride?)` → via `window.api.fetchPRs(owner, repo, provider, token, repoName, state)`.
- `fetchPRDetail` → full PR detail incl. files/patch/comments.
- `createPRComment(owner, repo, prNumber, provider, token, body)` → posts a comment (GitHub: issues-comments endpoint; GitLab: MR notes; Bitbucket: PR comments). Raw markdown body.
- Comment display remaps the **token owner's** comments to the **local git user** (`getGitHubUser(token)` + `getGitUser(repoPath)`).

### AI Review (`review` view, tabs: Jira Task | PR Details | AI Review)
- `AIReviewPanel.runReview()` → phases logged one-by-one (Getting Jira ticket detail… → Getting PR details… → Reviewing…), streams via `window.api.streamAIReview`.
- Right panel appears **only after the review text renders** (Summary | Log tabs).
- Summary tab: editable textarea prefilled with the review, **Submit as Comment** posts it signed with the local git user (`\n\n— name <email>`).
- DeepSeek reasoning models stream `reasoning_content` with empty `content` — `streamAIReview` falls back to reasoning text so the review is never blank.

## Theme (dark / light / system)

- Default dark. `toggleTheme` cycles dark → light → system (global only).
- `effectiveTheme` resolves `system` via `window.matchMedia('(prefers-color-scheme: dark)')`.
- CSS: `.theme-light` class toggles token values; Tailwind `@theme` maps tokens (`--color-bg-secondary` etc.) so utilities follow the theme. `light:` variant = `.theme-light` selector.

## Views & Keyboard Shortcuts (main keydown in App.tsx)

Views: `list` (repos), `commits`, `detail` (commit), `prs`, `prdetail`, `review`, `config` (dialog).

| Key | Action |
|-----|--------|
| `j`/`k` | navigate repos / PRs / commits |
| `Enter`/`c` | open commit detail / PR detail |
| `r` | open AI review for selected PR (PR list) |
| `o` | open current PR in git (review view) |
| `s` / `Shift+S` | sync one repo / sync all |
| `p` / `P` | PRs for repo / all PRs |
| `e` | open config |
| `w` / `W` | select / switch workspace |
| `g`/`G`, `f`, `/`, `:` | first/last, filter, search, command palette |
| `q` | quit |

## Conventions

- All IPC channels are `kebab-case` strings in `main.ts`; `preload.ts` mirrors them as `window.api.*` with the same argument order.
- Renderer state changes use function updaters (`setRepos((prev) => …)`) to avoid stale closures; use `useRef` mirrors (`syncAllRef`, `reposRef`, `cfgRef`) for keyboard handlers.
- Styles: prefer the existing CSS-variable tokens (`var(--bg-secondary)`, `var(--accent-blue)`…). Tailwind utilities are available; keep dark/light correctness by using token-mapped classes (`bg-bg-secondary`).
- Paths in imports use `../core/*.js` extensions (ESM).
