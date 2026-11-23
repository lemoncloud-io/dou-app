import type { SocketState } from './types';

export const AUTH_OPTIONS = { refreshRatio: 0.8, maxFailures: 3, refreshIntervalMs: 5 * 60 * 1000 } as const;

export const SDK_REFRESH_CYCLE_MS = AUTH_OPTIONS.refreshIntervalMs;

export const DEFAULT_VERIFY_TIMEOUT_MS = 10_000;

export const INITIAL_SOCKET_STATE: SocketState = Object.freeze({
    state: 'idle',
    isConnected: false,
    isVerified: false,
    connectionId: null,
});
