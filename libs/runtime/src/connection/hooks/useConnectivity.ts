import { useSyncExternalStore } from 'react';

import { deriveConnectivity, readOnlineSignal, subscribeConnection } from '@chatic/runtime-client';
import type { ConnectivityStatus } from '@chatic/runtime-client';

import { useRuntimeSocketState } from './useRuntimeSocketState';
import { useVerifiedClouds } from './useVerifiedClouds';

export type { ConnectivityStatus } from '@chatic/runtime-client';

/** Live connection status for the app shell. See `deriveConnectivity` for the semantics. */
export const useConnectivity = (): ConnectivityStatus => {
    // The online signal of the process that runs the sockets — this page's own, or the app's.
    const isBrowserOnline = useSyncExternalStore(subscribeConnection, readOnlineSignal, readOnlineSignal);
    const socketState = useRuntimeSocketState();
    const hasVerifiedSocket = useVerifiedClouds().length > 0;

    return deriveConnectivity({ ...socketState, isBrowserOnline, hasVerifiedSocket });
};
