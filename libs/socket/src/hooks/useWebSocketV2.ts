import { useCallback, useEffect, useRef } from 'react';

import { useWebSocketV2Store } from '../stores';

import type { WSSConnectParam, WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

export interface UseWebSocketV2Config {
    endpoint: string;
    connectParams?: WSSConnectParam;
    enabled?: boolean;
    logPrefix?: string;
}

export const useWebSocketV2 = (config: UseWebSocketV2Config) => {
    const { endpoint, connectParams, enabled = true, logPrefix = '[WebSocketV2]' } = config;

    const store = useWebSocketV2Store();
    const workerRef = useRef<Worker | null>(null);

    const connect = useCallback(async (): Promise<void> => {
        if (!endpoint) {
            console.error(`${logPrefix} Endpoint not configured`);
            return;
        }

        try {
            if (!workerRef.current) {
                workerRef.current = new Worker('/websocket.worker.js');

                workerRef.current.onmessage = (e: MessageEvent<WSSEnvelope>) => {
                    const envelope = e.data;
                    console.log(`${logPrefix} Message:`, envelope);
                    store.setLastMessage(envelope);
                };
            }

            workerRef.current.postMessage({
                type: 'connect',
                config: {
                    endpoint,
                    deviceId: connectParams?.deviceId,
                },
            });

            store.setConnectionStatus('connecting');
            store.setIsConnected(true);
            if (connectParams?.deviceId) {
                store.setDeviceId(connectParams.deviceId);
            }
        } catch (error) {
            console.error(`${logPrefix} Failed to connect:`, error);
            store.setConnectionStatus('error');
        }
    }, [endpoint, logPrefix, connectParams, store]);

    const disconnect = useCallback((): void => {
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'disconnect' });
        }
        store.setConnectionStatus('disconnected');
        store.setIsConnected(false);
    }, [store]);

    const send = useCallback(
        (data: unknown): void => {
            if (workerRef.current) {
                workerRef.current.postMessage({ type: 'send', data });
            } else {
                console.warn(`${logPrefix} Cannot send - worker not initialized`);
            }
        },
        [logPrefix]
    );

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
        };
    }, [enabled]);

    return {
        ...store,
        connect,
        disconnect,
        send,
    };
};
