import { useSyncExternalStore } from 'react';
import { getSocketManager } from '../runtime';
import type { SocketState } from '../types';

export const useSocketState = <T>(selector: (state: SocketState) => T): T => {
    const manager = getSocketManager();
    return useSyncExternalStore(
        listener => manager.subscribe(listener),
        () => selector(manager.getSnapshot()),
        () => selector(manager.getSnapshot())
    );
};
