/**
 * Auth Test Types for Admin
 * @see chatic-sockets-api #0.26.118
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
 * Auth session info for monitoring
 */
export interface AuthSession {
    /** Device ID */
    deviceId: string;
    /** Auth ID */
    authId: string;
    /** Auth state */
    state: AuthState;
    /** State timestamp */
    stateAt: number;
    /** Member ID */
    memberId: string | null;
    /** Member info */
    member: MemberHead | null;
    /** Error message */
    error: string | null;
    /** Last updated timestamp */
    updatedAt: number;
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
 * Device ID storage key
 */
export const DEVICE_ID_STORAGE_KEY = 'chatic_admin_auth_device_id';
