/**
 * Auth Test Types for Web
 * Re-exports shared types from @chatic/socket and adds web-specific types
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
 * Device ID storage key (web-specific)
 */
export const DEVICE_ID_STORAGE_KEY = 'chatic_auth_device_id';
