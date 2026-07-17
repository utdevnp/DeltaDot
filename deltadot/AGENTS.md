# AGENTS.md

## Project

DeltaDot is a TypeScript CLI that checks whether local Git repos inside a workspace directory are in sync with upstream remotes by comparing two branches via `git log origin/<base>..origin/<release>`. The UI is built with **Ink** (React for CLIs), rendering a live-updating terminal dashboard with a k9s-like interface.

## Commands

```sh
npm install           # install deps
npm run dev           # run via tsx (no build needed): tsx src/index.tsx
npm run build         # compile TypeScript → dist/
npm start             # node dist/index.js (requires build)
npx tsc --noEmit      # typecheck only (no dedicated script)
```

No lint, test, or format scripts exist.

## CLI Usage

```sh
npm run dev -- --path /path/to/workspace --base main --release R10
npm run dev -- --path /path/to/workspace --base main --release R10 --sync-interval 15
```

Options:
- `--path` (default: `.`) — workspace directory containing Git repos
- `--base` (default: `main`) — base branch
- `--release` (default: `R10`) — release branch
- `--sync-interval <minutes>` (default: `30`) — auto-sync interval
- `--token <token>` — API token for PR fetching (GitHub/Bitbucket/GitLab)
- `--provider <type>` — Provider type: `github`, `gitlab`, or `bitbucket` (default: `github`)

## File Structure

```
src/
├── index.tsx               — Entry: renders <App /> (4 lines)
├── App.tsx                 — CLI parsing, config/cache loading, screen setup
├── Dashboard.tsx           — State, effects, keyboard handler, view orchestration
├── types.ts                — All interfaces: RepoState, View, AppConfig, InputMode, etc.
├── utils.ts                — pad, truncate, timeAgo, toUsername, statusIcon, SPINNER
├── git.ts                  — run, analyzeRepo, fetchCommitDetail
├── remote.ts               — URL parsing, browser open, compare URL
├── pr.ts                   — PR fetching facade
├── services/pr/            — GitHub/GitLab/Bitbucket PR API clients + shared helpers
├── config.ts               — Config/cache load/save, repo discovery, CLI resolution
├── services/tasks/         — Jira task provider service (future task integrations)
└── components/
    ├── TopBar.tsx          — Title bar: workspace, base→release, repo count, sync status
    ├── BottomBar.tsx       — k9s-style menu with per-view keybinding hints
    ├── CommandBar.tsx      — Unified / search + : command input
    ├── Table.tsx           — Reusable table header + full-width separator
    ├── RepoList.tsx        — Repo list with auto-width columns
    ├── CommitsView.tsx     — Commit diff + latest-5 view with enter-to-detail
    ├── DetailView.tsx      — Single commit detail (hash, author, date, body, stat)
    ├── ConfigView.tsx      — Config editor (workspace, base, release, syncInterval, token, provider, taskProvider, jiraUrl, jiraEmail, jiraApiToken)
    ├── PRsView.tsx         — PR list with table, loading, error, empty states
    └── PRDetailView.tsx    — Single PR detail (state, author, branches, date, URL)
```

## Key Facts

- **ESM-only** (`"type": "module"`). TypeScript uses `"module": "NodeNext"` — imports in source must use `.js` extensions to match compiled output.
- `bin/deltadot.js` is a committed shim (`import '../dist/index.js'`); it only works after `npm run build`.
- TypeScript `^6.0.3` (very recent major version).
- No test suite, no linter, no formatter, no CI.
- UI uses **Ink** (React for CLIs); `tsconfig.json` has `"jsx": "react-jsx"` enabled.

## Cache File

- Written to `<workspace>/.deltadot-cache.json` — auto-created, safe to delete.
- On startup: if cache exists, data is shown immediately (marked `stale`) while a background sync runs.
- Auto-sync fires every `--sync-interval` minutes after the last full sync completes.
- Manual sync: press `s` in the dashboard on the selected repo.
- Add `.deltadot-cache.json` to the workspace's `.gitignore` to avoid committing it.

## Global Config File

- Saved to `~/.deltadot/config.json` — persists workspace, base, release, syncInterval, token, provider across sessions.
- CLI flags override saved config on launch; merged config is saved back automatically.
- Edit config at runtime by pressing `e` in the list view or `: config` command.

## Design Patterns

### Table Component (`src/components/Table.tsx`)

All tabular data uses the shared `<Table>` component:

```tsx
import { Table } from './Table.js';
import type { ColDef } from './Table.js';

const columns: ColDef[] = [
  { label: '#', width: 3 },
  { label: 'NAME', width: 20 },
  ...
];

<Table columns={columns} width={width}>
  {/* data rows — caller renders each row with full control */}
</Table>
```

