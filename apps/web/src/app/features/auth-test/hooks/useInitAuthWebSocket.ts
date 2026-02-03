import { useCallback, useEffect } from 'react';

import { useWebSocketStore, useWebSocketWorker } from '@chatic/socket';
import { webCore } from '@chatic/web-core';

import { useAuthStore } from '../stores';
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
 * Auth WebSocket initialization hook for Web
 * - Connects with auth=true to trigger auth event on connect
 * - Manages auth state from server responses
 */
export const useInitAuthWebSocket = (deviceId: string): UseInitAuthWebSocketReturn => {
    const setId = useWebSocketStore(state => state.setId);
    const setConnectionStatus = useWebSocketStore(state => state.setConnectionStatus);
    const broadcastMessage = useWebSocketStore(state => state.broadcastMessage);

    const setAuthState = useAuthStore(state => state.setAuthState);
    const setStateAt = useAuthStore(state => state.setStateAt);
    const setDeviceId = useAuthStore(state => state.setDeviceId);
    const setAuthId = useAuthStore(state => state.setAuthId);
    const setMemberId = useAuthStore(state => state.setMemberId);
    const setMember = useAuthStore(state => state.setMember);
    const setError = useAuthStore(state => state.setError);
    const addEventLog = useAuthStore(state => state.addEventLog);
    const dryRun = useAuthStore(state => state.dryRun);

    const tokenProvider = useCallback(async (): Promise<string | null> => {
        try {
            const tokenData = await webCore.getTokenSignature();
            return tokenData?.originToken?.identityToken ?? null;
        } catch (error) {
            console.error('[AuthSocket] Failed to get token:', error);
            return null;
        }
    }, []);

    const { id, connectionId, connectionStatus, isConnected, lastMessage, disconnect, connect, send } =
        useWebSocketWorker<BaseWebSocketMessage>({
            endpoint: WS_ENDPOINT,
            tokenProvider,
            messageParser: parseAuthWebSocketMessage,
            enabled: false, // Manual connect
            logPrefix: '[AuthSocket]',
            sessionId: deviceId,
            auth: true, // Enable auth mode - adds auth=true to connection URL
        });

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

        // Only process auth messages
        if (message.type === 'auth' && message.action === 'update' && message.payload) {
            const payload = message.payload;

            // Log received event
            addEventLog({
                direction: 'received',
                type: message.type,
                action: message.action,
                payload,
            });

            // Update store from payload
            if (payload.state) {
                setAuthState(payload.state);
            }
            if (payload.stateAt) {
                setStateAt(payload.stateAt);
            }
            if (payload.deviceId) {
                setDeviceId(payload.deviceId);
            }
            if (payload.authId) {
                setAuthId(payload.authId);
            }
            if (payload.memberId !== undefined) {
                setMemberId(payload.memberId || null);
            }
            if (payload.member$) {
                setMember(payload.member$);
            }
            if (payload.error !== undefined) {
                setError(payload.error || null);
            }
        }
    }, [
        lastMessage,
        broadcastMessage,
        addEventLog,
        setAuthState,
        setStateAt,
        setDeviceId,
        setAuthId,
        setMemberId,
        setMember,
        setError,
    ]);

    /**
     * Send auth:update message
     */
    const sendAuthUpdate = useCallback(
        (payload: Partial<AuthPayload>) => {
            const envelope: AuthEnvelope = {
                type: 'auth',
                action: 'update',
                payload: {
                    ...payload,
                    dryRun: payload.dryRun ?? dryRun,
                },
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
        [send, dryRun, addEventLog]
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
