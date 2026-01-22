import { useCallback, useMemo, useRef } from 'react';

import type { PositionPayload } from '../types';

const THROTTLE_MS = 50; // 20fps

interface UsePointerSyncOptions {
    send: (data: unknown) => void;
    isConnected: boolean;
}

interface UsePointerSyncReturn {
    sendPosition: (posX: number, posY: number) => void;
}

/**
 * Hook for sending mouse pointer position via WebSocket
 * Throttles updates to 20fps (50ms) for network efficiency
 */
export const usePointerSync = ({ send, isConnected }: UsePointerSyncOptions): UsePointerSyncReturn => {
    const lastSentRef = useRef<number>(0);

    const sendPosition = useCallback(
        (posX: number, posY: number) => {
            if (!isConnected) return;

            const now = Date.now();
            if (now - lastSentRef.current < THROTTLE_MS) return;

            lastSentRef.current = now;

            const payload: PositionPayload = {
                posX: Math.round(posX),
                posY: Math.round(posY),
                ts: now,
            };

            const message = {
                type: 'position',
                action: 'sync',
                payload,
                meta: {
                    channel: '1000001', // TODO: make configurable
                },
            };

            console.log('[usePointerSync] Sending position:', message);
            send(message);
        },
        [send, isConnected]
    );

    return useMemo(() => ({ sendPosition }), [sendPosition]);
};
