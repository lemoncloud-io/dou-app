import { create } from 'zustand';

import type { AuthEventLogEntry, AuthSession, AuthState, MemberHead } from '../types';

/**
 * Auth Monitor Store State
 */
interface AuthMonitorStoreState {
    /** Connected auth sessions by deviceId */
    sessions: Map<string, AuthSession>;
    /** Event log entries */
    eventLog: AuthEventLogEntry[];
    /** Own device ID */
    ownDeviceId: string;
    /** Own auth state */
    ownAuthState: AuthState;
    /** Own auth ID */
    ownAuthId: string | null;
}

/**
 * Auth Monitor Store Actions
 */
interface AuthMonitorStoreActions {
    /** Set or update a session */
    setSession: (session: AuthSession) => void;
    /** Remove a session by deviceId */
    removeSession: (deviceId: string) => void;
    /** Clear all sessions */
    clearSessions: () => void;
    /** Add event log entry */
    addEventLog: (entry: Omit<AuthEventLogEntry, 'id' | 'timestamp'>) => void;
    /** Clear event log */
    clearEventLog: () => void;
    /** Set own device ID */
    setOwnDeviceId: (deviceId: string) => void;
    /** Set own auth state */
    setOwnAuthState: (state: AuthState) => void;
    /** Set own auth ID */
    setOwnAuthId: (authId: string | null) => void;
    /** Update session from auth payload */
    updateSessionFromPayload: (payload: {
        deviceId?: string;
        authId?: string;
        state?: AuthState;
        stateAt?: number;
        memberId?: string;
        member$?: MemberHead;
        error?: string;
    }) => void;
}

/**
 * Auth Monitor Store
 * - Monitors connected auth sessions
 * - Tracks event log for debugging
 */
export const useAuthMonitorStore = create<AuthMonitorStoreState & AuthMonitorStoreActions>((set, get) => ({
    sessions: new Map(),
    eventLog: [],
    ownDeviceId: '',
    ownAuthState: '',
    ownAuthId: null,

    setSession: session =>
        set(state => {
            const newSessions = new Map(state.sessions);
            newSessions.set(session.deviceId, session);
            return { sessions: newSessions };
        }),

    removeSession: deviceId =>
        set(state => {
            const newSessions = new Map(state.sessions);
            newSessions.delete(deviceId);
            return { sessions: newSessions };
        }),

    clearSessions: () => set({ sessions: new Map() }),

    addEventLog: entry =>
        set(state => ({
            eventLog: [
                {
                    ...entry,
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                    timestamp: Date.now(),
                },
                ...state.eventLog,
            ].slice(0, 200), // Keep last 200 entries for admin
        })),

    clearEventLog: () => set({ eventLog: [] }),

    setOwnDeviceId: deviceId => set({ ownDeviceId: deviceId }),

    setOwnAuthState: state => set({ ownAuthState: state }),

    setOwnAuthId: authId => set({ ownAuthId: authId }),

    updateSessionFromPayload: payload => {
        const { deviceId, authId, state, stateAt, memberId, member$, error } = payload;

        if (!deviceId) return;

        const currentSessions = get().sessions;
        const existingSession = currentSessions.get(deviceId);

        const updatedSession: AuthSession = {
            deviceId,
            authId: authId || existingSession?.authId || '',
            state: state || existingSession?.state || 'pending',
            stateAt: stateAt || existingSession?.stateAt || Date.now(),
            memberId: memberId ?? existingSession?.memberId ?? null,
            member: member$ ?? existingSession?.member ?? null,
            error: error ?? existingSession?.error ?? null,
            updatedAt: Date.now(),
        };

        set(storeState => {
            const newSessions = new Map(storeState.sessions);
            newSessions.set(deviceId, updatedSession);
            return { sessions: newSessions };
        });
    },
}));
