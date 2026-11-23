import type { SessionSignalKind } from './signal';

import { cloudStore } from './cloudStore';
import { identityStore } from './identityStore';
import { relayStore } from './relayStore';

const mockEmitted: SessionSignalKind[] = [];
const mockBatches: SessionSignalKind[][] = [];
const mockOpen: SessionSignalKind[][] = [];

jest.mock('./signal', () => ({
    sessionSignal: {
        emit: (kind: SessionSignalKind) => {
            mockEmitted.push(kind);
            mockOpen[mockOpen.length - 1]?.push(kind);
        },
        batch: (run: () => void) => {
            const collected: SessionSignalKind[] = [];
            mockOpen.push(collected);
            try {
                run();
            } finally {
                mockOpen.pop();
                mockBatches.push(collected);
            }
        },
        subscribe: () => () => undefined,
    },
}));

const mockCells = new Map<string, string>();
jest.mock('./ports', () => {
    const port = {
        get: (key: string) => mockCells.get(key) ?? null,
        set: (key: string, value: string) => {
            mockCells.set(key, value);
        },
        remove: (key: string) => {
            mockCells.delete(key);
        },
    };
    return { secretPort: port, plainPort: port };
});

const TOKEN = { Token: { identityToken: 'id-token' } } as never;

beforeEach(() => {
    mockEmitted.length = 0;
    mockBatches.length = 0;
    mockOpen.length = 0;
    mockCells.clear();
});

const WRITES: Array<{ name: string; write: () => void; kinds: SessionSignalKind[] }> = [
    {
        name: 'relayStore.saveSelectedSiteId',
        write: () => relayStore.saveSelectedSiteId('site-1'),
        kinds: ['selection'],
    },
    { name: 'relayStore.clearSelectedSite', write: () => relayStore.clearSelectedSite(), kinds: ['selection'] },
    { name: 'relayStore.saveRelayToken', write: () => relayStore.saveRelayToken(TOKEN), kinds: ['relay:token'] },
    { name: 'relayStore.clearToken', write: () => relayStore.clearToken(), kinds: ['relay:token'] },
    {
        name: 'cloudStore.saveDelegationToken',
        write: () => cloudStore.saveDelegationToken(TOKEN),
        kinds: ['cloud:token'],
    },
    { name: 'cloudStore.saveCloudToken', write: () => cloudStore.saveCloudToken(TOKEN), kinds: ['cloud:token'] },
    {
        name: 'cloudStore.saveSelectedCloudId',
        write: () => cloudStore.saveSelectedCloudId('cloud-1'),
        kinds: ['selection'],
    },
    {
        name: 'cloudStore.saveSelectedSiteId',
        write: () => cloudStore.saveSelectedSiteId('site-1'),
        kinds: ['selection'],
    },
    { name: 'cloudStore.clearSelectedSite', write: () => cloudStore.clearSelectedSite(), kinds: ['selection'] },
    {
        name: 'cloudStore.clearSession',
        write: () => cloudStore.clearSession(),
        kinds: ['cloud:token', 'selection'],
    },
    { name: 'identityStore.setDelegatorId', write: () => identityStore.setDelegatorId('deleg-1'), kinds: ['identity'] },
    {
        name: 'identityStore.setDelegatorId(null)',
        write: () => identityStore.setDelegatorId(null),
        kinds: ['identity'],
    },
    { name: 'identityStore.setDeviceId', write: () => identityStore.setDeviceId('device-1'), kinds: ['identity'] },
    { name: 'identityStore.setDeviceId(null)', write: () => identityStore.setDeviceId(null), kinds: ['identity'] },
];

describe('세션 스토어 — 쓰기마다 자기 종류를 통지한다 (원칙 8)', () => {
    it.each(WRITES)('$name → $kinds', ({ write, kinds }) => {
        write();

        expect(mockEmitted).toEqual(kinds);
    });
});

