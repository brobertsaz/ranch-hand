import { useEffect, useState } from 'react';

// The time now, refreshed every `everyMs`, so a screen that stays open keeps "out today" and its clocks true
// without reading the clock in the middle of a render
export function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
