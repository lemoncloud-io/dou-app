import { useEffect, useState } from 'react';

/**
 * Re-renders the caller on a fixed interval so relative timestamps ("5m", "now")
 * stay current without a per-item timer. Returns the current epoch ms.
 */
export const useNow = (intervalMs = 60_000): number => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
};
