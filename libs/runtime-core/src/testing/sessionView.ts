import type { SessionSnapshot, SessionView } from '../session/snapshot';

export const emptySessionSnapshot = (): SessionSnapshot => ({
    context: {
        relay: { backend: null, wss: null, siteId: null, isAuthenticated: false },
        cloud: { cloudId: null, siteId: null, backend: null, wss: null, isActive: false },
        identity: { isInitialized: false, isAuthenticated: false, error: null, userId: null, delegatorId: null },
        activeServer: { kind: 'relay', backend: '', wss: '', siteId: null },
    },
    auth: { isInitialized: false, isAuthenticated: false, error: null },
    activeUser: null,
    relayUser: null,
    committedSiteId: null,
    uidByCloud: {},
    pairing: { isPairedSession: false, isInOwnCloudSession: false, cloudIds: [], cloudNames: {} },
});

export interface FakeSessionView extends SessionView {
    set(next: Partial<SessionSnapshot>): void;
    logout(): void;
}

export const fakeSessionView = (initial: Partial<SessionSnapshot> = {}): FakeSessionView => {
    let current: SessionSnapshot = { ...emptySessionSnapshot(), ...initial };
    const listeners = new Set<() => void>();
    const logoutListeners = new Set<() => void>();
    return {
        snapshot: () => current,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        set(next) {
            current = { ...current, ...next };
            for (const listener of [...listeners]) listener();
        },
        onLogout(listener) {
            logoutListeners.add(listener);
            return () => {
                logoutListeners.delete(listener);
            };
        },
        logout() {
            for (const listener of [...logoutListeners]) listener();
        },
    };
};
