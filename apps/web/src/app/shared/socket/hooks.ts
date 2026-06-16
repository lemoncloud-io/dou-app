import { useSyncExternalStore } from 'react';

import { type ClientSocketState } from '@lemoncloud/chatic-sockets-lib';
import { useWebCoreStore } from '@chatic/web-core';

import { getSocketManager } from './runtime';

export type WebSocketConnectionStatus = 'disconnected' | 'connecting' | 'connected';

const mapConnectionStatus = (state: ClientSocketState): WebSocketConnectionStatus => {
    switch (state) {
        case 'connecting':
            return 'connecting';
        case 'connected':
            return 'connected';
        case 'idle':
        case 'closing':
        case 'closed':
        default:
            return 'disconnected';
    }
};

export interface WebSocketSnapshot {
    cloudId: string;
    selectedPlaceId: string | null;
    wssType: 'relay' | 'cloud' | null;
    connectionStatus: WebSocketConnectionStatus;
    isConnected: boolean;
    deviceId: string | null;
}

let lastSnapshot: WebSocketSnapshot | null = null;

export const getSocketSnapshot = (): WebSocketSnapshot => {
    const manager = getSocketManager();
    const client = manager.getActiveClient();
    const config = manager.getActiveConfig();
    const state = client?.state ?? 'idle';
    const storeState = useWebCoreStore.getState();

    const nextSnapshot = {
        cloudId: storeState.selectedCloudId,
        selectedPlaceId: storeState.selectedPlaceId,
        wssType: config?.wssType ?? null,
        connectionStatus: mapConnectionStatus(state),
        isConnected: state === 'connected',
        deviceId: config?.deviceId ?? null,
    };

    if (
        lastSnapshot &&
        lastSnapshot.cloudId === nextSnapshot.cloudId &&
        lastSnapshot.selectedPlaceId === nextSnapshot.selectedPlaceId &&
        lastSnapshot.wssType === nextSnapshot.wssType &&
        lastSnapshot.connectionStatus === nextSnapshot.connectionStatus &&
        lastSnapshot.isConnected === nextSnapshot.isConnected &&
        lastSnapshot.deviceId === nextSnapshot.deviceId
    ) {
        return lastSnapshot;
    }

    lastSnapshot = nextSnapshot;
    return nextSnapshot;
};

export const subscribeSocketSnapshot = (listener: () => void): (() => void) => {
    const manager = getSocketManager();
    const unsubscribeState = manager.subscribeActiveClientState(() => listener());
    const unsubscribeClient = manager.subscribeActiveClient(() => listener());
    const unsubscribeSelection = useWebCoreStore.subscribe(() => listener());

    return () => {
        unsubscribeState();
        unsubscribeClient();
        unsubscribeSelection();
    };
};

export const useSocketState = <T>(selector: (snapshot: WebSocketSnapshot) => T): T => {
    const snapshot = useSyncExternalStore(subscribeSocketSnapshot, getSocketSnapshot, getSocketSnapshot);
    return selector(snapshot);
};

export const useConnectionStatus = (): WebSocketConnectionStatus => useSocketState(state => state.connectionStatus);

export const useIsConnected = (): boolean => useSocketState(state => state.isConnected);
