/**
 * Auth Test Types for Admin
 * Re-exports shared types from @chatic/socket and adds admin-specific types
 */

// Re-export shared auth types
export { AUTH_STATE_COLORS, AUTH_STATE_LABELS, parseAuthWebSocketMessage } from '@chatic/socket';

export type {
    AuthEnvelope,
    AuthEventLogEntry,
    AuthPayload,
    AuthState,
    EventDirection,
    MemberHead,
} from '@chatic/socket';

/**
 * Auth session info for monitoring (admin-specific)
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
 * Device ID storage key (admin-specific)
 */
export const DEVICE_ID_STORAGE_KEY = 'chatic_admin_auth_device_id';
