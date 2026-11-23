import { useEffect } from 'react';

export const loadChannelRoutes = () => import('../features/channels');

const PRELOAD_FALLBACK_DELAY_MS = 2_000;

export const usePreloadOnIdle = (load: () => Promise<unknown>): void => {
    useEffect(() => {
        const preload = () => void load().catch(() => undefined);
        if (typeof requestIdleCallback === 'function') {
            const id = requestIdleCallback(preload, { timeout: PRELOAD_FALLBACK_DELAY_MS });
            return () => cancelIdleCallback(id);
        }
        const id = setTimeout(preload, PRELOAD_FALLBACK_DELAY_MS);
        return () => clearTimeout(id);
    }, [load]);
};
