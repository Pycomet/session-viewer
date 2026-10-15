# First-Run Quest — Design

_Date: 2026-10-15 · Status: for review · Builds on: [`../../PRD.md`](../../PRD.md) (v1, built)_

## 1. Goal

A first-time user learns every main feature of Session Viewer in about **2 minutes**, by doing rather than reading, in a way that feels light and a little rewarding. The trickiest idea, that a session can be **live**, is shown before they're asked to do anything.

**Agreed with Alfred (2026-10-15):**
- The purpose is to teach first-timers, not to entertain while watching.
- It runs on a **built-in demo session**, so it always works, even for someone with no sessions yet.
- The tone is **light and clean**: a checklist, a progress bar, a pulse on what to try next, a "You're ready" finish. No XP, sounds or confetti.
- **Approach A:** a quest card built into the app (no tour library, no separate page).

**Success looks like:** a new user who has never seen the tool completes the quest without help, then opens one of their own sessions.

## 2. What the user experiences

1. **First open:** the viewer opens the **demo session** ("Demo: add due dates to a todo app") instead of an empty screen. The quest card appears in the bottom-right.
2. **It plays like a live session:** steps appear one by one over about 15 seconds, with the view following the newest step and the replay bar reading "Playing demo…". The card says: *"This is what watching Claude live looks like. Steps appear as they happen."*
3. **Then the checklist takes over.** The next item to try is highlighted on the card, and the matching thing on screen gently pulses. Items can be done in **any order**, and each one ticks with a small animation as it happens.
4. **Finish:** when all items are ticked, the card shows *"You're ready"* with a button, **"Open one of my sessions"**, which closes the card and highlights the session list.
5. **Skip any time:** "Skip tour" closes the card for good. A **"?" button** in the sidebar header restarts the tour.
6. The demo stays pinned at the top of the session list as **"▶ Demo: take the tour"**.

### The quest items (8)

The 7 items agreed in chat, with the last one split in two so each part ticks on its own:

| # | Item (card text) | Ticks when | Pulses on |
|---|---|---|---|
| 1 | Watch Claude work | Demo playback reaches the end (or the user presses "Back to live") | Replay bar |
| 2 | Click a step to see what Claude did | Any step's details panel opens | First visible step box |
| 3 | Open a folded turn | A folded "Turn N · X steps" box is opened | First folded turn box |
| 4 | Open a helper agent | A folded helper box is opened | First folded helper box |
| 5 | Find the error | A step with an error is clicked | First red step box (once its turn is open) |
| 6 | See where Claude worked | Switch to the Project map tab | "Project map" button |
| 7 | Rewind time | The replay slider is moved by the user | Replay slider |
| 8 | Arrange it your way | Any box is dragged (either view) | Whichever view is showing |

Hints are one short sentence each, e.g. item 5: *"Red boxes are steps that failed. Click one to see why."*

## 3. How it's built

All new code is in the web app; the server is unchanged.

| Unit | File | Job |
|---|---|---|
| Demo session | `src/core/demo.ts` | `DEMO_ID` (a fixed valid UUID) and `demoSession(): Session`, a hand-written, made-up session. It contains 4 turns (so one starts folded), a linked helper agent with 3 steps, one failed `npm test` step, and file reads and edits across `src/` and `tests/`, with increasing timestamps. No Node imports, so the browser can use it. |
| Quest rules | `src/web/quest/quest.ts` | Pure logic. `QUEST_ITEMS` (id, title, hint, pulse target), `QuestEvent` union, `questReducer(state, event)`, `nextItem(state)`, `isComplete(state)`. |
| Quest memory | `src/web/quest/storage.ts` | `loadQuest()` / `saveQuest(state)` in `localStorage` (key `sv.quest.v1`), wrapped in try/catch. Missing, corrupt or blocked storage falls back to a fresh in-memory state. |
| Demo playback | `src/web/quest/playback.ts` | Pure `playbackCursor(elapsedMs, totalSteps, durationMs)` → the replay cursor to show, or `null` when finished. |
| Quest card | `src/web/components/QuestCard.tsx` | The checklist card: title, "N of 8" with a progress bar, items with ticks, the current item's hint, "Skip tour", and the finish state. |
| Wiring | `App.tsx`, `FlowView.tsx`, `MapView.tsx`, `ReplayBar.tsx`, `SessionList.tsx`, `StepNode.tsx`, `styles.css` | Emit quest events from existing handlers. Show the pinned demo item and the "?" button. Add a `pulse` flag on the one node or button matching the next item. Add CSS for the pulse and tick (turned off under `prefers-reduced-motion`). |

**State shape:** `{ started: boolean; done: QuestItemId[]; dismissed: boolean }`. "Finished" is derived (all items done).

**Events** (emitted only from real user actions, never from playback):
`playback-done`, `step-selected`, `turn-opened`, `lane-opened`, `error-selected`, `view-map`, `replay-moved`, `node-dragged`.
Events count on any session, not just the demo, so a user who explores their own session first still gets credit.

**Data flow:** App loads quest state → on first run (`started === false`) it selects `DEMO_ID`, sets `started`, and runs playback by driving the existing replay `cursor` from a timer. When `activeId === DEMO_ID`, the session comes from `demoSession()` instead of the server stream. User actions → `questReducer` → saved → card re-renders. `nextItem` decides which on-screen element gets `pulse`.

**Demo layout saving:** dragging boxes in the demo saves a layout under `DEMO_ID` through the existing layouts API, so it behaves exactly like a real session.

## 4. Edge cases

- **The user acts during playback:** moving the slider stops playback and counts as "Rewind time"; "Back to live" ends playback and ticks "Watch Claude work". Clicking a step during playback works normally.
- **The user opens their own session mid-quest:** playback stops; the card stays and keeps counting.
- **Storage blocked** (private window): the quest works for the visit and restarts next time.
- **Reduced motion:** no pulse or tick animation; the highlight is a static outline.
- **Reopening via "?":** resets `done` and `dismissed`, then reopens the demo with playback.

## 5. Testing

Unit tests (Vitest, same style as the existing ones):
- `demoSession()`: has at least 4 turns; with the default view exactly one turn is folded; its helper lane is linked to an `Agent` step; contains an error step; its project map has at least 2 folders with both reads and edits; timestamps strictly increase in time order.
- `questReducer`: each event ticks its item; duplicate events are harmless; events after dismiss are still recorded; reset clears state.
- `nextItem`: returns the first undone item in table order, or `null` when complete.
- `playbackCursor`: 0 at start, grows evenly, `null` at or after the duration, safe when there are 0 steps.
- `storage`: round-trips state; corrupt JSON and a throwing `localStorage` both give a fresh state.

Browser check: first open shows the demo playing, all 8 items tick, the finish button works, "?" restarts, and both light and dark themes look right.

## 6. Out of scope

XP, levels, badges, sounds and confetti (tone decision). A second quest on the user's own sessions. Animating real live sessions differently. Any server change.
