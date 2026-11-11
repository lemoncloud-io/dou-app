import type { CacheType } from '@chatic/bridge-messages';
import type { CacheRoute, DataContextProvider, LocalCachePorts } from '@chatic/data';
import { MemoryStore } from '@chatic/storage';

import { localCachePlatform } from '../localCachePlatform';
import { runtimeStores } from '../../storage/runtimeStores';
import { createLocalDataSources } from './localFactory';

import type * as LocalFactory from './localFactory';

const contextProvider: DataContextProvider = {
    getContext: () => ({ cid: 'c1', uid: 'u1' }),
    setContext: () => undefined,
};

/** A storage that remembers where it was put, and answers like an empty cache. */
const fakeStorage = (type: CacheType, route: string) => ({
    type,
    route,
    save: jest.fn(),
    saveAll: jest.fn(),
    load: jest.fn(async () => null),
    loadAll: jest.fn(async () => []),
    delete: jest.fn(),
    clearAll: jest.fn(),
});

/** Cache ports whose routing the case controls, recording what the assembly asked. */
const fakePorts = (routeOf: (type: CacheType) => string) => {
    const routed: CacheRoute[][] = [];
    const asked: CacheType[] = [];
    const ports: LocalCachePorts = {
        route: type => {
            asked.push(type);
            return routeOf(type);
        },
        storage: (type, route) => fakeStorage(type, route) as never,
        routed: routes => void routed.push([...routes]),
        globalSearch: () => ({}) as never,
        metrics: () => ({}) as never,
    };
    return { ports, routed, asked };
};

const fingerprintOf = (sources: ReturnType<typeof createLocalDataSources>) =>
    (sources.syncMeta as unknown as { routingFingerprint?: string }).routingFingerprint;

beforeEach(() => runtimeStores.configure({ device: new MemoryStore() }));

// Sync cursors are stamped with the routing they were written under, so a cursor cannot claim
// "already synced" after its domain moved stores. The fingerprint is built from the decisions actually
// made while assembling, which is what keeps it from drifting when a cache type is added later.
describe('createLocalDataSources routing fingerprint', () => {
    it('records every type the platform routed, so two routings cannot share a fingerprint', () => {
        localCachePlatform.configure(fakePorts(() => 'web').ports);
        const webPrint = fingerprintOf(createLocalDataSources({ contextProvider }));
        localCachePlatform.configure(fakePorts(type => (type === 'invitecloud' ? 'session' : 'native')).ports);
        const nativePrint = fingerprintOf(createLocalDataSources({ contextProvider }));

        expect(webPrint).toContain('chat:web');
        expect(nativePrint).toContain('chat:native');
        expect(nativePrint).toContain('invitecloud:session');
        expect(webPrint).not.toEqual(nativePrint);
    });

    // A sync cursor compares this string byte for byte with the one it was written under, so its shape
    // is part of the contract, not a detail: one `type:route` per domain, sorted, comma-joined.
    it('writes the fingerprint as sorted type:route pairs, comma-joined', () => {
        localCachePlatform.configure(fakePorts(type => (type === 'invitecloud' ? 'session' : 'web')).ports);

        expect(fingerprintOf(createLocalDataSources({ contextProvider }))).toBe(
            'channel:web,chat:web,invite:web,invitecloud:session,join:web,meta:web,profile:web,site:web,user:web'
        );
    });

    it('covers every cache type the assembler built, not a hand-kept list', () => {
        localCachePlatform.configure(fakePorts(() => 'web').ports);

        const print = fingerprintOf(createLocalDataSources({ contextProvider }));

        for (const type of ['chat', 'channel', 'invitecloud', 'join', 'site', 'user', 'meta', 'profile', 'invite']) {
            expect(print).toContain(`${type}:`);
        }
    });

    it('hands the platform the routes it chose, once, after building the storages', () => {
        const { ports, routed } = fakePorts(() => 'web');
        localCachePlatform.configure(ports);

        createLocalDataSources({ contextProvider });

        expect(routed).toHaveLength(1);
        expect(routed[0].map(({ type }) => type).sort()).toEqual(
            ['channel', 'chat', 'invite', 'invitecloud', 'join', 'meta', 'profile', 'site', 'user'].sort()
        );
    });

    // An injected factory means the caller, not the platform, chose the stores — there is nothing
    // honest to stamp or report, so both switch off rather than guessing.
    it('leaves the fingerprint unset, and reports nothing, when the storage factory is injected', () => {
        const { ports, routed } = fakePorts(() => 'web');
        localCachePlatform.configure(ports);

        const sources = createLocalDataSources({ contextProvider, cacheStorageFactory: () => ({}) as never });

        expect(fingerprintOf(sources)).toBeUndefined();
        expect(routed).toHaveLength(0);
    });
});

// `@chatic/data` builds a storage per (cid, uid) partition on first use, so the factory also runs
// after assembly. The route decided at assembly must hold for those later partitions: inside the phone
// app, the shell's capability report can land in between and change the platform's answer.
describe('createLocalDataSources route per type', () => {
    it('a partition first reached later keeps the route decided at assembly, and the platform is not asked again', () => {
        let answer = 'web';
        const { ports, asked } = fakePorts(() => answer);
        localCachePlatform.configure(ports);

        const sources = createLocalDataSources({
            contextProvider: { getContext: () => ({ cid: 'default', uid: 'guest' }), setContext: () => undefined },
        });
        answer = 'native';
        const promoted = (sources.invite as any).storages.forScope({ cid: 'default', uid: 'account' });

        expect(promoted.route).toBe('web');
        expect(asked.filter(type => type === 'invite')).toHaveLength(1);
        expect(fingerprintOf(sources)).toContain('invite:web');
    });

    it('refuses to assemble before the cache ports were configured, and names the fix', () => {
        jest.isolateModules(() => {
            const fresh = jest.requireActual<typeof LocalFactory>('./localFactory');
            expect(() => fresh.createLocalDataSources({ contextProvider })).toThrow(/initAppRuntime/);
        });
    });
});
