import { useCallback, useEffect, useRef, useState } from 'react';
import type { Positions } from '../core/model';
import { fetchLayout, saveLayout, type View } from './api';

export function useSavedLayout(sessionId: string | null, view: View) {
  const [saved, setSaved] = useState<Positions>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setSaved({});
    if (sessionId) fetchLayout(sessionId, view).then(setSaved).catch(() => setSaved({}));
  }, [sessionId, view]);

  const persist = useCallback(
    (next: Positions) => {
      clearTimeout(timer.current);
      if (sessionId) timer.current = setTimeout(() => void saveLayout(sessionId, view, next), 400);
    },
    [sessionId, view],
  );

  const savePosition = useCallback(
    (nodeId: string, pos: { x: number; y: number }) =>
      setSaved((prev) => {
        const next = { ...prev, [nodeId]: pos };
        persist(next);
        return next;
      }),
    [persist],
  );

  const reset = useCallback(() => {
    setSaved({});
    persist({});
  }, [persist]);

  return { saved, savePosition, reset };
}
