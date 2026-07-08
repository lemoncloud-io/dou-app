import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { DEBUG_STORAGE_KEY } from '../consts';

const TAP_THRESHOLD = 10;
const TAP_RESET_MS = 3000;

const readEnabled = () => sessionStorage.getItem(DEBUG_STORAGE_KEY) === 'true';

// Module-level signal so every hook instance (MyPage unlock, always-mounted
// debug overlay, …) observes the same enabled state without prop plumbing.
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
const notify = () => listeners.forEach(listener => listener());

const setEnabled = (enabled: boolean) => {
    if (enabled) sessionStorage.setItem(DEBUG_STORAGE_KEY, 'true');
    else sessionStorage.removeItem(DEBUG_STORAGE_KEY);
    notify();
};

/**
 * Controls the hidden debug-mode gate.
 *
 * - `isEnabled`: whether debug tools are currently unlocked (sessionStorage-backed).
 * - `registerTap`: tap the app version 10 times within 3s to unlock debug mode.
 * - `disable`: lock debug tools again.
 *
 * Debug mode is session-scoped (sessionStorage) so it clears when the tab closes.
 * State changes propagate to every mounted instance of this hook.
 */
export const useDebugMode = () => {
    const isEnabled = useSyncExternalStore(subscribe, readEnabled);
    const tapCountRef = useRef(0);
    const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
        };
    }, []);

    const registerTap = useCallback(() => {
        tapCountRef.current += 1;
        if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
        tapTimerRef.current = setTimeout(() => {
            tapCountRef.current = 0;
        }, TAP_RESET_MS);

        if (tapCountRef.current >= TAP_THRESHOLD) {
            tapCountRef.current = 0;
            setEnabled(true);
        }
    }, []);

    const disable = useCallback(() => {
        setEnabled(false);
    }, []);

    return { isEnabled, registerTap, disable };
};
