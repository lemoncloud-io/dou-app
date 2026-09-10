import { useCallback, useSyncExternalStore } from 'react';

import { isNative } from '@chatic/bridges';
import { config, CONFIG_UNLOCK_KEY } from '@chatic/config';

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
    // The registry's local lane is what the panel's setting controls write, and ADR-0079 결정 4 says
    // the 10-tap + entry code is what opens it. Without this the unlock stopped at the panel door:
    // every `surface: 'dev'` key resolved `canWrite` WITHOUT 'local' on a stage where the lane is
    // shut (PROD), so the controls would render disabled on exactly the build they are needed on.
    // Harmless before `config.init()` — the facade answers `notWired` instead of throwing.
    if (enabled) config.set(CONFIG_UNLOCK_KEY, true, { lane: 'local' });
    else config.clear(CONFIG_UNLOCK_KEY, { lane: 'local' });
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
