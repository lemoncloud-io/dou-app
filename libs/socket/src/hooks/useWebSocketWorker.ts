import { useCallback, useEffect, useRef, useState } from 'react';

import type { BaseWebSocketMessage, ConnectionStatus } from '../types';

export interface UseWebSocketWorkerConfig<TMessage extends BaseWebSocketMessage> {
    endpoint: string;
    tokenProvider?: () => Promise<string | null>;
    messageParser?: (data: unknown) => TMessage | null;
    enabled?: boolean;
    authQueryParam?: string;
    pingInterval?: number;
    logPrefix?: string;
    sessionId?: string;
    channels?: string;
}

export interface UseWebSocketWorkerReturn<TMessage extends BaseWebSocketMessage> {
    id: string | null;
    connectionId: string | null;
    isConnected: boolean;
    connectionStatus: ConnectionStatus;
    lastMessage: TMessage | null;
    connect: () => Promise<void>;
    disconnect: () => void;
    send: (data: unknown) => void;
    pingCount: number;
    pongCount: number;
}

export const useWebSocketWorker = <TMessage extends BaseWebSocketMessage = BaseWebSocketMessage>(
    config: UseWebSocketWorkerConfig<TMessage>
): UseWebSocketWorkerReturn<TMessage> => {
    const {
        endpoint,
        tokenProvider,
        messageParser,
        enabled = true,
        authQueryParam = 'x-lemon-identity',
        pingInterval = 30000,
        logPrefix = '[WebSocketWorker]',
        sessionId,
        channels,
    } = config;

    const workerRef = useRef<Worker | null>(null);
    const [id, setId] = useState<string | null>(null);
    const [connectionId, setConnectionId] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
    const [lastMessage, setLastMessage] = useState<TMessage | null>(null);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [pingCount, setPingCount] = useState<number>(0);
    const [pongCount, setPongCount] = useState<number>(0);

    const connect = useCallback(async (): Promise<void> => {
        if (!endpoint) {
            console.error(`${logPrefix} Endpoint not configured`);
            return;
        }

        try {
            const token = tokenProvider ? (await tokenProvider()) || '' : '';

            if (!workerRef.current) {
                workerRef.current = new Worker('/websocket.worker.js');

                workerRef.current.onmessage = (e: MessageEvent) => {
                    const {
                        type,
                        status,
                        id: msgId,
                        connectionId: connId,
                        data,
                        message,
                        error,
                        pingCount,
                        pongCount,
                    } = e.data;

                    switch (type) {
                        case 'status':
                            setConnectionStatus(status);
                            setIsConnected(status === 'connected');
                            break;

                        case 'connectionId':
                            setId(msgId);
                            setConnectionId(connId);
                            console.log(`${logPrefix} ID:`, msgId);
                            console.log(`${logPrefix} Connection ID:`, connId);
                            break;

                        case 'stats':
                            setPingCount(pingCount);
                            setPongCount(pongCount);
                            break;

                        case 'message':
                            if (messageParser) {
                                const parsed = messageParser(data);
                                if (parsed) {
                                    console.log(`${logPrefix} Message:`, parsed);
                                    setLastMessage(parsed);
                                }
                            } else {
                                setLastMessage(data as TMessage);
                            }
                            break;

                        case 'log':
                            console.log(`${logPrefix}`, message);
                            break;

                        case 'error':
                            console.error(`${logPrefix} Error:`, error);
                            break;
                    }
                };
            }

            workerRef.current.postMessage({
                type: 'connect',
                config: {
                    endpoint,
                    token,
                    authQueryParam,
                    pingInterval,
                    sessionId,
                    channels,
                },
            });
        } catch (error) {
            console.error(`${logPrefix} Failed to connect:`, error);
        }
    }, [endpoint, tokenProvider, messageParser, authQueryParam, pingInterval, logPrefix, sessionId, channels]);

    const disconnect = useCallback((): void => {
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'disconnect' });
        }
        setConnectionStatus('disconnected');
        setIsConnected(false);
    }, []);

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

    useEffect(() => {
        if (!enabled) {
            disconnect();
            return;
        }

        void connect();

        return () => {
            disconnect();
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, [enabled, disconnect]);

    return {
        id,
        connectionId,
        isConnected,
        connectionStatus,
        lastMessage,
        connect,
        disconnect,
        send,
        pingCount,
        pongCount,
    };
};
