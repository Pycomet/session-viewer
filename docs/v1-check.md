# v1 check against real sessions (2026-10-15)

Production build (`node dist/cli.js`) against `~/.claude/projects` (41 sessions, Claude Code 2.1.x).

## Whole-library load
All **41/41** sessions load through the API without error, each in under 80 ms. The largest log (46 MB) returns in 0.16 s, so NFR-3 (under 2 s) is met with a wide margin. The server listens on `127.0.0.1` only (NFR-1).

## Five representative sessions

| Kind | Session | Steps | Helpers (linked) | Errors | Result |
|---|---|---|---|---|---|
| Long build | local dev setup commands | 1,160 | 4 (4) | 11 | Loads in 62 ms |
| Heavy helper use | software cost estimator wizard | 1,122 | 19 (19) | 17 | Full browser check: flow, helper branch, details, map, replay, drag-and-save all OK |
| With errors, no helpers | sandbox unreachable z-index | 107 | 0 | 7 | Loads, error steps flagged |
| Still running | visual agent session mapper (this build session) | 334 | 0 | 7 | Live stream pushed a fresh update while the log grew |
| Empty | 57f94949 | 0 | 0 | 0 | Loads; flow view is empty and the map shows "No files read or edited yet." |

## Found and fixed
- **Helper agents started by skills** (e.g. `/code-review`) have no `toolUseId`, so they can't link to a parent step. 5 of 98 helpers across the library were affected. They were loaded but never drawn. Now shown as standalone branches.
- **Dev-only blank page:** the Vite proxy prefix `/api` also captured the `/api.ts` module. Changed to `/api/`.

## Cosmetic, for v1.x
- React Flow's zoom controls and minimap stay light-themed in dark mode.
- An empty session (0 steps) shows a blank canvas with no message in the Flow tab.
- On the project map, files with the same name in different subfolders (e.g. two `page.tsx`) show only the file name; the full path is in the hover tooltip.
