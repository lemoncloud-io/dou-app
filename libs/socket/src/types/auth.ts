/**
 * Auth-related types and constants for WebSocket authentication
 * @packageDocumentation
 */

import type { AuthPayload, WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

/**
 * Re-export from chatic-sockets-api for convenience
 */
export type { AuthPayload };

/**
 * Auth state type
 * @see chatic-sockets-api AuthState
 */
export type AuthState = '' | 'pending' | 'validating' | 'authenticated' | 'failed' | 'disconnected';

/**
 * Member head info
 * @see chatic-sockets-api MemberHead
 */
export interface MemberHead {
    id?: string;
    name?: string;
}

/**
 * Auth Envelope for WebSocket communication
 */
export type AuthEnvelope = WSSEnvelope<AuthPayload>;

/**
 * Event direction for logging
 */
export type EventDirection = 'sent' | 'received';

/**
 * Auth event log entry
 */
export interface AuthEventLogEntry {
    /** unique id */
    id: string;
    /** timestamp (ms) */
    timestamp: number;
    /** event direction */
    direction: EventDirection;
    /** event type */
    type: string;
    /** event action */
    action: string;
    /** payload data */
    payload: AuthPayload;
    /** source device ID (for admin monitoring) */
    sourceDeviceId?: string;
}

/**
 * Auth state color mapping
 */
export const AUTH_STATE_COLORS: Record<AuthState, string> = {
    '': 'bg-gray-400',
    pending: 'bg-yellow-500',
    validating: 'bg-blue-500',
    authenticated: 'bg-green-500',
    failed: 'bg-red-500',
    disconnected: 'bg-gray-500',
};

/**
 * Auth state label mapping
 */
export const AUTH_STATE_LABELS: Record<AuthState, string> = {
    '': 'Unknown',
    pending: 'Pending',
    validating: 'Validating',
    authenticated: 'Authenticated',
    failed: 'Failed',
    disconnected: 'Disconnected',
};

/**
 * Parse auth WebSocket message
 */
export const parseAuthWebSocketMessage = (data: unknown): { id?: string; action?: string; data: unknown } | null => {
    if (!data || typeof data !== 'object') return null;

    const message = data as Record<string, unknown>;

    return {
        id: message.mid as string | undefined,
        action: message.action as string | undefined,
        data: message,
    };
};
