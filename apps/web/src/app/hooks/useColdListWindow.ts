import { useEffect, useState } from 'react';

export const COLD_LIST_WINDOW_MS = 15_000;

export const useColdListWindowElapsed = (scopeKey: string, windowMs: number = COLD_LIST_WINDOW_MS): boolean => {
    const [hasElapsed, setHasElapsed] = useState(false);

    useEffect(() => {
        setHasElapsed(false);
        const timer = setTimeout(() => setHasElapsed(true), windowMs);
        return () => clearTimeout(timer);
    }, [scopeKey, windowMs]);

    return hasElapsed;
};
