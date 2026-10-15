# Session Viewer — Product Requirements Document (v1)

_Owner: Alfred Emmanuel · Drafted: 2026-10-15 · Status: Draft for review_
_Builds on: [`brief.md`](./brief.md) (problem, personas, prior art)._

---

## 1. Summary

Session Viewer is a free, local tool that turns a Claude Code session into a **picture you can watch, replay, and rearrange**. You run one command, a browser tab opens, and you see your agent's work as connected boxes (what it did, in order, including helper agents) plus a **project map** showing which folders and files it read and changed.

Everything runs on your own machine. Nothing is uploaded.

---

## 2. Decisions made for v1

These were open in the brief. Each has a default chosen here so work can start. **Change any of them before building and the plan will be adjusted.**

| # | Question | v1 decision | Why |
|---|---|---|---|
| D1 | Standalone or inside Agent Atlas? | **Standalone repo**, but the log-reading code lives in its own `core/` folder with no UI dependencies so Atlas can reuse it later | Lets you ship and show it fast; keeps the door open to merge |
| D2 | Where does it run? | **Local web page** started with `npx session-viewer` (opens `http://127.0.0.1:4300`) | One command, no install, works next to any editor or terminal |
| D3 | Default view | **Flow view** (steps in order). Project map is the second tab | Flow answers "what is it doing now", the most frequent question |
| D4 | Release | **Personal use first**; make the repo public and post screenshots once v1 passes the week-1 test (§9) | Fits inbound GTM: the picture is the marketing |
| D5 | Which agents | **Claude Code only** | Real log format verified on 2026-10-15; Codex stores logs in SQLite, which is a separate piece of work |

---

## 3. Problem (short version)

Agents like Claude Code do long, multi-step work, and the only way to follow it is to scroll text. People lose the thread, can't see *where* in the project the agent is working, can't tell helper agents apart, and find reviewing afterwards slow. Full version: brief §2.

## 4. Goal and non-goals

**Goal:** a daily agent user can glance at a second screen and know **what the agent is doing, where in the project, and whether it's on track**, and can replay any past session the same way.

**Non-goals for v1:**
- Controlling the agent (pause, redirect, approve) from the viewer
- Codex, Cursor, or other agents
- Accounts, teams, cloud hosting, share links
- Reading `Bash` commands to guess which files they touched (only file tools count in v1)
- Loop detection and cost dashboards (data is captured; display comes in v1.x)

## 5. Target user

**Primary:** the daily agent driver, someone running Claude Code for hours a day across several projects (Alfred is user zero).
Secondary personas (agency, reviewer, agent builder) are out of scope until v1.x. See brief §3.

---

## 6. How it works (plain English)

1. You run `npx session-viewer`.
2. It finds your Claude Code sessions in `~/.claude/projects/` and lists them, newest first, with their titles.
3. You click one. The viewer reads the session's log file and its helper-agent files.
4. **Flow view:** each step is a box: your messages, the agent's replies, its thinking, and each tool it used. Boxes connect in order. Helper agents branch off the step that started them. Older parts of the conversation are folded into one box per turn so big sessions stay readable. Click a folded box to open it.
5. **Project map view:** each folder the agent touched is a box listing its files, marked "read" or "edited". Busier folders are highlighted more strongly.
6. **Live:** if the session is still running, new boxes appear within about 2 seconds.
7. **Replay:** a slider at the bottom moves through time. Both views show the session as it was at that moment.
8. **Arrange:** drag any box. Your arrangement is saved and comes back next time. A "Reset layout" button restores the automatic layout.
9. **Details:** click any step to see everything about it in a side panel: full text, the exact command or file, the result, errors, and tokens used.

---

## 7. Functional requirements

Each requirement maps to a user story in the brief (US-n). "Must" = needed for v1.

