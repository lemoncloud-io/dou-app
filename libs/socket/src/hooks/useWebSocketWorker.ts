import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/app-messages';
import type { BaseWebSocketMessage, ConnectionStatus } from '../types';

export interface UseWebSocketWorkerConfig<TMessage extends BaseWebSocketMessage> {
    endpoint: string;
    tokenProvider?: () => Promise<string | null>;
    messageParser?: (data: unknown) => TMessage | null;
    enabled?: boolean;
    authQueryParam?: string;
    logPrefix?: string;
    sessionId?: string;
    channels?: string;
    /** Enable auth mode - adds auth=true to connection URL */
    auth?: boolean;
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
        logPrefix = '[WebSocketWorker]',
        sessionId,
        channels,
        auth,
    } = config;

    const workerRef = useRef<Worker | null>(null);
    const [id, setId] = useState<string | null>(null);
    const [connectionId, setConnectionId] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
    const [lastMessage, setLastMessage] = useState<TMessage | null>(null);
    const [isConnected, setIsConnected] = useState<boolean>(false);

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

    const connect = useCallback(async (): Promise<void> => {
        if (!endpoint) {
            logger.error('SOCKET', `${logPrefix} Endpoint not configured`);
            return;
        }

        if (!sessionId) {
            logger.warn('SOCKET', `${logPrefix} SessionId (deviceId) not provided, skipping connection`);
            return;
        }

        try {
            const token = tokenProvider ? (await tokenProvider()) || '' : '';

            if (!workerRef.current) {
                workerRef.current = new Worker('/websocket.worker.js');

                workerRef.current.onmessage = (e: MessageEvent) => {
                    const { type, status, id: msgId, connectionId: connId, data, message, error } = e.data;

                    switch (type) {
                        case 'status':
                            setConnectionStatus(status);
                            setIsConnected(status === 'connected');
                            break;

                        case 'connectionId':
                            setId(msgId);
                            setConnectionId(connId);
                            logger.info('SOCKET', `${logPrefix} Connection info`, {
                                id: msgId,
                                connectionId: connId,
                            });
                            break;

                        case 'message':
                            if (messageParser) {
                                const parsed = messageParser(data);
                                if (parsed) {
                                    logger.debug('SOCKET', `${logPrefix} Message`, getMessageMeta(parsed));
                                    setLastMessage(parsed);
                                }
                            } else {
                                setLastMessage(data as TMessage);
                            }
                            break;

                        case 'log':
                            logger.debug('SOCKET', `${logPrefix} ${message}`);
                            break;

                        case 'error':
                            logger.error('SOCKET', `${logPrefix} Error`, { error });
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
                    sessionId,
                    channels,
                    auth,
                },
            });
        } catch (error) {
            logger.error('SOCKET', `${logPrefix} Failed to connect`, { error });
        }
    }, [endpoint, tokenProvider, messageParser, authQueryParam, logPrefix, sessionId, channels, auth]);

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
                logger.warn('SOCKET', `${logPrefix} Cannot send - worker not initialized`);
            }
        },
        [logPrefix]
    );

    // Store stable refs for cleanup
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
        id,
        connectionId,
        isConnected,
        connectionStatus,
        lastMessage,
        connect,
        disconnect,
        send,
    };
};
