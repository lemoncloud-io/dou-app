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
const mockCloudGetCloudTokenOf = jest.fn();
const mockCloudGetCloudIdentity = jest.fn();
const mockCloudGetCachedCloudIds = jest.fn((): string[] => []);
const mockCloudGetCloudIdentities = jest.fn((): Record<string, { uid: string }> => ({}));

const mockIdentityGetDelegatorId = jest.fn();

jest.mock('./stores', () => ({
    relayStore: {
        getBackend: (...a: unknown[]) => mockRelayGetBackend(...a),
        getWss: (...a: unknown[]) => mockRelayGetWss(...a),
        getIdentityToken: (...a: unknown[]) => mockRelayGetIdentityToken(...a),
        getSelectedSiteId: (...a: unknown[]) => mockRelayGetSelectedSiteId(...a),
        getRelayToken: (...a: unknown[]) => mockRelayGetRelayToken(...a),
        saveRelayToken: (...a: unknown[]) => mockRelaySaveRelayToken(...a),
    },
    cloudStore: {
        getSelectedCloudId: (...a: unknown[]) => mockCloudGetSelectedCloudId(...a),
        getBackend: (...a: unknown[]) => mockCloudGetBackend(...a),
        getWss: (...a: unknown[]) => mockCloudGetWss(...a),
        getIdentityToken: (...a: unknown[]) => mockCloudGetIdentityToken(...a),
        getSelectedSiteId: (...a: unknown[]) => mockCloudGetSelectedSiteId(...a),
        getDelegationToken: (...a: unknown[]) => mockCloudGetDelegationToken(...a),
        getCloudToken: (...a: unknown[]) => mockCloudGetCloudToken(...a),
        getCloudTokenOf: (...a: unknown[]) => mockCloudGetCloudTokenOf(...a),
        getCloudIdentity: (...a: unknown[]) => mockCloudGetCloudIdentity(...a),
        getCachedCloudIds: () => mockCloudGetCachedCloudIds(),
        getCloudIdentities: () => mockCloudGetCloudIdentities(),
    },
    identityStore: {
        getDelegatorId: (...a: unknown[]) => mockIdentityGetDelegatorId(...a),
    },
}));

jest.mock('./signal', () => ({
    sessionSignal: {
        emit: (...a: unknown[]) => mockNotify(...a),
        batch: (fn: () => unknown) => fn(),
        subscribe: jest.fn(() => () => undefined),
        registerInvalidator: jest.fn(),
    },
}));

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
            store.getSessionAuthSnapshot?.();
            store.sessionContextStore.getGlobalSessionContext();
            mockNotify.mockClear();

            store.rebuildSessionIdentity();

            expect(mockNotify).not.toHaveBeenCalled();
        });
    });

    it('uid가 바뀌면 notify한다', () => {
        jest.isolateModules(() => {
            const store = require('./contextStore');
            store.sessionContextStore.getGlobalSessionContext();
            mockNotify.mockClear();

            mockRelayGetRelayToken.mockReturnValue({ uid: 'u2', Token: 't2' });
            store.rebuildSessionIdentity();

            expect(mockNotify).toHaveBeenCalledTimes(1);
        });
    });

    it('cloud 토큰만 교체되고 uid가 그대로면 identity를 알리지 않는다', () => {
        jest.isolateModules(() => {
            mockCloudGetSelectedCloudId.mockReturnValue('cloud-1');
            mockCloudGetBackend.mockReturnValue('cloud-backend');
            mockCloudGetWss.mockReturnValue('wss://cloud');
            mockCloudGetIdentityToken.mockReturnValue('cloud-idt');
            mockCloudGetCloudToken.mockReturnValue({ uid: 'u1', Token: 'cloud-t1' });

            const store = require('./contextStore');
            store.sessionContextStore.getGlobalSessionContext();
            mockNotify.mockClear();

            mockCloudGetCloudToken.mockReturnValue({ uid: 'u1', Token: 'cloud-t2' });
            store.rebuildSessionIdentity();

            expect(mockNotify).not.toHaveBeenCalled();

            mockCloudGetCloudToken.mockReturnValue({ uid: 'u2', Token: 'cloud-t3' });
            store.rebuildSessionIdentity();

            expect(mockNotify).toHaveBeenCalledWith('identity');
        });
    });
});

