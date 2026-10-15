# Session Viewer

See your Claude Code sessions as a picture: live, replayable, and arrangeable.

    npx session-viewer

- **Flow view:** every step in order, with helper agents branching off and older turns folded.
- **Project map:** which folders and files the agent read or edited, shaded by activity.
- **Live:** new steps appear within ~2 seconds.
- **Replay:** drag the slider to see the session at any moment.
- **Arrange:** drag boxes; your layout is saved per session.

**First time?** The viewer opens a short demo and a 2-minute quest that walks you through every feature. Press **?** in the sidebar to take it again.

## Private by design
Runs only on `127.0.0.1`, reads `~/.claude/projects` on your machine, and makes no network calls. Layouts are saved to `~/.session-viewer/layouts`.

## Options
`--port 4300` · `--root <path to Claude projects>` · `--no-open`

## Known limits (v1)
Claude Code only. Files touched via shell commands (`Bash`) aren't shown on the project map. Claude Code's log format is undocumented and may change.

## Deploy
Pushing to GitHub, running your own copy, and publishing to npm: see [docs/DEPLOY.md](docs/DEPLOY.md).

## Develop
    npm install
    npm run dev:server   # API on :4300
    npm run dev:web      # UI on :5173
    npm test
