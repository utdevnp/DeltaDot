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
npm run package   # Build macOS .app + .dmg (universal: runs on any Mac)
```

## macOS Distribution (unsigned DMG)

DeltaDot is not yet code-signed/notarized (requires an Apple Developer account). The build **automatically ad-hoc re-signs** the app bundle (`build/afterPack.cjs`) so other Macs show the standard *"unidentified developer"* prompt instead of *"is damaged and can't be opened"*.

**Workaround for other Macs** — one of:
- Right-click the app → **Open** → confirm once, or
- `xattr -dr com.apple.quarantine /Applications/DeltaDot.app`

## macOS file-permission prompts ("DeltaDot would like to access…")

DeltaDot scans your workspace and runs `git` against every repository. If the workspace is under a TCC-protected location (`~/Documents`, `~/Desktop`, `~/Downloads`, or a network/removable volume), macOS asks for access — and because the app is **ad-hoc signed** (no stable identity), macOS can't remember the answer and keeps re-prompting, which looks like "asks for every repo".

Three ways to fix it:

**A. Full Disk Access (one-time, no rebuild — simplest)**
System Settings → Privacy & Security → **Full Disk Access** → add `DeltaDot` (enable the toggle). It stops prompting for every folder entirely.

**B. Stable code-signing identity (durable, prompts persist)**
Give the app a stable identity so macOS remembers "Allow" per location:
1. Keychain Access → Certificate Assistant → **Create a Certificate** → Name: `DeltaDot Signing`, Identity Type: **Self Signed Root**, Certificate Type: **Code Signing** → Create.
2. Rebuild, telling the packager to use it:
   ```sh
   DELTADOT_SIGNING_IDENTITY="DeltaDot Signing" npm run package
   ```
   (Without this, `build/afterPack.cjs` falls back to ad-hoc signing, which is what causes the re-prompting.)
3. Reinstall on the other Mac — it now asks **once per protected folder** and remembers.

**C. Move the workspace out of a protected folder**
Put the workspace somewhere macOS doesn't protect (e.g. `~/workspace` or `/Users/Shared`), and local repos stop prompting altogether.

When you get an Apple Developer account, replace B with a real Developer ID certificate + notarization (see below) for the best behavior.

**Building the DMG**: `npm run package` produces a universal DMG (`DeltaDot-1.0.0-universal.dmg`, runs on Intel + Apple Silicon). If the DMG step fails with `Operation not permitted: '/Volumes/DeltaDot/.VolumeIcon.icns'`, the terminal lacks macOS Full Disk Access — grant it (System Settings → Privacy & Security → Full Disk Access) or run `npm run package` from a normal GUI Terminal. The universal ZIP (`DeltaDot-1.0.0-universal-mac.zip`) is produced either way.

**Signing + notarization (when you have an Apple Developer account):**
1. Add a Developer ID Application certificate to the Keychain (identity is auto-detected by electron-builder).
2. Add notarization to `build.mac` in `package.json`:
   ```json
   "notarize": true
   ```
3. Export credentials (Apple ID flow):
   ```sh
   export APPLE_ID="you@example.com"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
   export APPLE_TEAM_ID="XXXXXXXXXX"
   ```
   or use an App Store Connect API key (`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`).
4. `npm run package` → produces a fully signed, notarized universal DMG that opens cleanly on any Mac.

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
