const mockNotify = jest.fn();

const mockRelayGetBackend = jest.fn();
const mockRelayGetWss = jest.fn();
const mockRelayGetIdentityToken = jest.fn();
const mockRelayGetSelectedSiteId = jest.fn();
const mockRelayGetRelayToken = jest.fn();
const mockRelaySaveRelayToken = jest.fn();

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
        saveRelayToken: (...a: unknown[]) => mockRelaySaveRelayToken(...a),
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

describe('getRelaySessionUser / patchRelaySessionUser — 계정(relay) 프로필 소스', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('클라우드 세션이 활성이어도 relay 토큰의 유저 필드를 돌려준다', () => {
        jest.isolateModules(() => {
            seedRelayOnly({
                uid: 'relay-uid',
                name: 'Relay Me',
                photo: 'relay.png',
                email: 'me@relay.io',
                Token: 'relay-t',
            });
            // Cloud active: getActiveSessionUser would answer with the cloud record from here on.
            mockCloudGetSelectedCloudId.mockReturnValue('cloud-1');
            mockCloudGetBackend.mockReturnValue('cloud-backend');
            mockCloudGetWss.mockReturnValue('wss://cloud');
            mockCloudGetIdentityToken.mockReturnValue('cloud-idt');
            mockCloudGetCloudToken.mockReturnValue({ uid: 'cloud-uid', name: 'Cloud Me', Token: 'cloud-t' });

            const store = require('./contextStore');

            expect(store.getActiveSessionUser()).toMatchObject({ uid: 'cloud-uid', name: 'Cloud Me' });
            expect(store.getRelaySessionUser()).toMatchObject({
                uid: 'relay-uid',
                name: 'Relay Me',
                photo: 'relay.png',
                email: 'me@relay.io',
            });
            // The auth carrier is never part of the display view.
            expect(store.getRelaySessionUser()).not.toHaveProperty('Token');
        });
    });

    it('relay 세션이 없으면 null이다', () => {
        jest.isolateModules(() => {
            seedRelayOnly(null);
            const store = require('./contextStore');

            expect(store.getRelaySessionUser()).toBeNull();
        });
    });

    it('$user 래퍼가 있으면 그 안을 읽는다', () => {
        jest.isolateModules(() => {
            seedRelayOnly({ uid: 'relay-uid', $user: { name: 'Wrapped' }, name: 'Flat', Token: 'relay-t' });
            const store = require('./contextStore');

            expect(store.getRelaySessionUser()).toEqual({ name: 'Wrapped' });
        });
    });

    it('patch는 저장된 relay 토큰에 병합되고 Token은 건드리지 않는다', () => {
        jest.isolateModules(() => {
            seedRelayOnly({ uid: 'relay-uid', name: 'Old', Token: 'relay-t' });
            const store = require('./contextStore');

            store.patchRelaySessionUser({ name: 'New', photo: 'new.png', Token: 'HACKED' });

            expect(mockRelaySaveRelayToken).toHaveBeenCalledWith({
                uid: 'relay-uid',
                name: 'New',
                photo: 'new.png',
                Token: 'relay-t',
            });
        });
    });

    it('$user 래퍼가 있으면 그 안에 patch한다 — 쓴 값이 읽히는 값이어야 한다', () => {
        jest.isolateModules(() => {
            seedRelayOnly({ uid: 'relay-uid', $user: { name: 'Old' }, Token: 'relay-t' });
            const store = require('./contextStore');

            store.patchRelaySessionUser({ name: 'New' });

            expect(mockRelaySaveRelayToken).toHaveBeenCalledWith({
                uid: 'relay-uid',
                $user: { name: 'New' },
                Token: 'relay-t',
            });
        });
    });

    it('relay 세션이 없으면 patch는 아무것도 저장하지 않는다', () => {
        jest.isolateModules(() => {
            seedRelayOnly(null);
            const store = require('./contextStore');

            store.patchRelaySessionUser({ name: 'New' });

            expect(mockRelaySaveRelayToken).not.toHaveBeenCalled();
        });
    });
});
