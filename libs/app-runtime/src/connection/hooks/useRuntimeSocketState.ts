import { useSyncExternalStore } from 'react';

import { getSocketManager } from '../../socket/runtime';
import type { SocketState } from '../../socket/types';

export const useRuntimeSocketState = (): SocketState => {
    const manager = getSocketManager();
    return useSyncExternalStore(
        listener => manager.subscribe(listener),
        () => manager.getSnapshot()
    );
};
