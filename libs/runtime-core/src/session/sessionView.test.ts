import { createCoreSessionView } from './sessionView';

// The stores, as the view reads them. Each test sets what the stores hold and fires the signal that
// would announce it, the way the real stores do.
type Listener = () => void;
const mockStore = {
    context: null as unknown,
    auth: null as unknown,
    activeUser: null as unknown,
    relayUser: null as unknown,
    committedSiteId: null as string | null,
    uids: {} as Record<string, string>,
    paired: false,
    inOwnCloud: false,
    pairedIds: [] as string[],
    pairedNames: {} as Record<string, string>,
};
const mockInvalidators: Listener[] = [];
const mockSessionListeners = new Set<Listener>();
const mockBackgroundListeners = new Set<Listener>();
const mockPairedListeners = new Set<Listener>();
const mockNameListeners = new Set<Listener>();
const mockUidSourceListeners = new Set<Listener>();
const listen = (set: Set<Listener>) => (listener: Listener) => {
    set.add(listener);
    return () => set.delete(listener);
};

jest.mock('@chatic/session', () => ({
    cloudStore: { subscribeUidSources: (listener: Listener) => listen(mockUidSourceListeners)(listener) },
    getGlobalSessionContext: () => mockStore.context,
    getSessionAuthSnapshot: () => mockStore.auth,
    getActiveSessionUser: () => mockStore.activeUser,
    getRelaySessionUser: () => mockStore.relayUser,
    getCommittedSessionSiteId: () => mockStore.committedSiteId,
    getUidsInClouds: () => mockStore.uids,
    sessionSignal: { registerInvalidator: (fn: Listener) => mockInvalidators.push(fn) },
    subscribeSessionSignal: (listener: Listener) => listen(mockSessionListeners)(listener),
}));
jest.mock('@chatic/transport', () => ({
    backgroundClouds: { subscribe: (listener: Listener) => listen(mockBackgroundListeners)(listener) },
}));
jest.mock('@chatic/auth', () => ({
    isPairedSession: () => mockStore.paired,
    isInOwnCloudSession: () => mockStore.inOwnCloud,
    pairedClouds: {
        list: () => [...mockStore.pairedIds],
        names: () => ({ ...mockStore.pairedNames }),
        subscribe: (listener: Listener) => listen(mockPairedListeners)(listener),
        subscribeNames: (listener: Listener) => listen(mockNameListeners)(listener),
    },
}));

/** What the session signal does on a write: invalidators first, eagerly; then the listeners. */
const emitSession = () => {
    mockInvalidators.forEach(invalidate => invalidate());
    [...mockSessionListeners].forEach(listener => listener());
};
const emit = (listeners: Set<Listener>) => [...listeners].forEach(listener => listener());

const identity = (overrides: Record<string, unknown> = {}) => ({
    isInitialized: true,
    isAuthenticated: true,
    error: null,
    userId: 'uid-relay',
    delegatorId: 'delegator',
    ...overrides,
});

const relayContext = (overrides: Record<string, unknown> = {}) => ({
    relay: {
        backend: 'https://relay',
        wss: 'wss://relay',
        identityToken: 'relay-secret',
        siteId: 's1',
        isAuthenticated: true,
    },
    cloud: {
        cloudId: 'default',
        siteId: null,
        backend: null,
        wss: null,
        identityToken: null,
        delegationToken: null,
        cloudToken: null,
        isActive: false,
    },
    identity: identity(),
    activeServer: {
        kind: 'relay',
        backend: 'https://relay',
        wss: 'wss://relay',
        siteId: 's1',
        identityToken: 'relay-secret',
    },
    ...overrides,
});

beforeEach(() => {
    mockInvalidators.length = 0;
    [
        mockSessionListeners,
        mockBackgroundListeners,
        mockPairedListeners,
        mockNameListeners,
        mockUidSourceListeners,
    ].forEach(set => set.clear());
    mockStore.context = relayContext();
    mockStore.auth = { isInitialized: true, isAuthenticated: true, error: null };
    mockStore.activeUser = { uid: 'uid-relay', name: 'Me' };
    mockStore.relayUser = { uid: 'uid-relay', name: 'Me' };
    mockStore.committedSiteId = null;
    mockStore.uids = { default: 'uid-relay' };
    mockStore.paired = false;
    mockStore.inOwnCloud = false;
    mockStore.pairedIds = [];
    mockStore.pairedNames = {};
});

