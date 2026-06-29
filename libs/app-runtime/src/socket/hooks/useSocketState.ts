import { useSyncExternalStore } from 'react';
import { getSocketManager } from '../runtime';
import type { SocketState } from '../types';

export const useSocketState = (): SocketState => {
    const manager = getSocketManager();
    return useSyncExternalStore(
        listener => manager.subscribe(listener),
        () => manager.getSnapshot()
    );
};
