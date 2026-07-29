'use client';

import { useEffect, useState } from 'react';

/**
 * Re-fetch on the same 3s heartbeat the old dashboard used, so growth shows up
 * as it happens. `null` url means "nothing to ask for yet" — usually no student
 * selected — and keeps the hook order stable while that is true.
 */
export function usePoll<T>(url: string | null, ms = 3000): T | null {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    if (!url) {
      setData(null);
      return;
    }
    let alive = true;
    const pull = async () => {
      try {
        const res = await fetch(url);
        if (alive && res.ok) setData((await res.json()) as T);
      } catch {
        // A missed poll is not worth surfacing; the next one is 3s away.
      }
    };
    void pull();
    const timer = setInterval(() => void pull(), ms);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [url, ms]);

  return data;
}
