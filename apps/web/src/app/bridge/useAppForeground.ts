import { useCallback, useEffect, useRef } from 'react';

import { useOnBackgroundStatusChanged } from './useHandleAppMessage';

// One physical resume can surface as both the native message and a visibilitychange;
// collapse signals landing within this window into a single handler call.
const FOREGROUND_DEDUP_MS = 1_000;

/**
 * Unified "app returned to foreground" signal. Merges the two sources this codebase has:
 *  - Native shell: `OnBackgroundStatusChanged` with `isForeground === true` — the reliable
 *    signal inside the WebView, where timers/JS may have been suspended.
 *  - Web fallback: `visibilitychange` → 'visible' — covers plain-browser sessions where the
 *    native message never arrives.
 *
 * Consumers react to foreground (list refresh, chat catch-up, overlay dismiss) without
 * knowing which source fired. The handler is kept in a ref so subscriptions stay stable
 * while callers pass fresh closures every render.
 */
export const useAppForeground = (handler: () => void): void => {
    const handlerRef = useRef(handler);
    useEffect(() => {
        handlerRef.current = handler;
    }, [handler]);

    const lastFiredAtRef = useRef(0);
    const fire = useCallback(() => {
        const now = Date.now();
        if (now - lastFiredAtRef.current < FOREGROUND_DEDUP_MS) return;
        lastFiredAtRef.current = now;
        handlerRef.current();
    }, []);

    useOnBackgroundStatusChanged(message => {
        if (message.data.isForeground) fire();
    });

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') fire();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [fire]);
};