### Reading sessions
| ID | Requirement | Story | Priority |
|---|---|---|---|
| FR-1 | List all Claude Code sessions under `~/.claude/projects/` (path overridable with `--root`), newest first, showing title (if any), project folder, and last-updated time. Cap at the 200 most recent | US-1 | Must |
| FR-2 | Read a session's main log and every helper-agent log in `<session>/subagents/`, and link each helper agent to the exact step that started it (via `toolUseId` in its `.meta.json`) | US-1, US-3 | Must |
| FR-3 | Turn log records into steps: user message, agent text, thinking, tool call (with its result attached), error. Unknown block types become a generic "unknown" step. Unknown record types are ignored | US-1, US-7 | Must |
| FR-4 | Never crash on bad input: skip blank, malformed, or half-written lines (a live session is always mid-write) | US-2 | Must |
| FR-5 | Record tokens per agent reply, counted once per API request (logs repeat usage across records of the same request) | US-9 (data only) | Must |

### Flow view
| ID | Requirement | Story | Priority |
|---|---|---|---|
| FR-6 | Show steps as connected boxes in order, laid out automatically top to bottom | US-1 | Must |
| FR-7 | Group the main conversation into **turns** (each of your messages starts a turn). By default only the last 3 turns are open; others show as one box ("Turn 4 · 23 steps"). Click to open or close | US-1, risk: big sessions | Must |
| FR-8 | Helper agents appear as a branch from the step that started them, labelled with their task description. Click to fold or unfold a helper's branch | US-3 | Must |
| FR-9 | Steps with errors (failed tool results, API errors) are clearly marked in red | US-8 (partial) | Must |
| FR-10 | "Follow latest" toggle: when on, the view moves to each new step as it appears | US-2 | Must |

