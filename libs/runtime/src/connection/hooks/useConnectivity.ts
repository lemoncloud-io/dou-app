import { useSyncExternalStore } from 'react';

import { deriveConnectivity, readOnlineSignal, subscribeConnection } from '@chatic/runtime-client';
import type { ConnectivityStatus } from '@chatic/runtime-client';

import { useRuntimeSocketState } from './useRuntimeSocketState';
import { useVerifiedClouds } from './useVerifiedClouds';

export type { ConnectivityStatus } from '@chatic/runtime-client';

export const useConnectivity = (): ConnectivityStatus => {
    const isBrowserOnline = useSyncExternalStore(subscribeConnection, readOnlineSignal, readOnlineSignal);
    const socketState = useRuntimeSocketState();
    const hasVerifiedSocket = useVerifiedClouds().length > 0;

    return deriveConnectivity({ ...socketState, isBrowserOnline, hasVerifiedSocket });
};
