# Deploying Session Viewer

Session Viewer reads Claude Code logs from the machine it runs on (`~/.claude/projects`), so **there is no website or server to host**. "Deploying" means one or more of:

1. **Pushing the code to GitHub**: backup, history, pull requests.
2. **Running it from your own copy**: for daily personal use.
3. **Publishing to npm**: so anyone can run `npx session-viewer` without cloning anything.

Requirements everywhere: **Node.js 20 or newer**, on macOS or Linux (Windows is best-effort).

---

## 1. Push to GitHub

### First time (create the repo)
Run from the main checkout. This creates a **private** repo called `session-viewer` under your GitHub account, then pushes both branches:

```bash
cd ~/Documents/session-viewer
gh repo create session-viewer --private --source=. --remote=origin
git push -u origin main worktree-v1-build
```

Needs the GitHub CLI signed in (`gh auth status`; if not, run `gh auth login`).

### Every time after
```bash
git push            # from whichever branch or worktree you're on
```

### Open a pull request for the v1 work
```bash
gh pr create --base main --head worktree-v1-build --title "Session Viewer v1 + first-run quest" --fill
```

### Making it public later
When you're ready to share it (PRD decision D4: public after the week-1 personal test):
```bash
gh repo edit --visibility public --accept-visibility-change-consequences
```
Before flipping it public, double-check that no real session logs (`*.jsonl`) were ever committed (`.gitignore` blocks them, but check):
```bash
git log --all --name-only --format= | grep -i '\.jsonl$' || echo "clean"
```

---

## 2. Run it from your own copy (personal use)

```bash
cd ~/Documents/session-viewer          # or the worktree, until v1 is merged
npm install
npm run build
node dist/cli.js                       # opens http://127.0.0.1:4300
```

Options: `--port 4300`, `--root <path to Claude projects>`, `--no-open`.

### Make `session-viewer` a command on your machine
```bash
npm link                               # once, from the repo folder
session-viewer                         # now works from any terminal
npm unlink -g session-viewer           # to remove it
```
After pulling new changes, run `npm run build` again; the linked command uses the fresh build automatically.

---

## 3. Publish to npm (so `npx session-viewer` works for anyone)

### One-time setup
1. Create an account at npmjs.com and turn on two-factor authentication.
2. Sign in from the terminal: `npm login`
3. **Check the name is free:** `npm view session-viewer`
   - If it prints "404 Not Found", the name is free.
   - If it's taken, use a scoped name: change `"name"` in `package.json` to `@<your-npm-username>/session-viewer`. People then run `npx @<your-npm-username>/session-viewer`.
4. Fill in the package details in `package.json` that npm shows on the package page:
   ```json
   "license": "MIT",
   "repository": { "type": "git", "url": "https://github.com/<your-github-username>/session-viewer" },
   "keywords": ["claude", "claude-code", "ai-agents", "visualization", "devtools"]
   ```
   Add a matching `LICENSE` file if you choose MIT (or pick another licence).

### Every release
```bash
git checkout main && git pull           # release from main, after the PR is merged
npm version patch                       # 0.1.0 → 0.1.1 (use minor for features, major for breaking changes)
npm publish --dry-run                   # shows exactly which files will be uploaded; should be dist/, README.md, package.json
npm publish                             # add --access public if the name is scoped (@you/...)
git push --follow-tags                  # pushes the version commit and its tag
```

`npm publish` automatically runs the `prepublishOnly` script first (`npm test && npm run build`), so a release with failing tests or a stale build can't go out.

### Check the release works
On a clean terminal (ideally another machine):
```bash
npx session-viewer@latest --no-open --port 4310
curl -s 127.0.0.1:4310/api/sessions | head -c 200
```
You should see your sessions as JSON. Then open `http://127.0.0.1:4310` and the first-run tour should start.

### If a release is broken
```bash
npm deprecate session-viewer@<bad-version> "Broken release, please use <good-version>"
```
Then fix, `npm version patch`, and publish again. (npm only allows unpublishing within 72 hours, and it's discouraged; deprecating is the normal route.)

---

## Release checklist

Before every push to `main` or every npm release:

- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` is clean
- [ ] `npm run build` succeeds
- [ ] `node dist/cli.js` opens and shows your sessions
- [ ] The tour runs on a fresh browser (open a private window, or run `localStorage.removeItem('sv.quest.v1')` in the browser console)
- [ ] The server only listens locally: `lsof -nP -iTCP:4300 -sTCP:LISTEN` shows `127.0.0.1:4300`, not `*:4300`
- [ ] No real session logs are committed (see "Making it public later")
- [ ] The README describes anything new
