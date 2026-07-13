const mockNotify = jest.fn();

const mockRelayGetBackend = jest.fn();
const mockRelayGetWss = jest.fn();
const mockRelayGetIdentityToken = jest.fn();
const mockRelayGetSelectedSiteId = jest.fn();
const mockRelayGetRelayToken = jest.fn();

const mockCloudGetSelectedCloudId = jest.fn();
const mockCloudGetBackend = jest.fn();
const mockCloudGetWss = jest.fn();
const mockCloudGetIdentityToken = jest.fn();
const mockCloudGetSelectedSiteId = jest.fn();
const mockCloudGetDelegationToken = jest.fn();
const mockCloudGetCloudToken = jest.fn();

const mockIdentityGetDelegatorId = jest.fn();

jest.mock('./core', () => ({
    relayCore: {
        getBackend: (...a: unknown[]) => mockRelayGetBackend(...a),
        getWss: (...a: unknown[]) => mockRelayGetWss(...a),
        getIdentityToken: (...a: unknown[]) => mockRelayGetIdentityToken(...a),
        getSelectedSiteId: (...a: unknown[]) => mockRelayGetSelectedSiteId(...a),
        getRelayToken: (...a: unknown[]) => mockRelayGetRelayToken(...a),
    },
    cloudCore: {
        getSelectedCloudId: (...a: unknown[]) => mockCloudGetSelectedCloudId(...a),
        getBackend: (...a: unknown[]) => mockCloudGetBackend(...a),
        getWss: (...a: unknown[]) => mockCloudGetWss(...a),
        getIdentityToken: (...a: unknown[]) => mockCloudGetIdentityToken(...a),
        getSelectedSiteId: (...a: unknown[]) => mockCloudGetSelectedSiteId(...a),
        getDelegationToken: (...a: unknown[]) => mockCloudGetDelegationToken(...a),
        getCloudToken: (...a: unknown[]) => mockCloudGetCloudToken(...a),
    },
    identityCore: {
        getDelegatorId: (...a: unknown[]) => mockIdentityGetDelegatorId(...a),
    },
}));

jest.mock('./utils', () => ({
    notifySessionStateChanged: (...a: unknown[]) => mockNotify(...a),
    registerSessionCacheInvalidator: jest.fn(),
}));

// Relay-only session (cloud inactive) with a fixed identity. buildIdentityContext derives uid from
// the active token (relay here), so mutating the relay token's uid is how we simulate a real change.
const seedRelayOnly = (relayToken: Record<string, unknown> | null = { uid: 'u1', Token: 't1' }) => {
    mockRelayGetBackend.mockReturnValue('relay-backend');
    mockRelayGetWss.mockReturnValue('wss://relay');
    mockRelayGetIdentityToken.mockReturnValue('relay-idt');
    mockRelayGetSelectedSiteId.mockReturnValue('site-1');
    mockRelayGetRelayToken.mockReturnValue(relayToken);

    mockCloudGetSelectedCloudId.mockReturnValue('default');
    mockCloudGetBackend.mockReturnValue(null);
    mockCloudGetWss.mockReturnValue(null);
    mockCloudGetIdentityToken.mockReturnValue(null);
    mockCloudGetSelectedSiteId.mockReturnValue(null);
    mockCloudGetDelegationToken.mockReturnValue(null);
    mockCloudGetCloudToken.mockReturnValue(null);

    mockIdentityGetDelegatorId.mockReturnValue(null);
};

describe('rebuildSessionIdentity — notify 게이팅 (#8)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seedRelayOnly();
    });

    it('관측 컨텍스트가 그대로면(예: 백그라운드 credential 재기록) notify를 생략한다', () => {
        jest.isolateModules(() => {
            const store = require('./contextStore');
            store.getSessionAuthSnapshot?.(); // no-op guard for tree-shaken exports
            store.sessionContextStore.getGlobalSessionContext(); // prime the cached context
            mockNotify.mockClear();

            store.rebuildSessionIdentity(); // nothing in core changed

            expect(mockNotify).not.toHaveBeenCalled();
        });
    });

    it('uid가 바뀌면 notify한다', () => {
        jest.isolateModules(() => {
            const store = require('./contextStore');
            store.sessionContextStore.getGlobalSessionContext(); // prime with uid=u1
            mockNotify.mockClear();

            // A genuine identity change (a new token carrying a different uid) must fan out.
            mockRelayGetRelayToken.mockReturnValue({ uid: 'u2', Token: 't2' });
            store.rebuildSessionIdentity();

            expect(mockNotify).toHaveBeenCalledTimes(1);
        });
    });

    it('cloud 토큰이 교체되면 notify한다', () => {
        jest.isolateModules(() => {
            // Activate a cloud session so the cloud token is part of the observable context.
            mockCloudGetSelectedCloudId.mockReturnValue('cloud-1');
            mockCloudGetBackend.mockReturnValue('cloud-backend');
            mockCloudGetWss.mockReturnValue('wss://cloud');
            mockCloudGetIdentityToken.mockReturnValue('cloud-idt');
            mockCloudGetCloudToken.mockReturnValue({ uid: 'u1', Token: 'cloud-t1' });

            const store = require('./contextStore');
            store.sessionContextStore.getGlobalSessionContext();
            mockNotify.mockClear();

            // A cloud credential refresh replaces the stored token object → reference changes → notify.
            mockCloudGetCloudToken.mockReturnValue({ uid: 'u1', Token: 'cloud-t2' });
            store.rebuildSessionIdentity();

            expect(mockNotify).toHaveBeenCalledTimes(1);
        });
    });
});
