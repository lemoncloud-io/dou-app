import { useEffect, useState } from 'react';

/**
 * The wall clock in milliseconds, re-read every `intervalMs` while `active` — what a countdown to an
 * instant from the port ticks on. Not the mock's day (`useToday`): code lifetimes are real minutes.
 */
export const useNow = (active: boolean, intervalMs = 1000): number => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) return;
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(timer);
    }, [active, intervalMs]);
    return now;
};
