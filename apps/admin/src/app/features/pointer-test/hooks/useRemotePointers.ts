import { useEffect } from 'react';

import { useWebSocketStore } from '@chatic/socket';

import { usePointerStore } from '../stores';

import type { PositionEnvelope, PositionPayload } from '../types';

/**
 * Type guard for position sync messages
 */
const isPositionMessage = (data: unknown): data is PositionEnvelope => {
    if (!data || typeof data !== 'object') return false;
    if (!('type' in data) || data.type !== 'position') return false;
    if (!('action' in data) || data.action !== 'sync') return false;
    if (!('payload' in data) || !data.payload || typeof data.payload !== 'object') return false;

    const payload = data.payload as Partial<PositionPayload>;
    if (typeof payload.posX !== 'number' || typeof payload.posY !== 'number') return false;

    return true;
};

/**
 * Hook for subscribing to remote pointer position updates via WebSocket
 * Updates the pointer store when position messages are received
 */
export const useRemotePointers = (): void => {
    const subscribe = useWebSocketStore(state => state.subscribe);
    const setPointer = usePointerStore(state => state.setPointer);

    useEffect(() => {
        const unsubscribe = subscribe(message => {
            if (isPositionMessage(message.data)) {
                const { payload } = message.data;
                const deviceId = payload.deviceId || 'unknown';
                setPointer(deviceId, payload.posX, payload.posY, payload.ts);
            }
        });

        return unsubscribe;
    }, [subscribe, setPointer]);
};
