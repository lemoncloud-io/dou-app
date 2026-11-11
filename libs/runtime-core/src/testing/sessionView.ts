import type { SessionSnapshot, SessionView } from '../session/snapshot';

/** A signed-out session with nothing selected — the snapshot a fresh install starts from. */
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

/** A session view a test drives: `set` replaces the snapshot and tells every subscriber. */
export interface FakeSessionView extends SessionView {
    set(next: Partial<SessionSnapshot>): void;
}

/**
 * A session view for a test of something that reads the session through the engine — hand it to the
 * React surface in an engine (`initAppRuntime({ ...coreEngine, session })`) and change the session with
 * `set`. Each `set` makes a new snapshot object, as the real view does on a change.
 */
export const fakeSessionView = (initial: Partial<SessionSnapshot> = {}): FakeSessionView => {
    let current: SessionSnapshot = { ...emptySessionSnapshot(), ...initial };
    const listeners = new Set<() => void>();
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
    };
};