describe('createCoreSessionView', () => {
    it('reads the session without a single token', () => {
        mockStore.context = relayContext({
            cloud: {
                cloudId: 'c1',
                siteId: 'p1',
                backend: 'https://cloud',
                wss: 'wss://cloud',
                identityToken: 'cloud-secret',
                delegationToken: { cloudId: 'c1', token: 'delegation-secret' },
                cloudToken: { uid: 'u-c1', Token: { identityToken: 'cloud-secret' } },
                isActive: true,
            },
            activeServer: {
                kind: 'cloud',
                cloudId: 'c1',
                siteId: 'p1',
                backend: 'https://cloud',
                wss: 'wss://cloud',
                identityToken: 'cloud-secret',
            },
        });

        const snapshot = createCoreSessionView().snapshot();

        expect(JSON.stringify(snapshot)).not.toMatch(/secret|identityToken|delegationToken|cloudToken/);
        expect(snapshot.context.activeServer).toEqual({
            kind: 'cloud',
            cloudId: 'c1',
            siteId: 'p1',
            backend: 'https://cloud',
            wss: 'wss://cloud',
        });
        expect(snapshot.context.cloud).toEqual({
            cloudId: 'c1',
            siteId: 'p1',
            backend: 'https://cloud',
            wss: 'wss://cloud',
            isActive: true,
        });
    });

    it('carries an error as its message, so the snapshot is plain JSON', () => {
        mockStore.context = relayContext({ identity: identity({ error: new Error('boot failed') }) });
        mockStore.auth = { isInitialized: true, isAuthenticated: false, error: new Error('boot failed') };

        const snapshot = createCoreSessionView().snapshot();

        expect(snapshot.context.identity.error).toBe('boot failed');
        expect(snapshot.auth.error).toBe('boot failed');
        expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    });

    it('returns the same snapshot until the session changes', () => {
        const view = createCoreSessionView();
        const first = view.snapshot();

        expect(view.snapshot()).toBe(first);

        mockStore.context = relayContext({ identity: identity({ userId: 'uid-2' }) });
        emitSession();

        expect(view.snapshot()).not.toBe(first);
        expect(view.snapshot().context.identity.userId).toBe('uid-2');
    });

    it('lets a subscriber read the new session from inside its notification', () => {
        const view = createCoreSessionView();
        view.snapshot();
        let seen: string | null = null;
        view.subscribe(() => {
            seen = view.snapshot().context.identity.userId;
        });

        mockStore.context = relayContext({ identity: identity({ userId: 'uid-2' }) });
        emitSession();

        expect(seen).toBe('uid-2');
    });

    it("re-reads a cloud's uid when the background clouds move, which is no session signal", () => {
        const view = createCoreSessionView();
        const listener = jest.fn();
        view.subscribe(listener);
        expect(view.snapshot().uidByCloud).toEqual({ default: 'uid-relay' });

        mockStore.uids = { default: 'uid-relay', c2: 'uid-c2' };
        emit(mockBackgroundListeners);

        expect(listener).toHaveBeenCalled();
        expect(view.snapshot().uidByCloud).toEqual({ default: 'uid-relay', c2: 'uid-c2' });
    });

    it("re-reads a cloud's uid when the token cache or the recorded identities are written", () => {
        const view = createCoreSessionView();
        const listener = jest.fn();
        view.subscribe(listener);
        view.snapshot();

        mockStore.uids = { default: 'uid-relay', c1: 'owner-uid' };
        emit(mockUidSourceListeners);

        expect(listener).toHaveBeenCalled();
        expect(view.snapshot().uidByCloud).toEqual({ default: 'uid-relay', c1: 'owner-uid' });
    });

    it('reads again on the next call after a read that threw, rather than serving the older snapshot', () => {
        const view = createCoreSessionView();
        view.snapshot();
        mockStore.context = null;
        emitSession();
        expect(() => view.snapshot()).toThrow();

        mockStore.context = relayContext({ identity: identity({ userId: 'uid-2' }) });

        expect(view.snapshot().context.identity.userId).toBe('uid-2');
    });

    it('re-reads the paired clouds when their list or their names move', () => {
        const view = createCoreSessionView();
        view.subscribe(jest.fn());
        view.snapshot();

        mockStore.pairedIds = ['c3'];
        mockStore.paired = true;
        emit(mockPairedListeners);
        expect(view.snapshot().pairing).toMatchObject({ isPairedSession: true, cloudIds: ['c3'] });

        mockStore.pairedNames = { c3: 'Studio' };
        emit(mockNameListeners);
        expect(view.snapshot().pairing.cloudNames).toEqual({ c3: 'Studio' });
    });

    it('keeps an unchanged part the same object, so its readers do not re-render', () => {
        const view = createCoreSessionView();
        view.subscribe(jest.fn());
        const before = view.snapshot();

        mockStore.pairedNames = { c3: 'Studio' };
        emit(mockNameListeners);
        const after = view.snapshot();

        expect(after).not.toBe(before);
        expect(after.context).toBe(before.context);
        expect(after.auth).toBe(before.auth);
        expect(after.activeUser).toBe(before.activeUser);
        expect(after.uidByCloud).toBe(before.uidByCloud);
    });

    it("keeps the identity the same object while the session's other parts move", () => {
        const view = createCoreSessionView();
        const sameIdentity = identity();
        mockStore.context = { ...relayContext(), identity: sameIdentity };
        const before = view.snapshot();

        mockStore.context = {
            ...relayContext({ relay: { ...relayContext().relay, siteId: 's2' } }),
            identity: sameIdentity,
        };
        emitSession();
        const after = view.snapshot();

        expect(after.context).not.toBe(before.context);
        expect(after.context.identity).toBe(before.context.identity);
    });

    it('returns the same snapshot after a signal that changed nothing it reads', () => {
        const view = createCoreSessionView();
        const before = view.snapshot();

        emit(mockBackgroundListeners);

        expect(view.snapshot()).toBe(before);
    });

    it('stops telling a subscriber once it unsubscribes', () => {
        const view = createCoreSessionView();
        const listener = jest.fn();
        const stop = view.subscribe(listener);

        stop();
        emitSession();
        emit(mockBackgroundListeners);
        emit(mockPairedListeners);
        emit(mockNameListeners);
        emit(mockUidSourceListeners);

        expect(listener).not.toHaveBeenCalled();
    });
});
