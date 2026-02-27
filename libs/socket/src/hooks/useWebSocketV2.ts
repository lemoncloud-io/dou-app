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
        };
    }

    const { endpoint, connectParams, enabled = true, logPrefix = '[WebSocketV2]' } = config;

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
                    }

                    if (message.type === 'connectionId') {
                        store.setId(message.id);
                        store.setConnectionId(message.connectionId);
                        store.setIsConnected(true);
                    }

                    if (message.type === 'status' && message.status === 'connected') {
                        store.setIsConnected(true);
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
        const worker = workerRef.current || globalWorkerRef;
        if (worker) {
            worker.postMessage({ type: 'disconnect' });
        }
        store.setConnectionStatus('disconnected');
        store.setIsConnected(false);
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

    // Store send function globally
    globalSendFn = send;

    const connectRef = useRef(connect);
    const disconnectRef = useRef(disconnect);
    connectRef.current = connect;
    disconnectRef.current = disconnect;

    useEffect(() => {
        if (!enabled) {
            disconnectRef.current();
            return;
        }

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
            }
        };
    }, [enabled]);

    return {
        ...store,
        connect,
        disconnect,
        send,
    };
};
