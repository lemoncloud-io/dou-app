import { useCallback, useEffect } from 'react';

import { useWebSocketStore, useWebSocketWorker } from '@chatic/socket';
import { webCore } from '@chatic/web-core';

import { useAuthMonitorStore } from '../stores';
import { parseAuthWebSocketMessage } from '../types';

import type { AuthEnvelope, AuthPayload } from '../types';
import type { BaseWebSocketMessage } from '@chatic/socket';

const WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT || '';

export interface UseInitAuthWebSocketReturn {
    connectionId: string | null;
    isConnected: boolean;
    connect: () => Promise<void>;
    disconnect: () => void;
    send: (data: unknown) => void;
    sendAuthUpdate: (payload: Partial<AuthPayload>) => void;
}

/**
 * Auth WebSocket initialization hook for Admin
 * - Connects to monitor auth events
 * - Tracks all auth sessions
 */
export const useInitAuthWebSocket = (deviceId: string): UseInitAuthWebSocketReturn => {
    const setId = useWebSocketStore(state => state.setId);
    const setConnectionStatus = useWebSocketStore(state => state.setConnectionStatus);
    const broadcastMessage = useWebSocketStore(state => state.broadcastMessage);

    const setOwnDeviceId = useAuthMonitorStore(state => state.setOwnDeviceId);
    const setOwnAuthState = useAuthMonitorStore(state => state.setOwnAuthState);
    const setOwnAuthId = useAuthMonitorStore(state => state.setOwnAuthId);
    const updateSessionFromPayload = useAuthMonitorStore(state => state.updateSessionFromPayload);
    const addEventLog = useAuthMonitorStore(state => state.addEventLog);

    const tokenProvider = useCallback(async (): Promise<string | null> => {
        try {
            const tokenData = await webCore.getTokenSignature();
            return tokenData?.originToken?.identityToken ?? null;
        } catch (error) {
            console.error('[AdminAuthSocket] Failed to get token:', error);
            return null;
        }
    }, []);

    const { id, connectionId, connectionStatus, isConnected, lastMessage, disconnect, connect, send } =
        useWebSocketWorker<BaseWebSocketMessage>({
            endpoint: WS_ENDPOINT,
            tokenProvider,
            messageParser: parseAuthWebSocketMessage,
            enabled: false,
            logPrefix: '[AdminAuthSocket]',
            sessionId: deviceId,
            auth: true, // Enable auth mode - adds auth=true to connection URL
        });

    // Set own device ID
    useEffect(() => {
        setOwnDeviceId(deviceId);
    }, [deviceId, setOwnDeviceId]);

    // Sync state to store
    useEffect(() => {
        setId(id);
    }, [id, setId]);

    useEffect(() => {
        setConnectionStatus(connectionStatus);
    }, [connectionStatus, setConnectionStatus]);

    // Handle incoming messages
    useEffect(() => {
        if (!lastMessage?.data) return;

        const message = lastMessage.data as AuthEnvelope;
        broadcastMessage(lastMessage);

        // Process auth messages
        if (message.type === 'auth' && message.action === 'update' && message.payload) {
            const payload = message.payload;

            // Log received event
            addEventLog({
                direction: 'received',
                type: message.type,
                action: message.action,
                payload,
                sourceDeviceId: payload.deviceId,
            });

            // Update own state if it's our device
            if (payload.deviceId === deviceId) {
                if (payload.state) {
                    setOwnAuthState(payload.state);
                }
                if (payload.authId) {
                    setOwnAuthId(payload.authId);
                }
            }

            // Update session tracking
            if (payload.deviceId) {
                updateSessionFromPayload(payload);
            }
        }
    }, [lastMessage, broadcastMessage, deviceId, addEventLog, setOwnAuthState, setOwnAuthId, updateSessionFromPayload]);

    /**
     * Send auth:update message
     */
    const sendAuthUpdate = useCallback(
        (payload: Partial<AuthPayload>) => {
            const envelope: AuthEnvelope = {
                type: 'auth',
                action: 'update',
                payload,
            };

            // Log sent event
            addEventLog({
                direction: 'sent',
                type: envelope.type,
                action: envelope.action,
                payload: envelope.payload as AuthPayload,
            });

            send(envelope);
        },
        [send, addEventLog]
    );

    return {
        connectionId,
        isConnected,
        connect,
        disconnect,
        send,
        sendAuthUpdate,
    };
};
