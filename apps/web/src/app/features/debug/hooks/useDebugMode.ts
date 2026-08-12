import { useCallback, useSyncExternalStore } from 'react';

import { isNative } from '@chatic/bridges';

import { appBridge } from '../../../bridge';
import { DEBUG_STORAGE_KEY } from '../consts';

// Inside the native shell the persisted native flag is the source of truth —
// injected as a window global (see mobile injectionScripts.ts) so a restarted
// WebView boots already unlocked and the two sides never need separate unlocks.
const readInjectedFlag = () =>
    (window as unknown as { CHATIC_APP_DEBUG_MODE?: boolean }).CHATIC_APP_DEBUG_MODE === true;

const readEnabled = () => sessionStorage.getItem(DEBUG_STORAGE_KEY) === 'true' || readInjectedFlag();

// Module-level signal so every hook instance (MyPage unlock, always-mounted
// debug overlay, …) observes the same enabled state without prop plumbing.
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
const notify = () => listeners.forEach(listener => listener());

/**
 * Sets the shared debug-mode flag. Exported so `useDebugUnlock` can flip it once its
 * own tap+code challenge succeeds — this module owns only the enabled/disabled state,
 * not how it gets unlocked.
 */
export const setDebugModeEnabled = (enabled: boolean) => {
    if (enabled) sessionStorage.setItem(DEBUG_STORAGE_KEY, 'true');
    else sessionStorage.removeItem(DEBUG_STORAGE_KEY);
    if (isNative()) {
        // Single unlock/lock covers both layers (PROD included).
        appBridge.setDebugMode(enabled);
        (window as unknown as { CHATIC_APP_DEBUG_MODE?: boolean }).CHATIC_APP_DEBUG_MODE = enabled;
    }
    notify();
};

/**
 * Reads the hidden debug-mode gate.
 *
 * - `isEnabled`: whether debug tools are currently unlocked (sessionStorage-backed).
 * - `disable`: lock debug tools again.
 *
 * Unlocking is `useDebugUnlock`'s job (tap counter + entry-code challenge); this hook
 * only observes the resulting state. Debug mode is session-scoped (sessionStorage) so
 * it clears when the tab closes. State changes propagate to every mounted instance.
 */
export const useDebugMode = () => {
    const isEnabled = useSyncExternalStore(subscribe, readEnabled);

    const disable = useCallback(() => {
        setDebugModeEnabled(false);
    }, []);

    return { isEnabled, disable };
};
