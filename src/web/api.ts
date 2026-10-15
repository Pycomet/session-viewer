import type { Positions, Session, SessionSummary } from '../core/model';

export type View = 'flow' | 'map';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const fetchSessions = () => fetch('/api/sessions').then((r) => json<SessionSummary[]>(r));

export function subscribeSession(id: string, onSession: (s: Session) => void): () => void {
  const es = new EventSource(`/api/sessions/${id}/stream`);
  es.addEventListener('session', (e) => onSession(JSON.parse((e as MessageEvent).data)));
  return () => es.close();
}

export const fetchLayout = (id: string, view: View) => fetch(`/api/layouts/${id}/${view}`).then((r) => json<Positions>(r));

export async function saveLayout(id: string, view: View, positions: Positions): Promise<void> {
  await fetch(`/api/layouts/${id}/${view}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(positions) });
}
