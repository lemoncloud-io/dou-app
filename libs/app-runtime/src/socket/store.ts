import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { useWebCoreStore } from '@chatic/web-core';

import type { WebSocketV2State, WebSocketV2Store } from './types';

const initialState: WebSocketV2State = {
    id: null,
    cloudId: null,
    selectedPlaceId: null,
    wssType: null,
    connectionId: null,
    isConnected: false,
    isDeviceRegistered: false,
    isVerified: false,
    connectionStatus: 'disconnected',
    lastMessage: null,
    deviceId: null,
};

export const useWebSocketV2Store = create<WebSocketV2Store>()(
    subscribeWithSelector(set => ({
        ...initialState,
        setId: id => set({ id }),
        setCloudId: cloudId => {
            useWebCoreStore.getState().setSelectedCloudId(cloudId);
            set({ cloudId });
        },
        setSelectedPlaceId: selectedPlaceId => {
            useWebCoreStore.getState().setSelectedPlaceId(selectedPlaceId);
            set({ selectedPlaceId });
        },
        setWssType: wssType => set({ wssType }),
        setConnectionId: connectionId => set({ connectionId }),
        setIsConnected: isConnected => set({ isConnected }),
        setIsDeviceRegistered: isDeviceRegistered => set({ isDeviceRegistered }),
        setIsVerified: isVerified => set({ isVerified }),
        setConnectionStatus: connectionStatus => set({ connectionStatus }),
        setLastMessage: lastMessage => set({ lastMessage }),
        setDeviceId: deviceId => set({ deviceId }),
        reset: () => set(initialState),
    }))
);

export const resetSocketStore = (): void => {
    useWebSocketV2Store.getState().reset();
};
