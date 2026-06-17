import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
export type WSSActionType = string;
export type WSSEventDomainType = string;

export interface WSSEnvelope<TPayload = unknown> {
    type: WSSEventDomainType;
    action: WSSActionType;
    payload?: TPayload;
    mid?: string;
    meta?: Record<string, unknown>;
}

export type SocketCloudId = string;

export interface SocketBindingConfig {
    url: string;
    deviceId: string;
    wssType?: 'relay' | 'cloud';
}

export interface ManagedSocketRecord {
    client: ClientSocketV2;
    config: SocketBindingConfig;
    unsubscribeError?: () => void;
}

export type WSSType = 'relay' | 'cloud';

export interface WebSocketV2State {
    id: string | null;
    cloudId: string | null;
    selectedPlaceId: string | null;
    wssType: WSSType | null;
    connectionId: string | null;
    isConnected: boolean;
    isDeviceRegistered: boolean;
    isVerified: boolean;
    connectionStatus: ConnectionStatus;
    lastMessage: WSSEnvelope | null;
    deviceId: string | null;
}

export interface WebSocketV2Store extends WebSocketV2State {
    setId: (id: string | null) => void;
    setCloudId: (cloudId: string) => void;
    setSelectedPlaceId: (selectedPlaceId: string | null) => void;
    setWssType: (wssType: WSSType | null) => void;
    setConnectionId: (connectionId: string | null) => void;
    setIsConnected: (isConnected: boolean) => void;
    setIsDeviceRegistered: (isDeviceRegistered: boolean) => void;
    setIsVerified: (isVerified: boolean) => void;
    setConnectionStatus: (status: ConnectionStatus) => void;
    setLastMessage: (message: WSSEnvelope | null) => void;
    setDeviceId: (deviceId: string | null) => void;
    reset: () => void;
}
