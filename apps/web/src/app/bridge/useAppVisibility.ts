import { useCallback, useEffect, useRef } from 'react';

import { useOnBackgroundStatusChanged } from './useHandleAppMessage';

// One physical transition can surface as both the native message and a visibilitychange;
// collapse same-direction signals landing within this window into a single handler call.
const VISIBILITY_DEDUP_MS = 1_000;

/**
 * Unified app visibility signal — the single place both foreground/background sources merge:
 *  - Native shell: `OnBackgroundStatusChanged` (`isForeground` true/false) — the reliable
 *    signal inside the WebView, where timers/JS may have been suspended.
 *  - Web fallback: `visibilitychange` → 'visible'/'hidden' — covers plain-browser sessions
 *    where the native message never arrives.
 *
 * Dedup is a per-direction time window (not "fire only on state change"): in a native shell
 * the document's visibilityState can disagree with the real app state (a background message
 * lost to suspension), so a state-based dedup could swallow a genuine resume. Same-direction
 * repeats beyond the window pass through — consumers needing exactly-once must dedup on
 * their own state. The handler is kept in a ref so subscriptions stay stable while callers
 * pass fresh closures every render.
 */
export const useAppVisibility = (handler: (isForeground: boolean) => void): void => {
    const handlerRef = useRef(handler);
    useEffect(() => {
        handlerRef.current = handler;
    }, [handler]);

    // Per direction so a background signal never swallows a foreground signal landing right
    // after it (fast app switch), and vice versa.
    const lastEmittedAtRef = useRef<{ foreground: number; background: number }>({ foreground: 0, background: 0 });
    const emitVisibility = useCallback((isForeground: boolean) => {
        const direction = isForeground ? 'foreground' : 'background';
        const now = Date.now();
        if (now - lastEmittedAtRef.current[direction] < VISIBILITY_DEDUP_MS) return;
        lastEmittedAtRef.current[direction] = now;
        handlerRef.current(isForeground);
    }, []);

    useOnBackgroundStatusChanged(message => emitVisibility(message.data.isForeground));

    useEffect(() => {
        const handleVisibilityChange = () => emitVisibility(document.visibilityState === 'visible');
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [emitVisibility]);
};
