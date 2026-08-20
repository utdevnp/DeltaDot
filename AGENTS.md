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
| `npm run package` | `npm run build` + `electron-builder --universal` (DMG/zip) |
| `npm run start` | Run the packaged app from `dist-electron` (production) |
| `DELTADOT_SIGNING_IDENTITY="<cert>" npm run package` | Build signed with a stable code-signing identity (see Packaging section) |
| `bash build/create-signing-cert.sh` | One-time: create + import a self-signed Code Signing cert |

There is **no test suite and no lint script** yet (see ROADMAP).

## macOS Packaging & Distribution

`npm run package` = `npm run build && electron-builder --universal` — produces a **universal** (arm64 + x86_64) `.dmg` + `.zip` that runs on every Mac. The packaged app ships one runtime dependency only: **`@kubernetes/client-node`** (in `dependencies`, pulled into the asar by electron-builder) — everything else is build-time in `devDependencies` (`@rolldown/binding-darwin-arm64`, `@tailwindcss/vite`, `tailwindcss`, `react`, `react-dom`). The main process imports Node built-ins + `electron` + `@kubernetes/client-node`; the renderer is fully bundled into `dist/`.

### Code signing (critical)

- `mac.identity` is **`null`** — electron-builder skips its own signing; `build/afterPack.cjs` re-signs the final merged `.app` (it skips the `*-x64-temp` / `*-arm64-temp` per-arch dirs so the universal merge stays consistent).
- Signing identity comes from env `DELTADOT_SIGNING_IDENTITY` (a stable cert name) and falls back to ad-hoc `-`. Signing failure **throws** — an unsealed app is never shipped silently.
- `mac.hardenedRuntime: true` + `build/entitlements.mac.plist` / `build/entitlements.mac.inherit.plist` (JIT / unsigned-executable-memory entitlements).
- `mac.extendInfo` sets the TCC usage descriptions (`NSDocumentsFolderUsageDescription`, `NSDesktopFolderUsageDescription`, `NSDownloadsFolderUsageDescription`, `NSRemovableVolumesUsageDescription`, `NSNetworkVolumesUsageDescription`).
- `build/create-signing-cert.sh` — one-time helper that creates a self-signed **Code Signing** cert (`openssl pkcs12 -legacy` for OpenSSL 3.x compatibility) and imports it into the login keychain.

### Known macOS behaviors (why the above exists)

- **"DeltaDot is damaged and can't be opened"** = the bundle signature is unsealed. The `afterPack` re-sign fixes it; verify with `codesign --verify --deep --strict <path>.app`.
- **"would like to access files…" for every repo** = macOS TCC prompts + unstable (ad-hoc) app identity so grants are not remembered. Fixes, in order of effort:
  1. **Full Disk Access** for the app (System Settings → Privacy & Security) — one-time, stops all prompts.
  2. **Stable identity** — `bash build/create-signing-cert.sh` once, then `DELTADOT_SIGNING_IDENTITY="DeltaDot Signing" npm run package`. Grants now persist; it asks once per protected folder (Documents/Desktop/Downloads/network/removable), not per repo.
  3. Move the workspace out of protected folders (`~/workspace`, `/Users/Shared`) — local repos stop prompting entirely.
- **DMG step fails with `Operation not permitted: /Volumes/DeltaDot/.VolumeIcon.icns`** = the terminal lacks macOS Full Disk Access; run `npm run package` from a normal GUI Terminal (the `.zip` target builds regardless).
- No Apple Developer account yet → app is **not notarized**. On other Macs the first launch needs right-click → Open, or `xattr -dr com.apple.quarantine /Applications/DeltaDot.app`. When an account exists: add `"notarize": true` under `build.mac` and export `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` (or the App Store Connect API-key envs).

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
  k8s.ts                  → getKubeContexts/Namespaces/Deployments/DeploymentDetail via @kubernetes/client-node (reads ~/.kube/config)  ⚠ Node-only
  k8s-compare.ts          → compareDeployments (pure diff sections)      ✅ renderer-safe
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

