import { useCallback, useEffect, useRef } from 'react';

import { useWebSocketV2Store } from '../stores';

import type { WSSConnectParam, WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

export interface UseWebSocketV2Config {
    endpoint: string;
    connectParams?: WSSConnectParam;
    enabled?: boolean;
    logPrefix?: string;
    wssType?: 'relay' | 'cloud';
}

// Global worker reference for singleton pattern
let globalWorkerRef: Worker | null = null;
let globalSendFn: ((data: unknown) => void) | null = null;
let globalEmitFn: ((data: unknown) => void) | null = null;
let globalEmitAuthenticatedFn: ((data: unknown) => void) | null = null;

export const getSocketSend = () => globalSendFn;

const HEALTH_CHECK_TIMEOUT_MS = 3_000;

/** Check socket health via Worker. Returns 'connected' if alive, 'reconnecting' if dead/reconnecting. */
export const checkSocketHealth = (): Promise<'connected' | 'reconnecting'> => {
    if (!globalWorkerRef) return Promise.resolve('reconnecting');

    return new Promise(resolve => {
        let settled = false;
        const worker = globalWorkerRef!;

        const handler = (e: MessageEvent) => {
            if (settled || e.data.type !== 'status') return;
            settled = true;
            worker.removeEventListener('message', handler);
            clearTimeout(timer);
            resolve(e.data.status === 'connected' ? 'connected' : 'reconnecting');
        };

        worker.addEventListener('message', handler);
        worker.postMessage({ type: 'check' });

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            worker.removeEventListener('message', handler);
            resolve('reconnecting');
        }, HEALTH_CHECK_TIMEOUT_MS);
    });
};

export const useWebSocketV2 = (config?: UseWebSocketV2Config) => {
    const store = useWebSocketV2Store();
    const isConnected = useWebSocketV2Store(s => s.isConnected);
    const workerRef = useRef<Worker | null>(null);

    // Stable lazy proxies — check globals at CALL TIME, not render time.
    // Prevents race condition: consumer mounts before socket provider sets globals,
    // then requestDedup blocks subsequent retry attempts.
    const sendProxy = useCallback((data: unknown) => {
        if (globalSendFn) globalSendFn(data);
        else console.warn('[WebSocketV2] Not initialized');
    }, []);
    const emitProxy = useCallback((data: unknown) => {
        if (globalEmitFn) globalEmitFn(data);
        else console.warn('[WebSocketV2] Not initialized');
    }, []);
    const emitAuthenticatedProxy = useCallback((data: unknown) => {
        if (globalEmitAuthenticatedFn) globalEmitAuthenticatedFn(data);
        else console.warn('[WebSocketV2] Not initialized');
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

    const { endpoint, connectParams, enabled = true, logPrefix = '[WebSocketV2]', wssType } = config;

    const connect = useCallback(async (): Promise<void> => {
        if (!endpoint) {
            console.error(`${logPrefix} Endpoint not configured`);
            return;
        }

        if (!connectParams?.deviceId) {
            console.warn(`${logPrefix} DeviceId not provided, skipping connection`);
            return;
        }

        try {
            if (!workerRef.current && !globalWorkerRef) {
                const worker = new Worker('/websocket.worker.js');
                workerRef.current = worker;
                globalWorkerRef = worker;

                worker.onmessage = (e: MessageEvent) => {
                    const message = e.data;

                    if (message.type === 'status') {
                        store.setConnectionStatus(message.status);
                    }

                    if (message.type === 'message') {
                        const envelope = message.data as WSSEnvelope;
                        console.log(`${logPrefix} Message:`, envelope);
                        store.setLastMessage(envelope);

                        const payload = envelope.payload as { state?: string } | undefined;
                        if (
                            envelope.type === 'auth' &&
                            envelope.action === 'update' &&
                            payload?.state === 'authenticated'
                        ) {
                            store.setIsVerified(true);
                        }
                    }

                    if (message.type === 'connectionId') {
                        store.setId(message.id);
                        store.setConnectionId(message.connectionId);
                        store.setIsConnected(true);
                    }

                    if (message.type === 'status' && message.status === 'connected') {
                        store.setIsConnected(true);
                    }

                    if (message.type === 'status' && message.status === 'disconnected') {
                        store.setIsConnected(false);
                        store.setIsVerified(false);
                    }
                };
            }

            const worker = workerRef.current || globalWorkerRef;
            if (worker) {
                worker.postMessage({
                    type: 'connect',
                    config: {
                        endpoint,
                        deviceId: connectParams?.deviceId,
                    },
                });
            }

            store.setConnectionStatus('connecting');
            store.setIsConnected(false);
            store.setWssType(wssType ?? null);
            if (connectParams?.deviceId) {
                store.setDeviceId(connectParams.deviceId);
            }
        } catch (error) {
            console.error(`${logPrefix} Failed to connect:`, error);
            store.setConnectionStatus('error');
        }
    }, [endpoint, logPrefix, connectParams, store]);

    const disconnect = useCallback((): void => {
        const worker = workerRef.current || globalWorkerRef;
        if (worker) {
            worker.postMessage({ type: 'disconnect' });
        }
        store.setConnectionStatus('disconnected');
        store.setIsConnected(false);
        store.setIsVerified(false);
        store.setWssType(null);
    }, [store]);

    const send = useCallback(
        (data: unknown): void => {
            const worker = workerRef.current || globalWorkerRef;
            if (worker) {
                worker.postMessage({ type: 'send', data });
            } else {
                console.warn(`${logPrefix} Cannot send - worker not initialized`);
            }
        },
        [logPrefix]
    );

    const emit = useCallback(
        (data: unknown): void => {
            const worker = workerRef.current || globalWorkerRef;
            if (!worker) {
                console.warn(`${logPrefix} Cannot emit - worker not initialized`);
                return;
            }
            if (useWebSocketV2Store.getState().isConnected) {
                worker.postMessage({ type: 'send', data });
                return;
            }
            // wait for connection then send
            const unsub = useWebSocketV2Store.subscribe(
                s => s.isConnected,
                connected => {
                    if (!connected) return;
                    unsub();
                    (workerRef.current || globalWorkerRef)?.postMessage({ type: 'send', data });
                }
            );
        },
        [logPrefix]
    );

    const emitAuthenticated = useCallback(
        (data: unknown): void => {
            const worker = workerRef.current || globalWorkerRef;
            if (!worker) {
                console.warn(`${logPrefix} Cannot emitAuthenticated - worker not initialized`);
                return;
            }
            if (useWebSocketV2Store.getState().isVerified) {
                worker.postMessage({ type: 'send', data });
                return;
            }
            const unsub = useWebSocketV2Store.subscribe(
                s => s.isVerified,
                verified => {
                    if (!verified) return;
                    unsub();
                    (workerRef.current || globalWorkerRef)?.postMessage({ type: 'send', data });
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
            console.log(`${logPrefix} Disconnecting (enabled=false)`);
            disconnectRef.current();
            return;
        }

        console.log(`${logPrefix} Connecting to:`, endpoint);
        void connectRef.current();

        return () => {
            disconnectRef.current();
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
            if (globalWorkerRef) {
                globalWorkerRef.terminate();
                globalWorkerRef = null;
                globalSendFn = null;
                globalEmitFn = null;
                globalEmitAuthenticatedFn = null;
            }
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