describe('세션 스토어 — 통지하지 않는 쓰기', () => {
    it('setCachedCloudTokens는 세션 상태가 아니라 캐시라 아무것도 emit하지 않는다', () => {
        cloudStore.setCachedCloudTokens('cloud-1', { cloudToken: TOKEN, delegationToken: TOKEN } as never);

        expect(mockEmitted).toEqual([]);
    });

    it('dropCachedCloudTokens is the cache too — nothing is emitted', () => {
        cloudStore.setCachedCloudTokens('cloud-1', { cloudToken: TOKEN, delegationToken: TOKEN } as never);
        mockEmitted.length = 0;

        cloudStore.dropCachedCloudTokens('cloud-1');

        expect(cloudStore.peekCachedCloudTokens('cloud-1')).toBeNull();
        expect(mockEmitted).toEqual([]);
    });

    it('setCloudIdentity and clearCloudIdentities emit nothing', () => {
        cloudStore.setCloudIdentity('cloud-1', { uid: 'u1' });
        cloudStore.clearCloudIdentities();

        expect(mockEmitted).toEqual([]);
    });

    it('clearCachedCloudTokens is the cache too — nothing is emitted', () => {
        cloudStore.setCachedCloudTokens('cloud-1', { cloudToken: TOKEN, delegationToken: TOKEN } as never);
        mockEmitted.length = 0;

        cloudStore.clearCachedCloudTokens();

        expect(mockEmitted).toEqual([]);
    });

    it('recordCloudUse and clearRecentClouds emit nothing', () => {
        cloudStore.recordCloudUse('cloud-1');
        cloudStore.clearRecentClouds();

        expect(mockEmitted).toEqual([]);
    });

    it('setReclaimedFor and clearReclaimedClouds emit nothing', () => {
        cloudStore.setReclaimedFor('cloud-1', 'account-1');
        cloudStore.clearReclaimedClouds();

        expect(mockEmitted).toEqual([]);
    });

    it('읽기는 통지하지 않는다 — 만료된 캐시 항목을 스스로 지우는 읽기까지', () => {
        cloudStore.setCachedCloudTokens('cloud-1', {
            cloudToken: {
                Token: {
                    identityToken: `h.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 })).toString('base64url')}.s`,
                },
            },
            delegationToken: TOKEN,
        } as never);
        mockEmitted.length = 0;

        expect(cloudStore.getCachedCloudTokens('cloud-1')).toBeNull();
        expect(mockEmitted).toEqual([]);
    });
});

describe('세션 스토어 — 유스케이스 하나는 팬아웃 하나 (원칙 8 후반)', () => {
    it('clearSession의 두 종류는 한 batch 안에서 나온다', () => {
        cloudStore.clearSession();

        expect(mockBatches).toEqual([['cloud:token', 'selection']]);
    });

    it('단건 쓰기는 batch를 열지 않는다 — 경계는 유스케이스의 것이다', () => {
        relayStore.saveRelayToken(TOKEN);

        expect(mockBatches).toEqual([]);
    });
});

describe('세션 스토어 — 쓰기 인구조사', () => {
    it('표가 세 스토어의 쓰기 메서드를 전부 덮는다', () => {
        const covered = new Set(
            WRITES.map(entry => entry.name.replace(/\(null\)$/, '')).concat([
                'cloudStore.setCachedCloudTokens',
                'cloudStore.dropCachedCloudTokens',
                'cloudStore.setCloudIdentity',
                'cloudStore.clearCloudIdentities',
                'cloudStore.clearCachedCloudTokens',
                'cloudStore.recordCloudUse',
                'cloudStore.clearRecentClouds',
                'cloudStore.setReclaimedFor',
                'cloudStore.clearReclaimedClouds',
            ])
        );

        const methodsOf = (store: object, label: string): string[] =>
            Object.getOwnPropertyNames(Object.getPrototypeOf(store))
                .filter(key => key !== 'constructor')
                .map(key => `${label}.${key}`);

        const surface = [
            ...methodsOf(relayStore, 'relayStore'),
            ...methodsOf(cloudStore, 'cloudStore'),
            ...methodsOf(identityStore, 'identityStore'),
        ];
        const writes = surface.filter(name => /\.(save|set|clear)[A-Z]/.test(name));

        expect(writes.length).toBeGreaterThan(0);
        expect(writes.filter(name => !covered.has(name))).toEqual([]);
    });
});
