import type { ClientSyncPayload, DeviceModel } from '@lemoncloud/chatic-sockets-api';

/**
 * Channel ID for pointer sync WebSocket communication
 */
export const POINTER_CHANNEL = '1000001';

/**
 * Client status type
 */
export type ClientStatusType = 'green' | 'yellow' | 'red' | '';

/**
 * Sync message envelope (type: 'sync', action: 'update')
 * @see chatic-sockets-api #0.26.116
 */
export interface SyncEnvelope {
    type: 'sync';
    action: 'update';
    payload: ClientSyncPayload;
    mid?: string;
    meta?: {
        ts?: number;
        seq?: number;
        channel?: string;
    };
}

/**
 * Model message envelope (type: 'model', action: 'update')
 * @see chatic-sockets-api #0.26.116
 */
export interface ModelEnvelope {
    type: 'model';
    action: 'update';
    payload: ClientSyncPayload & DeviceModel;
    mid?: string;
    meta?: {
        ts?: number;
        seq?: number;
        channel?: string;
    };
}

/**
 * Combined type for pointer-related messages
 */
export type PointerMessage = SyncEnvelope | ModelEnvelope;

/**
 * Remote pointer state for display
 */
export interface RemotePointer {
    deviceId: string;
    posX: number;
    posY: number;
    ts: number;
    tick: number;
    status: ClientStatusType;
    lastUpdated: number;
}

// Re-export types from chatic-sockets-api for convenience
export type { ClientSyncPayload, DeviceModel };
