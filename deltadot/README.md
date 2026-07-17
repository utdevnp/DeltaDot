# DeltaDot

DeltaDot is a terminal UI for checking whether local Git repositories inside a workspace are in sync with their upstream remotes.

It scans every Git repo in a folder, compares the configured `base` and `release` branches, and shows commit drift, latest commits, and pull request details in a live-updating Ink dashboard.

## Features

- Workspace-wide repo discovery
- Branch sync comparison with `git log origin/<base>..origin/<release>`
- Live terminal dashboard built with Ink
- PR list and PR detail views
- GitHub, GitLab, and Bitbucket PR fetching
- Jira task review screen with `Shift+R`
- Cache support for fast startup and background refresh

## Install

```sh
npm install
```

## Run

Development mode:

```sh
npm run dev -- --path /path/to/workspace --base main --release R10
```

With auto sync interval:

```sh
npm run dev -- --path /path/to/workspace --base main --release R10 --sync-interval 15
```

Build and run:

```sh
npm run build
npm start
```

## CLI Options

- `--path <dir>` - workspace directory containing Git repositories
- `--base <branch>` - base branch to compare against
- `--release <branch>` - release branch to inspect
- `--sync-interval <minutes>` - auto-sync interval in minutes
- `--token <token>` - API token for PR fetching
- `--provider <type>` - `github`, `gitlab`, or `bitbucket`

## Task Provider Config

Global config also supports a single active task provider for reviews.

Jira Cloud fields:
- `taskProvider`: `jira`
- `jiraUrl`
- `jiraEmail`
- `jiraApiToken`

## Keyboard Shortcuts

### List view

- `j` / `k` or arrow keys - navigate repos
- `Enter` or `c` - open commits view
- `s` - sync selected repo
- `S` - sync all repos
- `P` - open PR list
- `o` - open compare URL
- `b` - toggle branch column
- `q` - quit

### PR view

- `j` / `k` or arrow keys - navigate PRs
- `Enter` - open PR detail
- `S` - sync all repos and refresh PRs
- `o` - open PR in browser
- `b` / `Esc` - back to list

### PR detail

- `j` / `k` - scroll description
- `b` / `Esc` - back to PR list

## Cache

- Cache file: `<workspace>/.deltadot-cache.json`
- Global config: `~/.deltadot/config.json`

## Notes

- DeltaDot is ESM-only.
- Build output is written to `dist/`.
- The committed `bin/deltadot.js` shim works after building.
