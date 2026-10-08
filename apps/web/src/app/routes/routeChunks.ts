import { useEffect } from 'react';

/**
 * The channels feature's chunk. The room route loads it lazily and the private shell preloads it, so
 * the two share one import specifier and the one module the browser fetches.
 */
export const loadChannelRoutes = () => import('../features/channels');

/**
 * How long after mount to preload when the browser has no idle callback. The iOS WKWebView has none,
 * so on iOS this delay is what the app actually uses.
 */
const PRELOAD_FALLBACK_DELAY_MS = 2_000;

/**
 * Runs `load` once the shell has settled, to fetch a chunk the next screen will need before the user
 * asks for it. The private shell uses it for the room screen: without it, the first room opened in a
 * session waited for that chunk over the network before it could mount, which was the slowest room
 * open measured (about a second).
 *
 * It waits for idle rather than running at mount, so it does not compete with the boot work that ends
 * at the first screen. A failure is left for the route itself to meet and report when it loads.
 */
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
