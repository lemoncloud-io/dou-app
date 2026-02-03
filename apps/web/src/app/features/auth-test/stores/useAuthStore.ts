import { create } from 'zustand';

import type { AuthEventLogEntry, AuthState, MemberHead } from '../types';

/**
 * State transition history entry
 */
interface StateTransition {
    from: AuthState;
    to: AuthState;
    timestamp: number;
}

/**
 * Auth Store State
 */
interface AuthStoreState {
    /** Current auth state */
    authState: AuthState;
    /** State transition timestamp */
    stateAt: number | null;
    /** Device ID */
    deviceId: string;
    /** Auth ID from server */
    authId: string | null;
    /** Member ID */
    memberId: string | null;
    /** Member info */
    member: MemberHead | null;
    /** Error message */
    error: string | null;
    /** Event log entries */
    eventLog: AuthEventLogEntry[];
    /** dryRun mode enabled */
    dryRun: boolean;
    /** State transition history */
    stateHistory: StateTransition[];
}

/**
 * Auth Store Actions
 */
interface AuthStoreActions {
    /** Set auth state with history tracking */
    setAuthState: (state: AuthState) => void;
    /** Set state timestamp */
    setStateAt: (timestamp: number) => void;
    /** Set device ID */
    setDeviceId: (deviceId: string) => void;
    /** Set auth ID */
    setAuthId: (authId: string | null) => void;
    /** Set member ID */
    setMemberId: (memberId: string | null) => void;
    /** Set member info */
    setMember: (member: MemberHead | null) => void;
    /** Set error */
    setError: (error: string | null) => void;
    /** Add event log entry */
    addEventLog: (entry: Omit<AuthEventLogEntry, 'id' | 'timestamp'>) => void;
    /** Clear event log */
    clearEventLog: () => void;
    /** Toggle dryRun mode */
    setDryRun: (enabled: boolean) => void;
    /** Reset all state */
    reset: () => void;
    /** Clear state history */
    clearStateHistory: () => void;
}

const initialState: AuthStoreState = {
    authState: '',
    stateAt: null,
    deviceId: '',
    authId: null,
    memberId: null,
    member: null,
    error: null,
    eventLog: [],
    dryRun: true,
    stateHistory: [],
};

/**
 * Auth Store
 * - Manages WebSocket auth state
 * - Tracks event log for debugging
 */
export const useAuthStore = create<AuthStoreState & AuthStoreActions>(set => ({
    ...initialState,

    setAuthState: newState =>
        set(current => {
            const previousState = current.authState;
            const stateHistory = [...current.stateHistory];

            // Track state transition if state changed
            if (previousState && previousState !== newState) {
                stateHistory.push({
                    from: previousState,
                    to: newState,
                    timestamp: Date.now(),
                });
            }

            return {
                authState: newState,
                stateHistory: stateHistory.slice(-10), // Keep last 10 transitions
            };
        }),
    setStateAt: timestamp => set({ stateAt: timestamp }),
    setDeviceId: deviceId => set({ deviceId }),
    setAuthId: authId => set({ authId }),
    setMemberId: memberId => set({ memberId }),
    setMember: member => set({ member }),
    setError: error => set({ error }),

    addEventLog: entry =>
        set(state => ({
            eventLog: [
                {
                    ...entry,
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                    timestamp: Date.now(),
                },
                ...state.eventLog,
            ].slice(0, 100), // Keep last 100 entries
        })),

    clearEventLog: () => set({ eventLog: [] }),

    setDryRun: enabled => set({ dryRun: enabled }),

    reset: () => set(initialState),

    clearStateHistory: () => set({ stateHistory: [] }),
}));
