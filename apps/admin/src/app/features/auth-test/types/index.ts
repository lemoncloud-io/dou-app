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

// Re-export token generation types from shared
export type { TokenGenerateRequest, TokenGenerateResponse, TokenGeneratorFormState } from '@chatic/shared';

// Note: AuthSession is defined in stores/useAuthMonitorStore.ts with extended history tracking

/**
 * Device ID storage key (admin-specific)
 */
export const DEVICE_ID_STORAGE_KEY = 'chatic_admin_auth_device_id';
