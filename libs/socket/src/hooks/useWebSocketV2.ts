import { useCallback, useEffect, useRef } from 'react';

import { useWebSocketV2Store } from '../stores';

import type { WSSConnectParam, WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

export interface UseWebSocketV2Config {
    endpoint: string;
    connectParams?: WSSConnectParam;
    enabled?: boolean;
    logPrefix?: string;
}

// Global worker reference for singleton pattern
let globalWorkerRef: Worker | null = null;
let globalSendFn: ((data: unknown) => void) | null = null;
let globalEmitFn: ((data: unknown) => void) | null = null;
let globalEmitAuthenticatedFn: ((data: unknown) => void) | null = null;

export const getSocketSend = () => globalSendFn;

export const useWebSocketV2 = (config?: UseWebSocketV2Config) => {
    const store = useWebSocketV2Store();
    const isConnected = useWebSocketV2Store(s => s.isConnected);
    const workerRef = useRef<Worker | null>(null);

    // If no config provided, return current state and send function
    if (!config) {
        return {
            ...store,
            isConnected,
            send: globalSendFn || (() => console.warn('[WebSocketV2] Not initialized')),
            emit: globalEmitFn || (() => console.warn('[WebSocketV2] Not initialized')),
            emitAuthenticated: globalEmitAuthenticatedFn || (() => console.warn('[WebSocketV2] Not initialized')),
        };
    }

    const { endpoint, connectParams, enabled = true, logPrefix = '[WebSocketV2]' } = config;

    const connect = useCallback(async (): Promise<void> => {
        if (!endpoint) {
            console.error(`${logPrefix} ❌ Endpoint not configured`);
            return;
        }

        if (!connectParams?.deviceId) {
            console.warn(`${logPrefix} ⏳ DeviceId not provided, skipping connection`);
            return;
        }

        console.log(`${logPrefix} 🔌 connect() called`, { endpoint, deviceId: connectParams.deviceId });

        try {
            if (!workerRef.current && !globalWorkerRef) {
                const worker = new Worker('/websocket.worker.js');
                workerRef.current = worker;
                globalWorkerRef = worker;

                worker.onmessage = (e: MessageEvent) => {
                    const message = e.data;

                    if (message.type === 'log') {
                        console.log(`${logPrefix} 🔧 worker:`, message.message);
                    }

                    if (message.type === 'status') {
                        console.log(`${logPrefix} 📡 status: ${message.status}`);
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
                        console.log(`${logPrefix} 🆔 connectionId:`, message.connectionId, 'id:', message.id);
                        store.setId(message.id);
                        store.setConnectionId(message.connectionId);
                        store.setIsConnected(true);
                    }

                    if (message.type === 'status' && message.status === 'connected') {
                        console.log(`${logPrefix} ✅ Connected`);
                        store.setIsConnected(true);
                    }

                    if (message.type === 'error') {
                        console.error(`${logPrefix} ❌ worker error:`, message.error);
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
            if (connectParams?.deviceId) {
                store.setDeviceId(connectParams.deviceId);
            }
        } catch (error) {
            console.error(`${logPrefix} Failed to connect:`, error);
            store.setConnectionStatus('error');
        }
    }, [endpoint, logPrefix, connectParams, store]);

    const disconnect = useCallback((): void => {
        console.log(`${logPrefix} 🔴 disconnect() called`);
        console.trace(`${logPrefix} 🔴 disconnect trace`);
        const worker = workerRef.current || globalWorkerRef;
        if (worker) {
            worker.postMessage({ type: 'disconnect' });
        }
        store.setConnectionStatus('disconnected');
        store.setIsConnected(false);
        store.setIsVerified(false);
    }, [logPrefix, store]);

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
            console.log(`${logPrefix} ⚠️ Disconnecting (enabled=false)`, {
                deviceId: config.connectParams?.deviceId,
                endpoint,
            });
            disconnectRef.current();
            return;
        }

        console.log(`${logPrefix} 🚀 useEffect → connect`, {
            endpoint,
            enabled,
            deviceId: config.connectParams?.deviceId,
        });
        void connectRef.current();

        // Reconnect on foreground resume (mobile WebView background → foreground)
        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'visible') return;

            const { isConnected: connected } = useWebSocketV2Store.getState();
            console.log(`${logPrefix} 👁️ visibilitychange → visible, isConnected:`, connected);

            if (!connected) {
                console.log(`${logPrefix} 🔄 Reconnecting after foreground resume`);
                void connectRef.current();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            disconnectRef.current();
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
            if (globalWorkerRef) {
                globalWorkerRef.terminate();
                globalWorkerRef = null;
                globalSendFn = null;
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
