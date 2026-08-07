# ROADMAP

Planned improvements for **DeltaDot**. Ordered roughly by impact. Items are not committed until implemented — use this file to track what needs doing.

## Short term (next iterations)

- [ ] **Tailwind migration of existing inline styles**
  - Current UI is ~70% inline `style={{…}}` objects. Tailwind v4 is wired (theme tokens + utilities, no preflight). Gradually convert component styles to token-mapped utility classes (`bg-bg-secondary`, `text-text-primary`, `border-border`, …), keeping dark/light correctness.
- [ ] **Unit tests for core logic**
  - No test framework yet. Add `vitest` covering: `core/urls.ts` (remote parsing), `core/services/pr/*` (SSE parsing, provider dispatchers), `core/services/ai/review.ts` (reasoning fallback, streaming accumulation), `core/git.ts` branch-log parsing.
- [ ] **E2E smoke test (Playwright + Electron)**
  - Launch the app, assert window renders, workspace list loads, a repo sync completes, PR view opens.
- [ ] **CI pipeline (GitHub Actions)**
  - `npm ci` → `npm run build` → type-check → lint → test on macOS (arm64 + x64), Windows, Linux.
- [ ] **Lint + formatting**
  - Add ESLint + Prettier config; enforce in CI.

## Medium term

- [ ] **macOS code signing & notarization**
  - Currently unsigned (users must right-click → Open). Add `electron-builder` signing config with `hardenedRuntime`, notarize via `notarytool`.
- [ ] **Auto-updates**
  - Integrate `electron-updater` + a release feed (GitHub Releases) so the DMG/zip updates itself.
- [ ] **Windows & Linux packaging**
  - NSIS / AppImage targets; verify dev flow on both (the renderer/main split is platform-agnostic).
- [ ] **Sync concurrency guard**
  - `syncAll` and `syncOneRepoDirect` can overlap (config save mid-sync, Shift+S spam). Add an in-flight lock so only one full sync runs at a time and `isSyncing` can't be cleared early.
- [ ] **Per-repo refresh + progress resilience**
  - Better error surfacing when a repo's base/release branch is missing; per-repo retry; keep stale data visible with an error badge instead of blanking.
- [ ] **AI review UX polish**
  - Toggle to show/hide DeepSeek reasoning (thinking) vs final answer.
  - Token-budget awareness: detect when `max_tokens` truncates and surface a warning.
  - Model/context-size selection per provider in the config dialog.
- [ ] **PR comment improvements**
  - Post **inline review comments** (line-level, `POST /pulls/{n}/comments`) from the diff view.
  - Reply to existing comments; resolve/unresolve threads.
- [ ] **GitLab / Bitbucket parity**
  - Full review-comment + merge-request action parity (the comment endpoints exist; add MR approve/merge).

## Longer term

- [ ] **Performance for large workspaces**
  - Cache per-repo analysis; debounce sync; virtualize long repo/commit lists; lazy-load PR pages (pagination beyond 50).
- [ ] **Better global logging / diagnostics**
  - Centralized main-process logger with rotation; expose a "copy diagnostics" action.
- [ ] **i18n**
  - Extract UI strings; add locale infrastructure (English first).
- [ ] **Plugin / extension surface**
  - Allow third-party task providers (ClickUp, Linear) and AI providers without core changes.
- [ ] **Web/remote sync (optional)**
  - Optional daemon so multiple machines share workspace state.

## Known constraints (do not regress)

- Renderer must never import Node-only modules (`core/git.ts`, `child_process`) — causes a blank window (vite externalization). Keep pure helpers in `core/urls.ts`/`core/markdown.ts`.
- Theme is **global-only**; workspace configs must not store `theme` (`activateWorkspace` restores it from global config, `handleConfigSave` strips it).
- Last-opened workspace is restored via `loadActiveWorkspaceId()` — never `loadConfig()` (returns an object, not an id).
- Dev server must stay pinned to `127.0.0.1:5173` (vite binds IPv4; `localhost` can resolve to IPv6 and blank the window).
- Config save must auto-sync repos with the new base/release (`syncOneRepoDirect`).