The renderer must **never** import modules that pull in Node built-ins (`child_process`, `fs`, `path`) or the k8s client (`@kubernetes/client-node`). Vite externalizes them and the app crashes with a blank window (`Module "child_process" has been externalized…`).

- ✅ Renderer may import: `core/types.js`, `core/urls.js`, `core/markdown.js`, `core/utils.js`, `core/k8s-compare.js` (pure)
- ⚠️ Never import `core/git.js`, `core/remote.ts`'s git path, `core/pr.js`, or `core/k8s.ts` from renderer code. If the renderer needs a pure helper, put it in `core/urls.ts` (or another pure module).
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

## Design System (vivid, theme-aware)

Tokens live in `src/styles/app.css` — the single source of truth. **Never hardcode hex colors in components**; use `var(--token)` inline or CSS classes.

### Palette (Tailwind-family vivid)

| Token | Dark (`:root`) | Light (`.theme-light`) |
|-------|----------------|------------------------|
| `--bg-primary` | `#0a0f1f` | `#fbfdff` |
| `--bg-secondary` | `#121a33` | `#f1f5fd` |
| `--bg-tertiary` | `#1c2747` | `#e4ecfa` |
| `--bg-hover` | `#243259` | `#d6e2f6` |
| `--border` | `#2d3d66` | `#c6d4ee` |
| `--border-strong` | `#41589a` | `#9db4dd` |
| `--text-primary` | `#eef2ff` | `#182338` |
| `--text-secondary` | `#a9b8e0` | `#55648c` |
| `--text-dim` | `#64739c` | `#5b6a94` |
| `--accent-blue` | `#3b82f6` | `#2563eb` |
| `--accent-green` | `#22c55e` | `#15803d` |
| `--accent-red` | `#ef4444` | `#dc2626` |
| `--accent-yellow` | `#f59e0b` | `#b45309` |
| `--accent-cyan` | `#06b6d4` | `#0891b2` |
| `--accent-orange` | `#f97316` | `#c2410c` |
| `--accent-purple` | `#a855f7` | `#9333ea` |
| `--selection-bg` | `#1d2f5e` | `#dbeafe` |
| `--btn-blue` / `--btn-blue-dark` | `#2563eb` / `#1d4ed8` | `#1d4ed8` / `#1e40af` |
| `--btn-green` / `--btn-green-dark` | `#16a34a` / `#15803d` | `#15803d` / `#166534` |

Supporting tokens (defined in both theme blocks):
- `--tint-{blue,green,red,yellow,purple}` — translucent chip/diff/hover backgrounds (use instead of raw `rgba(...)`)
- `--border-{blue,green,red,yellow}` — tinted borders for chips/status boxes
- `--glow-blue`, `--glow-cyan` — glow shadows for accents/status dots
- `--shadow-pop` — dialog/modal drop shadow

### Rules

1. **Both theme blocks must define every token** — add any new token to `:root` AND `.theme-light` (light-theme accents are deliberately 600/700-level so small text stays ≥ 4.5:1).
2. No hardcoded hexes in `src/` (except `#fff` label text on `--btn-*`/accent fills, and `color-mix` mix targets).
3. Primary buttons: `linear-gradient(135deg, var(--btn-blue), var(--btn-blue-dark))` (green variant uses `--btn-green*`; dark end first for white-label contrast). Hover: `color-mix(in srgb, var(--btn-blue) 88%, #fff)`; `onMouseLeave` restores the exact base gradient string.
4. Translucent backgrounds: use `--tint-*` tokens or `color-mix(in srgb, var(--accent-x) 12%, transparent)` — never raw `rgba(...)` in components.
5. Text hierarchy: `--text-primary` (headings/values) > `--text-secondary` (body/meta) > `--text-dim` (labels/hints). Status/diff text uses `--accent-*`.
6. Selected rows: `linear-gradient(90deg, var(--selection-bg), color-mix(in srgb, var(--selection-bg) 55%, transparent))` + `inset 3px 0 0 var(--accent-blue)`.
7. Tailwind `@theme` maps every token (`--color-accent-purple`, `--color-bg-hover`, …) so utilities (`bg-bg-secondary`, `text-text-dim`, `light:`) follow the theme automatically.

