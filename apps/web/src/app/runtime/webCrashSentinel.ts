import { tabStore } from '../storage';

const ALIVE_SENTINEL_KEY = '@chatic/web.log.alive';

export interface WebCrashSentinelResult {
    /**
     * True when the previous session in this tab ended WITHOUT a clean
     * pagehide — the page crashed, hung, or was killed (ADR-0097 S7).
     */
    crashedLastSession: boolean;
    /** Detaches the sentinel lifecycle (tests). */
    teardown: () => void;
}

/**
 * Boots the page-crash sentinel: reads the previous session's fate, then keeps
 * a liveness mark for this one.
 *
 * The sentinel is set while this session is alive and in the foreground; a
 * session that dies with it still set is read as a crash on next boot.
 *
 * `pagehide` alone is not enough: a backgrounded tab discarded by the OS
 * (common on mobile) never fires it, and the next visit would report a false
 * page-crash. Since false crash reports are exactly the noise ADR-0029 set out
 * to remove, the sentinel is also cleared whenever the page goes hidden and
 * re-armed when it comes back. The trade-off is deliberate: a crash that
 * happens while hidden goes unreported, which costs far less than eroding trust
 * in the signal.
 */
export const attachWebCrashSentinel = (): WebCrashSentinelResult => {
    // The tab store: the sentinel is about this tab's previous load. It is tolerant, so a storage
    // that is unavailable reads as "no mark" — memory-only, and never a reported crash.
    const crashedLastSession = tabStore.get(ALIVE_SENTINEL_KEY) === '1';

    const setAlive = (): void => tabStore.set(ALIVE_SENTINEL_KEY, '1');
    const clearAlive = (): void => tabStore.remove(ALIVE_SENTINEL_KEY);
    const onVisibilityChange = (): void => {
        if (document.visibilityState === 'hidden') clearAlive();
        else setAlive();
    };

    setAlive();
    window.addEventListener('pagehide', clearAlive);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return {
        crashedLastSession,
        teardown: () => {
            window.removeEventListener('pagehide', clearAlive);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            clearAlive();
        },
    };
};
