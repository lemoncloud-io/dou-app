import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type { ConnectionStatus } from '../types';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

export interface WebSocketV2State {
    id: string | null;
    connectionId: string | null;
    isConnected: boolean;
    isVerified: boolean;
    connectionStatus: ConnectionStatus;
    lastMessage: WSSEnvelope | null;
    deviceId: string | null;
}

export interface WebSocketV2Store extends WebSocketV2State {
    setId: (id: string | null) => void;
    setConnectionId: (connectionId: string | null) => void;
    setIsConnected: (isConnected: boolean) => void;
    setIsVerified: (isVerified: boolean) => void;
    setConnectionStatus: (status: ConnectionStatus) => void;
    setLastMessage: (message: WSSEnvelope | null) => void;
    setDeviceId: (deviceId: string | null) => void;
    reset: () => void;
}

const initialState: WebSocketV2State = {
    id: null,
    connectionId: null,
    isConnected: false,
    isVerified: false,
    connectionStatus: 'disconnected',
    lastMessage: null,
    deviceId: null,
};

export const useWebSocketV2Store = create<WebSocketV2Store>()(
    subscribeWithSelector(set => ({
        ...initialState,

        setId: id => set({ id }),
        setConnectionId: connectionId => set({ connectionId }),
        setIsConnected: isConnected => set({ isConnected }),
        setIsVerified: isVerified => set({ isVerified }),
        setConnectionStatus: connectionStatus => set({ connectionStatus }),
        setLastMessage: lastMessage => set({ lastMessage }),
        setDeviceId: deviceId => set({ deviceId }),
        reset: () => set(initialState),
    }))
);
