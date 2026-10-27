import { useEffect, useState } from 'react';

/** The current time, re-read every `intervalMs` while `active` — for a code's countdown. */
export const useNow = (active: boolean, intervalMs = 1000): number => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) return undefined;
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [active, intervalMs]);
    return now;
};