- **Header row**: column labels in `whiteBright` bold, padded to width, joined with ` │ ` — rendered with `paddingLeft={3}`
- **Separator**: a full-width `─` line with no padding (`<Box height={1}><Text dimColor>{'─'.repeat(width)}</Text></Box>`)
- **Data rows**: caller renders children with full control over per-cell colors and wrapping
- **Selected row**: all content in a single `<Text color="yellowBright" bold wrap="truncate-end">` with cells joined by ` │ ` — no per-cell coloring
- **Unselected row**: cells separated by `<Text color="cyanBright"> │ </Text>` with individual cell colors

### `missingRelease` (no release branch)

Repos without the release branch (`missingRelease: true`) appear **dimmed** — all text colors get `dimColor` applied. The diff column shows `no release` in dimmed text. These repos are skipped during release comparison since they have no target branch.

### Selection

- Selected item: `color="yellowBright" bold` — never `inverse` or white-background
- Applies to list rows, commit rows, PR rows, and any navigable item

### Separators

- All horizontal separator lines span full terminal width (`{'─'.repeat(width)}`)
- No `paddingLeft` on separator boxes
- No column-break characters (`┼`) inside separators — plain `─` only
- Two separators in list view: one below TopBar (from Dashboard), one below column headers (from Table)

### TopBar

Format: ` ■ DeltaDot │ ~/workspace │ main → R10 │ 10 repos │ ◐ syncing 3/10`

- When syncing: spinner + `syncing doneCount/repoCount`
- When done: `✓ synced ${timeAgo(lastSync)}`
- Workspace path truncated (`/Users/user/` → `~/`)

### Keybindings (k9s-style)

| Key | List view | Commits view | Detail view | PRs view | PR detail | Config view |
|-----|-----------|--------------|-------------|----------|-----------|-------------|
| `↑↓` / `jk` | Navigate repos | Navigate commits | — | Navigate PRs | — | Move field |
| `g` / `G` | First / last repo | First / last commit | — | First / last PR | — | First / last field |
| `c` | Open commits | — | — | — | — | — |
| `↵` | Open commits | Open commit detail | — | Open PR detail | — | Save & apply |
| `s` | Manual sync repo | Manual sync | — | — | — | — |
| `S` | Sync all | — | — | Sync all + refresh PRs | — | — |
| `e` | Open config editor | — | — | — | — | — |
| `Tab` | — | — | — | — | — | Next field |
| `b` / `Esc` | Toggle branch col | Back to list | Back to commits | Back to list | Back to PRs | Cancel |
| `/` | Search/filter repos | — | — | — | — | — |
| `:` | Command bar | Command bar | Command bar | Command bar | Command bar | — |
| `P` | PRs view | — | — | — | — | — |
| `o` / `O` | Open compare URL | Open commit URL | — | Open PR URL | Open PR URL | — |
| `q` | Quit | Quit | Quit | Quit | Quit | Quit |

### PR fetching

- PRs are fetched from the selected repo's remote via provider API (GitHub/Bitbucket/GitLab)
- Provider auto-detected from remote URL (`bitbucket.org`, `gitlab.com`, or `github.com`)
- Token from config used for `Bearer` auth header
- PRsView shows: `#`, `TITLE`, `AGE`, `PR #`, `REPO`, `STATE`, `APRVD`, `BRANCH`, `AUTHOR`
- Press `Enter` on a PR to see detail (state, author, branches, dates, URL)
- Press `Shift+R` on a PR to open the review view with Jira task details + PR changes
- Task provider config is global and currently supports a single active provider (Jira)

### Quit

- `q` uses `process.exit(0)` to force-terminate regardless of active timers/intervals
- Both `q` key and `: q` command use the same force exit

### Configuration overrides
- Input modes: `none | search | command`
- `/` opens search with live filtering (onChange updates `searchQuery`)
- `:` opens command mode (onSubmit calls `execCommand`)
- Tab in command mode: auto-completes to matching command (longest common prefix)
- Config fields: `workspace`, `base`, `release`, `syncInterval`, `token`, `provider`, `taskProvider`, `jiraUrl`, `jiraEmail`, `jiraApiToken`

## Dashboard Views & Keys

| View | Description | Key bindings |
|------|-------------|-------------|
| `list` | Repo table with status, diff, version, author, age, last commit | j/k/↑↓ g/G c s S e / : P o b q |
| `commits` | DIFF section + LATEST 5 section with commit tables | ↑↓ j/k g/G Enter o s b/Esc q |
| `detail` | Single commit details (hash, author, date, body, file stats) | b/Esc q |
| `config` | Config editor (workspace, base, release, syncInterval, token, provider, taskProvider) | Tab ↑↓ Enter Esc q |
| `prs` | PR list with table, loading, error, empty states | ↑↓ j/k g/G Enter R o b/Esc q |
| `prdetail` | Single PR detail (state, author, branches, date, URL) | R o b/Esc q |
| `review` | Jira task + PR changes review view | j/k ↑↓ pageUp/pageDown o b/Esc q |
