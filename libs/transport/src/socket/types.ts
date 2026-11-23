import type {
    ClientSocketErrorEvent,
    ClientSocketMessageEvent,
    ClientSocketState,
    ClientSocketStateEvent,
    ClientSocketV2,
    SocketMessage,
} from '@lemoncloud/chatic-sockets-lib';

import type { SocketCloseReason } from './utils/closeReason';

export type SocketKind = 'relay' | 'cloud';

export type SlotKey = string & { readonly __slotKey: never };

export interface SocketBindingConfig {
    url: string;
    deviceId: string;
    wssType?: 'relay' | 'cloud';
    cid: string;
}

export interface SocketState {
    state: ClientSocketState;
    isConnected: boolean;
    isVerified: boolean;
    connectionId: string | null;
}

export interface SlotStatus {
    key: SlotKey;
    kind: SocketKind;
    active: boolean;
    state: ClientSocketState;
    verified: boolean;
    connectCount: number;
}

export type SocketStateListener = (state: SocketState) => void;

export type SocketClientListener = (client: ClientSocketV2 | null) => void;

export type SocketSlotClientListener = (key: SlotKey, client: ClientSocketV2 | null) => void;

export type ScopedSocketClient = Pick<ISocketManager, 'request' | 'send' | 'onType'>;

export interface SocketRequestSample {
    type: string;
    kind: SocketKind;
    outcome: string;
    roundTripMs: number;
    closeReason?: SocketCloseReason;
}

export interface ISocketManager {
    ensure(config: SocketBindingConfig): ClientSocketV2;
    connect(key: SlotKey): Promise<void>;
    destroy(key?: SlotKey): void;
    setActiveSlot(key: SlotKey | null): void;
    setAuthenticated(key: SlotKey, value: boolean): void;
    getSlotKeys(): SlotKey[];

    request<T = unknown>(type: string, data?: unknown, options?: { timeoutMs?: number }): Promise<T>;
    setRequestObserver(observer: ((sample: SocketRequestSample) => void) | undefined): void;
    send<T = unknown>(type: string | SocketMessage<T>, data?: T): void;
    onType<T = unknown>(type: string, listener: (message: SocketMessage<T>) => void): () => void;
    onSlotType<T = unknown>(key: SlotKey, type: string, listener: (message: SocketMessage<T>) => void): () => void;
    onMessage(listener: (event: ClientSocketMessageEvent) => void): () => void;
    onState(listener: (event: ClientSocketStateEvent) => void): () => void;
    onError(listener: (event: ClientSocketErrorEvent) => void): () => void;
    disconnect(code?: number, reason?: string): Promise<void>;

    getClient(key?: SlotKey): ClientSocketV2 | null;
    getScopedClient(key: SlotKey): ScopedSocketClient;
    getSnapshot(): SocketState;
    subscribe(listener: SocketStateListener): () => void;
    subscribeClient(listener: SocketClientListener): () => void;
    subscribeSlotClients(listener: SocketSlotClientListener): () => void;
    waitUntilVerified(timeoutMs?: number): Promise<boolean>;
    waitUntilSlotVerified(key: SlotKey, timeoutMs?: number): Promise<boolean>;
    isSlotVerified(key: SlotKey): boolean;
    firstConnectSince(key: SlotKey): number | undefined;
    subscribeSlotVerified(key: SlotKey, listener: (verified: boolean) => void): () => void;
    getSlotStatuses(): SlotStatus[];

    getBoundCid(): string | null;
}
