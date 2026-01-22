/**
 * Channel ID for pointer sync WebSocket communication
 */
export const POINTER_CHANNEL = '1000001';

/**
 * Position payload for WebSocket communication
 * Matches server-defined PositionPayload interface
 */
export interface PositionPayload {
    /** x position (pixel) */
    posX: number;
    /** y position (pixel) */
    posY: number;
    /** client timestamp (ms) */
    ts: number;
    /** source device id (added by server) */
    readonly deviceId?: string;
}

/**
 * WSSEnvelope wrapper for position messages
 */
export interface PositionEnvelope {
    type: 'position';
    action: 'sync';
    payload: PositionPayload;
    mid?: string;
    meta?: {
        ts?: number;
        seq?: number;
        channel?: string;
    };
}

/**
 * Remote pointer state for display
 */
export interface RemotePointer {
    deviceId: string;
    posX: number;
    posY: number;
    ts: number;
    lastUpdated: number;
}