### Project map view
| ID | Requirement | Story | Priority |
|---|---|---|---|
| FR-11 | Build a map from file tools (`Read`, `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, `NotebookRead`): one box per folder (grouped to 2 levels deep relative to the project folder), listing each file with read and edit counts | US-4 | Must |
| FR-12 | Files outside the project folder are grouped in one "(outside project)" box | US-4 | Must |
| FR-13 | Folder boxes are shaded by how much activity they had (more = stronger) | US-4 | Must |

### Live, replay, arrange, details
| ID | Requirement | Story | Priority |
|---|---|---|---|
| FR-14 | While a session file is changing, push updates to the open page within 2 seconds | US-2 | Must |
| FR-15 | Replay slider across all steps (main + helpers, in time order). Both views show only steps up to the slider position. Sliding to the end returns to live | US-5 | Must |
| FR-16 | Boxes can be dragged in both views. Positions are saved per session and per view in `~/.session-viewer/layouts/` and restored on reopen. "Reset layout" clears them | US-6 | Must |
| FR-17 | Clicking a step opens a details panel: type, time, full text, tool name, full input, full result, error flag, tokens | US-7 | Must |

### Running it
| ID | Requirement | Story | Priority |
|---|---|---|---|
| FR-18 | `npx session-viewer` starts the local server and opens the browser. Flags: `--port` (default 4300), `--root`, `--no-open` | — | Must |

## 8. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 **Private** | Server listens on `127.0.0.1` only. Makes no outbound network calls. Says so in the README |
| NFR-2 **Safe input** | Session IDs in URLs must match the UUID format and exist in the sessions list. No file paths are accepted from the browser |
| NFR-3 **Fast enough** | A 1,000-step session opens in under 2 seconds on a recent laptop. Panning and dragging stay smooth thanks to folded turns |
| NFR-4 **Resilient to format change** | All log-format knowledge lives in one module (`core/parse.ts`). A Claude Code update should break, at worst, one file |
| NFR-5 **Requirements** | Node.js 20 or newer. macOS and Linux. Windows is best-effort |
| NFR-6 **Light and dark** | The UI follows the system light/dark setting |

---

## 9. Success measures

| Measure | Target | How checked |
|---|---|---|
| Week-1 personal test | Alfred keeps it open on a second screen for a full workday and prefers it to the terminal | Self-report after one day |
| Comprehension | Someone who didn't run the session explains what happened in under 2 minutes using only the viewer | Show one friend or client |
| Spotting trouble | In replay, a wrong turn or error is noticed within 30 seconds | Try on 3 real past sessions |
| Arrange is used | Alfred drags or rearranges boxes at least once per day in week 1 | Check `~/.session-viewer/layouts/` |
| Public interest (after D4) | Screenshots shared; stars/installs tracked | GitHub + npm stats |

## 10. Risks

| Risk | Mitigation |
|---|---|
| Claude Code changes its log format (it's undocumented) | One parsing module (NFR-4); tests built from the real record shapes seen 2026-10-15 (Claude Code v2.1.272) |
| Big sessions become spaghetti | Turns folded by default (FR-7); helper branches can be folded (FR-8) |
| Project map looks nice but isn't useful | Test on 5 real sessions before polishing the UI |
| Crowded space (Agent Flow, AgentPlex, zoetrope, ccviz) | Lead with the two differences: project map and arrange/save |
| Logs contain secrets | Local-only (NFR-1); no export in v1 |

## 11. Milestones

| Milestone | What you can do at the end | Covers |
|---|---|---|
| **M1 — Reads logs** | Tested code that turns any real session into steps + helper lanes + project map data | FR-1–5, FR-11–12 |
| **M2 — Serves them** | `npx session-viewer` runs, lists sessions, streams live updates, saves layouts | FR-14, FR-16 (storage), FR-18, NFR-1–2 |
| **M3 — Flow view** | See, fold, follow, and click through a session as a diagram | FR-6–10, FR-17 |
| **M4 — Map, replay, arrange** | Project map, time slider, drag-and-save in both views | FR-13, FR-15, FR-16 (UI) |
| **M5 — Ship to self** | Built package, README, checked against 5 real sessions, week-1 test begins | §9 |

Detailed build steps: [`superpowers/plans/2026-10-15-session-viewer-v1.md`](./superpowers/plans/2026-10-15-session-viewer-v1.md).

## 12. Later (v1.x and beyond)

Loop and "stuck" detection, cost per step and per helper, notes and labelled groups on the canvas, export as image, Codex support, several sessions side by side, a "plan before the run" overlay, and linking from Agent Atlas nodes into sessions.

---

## Appendix A — Claude Code log facts (verified 2026-10-15, v2.1.272)

- Sessions: `~/.claude/projects/<encoded-project-path>/<session-uuid>.jsonl`, one JSON record per line.
- Record `type`s seen: `user`, `assistant`, `attachment`, `system`, `ai-title`, plus housekeeping types (`mode`, `permission-mode`, `agent-name`, `queue-operation`, `file-history-snapshot`, `last-prompt`, …). Only `user`, `assistant`, and `ai-title` matter for v1.
- `assistant.message.content[]` blocks: `text`, `thinking`, `tool_use` (`id`, `name`, `input`). Usage is at `message.usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`); records also carry `requestId`.
- Tool results come back in `user.message.content[]` as `tool_result` blocks (`tool_use_id`, `content`, `is_error`).
- Records carry `uuid`, `parentUuid`, `timestamp`, `cwd`, `isSidechain`. API errors have `isApiErrorMessage: true`.
- Helper agents: `<session-uuid>/subagents/agent-<agentId>.jsonl` (same record format, `isSidechain: true`, `agentId`) plus `agent-<agentId>.meta.json` with `agentType`, `description`, and **`toolUseId`**, the `tool_use.id` of the `Agent` call that started it. `spawnDepth` > 1 means a helper started by a helper.
- File tools: `Read`/`Write`/`Edit` take `file_path` (absolute). `Write` input: `content`, `file_path`.
- The project folder name encodes the path with `-` (lossy). Use the `cwd` field from records instead.
