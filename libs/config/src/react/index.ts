import { useCallback, useSyncExternalStore } from 'react';

import { config } from '..';

/**
 * React binding, on its own entry point.
 *
 * A separate entry so the core stays framework-blind — that is what lets `boot`, the transport and
 * the log pipeline read the same values without pulling React in, and what lets React Native share
 * the core (ADR-0079 결정 7).
 *
 * `getSnapshot` is memoized per key because `useSyncExternalStore` re-subscribes when the function
 * identity changes. The value it returns is safe to compare by identity: a primitive is itself, and
 * a `json` value is the very object the store or the registry holds, not a fresh copy.
 */
export const useConfigValue = <T>(key: string): T | undefined => {
    const subscribe = useCallback((onChange: () => void) => config.subscribe([key], onChange), [key]);
    const getSnapshot = useCallback(() => config.get<T>(key), [key]);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/** The whole row — name, description, value, which lane won, whether it is editable here. */
export const useConfigSnapshot = <T>(key: string) => {
    const subscribe = useCallback((onChange: () => void) => config.subscribe([key], onChange), [key]);
    const getSnapshot = useCallback(() => config.snapshot<T>(key), [key]);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
