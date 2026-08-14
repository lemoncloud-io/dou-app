// The IndexedDB adapter opens a real database in its constructor, so a shim must exist before
// localFactory is imported.
import 'fake-indexeddb/auto';

import type { CacheType } from '@chatic/app-messages';
import type { DataContextProvider } from '@chatic/data';

/**
 * Storage routing: every cache type follows the environment (native → NativeDB/SQLite, browser →
 * IndexedDB), minus any type pinned to web storage — that table is empty now that the native
 * profile writer stores items verbatim. See WEB_PINNED_CACHE_TYPES in cacheStorageRouting.
 */
describe('getCacheStorage storage routing', () => {
    const contextProvider: DataContextProvider = {
        getContext: () => ({ cid: 'c1', uid: 'u1' }),
        setContext: () => undefined,
    };

    // The native capability snapshot lives at module scope (nativeCacheSupport), so each
    // environment needs a fresh module registry. Adapters are identified by constructor name
    // rather than `instanceof`: importing the classes here would either compare against a stale
    // constructor (resetModules gives the factory a different copy) or, if imported dynamically to
    // dodge that, mark @chatic/data as lazy-loaded and make every static import of it across
    // app-runtime an @nx/enforce-module-boundaries error.
    const loadFactory = async (isNative: boolean) => {
        jest.resetModules();
        if (isNative) (window as any).ReactNativeWebView = { postMessage: jest.fn() };
        else delete (window as any).ReactNativeWebView;
        return import('./localFactory');
    };

    const adapterName = (storage: unknown) => (storage as object).constructor.name;

    afterEach(() => {
        delete (window as any).ReactNativeWebView;
    });

    it('routes profile to cold NativeDB inside the native WebView', async () => {
        const { getCacheStorage } = await loadFactory(true);

        expect(adapterName(getCacheStorage('profile', contextProvider))).toBe('NativeDBAdapter');
    });

    it('still routes other types to cold NativeDB inside the native WebView', async () => {
        const { getCacheStorage } = await loadFactory(true);

        expect(adapterName(getCacheStorage('channel', contextProvider))).toBe('NativeDBAdapter');
        expect(adapterName(getCacheStorage('chat', contextProvider))).toBe('NativeDBAdapter');
        expect(adapterName(getCacheStorage('join', contextProvider))).toBe('NativeDBAdapter');
    });

    it('routes everything to hot IndexedDB in a plain browser', async () => {
        const { getCacheStorage } = await loadFactory(false);

        expect(adapterName(getCacheStorage('profile', contextProvider))).toBe('IndexedDBAdapter');
        expect(adapterName(getCacheStorage('channel', contextProvider))).toBe('IndexedDBAdapter');
    });

    // Web/app deploy skew: the web ships ahead of the app, so a type newer than the installed app
    // would be written into the native `default:` arm, which answers `null` with `success: true` —
    // an invisible, permanently empty cache. Such a type goes to hot storage until the app catches up.
    // 'invite' (ADR-0052) is the first real type this applies to — deliberately never added to
    // LEGACY_NATIVE_CACHE_TYPES, so it exercises this exact path in production, not just in a test.
    it('routes a type the installed app cannot store to hot IndexedDB', async () => {
        const { getCacheStorage } = await loadFactory(true);
        const futureType = 'invite';

        expect(adapterName(getCacheStorage(futureType, contextProvider))).toBe('IndexedDBAdapter');
    });

    it('routes it back to cold NativeDB once the app reports supporting it', async () => {
        const factory = await loadFactory(true);
        // Same module registry as the factory (resetModules gives it its own copy of the snapshot).
        const { setNativeCacheSupport } = await import('../nativeCacheSupport');
        const futureType = 'invite';

        setNativeCacheSupport({ cacheSchemaVersion: 99, supportedCacheTypes: [futureType] });

        expect(adapterName(factory.getCacheStorage(futureType, contextProvider))).toBe('NativeDBAdapter');
    });

    // The full routing table, pinned as a matrix so a routing change can never slip through as a
    // side effect — this is the behavior contract of ADR-0051's single-decision-point refactor.
    it('routes every known cache type per the matrix in both environments', async () => {
        const EXPECTED: Record<CacheType, { browser: string; native: string }> = {
            chat: { browser: 'IndexedDBAdapter', native: 'NativeDBAdapter' },
            channel: { browser: 'IndexedDBAdapter', native: 'NativeDBAdapter' },
            invitecloud: { browser: 'IndexedDBAdapter', native: 'NativeDBAdapter' },
            join: { browser: 'IndexedDBAdapter', native: 'NativeDBAdapter' },
            site: { browser: 'IndexedDBAdapter', native: 'NativeDBAdapter' },
            user: { browser: 'IndexedDBAdapter', native: 'NativeDBAdapter' },
            meta: { browser: 'IndexedDBAdapter', native: 'NativeDBAdapter' },
            profile: { browser: 'IndexedDBAdapter', native: 'NativeDBAdapter' },
            // Not legacy and this test never reports support, so it stays on web in EITHER
            // environment — the one asymmetric row in this matrix, and exactly the skew-gate
            // contract ADR-0052 relies on.
            invite: { browser: 'IndexedDBAdapter', native: 'IndexedDBAdapter' },
        };

        const browser = await loadFactory(false);
        for (const [type, expected] of Object.entries(EXPECTED)) {
            expect(adapterName(browser.getCacheStorage(type as CacheType, contextProvider))).toBe(expected.browser);
        }

        const native = await loadFactory(true);
        for (const [type, expected] of Object.entries(EXPECTED)) {
            expect(adapterName(native.getCacheStorage(type as CacheType, contextProvider))).toBe(expected.native);
        }
    });

    // ADR-0053 replaced the gate's criteria (frozen set + name list + global schema number) with one
    // comparison against per-domain contract versions. The whole design rests on that switch moving
    // ZERO routing decisions, since the web ships ahead of the app and most apps a new web meets
    // still report names only. This pins the routing table across every report shape in the wild.
    it('routes every type identically whatever shape the app reports in', async () => {
        const ALL_TYPES: CacheType[] = [
            'chat',
            'channel',
            'invitecloud',
            'join',
            'site',
            'user',
            'meta',
            'profile',
            'invite',
        ];
        const REPORT_SHAPES = [
            // Pre-handshake / a build older than the fields. Only the frozen floor applies.
            { label: 'unreported', report: undefined, expected: (t: CacheType) => t !== 'invite' },
            // What almost every installed app sends today: names, no contract versions.
            {
                label: 'names only',
                report: { cacheSchemaVersion: 11, supportedCacheTypes: ALL_TYPES },
                expected: () => true,
            },
            // A post-ADR-0053 app: measured contract versions alongside the legacy fields.
            {
                label: 'names + contract versions',
                report: {
                    cacheSchemaVersion: 11,
                    supportedCacheTypes: ALL_TYPES,
                    cacheDomainVersions: Object.fromEntries(ALL_TYPES.map(t => [t, 1])),
                },
                expected: () => true,
            },
            // A partially migrated app: `invites` never landed, so it reports neither for that
            // domain — the one case where the measurement must actually change a decision.
            {
                label: 'partially migrated',
                report: {
                    cacheSchemaVersion: 11,
                    supportedCacheTypes: ALL_TYPES.filter(t => t !== 'invite'),
                    cacheDomainVersions: Object.fromEntries(ALL_TYPES.filter(t => t !== 'invite').map(t => [t, 1])),
                },
                expected: (t: CacheType) => t !== 'invite',
            },
        ];

        for (const { label, report, expected } of REPORT_SHAPES) {
            const factory = await loadFactory(true);
            const { setNativeCacheSupport } = await import('../nativeCacheSupport');
            if (report) setNativeCacheSupport(report);

            for (const type of ALL_TYPES) {
                expect({
                    shape: label,
                    type,
                    adapter: adapterName(factory.getCacheStorage(type, contextProvider)),
                }).toEqual({
                    shape: label,
                    type,
                    adapter: expected(type) ? 'NativeDBAdapter' : 'IndexedDBAdapter',
                });
            }
        }
    });
});

