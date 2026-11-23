import { tabStore } from '../storage';

const ALIVE_SENTINEL_KEY = '@chatic/web.log.alive';

export interface WebCrashSentinelResult {
    crashedLastSession: boolean;
    teardown: () => void;
}

export const attachWebCrashSentinel = (): WebCrashSentinelResult => {
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
