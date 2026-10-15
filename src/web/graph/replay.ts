import type { Session, Step } from '../../core/model';

export function timelineOf(session: Session): Step[] {
  const keyed: { step: Step; t: number; lane: number; i: number }[] = [];
  session.lanes.forEach((lane, laneIdx) => {
    let last = 0;
    lane.steps.forEach((step, i) => {
      const parsed = step.timestamp ? Date.parse(step.timestamp) : NaN;
      if (!Number.isNaN(parsed)) last = parsed;
      keyed.push({ step, t: last, lane: laneIdx, i });
    });
  });
  keyed.sort((a, b) => a.t - b.t || a.lane - b.lane || a.i - b.i);
  return keyed.map((k) => k.step);
}

export function visibleUpTo(timeline: Step[], cursor: number): Set<string> {
  return new Set(timeline.slice(0, Math.max(0, cursor)).map((s) => s.id));
}