// Sync cursors are stamped with the routing they were written under, so a cursor cannot claim
// "already synced" after its domain moved stores (ADR-0053). The fingerprint is built from the
// decisions actually made while assembling, which is what keeps it from drifting when a cache type
// is added later.
describe('createLocalDataSources routing fingerprint', () => {
    const contextProvider: DataContextProvider = {
        getContext: () => ({ cid: 'c1', uid: 'u1' }),
        setContext: () => undefined,
    };

    const loadFactory = async (isNative: boolean) => {
        jest.resetModules();
        if (isNative) (window as any).ReactNativeWebView = { postMessage: jest.fn() };
        else delete (window as any).ReactNativeWebView;
        return import('./localFactory');
    };

    afterEach(() => {
        delete (window as any).ReactNativeWebView;
    });

    // Reaching into the data source is the only way to observe the stamp without a live store; the
    // behavioural contract itself is pinned in SyncMetaLocalDataSourceV2's own suite. `isNativeApp`
    // reads `window` at CALL time, so each environment must be assembled before the next is loaded.
    const fingerprintIn = async (isNative: boolean) => {
        const { createLocalDataSources } = await loadFactory(isNative);
        const sources = createLocalDataSources({ contextProvider });
        return (sources.syncMeta as any).routingFingerprint as string;
    };

    it('records every type it routed, so the two environments cannot share a fingerprint', async () => {
        const browserPrint = await fingerprintIn(false);
        const nativePrint = await fingerprintIn(true);

        expect(browserPrint).toContain('chat:web');
        expect(nativePrint).toContain('chat:native');
        expect(browserPrint).not.toEqual(nativePrint);
    });

    it('covers every cache type the assembler built, not a hand-kept list', async () => {
        const { createLocalDataSources } = await loadFactory(false);

        const print = (createLocalDataSources({ contextProvider }).syncMeta as any).routingFingerprint as string;

        for (const type of ['chat', 'channel', 'invitecloud', 'join', 'site', 'user', 'meta', 'profile', 'invite']) {
            expect(print).toContain(`${type}:`);
        }
    });

    // An injected factory means the caller, not the router, chose the stores — there is nothing
    // honest to stamp, so the check switches off rather than guessing.
    it('leaves the fingerprint unset when the storage factory is injected', async () => {
        const { createLocalDataSources } = await loadFactory(true);

        const sources = createLocalDataSources({
            contextProvider,
            cacheStorageFactory: () => ({}) as never,
        });

        expect((sources.syncMeta as any).routingFingerprint).toBeUndefined();
    });
});

describe('getCacheStorage chat cap injection', () => {
    const contextProvider: DataContextProvider = {
        getContext: () => ({ cid: 'c1', uid: 'u1' }),
        setContext: () => undefined,
    };

    const loadFactory = async () => {
        jest.resetModules();
        delete (window as any).ReactNativeWebView;
        return import('./localFactory');
    };

    it('hands the per-channel chat cap to the web chat adapter', async () => {
        const { getCacheStorage } = await loadFactory();

        const storage = getCacheStorage('chat', contextProvider, { maxChatsPerChannel: 5 });

        expect((storage as any).options.maxChatsPerChannel).toBe(5);
    });

    it('leaves the cap unbounded when no options are injected', async () => {
        const { getCacheStorage } = await loadFactory();

        const storage = getCacheStorage('chat', contextProvider);

        expect((storage as any).options.maxChatsPerChannel).toBeUndefined();
    });
});
