import { useCallback, useEffect, useRef } from 'react';

import { logger } from '@chatic/bridges';
import { useWebSocketV2Store } from '../stores';
import { reportError } from '@chatic/web-core';

import type { WSSConnectParam, WSSEnvelope, WSSActionType, WSSEventDomainType } from '@lemoncloud/chatic-sockets-api';
import {
    createClientSocketV2,
    createDeviceRuntime,
    type ClientSocketV2 as PackageClientSocketV2,
    type DeviceSocketRuntime,
    type ClientSocketState,
    type SocketMessage,
    type DomainSyncPlan,
} from '@lemoncloud/chatic-sockets-lib';
import type { ConnectionStatus } from '../types';

export interface UseWebSocketV2Config {
    endpoint: string;
    connectParams?: WSSConnectParam;
    enabled?: boolean;
    logPrefix?: string;
    wssType?: 'relay' | 'cloud';
    extraSyncPlans?: DomainSyncPlan<any>[];
}

// ---------------------------------------------------------------------------
// Global singleton refs
// ---------------------------------------------------------------------------
let globalClientRef: PackageClientSocketV2 | null = null;
let globalRuntimeRef: DeviceSocketRuntime | null = null;
let globalSendFn: ((data: unknown) => void) | null = null;
let globalEmitFn: ((data: unknown) => void) | null = null;
let globalEmitAuthenticatedFn: ((data: unknown) => void) | null = null;
let globalUnsubscribers: (() => void)[] = [];

export const getSocketSend = () => globalSendFn;
export const getSocketRuntime = () => globalRuntimeRef;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getMessageMeta = (data: unknown) => {
    if (typeof data !== 'object' || data === null) {
        return { dataType: typeof data };
    }

    const message = data as Record<string, unknown>;
    return {
        type: message.type,
        action: message.action,
        id: message.id,
        mid: message.mid,
    };
};

// ---------------------------------------------------------------------------
// Format bridge (WSSEnvelope ↔ SocketMessage)
// ---------------------------------------------------------------------------

// v1 (type.action) → v2 (SocketMessage type) mapping
// Only entries that CHANGE are listed; 1:1 mappings (chat.send, chat.read, chat.feed, etc.) fall through.
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

// v2 (SocketMessage type, after stripping :ok/:error) → v1 {domain, action}
// Reverse of OUTBOUND_TYPE_MAP. Unmapped types use generic dot-split.
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
};

/** Outbound: WSSEnvelope → SocketMessage (consumer → package) */
const toSocketMessage = (envelope: WSSEnvelope): SocketMessage => {
    const v1Key = `${envelope.type}.${envelope.action}`;
    // v2 프로토콜은 mid로 request/response를 매칭하므로 meta.ref 값을 mid에도 설정
    const ref = envelope.meta?.ref as string | undefined;
    return {
        type: OUTBOUND_TYPE_MAP[v1Key] ?? v1Key,
        data: envelope.payload ?? null,
        mid: envelope.mid ?? ref,
        meta: envelope.meta as SocketMessage['meta'],
    };
};

/** Inbound: SocketMessage → WSSEnvelope (package → consumer) */
const toWSSEnvelope = (msg: SocketMessage): WSSEnvelope => {
    // Strip :ok / :error / .ok / .error suffixes
    // e.g. 'channel.create:ok' → 'channel.create' → mapped to {type:'chat', action:'start'}
    // e.g. 'user.get-site-profile.ok' → 'user.get-site-profile'
    const baseType = msg.type.replace(/:ok$|:error$|\.ok$|\.error$/, '');
    const mapped = INBOUND_TYPE_MAP[baseType];
    const domain = mapped
        ? mapped.domain
        : baseType.indexOf('.') > 0
          ? baseType.slice(0, baseType.indexOf('.'))
          : baseType;
    const action = mapped ? mapped.action : baseType.indexOf('.') > 0 ? baseType.slice(baseType.indexOf('.') + 1) : '';
    // v2 서버는 mid로 응답을 매칭 → SocketRequestManager가 meta.ref로 매칭하므로
    // mid 값을 meta.ref에 복사하여 브리지
    const rawMeta: Record<string, unknown> = msg.meta ? { ...msg.meta } : {};
    if (msg.mid && !rawMeta.ref) {
        rawMeta.ref = msg.mid;
    }
    return {
        type: domain as WSSEventDomainType,
        action: action as WSSActionType,
        payload: msg.data,
        mid: msg.mid,
        meta: rawMeta as unknown as WSSEnvelope['meta'],
    };
};

// ---------------------------------------------------------------------------
// State mapping (ClientSocketState → ConnectionStatus)
// ---------------------------------------------------------------------------

