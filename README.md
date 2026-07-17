<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/utdevnp/DeltaDot/main/assets/banner-dark.png">
  <img alt="DeltaDot" src="https://raw.githubusercontent.com/utdevnp/DeltaDot/main/assets/banner-light.png" width="100%">
</picture>

# DeltaDot

> **Git workspace sync manager for macOS**

DeltaDot scans every Git repository in a workspace folder, compares configured base and release branches, and shows commit drift, latest commits, and PR details — all in a beautiful native Electron app.

## Features

- **Workspace-wide repo discovery** — scans any folder for Git repos
- **Branch sync comparison** — `git log origin/base..origin/release` per repo
- **Live dashboard** — real-time status indicators with animated spinners
- **PR fetching** — GitHub, GitLab, and Bitbucket pull request lists
- **PR detail view** — full PR metadata, comments, file changes, +/- counts
- **AI-powered code review** — PR diff + Jira descriptions sent to OpenAI / Anthropic / Gemini / Ollama / OpenRouter
- **Jira integration** — auto-extracts issue keys from branch names and PR titles
- **Clone repositories** — `⌘N` to clone new repos directly into the workspace
- **Config persistence** — settings saved to `~/.deltadot/config.json`
- **Dark / Light / System theme** — toggle with one click in the TopBar
- **Auto-sync** — background refresh at configurable intervals
- **Cache system** — instant startup, data shown immediately while syncing in background
- **Keyboard-driven** — full k9s-style navigation

## Install

```sh
npm install
```

## Run

```sh
npm run dev       # Development with HMR
npm run start     # Production mode
npm run package   # Build macOS .app + .dmg
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

- **Electron** — native macOS window
- **React 19** — UI framework
- **Vite 8** — build tool
- **TypeScript** — type safety
- **electron-builder** — macOS `.app` / `.dmg` packaging

## Project Structure

```
DeltaDot/
├── electron/          # Main process + IPC handlers + preload
├── src/               # React renderer
│   ├── components/    # All UI components
│   └── styles/        # CSS theme
├── core/              # Shared business logic
│   └── services/      # Git, PR providers, AI, Jira clients
├── package.json
└── README.md
```

## License

MIT
