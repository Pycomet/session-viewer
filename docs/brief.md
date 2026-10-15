# Session Viewer — Product Brief (pre-spec)

_Working name: Session Viewer. Drafted 2026-10-15. Status: idea / pre-build. Related: `agent-atlas-v1-spec.md`._

---

## 1. One-liner

**Watch what your AI coding agent is doing as a picture, not a wall of text.** Live or replayed, on a canvas you can drag around and rearrange.

---

## 2. Problem statement

AI coding agents (Claude Code, Codex, and similar) now do long, multi-step work on their own: they read dozens of files, run commands, spawn helper agents, and edit code across a project. Today the only way to follow that work is to **scroll through a terminal transcript or a raw log file**.

That causes four concrete problems:

1. **You lose the thread.** After 20+ steps, it's hard to answer "what is it doing right now, and why?" Text is read one line at a time, while a picture shows the whole shape at once.
2. **You can't see *where* in the project it's working.** Logs list file paths, but don't show that the agent has spent 15 minutes in the payments module when the task was about the login page.
3. **Helper agents are invisible.** When the main agent hands work to subagents, the log interleaves everything. Who did what, in what order, is buried.
4. **Reviewing afterwards is slow.** To check an agent's work (or explain it to a teammate or client), you re-read the whole transcript or just trust the final diff.

**Who feels it most:** people who run agents for long tasks every day and need to trust, steer, or explain the result.

**Cost of not solving it:** wasted time re-reading logs, agents going off-track unnoticed (burning tokens and money), and low trust in agent output, so people either over-supervise or under-check.

---

## 3. Who it's for

| Persona | Situation | What they want |
|---|---|---|
| **Daily agent driver** (primary, e.g. Alfred) | Runs Claude Code for hours a day across several projects | Glance at a screen and know what the agent is doing and whether it's on track |
| **Agency / freelancer** | Uses agents on client work | Show a client a clear visual of what was done, as proof of work, not a log dump |
| **Reviewer / team lead** | Reviews PRs produced with an agent | Understand *how* the agent got to the change: what it read, tried, and threw away |
| **Agent builder** | Builds their own agents/skills/subagents | Debug why an agent took a wrong turn or looped |

v1 targets the **daily agent driver** only. The others are later.

---

## 4. User stories

Format: _As a [who], I want [what], so that [why]._ Each has a plain "done when" check.

### Must-have (v1)

**US-1 — See a session as a picture**
As a daily agent driver, I want to open a past Claude Code session and see it as a diagram of steps, so that I understand what happened without reading the whole log.
- _Done when:_ I pick a session from a list, and see each step (my message, agent reply, tool call, file edit, command) as a node, connected in order.

**US-2 — Watch a session live**
As a daily agent driver, I want the diagram to grow while the agent is working, so that I can follow along from a second screen.
- _Done when:_ new steps appear within ~2 seconds of happening, and the view follows the latest step unless I've scrolled away.

**US-3 — See helper agents separately**
As a daily agent driver, I want each subagent shown in its own lane or group, so that I can tell who did what.
- _Done when:_ subagent work is visually grouped under the step that started it and can be collapsed/expanded.

**US-4 — See where in the project the agent worked**
As a daily agent driver, I want a "project map" view showing files/folders, with the ones the agent touched highlighted, so that I can see if it's working in the right place.
- _Done when:_ folders appear as boxes; files read vs. edited are marked differently; brighter means touched more.

**US-5 — Replay with a slider**
As a daily agent driver, I want to scrub a timeline back and forth, so that I can see the session at any moment.
- _Done when:_ dragging a slider shows the diagram as it was at that step.

**US-6 — Drag and arrange**
As a daily agent driver, I want to drag nodes and groups around and have the layout remembered, so that I can organise the picture the way my brain understands it.
- _Done when:_ I can move nodes and boxes, and the layout is still there when I reopen the session.

**US-7 — Click for details**
As a daily agent driver, I want to click any node to see the full detail (the command run, the file diff, the text), so that the picture never hides information.
- _Done when:_ clicking opens a side panel with the raw content for that step.

### Should-have (v1.x)

