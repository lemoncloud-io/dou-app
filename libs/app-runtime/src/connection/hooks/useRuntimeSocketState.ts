import { useSyncExternalStore } from 'react';

import { getSocketManager } from '@chatic/transport';
import type { SocketState } from '@chatic/transport';

export const useRuntimeSocketState = (): SocketState => {
    const manager = getSocketManager();
    return useSyncExternalStore(
        listener => manager.subscribe(listener),
        () => manager.getSnapshot()
    );
};
