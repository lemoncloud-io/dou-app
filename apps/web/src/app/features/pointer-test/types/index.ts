import type { ClientSyncPayload } from '@lemoncloud/chatic-sockets-api';

/**
 * Channel ID for pointer sync WebSocket communication
 */
export const POINTER_CHANNEL = '1000001';

/**
 * Position payload for WebSocket communication
 * @see chatic-sockets-api #0.26.116 ClientSyncPayload
 */
export interface PositionPayload {
    /** x position (pixel) */
    posX: number;
    /** y position (pixel) */
    posY: number;
    /** client timestamp (ms) */
    ts: number;
    /** tick count (server sync) */
    tick: number;
    /** status indicator */
    status: string;
}

/**
 * Sync message envelope for position updates
 * @see chatic-sockets-api #0.26.116
 */
export interface SyncEnvelope {
    type: 'sync';
    action: 'update';
    payload: PositionPayload;
    mid?: string;
    meta?: {
        ts?: number;
        seq?: number;
        channel?: string;
    };
}

/**
 * Canvas dimensions for coordinate normalization (if needed)
 */
export interface CanvasDimensions {
    width: number;
    height: number;
}

// Re-export for convenience
export type { ClientSyncPayload };