- **US-8 — Spot trouble at a glance:** errors, failed commands, and repeated loops are coloured/flagged.
- **US-9 — Cost and time:** each step shows time taken and tokens used; expensive steps stand out.
- **US-10 — Notes and grouping:** I can draw a box around steps and label it ("tried approach A, abandoned").
- **US-11 — Share:** export a session as an image or a read-only link to send to a client or teammate.

### Later

- **US-12 — Codex and other agents** (same view, different log format).
- **US-13 — Multiple sessions side by side** (several agents running at once).
- **US-14 — Plan before the run:** sketch the intended architecture/plan on the canvas, then see the agent's actual path drawn over it.
- **US-15 — Link to Agent Atlas:** click a skill/agent on the Atlas map and see the sessions where it was used.

---

## 5. Scope for v1

**In:**
- Claude Code only
- Runs locally on your machine (reads `~/.claude/projects/**/*.jsonl`); nothing uploaded
- Two views: **Timeline/flow view** (steps in order) and **Project map view** (where it worked)
- Live updates + replay slider
- Drag, arrange, and saved layouts
- Click-for-details side panel

**Out (for now):**
- Codex / Cursor / other agents
- Controlling the agent from the canvas (pause, redirect): view-only in v1
- Teams, accounts, cloud hosting
- Sharing links (images only, if anything)

---

## 6. What makes it different (vs. existing tools)

| Tool | What it does | What it lacks |
|---|---|---|
| Agent Flow (VS Code ext.) | Live graph of Claude Code + Codex steps | Lives inside VS Code; no project map; no saved arrangement |
| AgentPlex | Drag-and-drop canvas of many sessions | Manages sessions; doesn't show *inside* one in depth |
| zoetrope | Replay a session, terminal/browser | View-only, no arranging, no project map |
| ccviz | Per-message graph of tool calls | Claude-only, no project map, no arranging |

**Our angle, in one line:** the only viewer that shows **where in your project** the agent worked (project map), and lets you **arrange the picture yourself** (drag, group, label, saved).

_Prior-art check was a quick search on 2026-10-15. A deeper check is needed before committing (see Open questions)._

---

## 7. How we'll know it works (success measures)

- **Personal test (week 1):** Alfred keeps it open on a second screen for a full workday and prefers it over reading the terminal.
- **Comprehension test:** someone who didn't run the session can explain what the agent did in under 2 minutes using only the viewer.
- **Trouble-spotting:** in replay, a wrong turn or loop is noticeable within 30 seconds.
- **Adoption (if released):** GitHub stars / installs, and people posting screenshots (same "shareable picture" appetite as Atlas).

---

## 8. Assumptions and risks

| Assumption / risk | Why it matters | How to check / reduce |
|---|---|---|
| Claude Code's log format stays stable enough | It's not a public, documented format; it can change | Isolate parsing in one small module; also support hooks as a second source |
| Big sessions stay readable | 500+ steps becomes spaghetti | Collapse by default (group by user message / subagent); zoom levels |
| "Project map" is genuinely useful, not just pretty | It's the main differentiator | Test on 5 real sessions before building polish |
| People want to *arrange*, not just view | Drag-and-drop is the other differentiator | Watch whether Alfred actually drags things in week 1 |
| Crowded space | Four similar tools already exist | Lead with project map + arrange; consider folding into Agent Atlas instead |
| Privacy | Logs contain code and secrets | Local-only, no network, say so loudly |

---

## 9. Open questions (decisions for Alfred)

1. **Standalone or inside Agent Atlas?** Earlier recommendation was to make it an Atlas feature. This brief works for either.
2. **Where does it run?** Local web page opened by an `npx` command (simplest), desktop app, or VS Code panel?
3. **Which view leads?** Step-by-step flow or project map as the default screen?
4. **Release plan:** personal tool first, or build in public as a showcase (fits inbound GTM)?
5. **Deeper prior-art check:** worth a proper research pass on Agent Flow and AgentPlex feature lists before building?

---

## 10. Suggested next steps

1. Answer the open questions above (especially #1 and #2).
2. Quick spike (half a day): parse one real session file and dump steps + touched files, to confirm the data is all there.
3. Paper sketch / clickable mockup of the two views.
4. Then write the full v1 spec (architecture, milestones) in the same style as `agent-atlas-v1-spec.md`.