### Theme mechanics

- Default dark. `toggleTheme` cycles dark → light → system (global only).
- `effectiveTheme` resolves `system` via `window.matchMedia('(prefers-color-scheme: dark)')`.
- CSS: `.theme-light` class on `<html>` toggles token values; `light:` variant = `.theme-light` selector.
- Theme is global-only; never stored per-workspace.

## Views & Keyboard Shortcuts (main keydown in App.tsx)

Views: `list` (repos), `commits`, `detail` (commit), `prs`, `prdetail`, `review`, `k8s` (Kubernetes deployments), `config` (dialog).

| Key | Action |
|-----|--------|
| `j`/`k` | navigate repos / PRs / commits / deployments |
| `Enter`/`c` | open commit detail / PR detail (PR list: `Enter` opens AI review, same as `r`; mouse click still opens PR detail) |
| `r` | open AI review for selected PR (PR list); refresh deployments (k8s view) |
| `r-click ctx` | compare context with another (k8s view) |
| `o` | open current PR in git (review view) |
| `s` / `Shift+S` | sync one repo / sync all |
| `p` / `P` | PRs for repo / all PRs |
| `K` | open Kubernetes view (list view) |
| `e` | open config |
| `w` / `W` | select / switch workspace |
| `g`/`G`, `f`, `/`, `:` | first/last, filter, search, command palette |
| `q` | quit |

### Kubernetes view (k8s)

- Reads the **local kubeconfig** (`~/.kube/config` / `KUBECONFIG`) via `@kubernetes/client-node`. **Each context opens in its own tab** — the first tab is the **last selected context** (remembered in `~/.deltadot/kube-context`, falls back to the kubeconfig current context). Selecting a context in the title-bar dropdown opens/activates its tab; tabs are closeable (`✕`, at least one stays) and **renameable (double-click)**, including context tabs.
- **Namespace selector lives inside each context tab** (per-tab namespace + refresh), followed by a **resource-kind submenu** (Deployments, Pods, ConfigMaps, Secrets, Services, StatefulSets, DaemonSets, Ingresses, Jobs, CronJobs) and the resource table (`#` + per-kind columns; READY/AGE/IMAGE cells are formatted). `Enter`/click on a **deployment** row opens it in its own workload tab (Image Version first, then containers/env/resources/probes…).
- **Tab-by-tab compare**: right-click any context tab (or the dropdown) → a menu populates (open tabs first, marked `tab`) → pick another context → a **new compare tab** opens (`ctxA vs ctxB`). The compare table is `# | Deployment Name | <context name> | <context name> | …` — columns are the **dynamic context/tab labels**, each cell shows the short image tag with the deployment's **age inline** (`1.11.1 - 5m`), `—` when missing, yellow for versions drifting from the first context. Use **"+ Add context"** for more columns (✕ removes extras, minimum 2).
- All k8s calls go through `window.api.k8sContexts/k8sNamespaces/k8sDeployments/k8sDeploymentDetail` (IPC `k8s-*` handlers in `main.ts` → `core/k8s.ts`).

## Conventions

- All IPC channels are `kebab-case` strings in `main.ts`; `preload.ts` mirrors them as `window.api.*` with the same argument order.
- Renderer state changes use function updaters (`setRepos((prev) => …)`) to avoid stale closures; use `useRef` mirrors (`syncAllRef`, `reposRef`, `cfgRef`) for keyboard handlers.
- Styles: prefer the existing CSS-variable tokens (`var(--bg-secondary)`, `var(--accent-blue)`…). Tailwind utilities are available; keep dark/light correctness by using token-mapped classes (`bg-bg-secondary`).
- Paths in imports use `../core/*.js` extensions (ESM).
- **Table / list views always use a title bar**: view title on the left, actions (filters, badges, counts) in the middle, and the back button as the **last element at the right end** — never before the title or sandwiched between content. Applies to `prs`, `commits`, `detail` (commit), `list` (no back button, title + count), and any future table view.
