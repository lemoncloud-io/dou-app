import { useSyncExternalStore } from 'react';

import { isNative } from '@chatic/bridges';

/**
 * Whether the native shell is attached, right now.
 *
 * Polled rather than read once: the shell's injected globals can appear AFTER the web mounts —
 * `WebBridgeClient` polls for exactly that reason — so a panel that decided at first render would
 * keep telling a tester "no shell" on a device that has one. Only runs while the panel is open,
 * which is the only time anything subscribes.
 */
const POLL_MS = 1000;

const subscribe = (listener: () => void) => {
    const id = setInterval(listener, POLL_MS);
    return () => clearInterval(id);
};

export const useShellPresence = (): boolean => useSyncExternalStore(subscribe, isNative, () => false);
