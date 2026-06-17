import { useCallback, useEffect, useRef } from 'react';

import { logger } from '@chatic/bridges';
import type { ClientSocketState, SocketMessage } from '@lemoncloud/chatic-sockets-lib';

import { getSocketManager } from './runtime';
import { resetSocketStore, useWebSocketV2Store } from './store';
import type { WSSActionType, WSSEnvelope, WSSEventDomainType } from './types';

export interface WSSConnectParam {
    deviceId?: string;
}

export interface UseWebSocketV2Config {
    endpoint: string;
    connectParams?: WSSConnectParam;
    enabled?: boolean;
    logPrefix?: string;
    wssType?: 'relay' | 'cloud';
}

let restarting = false;
let activeMessageUnsubs: Array<() => void> = [];

const OUTBOUND_TYPE_MAP: Record<string, string> = {
    'chat.start': 'channel.create',
    'chat.get-self': 'channel.get-self',
    'chat.mine': 'channel.mine',
    'chat.sync': 'channel.sync',
    'chat.users': 'channel.list-user',
    'chat.invite': 'channel.invite',
    'chat.leave': 'channel.leave',
    'chat.update-channel': 'channel.update',
    'chat.update-join': 'channel.update-join',
    'chat.delete-channel': 'channel.delete',
    'chat.join': 'channel.join',
};

const INBOUND_TYPE_MAP: Record<string, { domain: string; action: string }> = {
    'channel.create': { domain: 'chat', action: 'start' },
    'channel.get-self': { domain: 'chat', action: 'get-self' },
    'channel.mine': { domain: 'chat', action: 'mine' },
    'channel.sync': { domain: 'chat', action: 'sync' },
    'channel.list-user': { domain: 'chat', action: 'users' },
    'channel.invite': { domain: 'chat', action: 'invite' },
    'channel.leave': { domain: 'chat', action: 'leave' },
    'channel.update': { domain: 'chat', action: 'update-channel' },
    'channel.update-join': { domain: 'chat', action: 'update-join' },
    'channel.delete': { domain: 'chat', action: 'delete-channel' },
    'channel.join': { domain: 'chat', action: 'join' },
    'channel.sync-site-profile': { domain: 'chat', action: 'sync-site-profile' },
};

const mapState = (state: ClientSocketState): 'disconnected' | 'connecting' | 'connected' => {
    switch (state) {
        case 'connecting':
            return 'connecting';
        case 'connected':
            return 'connected';
        default:
            return 'disconnected';
    }
};

const toSocketMessage = (envelope: WSSEnvelope): SocketMessage => {
    const v1Key = `${envelope.type}.${envelope.action}`;
    const ref = envelope.meta?.ref as string | undefined;
    return {
        type: OUTBOUND_TYPE_MAP[v1Key] ?? v1Key,
        data: envelope.payload ?? null,
        mid: envelope.mid ?? ref,
        meta: envelope.meta as SocketMessage['meta'],
    };
};

const toWSSEnvelope = (msg: SocketMessage): WSSEnvelope => {
    const baseType = msg.type.replace(/:ok$|:error$|\.ok$|\.error$/, '');
    const mapped = INBOUND_TYPE_MAP[baseType];
    const domain = mapped
        ? mapped.domain
        : baseType.includes('.')
          ? baseType.slice(0, baseType.indexOf('.'))
          : baseType;
    const action = mapped ? mapped.action : baseType.includes('.') ? baseType.slice(baseType.indexOf('.') + 1) : '';
    const rawMeta: Record<string, unknown> = msg.meta ? { ...msg.meta } : {};
    if (msg.mid && !rawMeta.ref) {
        rawMeta.ref = msg.mid;
    }

    return {
        type: domain as WSSEventDomainType,
        action: action as WSSActionType,
        payload: msg.error ? { error: msg.error } : msg.data,
        mid: msg.mid,
        meta: rawMeta as WSSEnvelope['meta'],
    };
};

const MESSAGE_TYPES_TO_TRACK = [
    'device.save:ok',
    'device.read:ok',
    'auth.update:ok',
    'auth.update:error',
    'user.update-profile:ok',
    'user.update-profile:error',
    'model.create',
    'model.update',
    'model.delete',
];

const bindActiveClientMessages = (): void => {
    for (const unsubscribe of activeMessageUnsubs) {
        unsubscribe();
    }
    activeMessageUnsubs = [];

    const client = getSocketManager().getActiveClient();
    if (!client) return;

    activeMessageUnsubs = MESSAGE_TYPES_TO_TRACK.map(type =>
        client.onType(type, msg => {
            const store = useWebSocketV2Store.getState();
            if (msg.type === 'device.save:ok' || msg.type === 'device.read:ok') {
                const view = (msg.data ?? {}) as { id?: string; connId?: string };
                if (view.id) store.setId(view.id);
                if (view.connId) store.setConnectionId(view.connId);
                store.setIsDeviceRegistered(true);
            }

            if (msg.type === 'auth.update:ok') {
                store.setIsVerified(true);
            }
            if (msg.type === 'auth.update:error') {
                store.setIsVerified(false);
            }

            store.setLastMessage(toWSSEnvelope(msg));
        })
    );
};