describe('getUidInCloud — the uid this account has in one cloud, committed or not', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCloudGetCloudTokenOf.mockReturnValue(null);
        mockCloudGetCloudIdentity.mockReturnValue(null);
    });

    it('answers the relay with the relay token uid, even while a cloud token is active', () => {
        jest.isolateModules(() => {
            seedRelayOnly({ uid: 'relay-uid', Token: 't' });
            mockCloudGetCloudToken.mockReturnValue({ uid: 'cloud-uid' });

            expect(require('./contextStore').getUidInCloud('default')).toBe('relay-uid');
            expect(mockCloudGetCloudTokenOf).not.toHaveBeenCalled();
        });
    });

    it('answers a cloud with the uid of the token its socket signs with', () => {
        jest.isolateModules(() => {
            seedRelayOnly();
            mockCloudGetCloudTokenOf.mockImplementation((cid: string) => (cid === 'cloud-a' ? { uid: 'uid-a' } : null));
            mockCloudGetCloudIdentity.mockReturnValue({ uid: 'stale-uid' });

            expect(require('./contextStore').getUidInCloud('cloud-a')).toBe('uid-a');
        });
    });

    it('falls back to the recorded identity once the token is gone', () => {
        jest.isolateModules(() => {
            seedRelayOnly();
            mockCloudGetCloudIdentity.mockImplementation((cid: string) =>
                cid === 'cloud-b' ? { uid: 'uid-b' } : null
            );

            expect(require('./contextStore').getUidInCloud('cloud-b')).toBe('uid-b');
        });
    });

    it('takes a token id when it carries no uid, as the session identity does', () => {
        jest.isolateModules(() => {
            seedRelayOnly();
            mockCloudGetCloudTokenOf.mockReturnValue({ id: 'id-only' });

            expect(require('./contextStore').getUidInCloud('cloud-a')).toBe('id-only');
        });
    });

    it('is null for a cloud this account has no uid in', () => {
        jest.isolateModules(() => {
            seedRelayOnly();

            expect(require('./contextStore').getUidInCloud('cloud-z')).toBeNull();
        });
    });
});

describe('getUidsInClouds — every uid getUidInCloud answers, as one map', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCloudGetCloudTokenOf.mockReturnValue(null);
        mockCloudGetCloudIdentity.mockReturnValue(null);
        mockCloudGetCachedCloudIds.mockReturnValue([]);
        mockCloudGetCloudIdentities.mockReturnValue({});
        mockCloudGetDelegationToken.mockReturnValue(null);
    });

    it('answers the relay, the committed cloud, cached-token clouds and recorded identities', () => {
        jest.isolateModules(() => {
            seedRelayOnly({ uid: 'relay-uid', Token: 't' });
            mockCloudGetDelegationToken.mockReturnValue({ cloudId: 'committed' });
            mockCloudGetCachedCloudIds.mockReturnValue(['cached']);
            mockCloudGetCloudIdentities.mockReturnValue({ recorded: { uid: 'uid-recorded' } });
            const tokens: Record<string, { uid: string }> = {
                committed: { uid: 'uid-committed' },
                cached: { uid: 'uid-cached' },
            };
            mockCloudGetCloudTokenOf.mockImplementation((cid: string) => tokens[cid] ?? null);
            mockCloudGetCloudIdentity.mockImplementation((cid: string) =>
                cid === 'recorded' ? { uid: 'uid-recorded' } : null
            );

            expect(require('./contextStore').getUidsInClouds()).toEqual({
                default: 'relay-uid',
                committed: 'uid-committed',
                cached: 'uid-cached',
                recorded: 'uid-recorded',
            });
        });
    });

    it('leaves out a cloud getUidInCloud has no uid for', () => {
        jest.isolateModules(() => {
            seedRelayOnly();
            mockCloudGetCachedCloudIds.mockReturnValue(['tokenless']);

            expect(require('./contextStore').getUidsInClouds()).not.toHaveProperty('tokenless');
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

const seedCloudActive = () => {
    seedRelayOnly();
    mockCloudGetSelectedCloudId.mockReturnValue('c1');
    mockCloudGetBackend.mockReturnValue('https://c1.example.com');
    mockCloudGetWss.mockReturnValue('wss://c1.example.com');
    mockCloudGetIdentityToken.mockReturnValue('cloud-idt');
    mockCloudGetSelectedSiteId.mockReturnValue('site-c1');
    mockCloudGetCloudToken.mockReturnValue({ uid: 'cu1', Token: 'ct1' });
};

describe('getCloudSessionSnapshot — 같은 tick 안의 일관성 (ADR-0076 배치 A12)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('활성 클라우드의 네 필드를 스냅샷으로 돌려준다', () => {
        seedCloudActive();
        jest.isolateModules(() => {
            const store = require('./contextStore');
            expect(store.sessionContextStore.getCloudSessionSnapshot()).toEqual({
                cloudId: 'c1',
                siteId: 'site-c1',
                identityToken: 'cloud-idt',
                backend: 'https://c1.example.com',
                wss: 'wss://c1.example.com',
            });
        });
    });

    it('필드가 하나라도 비면 null이다', () => {
        seedCloudActive();
        mockCloudGetIdentityToken.mockReturnValue(null);
        jest.isolateModules(() => {
            const store = require('./contextStore');
            expect(store.sessionContextStore.getCloudSessionSnapshot()).toBeNull();
        });
    });

    it('캐시가 프라임된 뒤 스토리지가 바뀌어도 다른 독자와 같은 답을 낸다 (notify 없이는 안 움직인다)', () => {
        seedCloudActive();
        jest.isolateModules(() => {
            const store = require('./contextStore');
            store.sessionContextStore.getGlobalSessionContext();

            mockCloudGetSelectedCloudId.mockReturnValue('c2');

            expect(store.sessionContextStore.getCloudSessionSnapshot()?.cloudId).toBe('c1');
            expect(store.sessionContextStore.getCloudContext().cloudId).toBe('c1');
        });
    });
});
