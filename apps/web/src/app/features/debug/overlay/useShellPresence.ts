import { useSyncExternalStore } from 'react';

import { isNative } from '@chatic/bridges';

const POLL_MS = 1000;

const subscribe = (listener: () => void) => {
    const id = setInterval(listener, POLL_MS);
    return () => clearInterval(id);
};

export const useShellPresence = (): boolean => useSyncExternalStore(subscribe, isNative, () => false);
