/**
 * The per-cloud reads the cloud store answers for a socket that serves a cloud other than the
 * committed one: the margin-blind cache peek, the "which token does this cloud sign with" read, and
 * the identity map that outlives the tokens. `writeSignals.test.ts` covers what each write announces;
 * this file covers what the reads return. Same shape: the real singleton over a fake storage.
 */
import { cloudStore } from './cloudStore';

jest.mock('./signal', () => ({
    sessionSignal: { emit: jest.fn(), batch: (run: () => void) => run(), subscribe: () => () => undefined },
}));

const mockCells = new Map<string, string>();
/** Every key written, in order — for the cases that care whether a write happened at all. */
const mockSets: string[] = [];
jest.mock('@chatic/shared', () => ({
    storage: {
        get: (key: string) => mockCells.get(key) ?? null,
        set: (key: string, value: string) => {
            mockSets.push(key);
            mockCells.set(key, value);
        },
        remove: (key: string) => {
            mockCells.delete(key);
        },
    },
}));

const inMs = (ms: number) => new Date(Date.now() + ms).toISOString();

const tokens = (identityToken: string, expiresInMs = 60 * 60_000) =>
    ({
        delegationToken: { cloudId: 'x', delegationToken: 'd', backend: 'https://b', wss: 'wss://w' },
        cloudToken: { Token: { identityToken, credential: { Expiration: inMs(expiresInMs) } } },
    }) as never;

beforeEach(() => {
    mockCells.clear();
    mockSets.length = 0;
});

describe('cloudStore — the token cache, peeked vs. served', () => {
    it('peekCachedCloudTokens returns an entry the margin-checked read would drop, and drops nothing', () => {
        // 30s left: inside the 60s margin, so `getCachedCloudTokens` refuses to serve it.
        cloudStore.setCachedCloudTokens('cloud-1', tokens('nearly-out', 30_000));

        expect(cloudStore.peekCachedCloudTokens('cloud-1')?.cloudToken.Token?.identityToken).toBe('nearly-out');
        expect(cloudStore.getCachedCloudTokens('cloud-1')).toBeNull();
        // The served read deleted it; the peek before it did not.
        expect(cloudStore.peekCachedCloudTokens('cloud-1')).toBeNull();
    });

    it('peekCachedCloudTokens is null for a cloud that was never cached', () => {
        expect(cloudStore.peekCachedCloudTokens('cloud-9')).toBeNull();
    });

    it('dropCachedCloudTokens forgets one cloud and leaves the others', () => {
        cloudStore.setCachedCloudTokens('cloud-1', tokens('one'));
        cloudStore.setCachedCloudTokens('cloud-2', tokens('two'));

        cloudStore.dropCachedCloudTokens('cloud-1');

        expect(cloudStore.peekCachedCloudTokens('cloud-1')).toBeNull();
        expect(cloudStore.peekCachedCloudTokens('cloud-2')?.cloudToken.Token?.identityToken).toBe('two');
    });

    it('dropCachedCloudTokens on an unknown cloud is a no-op', () => {
        cloudStore.setCachedCloudTokens('cloud-2', tokens('two'));

        cloudStore.dropCachedCloudTokens('cloud-1');

        expect(cloudStore.peekCachedCloudTokens('cloud-2')).not.toBeNull();
    });
});

describe('cloudStore.getCloudTokenOf', () => {
    it('answers the committed cloud from the store’s own token, not the cache', () => {
        cloudStore.saveDelegationToken({ cloudId: 'cloud-1' } as never);
        cloudStore.saveCloudToken({ Token: { identityToken: 'store-copy' } } as never);
        cloudStore.setCachedCloudTokens('cloud-1', tokens('cache-copy'));

        expect(cloudStore.getCloudTokenOf('cloud-1')?.Token?.identityToken).toBe('store-copy');
    });

    it('answers any other cloud from the cache, margin-blind', () => {
        cloudStore.saveDelegationToken({ cloudId: 'cloud-1' } as never);
        cloudStore.setCachedCloudTokens('cloud-2', tokens('cache-copy', 30_000));

        expect(cloudStore.getCloudTokenOf('cloud-2')?.Token?.identityToken).toBe('cache-copy');
    });

    it('is null for a cloud that is neither committed nor cached', () => {
        expect(cloudStore.getCloudTokenOf('cloud-3')).toBeNull();
    });

    it('with no committed cloud, every cloud is answered from the cache', () => {
        cloudStore.setCachedCloudTokens('cloud-1', tokens('cache-copy'));

        expect(cloudStore.getCloudTokenOf('cloud-1')?.Token?.identityToken).toBe('cache-copy');
    });
});

describe('cloudStore — cloud identities', () => {
    it('records and reads a uid per cloud', () => {
        cloudStore.setCloudIdentity('cloud-1', { uid: 'u1' });
        cloudStore.setCloudIdentity('cloud-2', { uid: 'u2' });

        expect(cloudStore.getCloudIdentity('cloud-1')).toEqual({ uid: 'u1' });
        expect(cloudStore.getCloudIdentities()).toEqual({ 'cloud-1': { uid: 'u1' }, 'cloud-2': { uid: 'u2' } });
    });

    it('is null for a cloud never entered', () => {
        expect(cloudStore.getCloudIdentity('cloud-9')).toBeNull();
        expect(cloudStore.getCloudIdentities()).toEqual({});
    });

    it('survives clearSession — leaving a cloud is not a change of account', () => {
        cloudStore.setCloudIdentity('cloud-1', { uid: 'u1' });
        cloudStore.setCachedCloudTokens('cloud-1', tokens('one'));

        cloudStore.clearSession();

        expect(cloudStore.getCloudIdentity('cloud-1')).toEqual({ uid: 'u1' });
        // The token cache does go with the session, as before.
        expect(cloudStore.peekCachedCloudTokens('cloud-1')).toBeNull();
    });

    it('clearCloudIdentities forgets every cloud', () => {
        cloudStore.setCloudIdentity('cloud-1', { uid: 'u1' });

        cloudStore.clearCloudIdentities();

        expect(cloudStore.getCloudIdentities()).toEqual({});
    });

    it('does not rewrite storage for the same uid — every writeback records, most change nothing', () => {
        cloudStore.setCloudIdentity('cloud-1', { uid: 'u1' });
        const writesBefore = mockSets.length;

        cloudStore.setCloudIdentity('cloud-1', { uid: 'u1' });

        expect(mockSets.length).toBe(writesBefore);
    });
});