const mapState = (state: ClientSocketState): ConnectionStatus => {
    switch (state) {
        case 'idle':
            return 'disconnected';
        case 'connecting':
            return 'connecting';
        case 'connected':
            return 'connected';
        case 'closing':
            return 'disconnected';
        case 'closed':
            return 'disconnected';
    }
};

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/** Check socket health. Returns 'connected' if alive, 'reconnecting' if dead/reconnecting. */
export const checkSocketHealth = (): Promise<'connected' | 'reconnecting'> => {
    if (!globalClientRef) return Promise.resolve('reconnecting');
    return Promise.resolve(globalClientRef.state === 'connected' ? 'connected' : 'reconnecting');
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useWebSocketV2 = (config?: UseWebSocketV2Config) => {
    const store = useWebSocketV2Store();
    const isConnected = useWebSocketV2Store(s => s.isConnected);
    const clientRef = useRef<PackageClientSocketV2 | null>(null);
    const runtimeRef = useRef<DeviceSocketRuntime | null>(null);

    // Stable lazy proxies — check globals at CALL TIME, not render time.
    const sendProxy = useCallback((data: unknown) => {
        if (globalSendFn) globalSendFn(data);
        else logger.warn('SOCKET', '[WebSocketV2] Not initialized');
    }, []);
    const emitProxy = useCallback((data: unknown) => {
        if (globalEmitFn) globalEmitFn(data);
        else logger.warn('SOCKET', '[WebSocketV2] Not initialized');
    }, []);
    const emitAuthenticatedProxy = useCallback((data: unknown) => {
        if (globalEmitAuthenticatedFn) globalEmitAuthenticatedFn(data);
        else logger.warn('SOCKET', '[WebSocketV2] Not initialized');
    }, []);

    if (!config) {
        return {
            ...store,
            isConnected,
            send: sendProxy,
            emit: emitProxy,
            emitAuthenticated: emitAuthenticatedProxy,
        };
    }

    const { endpoint, connectParams, enabled = true, logPrefix = '[WebSocketV2]', wssType, extraSyncPlans } = config;

    // -----------------------------------------------------------------------
    // connect
    // -----------------------------------------------------------------------
    const connect = useCallback(async (): Promise<void> => {
        if (!endpoint) {
            logger.error('SOCKET', `${logPrefix} Endpoint not configured`);
            return;
        }

        if (!connectParams?.deviceId) {
            logger.warn('SOCKET', `${logPrefix} DeviceId not provided, skipping connection`);
            return;
        }

        // Already initialized — guard against double-init
        if (clientRef.current || globalClientRef) return;

        try {
            store.setConnectionStatus('connecting');
            store.setIsConnected(false);
            store.setIsDeviceRegistered(false);
            store.setWssType(wssType ?? null);
            if (connectParams.deviceId) {
                store.setDeviceId(connectParams.deviceId);
            }

            // Build v2 endpoint URL
            const v2Url = endpoint + (endpoint.includes('?') ? '&' : '?') + 'v2=';

            const client = createClientSocketV2({
                url: v2Url,
                device: { id: connectParams.deviceId, platform: 'web' },
            });
            clientRef.current = client;
            globalClientRef = client;

            // --- Event listeners ---

            const unsubState = client.onState(event => {
                const status = mapState(event.next);
                store.setConnectionStatus(status);

                if (event.next === 'connected') {
                    store.setIsConnected(true);
                } else {
                    store.setIsConnected(false);
                }

                if (event.next === 'closed' || event.next === 'idle') {
                    store.setIsVerified(false);
                    store.setIsDeviceRegistered(false);
                }
            });

            const unsubMessage = client.onMessage(event => {
                const msg = event.message;
                logger.debug('SOCKET', `${logPrefix} Message`, { type: msg.type, mid: msg.mid });

                // device.save 응답 → isDeviceRegistered 설정
                // useCloudTokenRefresh가 이 상태를 감지하여 auth.update를 자동 전송
                if (msg.type === 'device.save:ok') {
                    const view = (msg.data ?? {}) as { id?: string; connId?: string };
                    if (view.id) store.setId(view.id);
                    if (view.connId) store.setConnectionId(view.connId);
                    store.setIsDeviceRegistered(true);
                    logger.info('SOCKET', `${logPrefix} Device registered`, { id: view.id, connId: view.connId });
                }

                // auth.update 응답 → isVerified 설정
                if (msg.type === 'auth.update:ok') {
                    store.setIsVerified(true);
                    logger.info('SOCKET', `${logPrefix} Auth verified`);
                }
                if (msg.type === 'auth.update:error') {
                    store.setIsVerified(false);
                    logger.error('SOCKET', `${logPrefix} Auth failed`, { error: msg.error });
                }

                // Convert to WSSEnvelope and dispatch to consumers
                const envelope = toWSSEnvelope(msg);
                store.setLastMessage(envelope);
            });

            const unsubError = client.onError(event => {
                logger.error('SOCKET', `${logPrefix} Socket error`, {
                    error: event.error,
                    data: { phase: event.phase },
                });
                reportError(new Error(`[WebSocket] ${event.phase}: ${event.error}`));
            });

            globalUnsubscribers = [unsubState, unsubMessage, unsubError];

            // --- Runtime (handles connect, device.save, keepAlive, reconnect, rotation) ---
            const runtime = createDeviceRuntime({
                client,
                devicePlanOptions: {
                    // device.read (periodic sync) 응답에서 id/connId 업데이트
                    onUpdate: (_target, view) => {
                        if (view.id) store.setId(view.id);
                        if (view.connId) store.setConnectionId(view.connId);
                    },
                },
                extraSyncPlans,
            });
            runtimeRef.current = runtime;
            globalRuntimeRef = runtime;

            await runtime.start();
        } catch (error) {
            logger.error('SOCKET', `${logPrefix} Failed to connect`, { error });
            store.setConnectionStatus('error');
        }
    }, [endpoint, logPrefix, connectParams, store, wssType, extraSyncPlans]);

    // -----------------------------------------------------------------------
    // disconnect
    // -----------------------------------------------------------------------
    const disconnect = useCallback((): void => {
        const runtime = runtimeRef.current || globalRuntimeRef;
        if (runtime) {
            void runtime.stop();
        }
        store.setConnectionStatus('disconnected');
        store.setIsConnected(false);
        store.setIsDeviceRegistered(false);
        store.setIsVerified(false);
        store.setWssType(null);
    }, [store]);

    // -----------------------------------------------------------------------
    // send / emit / emitAuthenticated
    // -----------------------------------------------------------------------
    const send = useCallback(
        (data: unknown): void => {
            const client = clientRef.current || globalClientRef;
            if (client) {
                client.send(toSocketMessage(data as WSSEnvelope));
            } else {
                logger.warn('SOCKET', `${logPrefix} Cannot send - not initialized`);
            }
        },
        [logPrefix]
    );

    const emit = useCallback(
        (data: unknown): void => {
            const client = clientRef.current || globalClientRef;
            if (!client) {
                logger.warn('SOCKET', `${logPrefix} Cannot emit - not initialized`);
                return;
            }
            if (useWebSocketV2Store.getState().isConnected) {
                client.send(toSocketMessage(data as WSSEnvelope));
                return;
            }
            // wait for connection then send
            const unsub = useWebSocketV2Store.subscribe(
                s => s.isConnected,
                connected => {
                    if (!connected) return;
                    unsub();
                    const c = clientRef.current || globalClientRef;
                    if (c) c.send(toSocketMessage(data as WSSEnvelope));
                }
            );
        },
        [logPrefix]
    );

    const emitAuthenticated = useCallback(
        (data: unknown): void => {
            const client = clientRef.current || globalClientRef;
            if (!client) {
                logger.warn('SOCKET', `${logPrefix} Cannot emitAuthenticated - not initialized`);
                return;
            }
            logger.debug('SOCKET', `${logPrefix} Emit`, getMessageMeta(data));
            if (useWebSocketV2Store.getState().isVerified) {
                client.send(toSocketMessage(data as WSSEnvelope));
                return;
            }
            const unsub = useWebSocketV2Store.subscribe(
                s => s.isVerified,
                verified => {
                    if (!verified) return;
                    unsub();
                    logger.debug('SOCKET', `${logPrefix} Emit (deferred)`, getMessageMeta(data));
                    const c = clientRef.current || globalClientRef;
                    if (c) c.send(toSocketMessage(data as WSSEnvelope));
                }
            );
        },
        [logPrefix]
    );

    // Store send functions globally
    globalSendFn = send;
    globalEmitFn = emit;
    globalEmitAuthenticatedFn = emitAuthenticated;

    const connectRef = useRef(connect);
    const disconnectRef = useRef(disconnect);
    connectRef.current = connect;
    disconnectRef.current = disconnect;

    useEffect(() => {
        if (!enabled) {
            logger.info('SOCKET', `${logPrefix} Disconnecting (enabled=false)`);
            disconnectRef.current();
            return;
        }

        // Defer connection so that rapid re-renders (React StrictMode, fast dependency
        // transitions) cancel the timer before a WebSocket is opened — prevents
        // "WebSocket is closed before the connection is established".
        const connectTimer = setTimeout(() => {
            logger.info('SOCKET', `${logPrefix} Connecting`, { endpoint });
            void connectRef.current();
        }, 0);

        return () => {
            clearTimeout(connectTimer);
            disconnectRef.current();

            // Cleanup event listeners
            for (const unsub of globalUnsubscribers) {
                unsub();
            }
            globalUnsubscribers = [];

            // Cleanup refs
            clientRef.current = null;
            runtimeRef.current = null;
            globalClientRef = null;
            globalRuntimeRef = null;
        };
    }, [enabled, endpoint]);

    return {
        ...store,
        connect,
        disconnect,
        send,
        emit,
        emitAuthenticated,
    };
};