const sendEnvelope = (envelope: WSSEnvelope): void => {
    const client = getSocketManager().getActiveClient();
    if (!client) {
        logger.warn('SOCKET', '[useWebSocketV2] Active socket client not ready');
        return;
    }
    client.send(toSocketMessage(envelope));
};

export const getSocketSend = (): ((data: unknown) => void) => data => {
    sendEnvelope(data as WSSEnvelope);
};

export const checkSocketHealth = async (): Promise<'connected' | 'reconnecting'> => {
    const client = getSocketManager().getActiveClient();
    return client?.state === 'connected' ? 'connected' : 'reconnecting';
};

export const forceReconnect = (): void => {
    const client = getSocketManager().getActiveClient();
    if (!client) return;
    if (client.state !== 'connected') {
        void client.connect();
    }
};

export const probeSocket = async (timeoutMs = 5000): Promise<boolean> => {
    const client = getSocketManager().getActiveClient();
    if (!client || client.state !== 'connected') return false;
    try {
        await client.request('system.ping', null, { timeoutMs });
        return true;
    } catch {
        return false;
    }
};

export const restartSocket = async (): Promise<void> => {
    const manager = getSocketManager();
    const activeCloudId = manager.getActiveCloudId();
    const config = manager.getActiveConfig();
    if (!config || restarting) return;

    restarting = true;
    try {
        manager.remove(activeCloudId);
        const client = manager.ensure(activeCloudId, config);
        bindActiveClientMessages();
        await client.connect();
    } finally {
        restarting = false;
    }
};

export const isSocketRestarting = (): boolean => restarting;

export const useWebSocketV2 = (config?: UseWebSocketV2Config) => {
    const store = useWebSocketV2Store();
    const isConnected = useWebSocketV2Store(s => s.isConnected);
    const manager = getSocketManager();
    const bindStateRef = useRef(false);

    const send = useCallback((data: unknown): void => {
        sendEnvelope(data as WSSEnvelope);
    }, []);

    const emit = useCallback(
        (data: unknown): void => {
            const client = manager.getActiveClient();
            if (client?.state === 'connected') {
                sendEnvelope(data as WSSEnvelope);
                return;
            }

            const unsubscribe = useWebSocketV2Store.subscribe(
                s => s.isConnected,
                connected => {
                    if (!connected) return;
                    unsubscribe();
                    sendEnvelope(data as WSSEnvelope);
                }
            );
        },
        [manager]
    );

    const emitAuthenticated = useCallback((data: unknown): void => {
        if (useWebSocketV2Store.getState().isVerified) {
            sendEnvelope(data as WSSEnvelope);
            return;
        }

        const unsubscribe = useWebSocketV2Store.subscribe(
            s => s.isVerified,
            verified => {
                if (!verified) return;
                unsubscribe();
                sendEnvelope(data as WSSEnvelope);
            }
        );
    }, []);

    useEffect(() => {
        if (bindStateRef.current) return;
        bindStateRef.current = true;

        const unsubscribeClient = manager.subscribeActiveClient(client => {
            bindActiveClientMessages();
            useWebSocketV2Store.getState().setConnectionStatus(mapState(client?.state ?? 'idle'));
            useWebSocketV2Store.getState().setIsConnected(client?.state === 'connected');
        });

        const unsubscribeState = manager.subscribeActiveClientState(state => {
            const socketStore = useWebSocketV2Store.getState();
            socketStore.setConnectionStatus(mapState(state));
            socketStore.setIsConnected(state === 'connected');
            if (state === 'idle' || state === 'closed') {
                socketStore.setIsVerified(false);
                socketStore.setIsDeviceRegistered(false);
            }
        });

        return () => {
            unsubscribeClient();
            unsubscribeState();
            bindStateRef.current = false;
        };
    }, [manager]);

    const endpoint = config?.endpoint ?? '';
    const connectParams = config?.connectParams;
    const enabled = config?.enabled ?? true;
    const wssType = config?.wssType;

    const connect = useCallback(async (): Promise<void> => {
        if (!endpoint || !connectParams?.deviceId) return;

        const socketStore = useWebSocketV2Store.getState();
        const cloudId = socketStore.cloudId ?? 'default';
        socketStore.setConnectionStatus('connecting');
        socketStore.setIsConnected(false);
        socketStore.setWssType(wssType ?? null);
        socketStore.setDeviceId(connectParams.deviceId);

        manager.setActiveCloudId(cloudId);
        const client = manager.ensure(cloudId, {
            url: endpoint,
            deviceId: connectParams.deviceId,
            wssType,
        });
        bindActiveClientMessages();
        if (client.state === 'idle' || client.state === 'closed') {
            await client.connect();
        }
    }, [connectParams?.deviceId, endpoint, manager, wssType]);

    const disconnect = useCallback((): void => {
        manager.destroy();
        resetSocketStore();
    }, [manager]);

    useEffect(() => {
        if (!config) return;

        if (!enabled) {
            disconnect();
            return;
        }

        void connect();

        return () => {
            for (const unsubscribe of activeMessageUnsubs) {
                unsubscribe();
            }
            activeMessageUnsubs = [];
        };
    }, [config, connect, disconnect, enabled]);

    return {
        ...store,
        connect,
        disconnect,
        send,
        emit,
        emitAuthenticated,
    };
};
