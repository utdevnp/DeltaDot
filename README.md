<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/utdevnp/DeltaDot/main/assets/banner-dark.png">
  <img alt="DeltaDot" src="https://raw.githubusercontent.com/utdevnp/DeltaDot/main/assets/banner-light.png" width="100%">
</picture>

# DeltaDot

> **Git workspace sync manager — Terminal CLI + Desktop app for macOS**

DeltaDot scans every Git repository in a workspace folder, compares configured base and release branches, and shows commit drift, latest commits, and PR details — all in a beautiful live-updating interface.

## Editions

| | [DeltaDot CLI](deltadot/) | [DeltaDot Desktop](UI/) |
|---|---|---|
| **Interface** | Terminal (Ink / React) | Native macOS app (Electron) |
| **Run** | `npm run dev -- --path ~/workspace` | Click the app or `npm run start` |
| **Install** | `npm install` in `deltadot/` | `npm install` in `UI/` |
| **Packaging** | N/A | `npm run package` → `.dmg` |

## Features

- **Workspace-wide repo discovery** — scans any folder for Git repos
- **Branch sync comparison** — `git log origin/base..origin/release` per repo
- **Live dashboard** — real-time status indicators with animated spinners
- **PR fetching** — GitHub, GitLab, and Bitbucket pull request lists
- **PR detail view** — full PR metadata, comments, file changes, +/− counts
- **AI-powered code review** — PR diff + Jira descriptions sent to OpenAI / Anthropic / Gemini / Ollama / OpenRouter
- **Jira integration** — auto-extracts issue keys from branch names and PR titles
- **Clone repositories** — `⌘N` to clone new repos directly into the workspace
- **Config persistence** — settings saved to `~/.deltadot/config.json`
- **Dark / Light / System theme** — toggle with one click in the TopBar
- **Auto-sync** — background refresh at configurable intervals
- **Cache system** — instant startup, data shown immediately while syncing in background

## Quick Start (Desktop)

```sh
cd UI
npm install
npm run dev      # Development with HMR
npm run start    # Production mode
npm run package  # Build macOS .app + .dmg
```

## Quick Start (CLI)

```sh
cd deltadot
npm install
npm run dev -- --path /path/to/workspace --base main --release R10
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑↓` / `j k` | Navigate repos / commits / PRs |
| `Enter` / `c` | Open commits for selected repo |
| `s` | Sync selected repo |
| `S` | Sync all repos |
| `P` | Open PR list |
| `e` | Open settings |
| `⌘N` / `Ctrl+N` | Clone a new repository |
| `⌘T` | Toggle theme |
| `/` | Search / filter repos |
| `:` | Command mode |
| `o` | Open compare URL in browser |
| `q` | Quit |

## Configuration

Press `e` or type `: config` to open the settings dialog:

| Tab | Fields |
|-----|--------|
| **Workspace** | Path, Base branch, Release branch, Sync interval |
| **Git Provider** | Provider (GitHub/GitLab/Bitbucket), API token |
| **Task / Jira** | Task provider, Jira URL/Email/Token |
| **AI Review** | AI provider, API key, URL, Model, System prompt |

## Tech Stack

### Desktop (`UI/`)
- **Electron** — native macOS window
- **React 19** — UI framework
- **Vite 8** — build tool
- **TypeScript** — type safety
- **electron-builder** — macOS `.app` / `.dmg` packaging

### CLI (`deltadot/`)
- **Ink 7** — React for CLIs
- **Commander** — CLI argument parsing
- **TypeScript** — type safety

### Shared
- All business logic (git operations, API clients, config) uses the **same TypeScript modules** — the CLI and Desktop share the same engine.

## Project Structure

```
DeltaDot/
├── deltadot/          # Terminal CLI (Ink)
│   ├── src/           # CLI source + shared core logic
│   │   ├── components/
│   │   ├── services/
│   │   └── ...
│   └── package.json
├── UI/                # Electron Desktop app
│   ├── electron/      # Main process + preload
│   ├── src/           # React renderer
│   │   ├── components/
│   │   └── styles/
│   ├── core/          # Copied shared logic (symlinked origin)
│   └── package.json
├── assets/            # Screenshots, icons
└── README.md
```

## License

MIT — © Ebpearls
