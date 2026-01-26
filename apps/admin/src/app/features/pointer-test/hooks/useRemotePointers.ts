import { useEffect } from 'react';

import { useWebSocketStore } from '@chatic/socket';

import { usePointerStore } from '../stores';

import type { ClientSyncPayload, ModelEnvelope, PointerMessage, SyncEnvelope } from '../types';

/**
 * Type guard for sync messages (type: 'sync', action: 'update')
 * @see chatic-sockets-api #0.26.116
 */
const isSyncMessage = (data: unknown): data is SyncEnvelope => {
    if (!data || typeof data !== 'object') return false;
    if (!('type' in data) || data.type !== 'sync') return false;
    if (!('action' in data) || data.action !== 'update') return false;
    if (!('payload' in data) || !data.payload || typeof data.payload !== 'object') return false;

    const payload = data.payload as Partial<ClientSyncPayload>;
    return typeof payload.posX === 'number' && typeof payload.posY === 'number';
};

/**
 * Type guard for model messages (type: 'model', action: 'update')
 * @see chatic-sockets-api #0.26.116
 */
const isModelMessage = (data: unknown): data is ModelEnvelope => {
    if (!data || typeof data !== 'object') return false;
    if (!('type' in data) || data.type !== 'model') return false;
    if (!('action' in data) || data.action !== 'update') return false;
    if (!('payload' in data) || !data.payload || typeof data.payload !== 'object') return false;

    const payload = data.payload as Partial<ClientSyncPayload>;
    return typeof payload.posX === 'number' && typeof payload.posY === 'number';
};

/**
 * Combined type guard for pointer-related messages
 */
const isPointerMessage = (data: unknown): data is PointerMessage => {
    return isSyncMessage(data) || isModelMessage(data);
};

/**
 * Extract deviceId from pointer message payload
 * - Uses payload.id from WSSPayload base
 */
const extractDeviceId = (message: PointerMessage): string => {
    const { payload } = message;
    return payload.id ?? 'unknown';
};

/**
 * Hook for subscribing to remote pointer position updates via WebSocket
 * Supports sync and model message formats
 * @param mySessionId - Optional session ID to filter out own messages
 */
export const useRemotePointers = (mySessionId?: string): void => {
    const subscribe = useWebSocketStore(state => state.subscribe);
    const setPointer = usePointerStore(state => state.setPointer);

    useEffect(() => {
        const unsubscribe = subscribe(message => {
            console.log('[useRemotePointers] Received message:', message.data);

            if (isPointerMessage(message.data)) {
                const { payload } = message.data;
                const deviceId = extractDeviceId(message.data);

                // Filter out own messages
                if (mySessionId && deviceId === mySessionId) {
                    console.log('[useRemotePointers] Ignoring own message:', deviceId);
                    return;
                }

                const ts = payload.ts ?? Date.now();
                const tick = payload.tick ?? 0;
                const status = payload.status ?? '';

                console.log('[useRemotePointers] Pointer update:', {
                    deviceId,
                    posX: payload.posX,
                    posY: payload.posY,
                });
                setPointer(deviceId, payload.posX, payload.posY, ts, tick, status);
            }
        });

        return unsubscribe;
    }, [subscribe, setPointer, mySessionId]);
};
