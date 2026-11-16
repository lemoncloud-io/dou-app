// The IndexedDB adapter opens a real database in its constructor, so a shim must exist before the
// ports are imported.
import 'fake-indexeddb/auto';

import type { CacheType } from '@chatic/bridge-messages';
import type { CacheAssemblyOptions, DataContextProvider } from '@chatic/data';
import { MemoryStore } from '@chatic/storage';

import type * as LocalCache from './index';

/** The storage the web ports build for `type`, on the route they choose for it. */
const storageFor = (
    ports: Pick<typeof LocalCache, 'webLocalCachePorts'>,
    type: CacheType,
    contextProvider: DataContextProvider,
    options?: CacheAssemblyOptions
) => {
    const cache = ports.webLocalCachePorts(tabStore());
    return cache.storage(type, cache.route(type), contextProvider, options);
};

/** A tab store in memory, standing in for the entry point's `webSession`. */
const tabStore = () => new MemoryStore();

/**
 * Storage routing: every cache type follows the environment (native → NativeDB/SQLite, browser →
 * IndexedDB), minus any type pinned to web storage — that table is empty now that the native
 * profile writer stores items verbatim. See WEB_PINNED_CACHE_TYPES in routing.ts. The one
 * exception is invited clouds in a plain browser tab, which live in the tab's sessionStorage.
 */
describe('webLocalCachePorts storage routing', () => {
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
        return import('./index');
    };

    const adapterName = (storage: unknown) => (storage as object).constructor.name;

    afterEach(() => {
        delete (window as any).ReactNativeWebView;
    });

    it('routes profile to cold NativeDB inside the native WebView', async () => {
        const ports = await loadFactory(true);

        expect(adapterName(storageFor(ports, 'profile', contextProvider))).toBe('NativeDBAdapter');
    });

    it('still routes other types to cold NativeDB inside the native WebView', async () => {
        const ports = await loadFactory(true);

        expect(adapterName(storageFor(ports, 'channel', contextProvider))).toBe('NativeDBAdapter');
        expect(adapterName(storageFor(ports, 'chat', contextProvider))).toBe('NativeDBAdapter');
        expect(adapterName(storageFor(ports, 'join', contextProvider))).toBe('NativeDBAdapter');
    });

    it('routes everything to hot IndexedDB in a plain browser', async () => {
        const ports = await loadFactory(false);

        expect(adapterName(storageFor(ports, 'profile', contextProvider))).toBe('IndexedDBAdapter');
        expect(adapterName(storageFor(ports, 'channel', contextProvider))).toBe('IndexedDBAdapter');
    });

    // A plain tab's guest — the only user an invited cloud was granted to — lives in sessionStorage
    // and ends with the tab, so the row does too. The store is wrapped by the one-time IndexedDB
    // import that carries a tab's rows across the move.
    it('routes invited clouds to the tab session store in a plain browser', async () => {
        const ports = await loadFactory(false);

        expect(adapterName(storageFor(ports, 'invitecloud', contextProvider))).toBe('InvitedCloudImportStorage');
    });

    // A desktop shell keeps the session in localStorage, so its invited clouds stay durable too: the
    // shell is "native" for the session's storage while still having no SQLite to reach.
    it('keeps invited clouds in IndexedDB inside a desktop shell', async () => {
        jest.resetModules();
        delete (window as any).ReactNativeWebView;
        (window as any).ChaticMessageHandler = { postMessage: jest.fn() };
        try {
            const ports = await import('./index');

            expect(adapterName(storageFor(ports, 'invitecloud', contextProvider))).toBe('IndexedDBAdapter');
        } finally {
            delete (window as any).ChaticMessageHandler;
        }
    });

    // Web/app deploy skew: the web ships ahead of the app, so a type newer than the installed app
    // would be written into the native `default:` arm, which answers `null` with `success: true` —
    // an invisible, permanently empty cache. Such a type goes to hot storage until the app catches up.
    // 'invite' is the first real type this applies to — deliberately never added to
    // LEGACY_NATIVE_CACHE_TYPES, so it exercises this exact path in production, not just in a test.
    it('routes a type the installed app cannot store to hot IndexedDB', async () => {
        const ports = await loadFactory(true);
        const futureType = 'invite';

        expect(adapterName(storageFor(ports, futureType, contextProvider))).toBe('IndexedDBAdapter');
    });

    it('routes it back to cold NativeDB once the app reports supporting it', async () => {
        const ports = await loadFactory(true);
        // Same module registry as the ports (resetModules gives it its own copy of the snapshot).
        const { setNativeCacheSupport } = ports;
        const futureType = 'invite';

        setNativeCacheSupport({ cacheSchemaVersion: 99, supportedCacheTypes: [futureType] });

        expect(adapterName(storageFor(ports, futureType, contextProvider))).toBe('NativeDBAdapter');
    });

    // The full routing table, pinned as a matrix so a routing change can never slip through as a
    // side effect — this is the behavior contract of having one routing decision point.
    it('routes every known cache type per the matrix in both environments', async () => {
        const EXPECTED: Record<CacheType, { browser: string; native: string }> = {
            chat: { browser: 'IndexedDBAdapter', native: 'NativeDBAdapter' },
            channel: { browser: 'IndexedDBAdapter', native: 'NativeDBAdapter' },
            invitecloud: { browser: 'InvitedCloudImportStorage', native: 'NativeDBAdapter' },
            join: { browser: 'IndexedDBAdapter', native: 'NativeDBAdapter' },
            site: { browser: 'IndexedDBAdapter', native: 'NativeDBAdapter' },
            user: { browser: 'IndexedDBAdapter', native: 'NativeDBAdapter' },
            meta: { browser: 'IndexedDBAdapter', native: 'NativeDBAdapter' },
            profile: { browser: 'IndexedDBAdapter', native: 'NativeDBAdapter' },
            // Not legacy and this test never reports support, so it stays on web in EITHER
            // environment — the one asymmetric row in this matrix, and exactly the skew-gate
            // contract the invite domain relies on.
            invite: { browser: 'IndexedDBAdapter', native: 'IndexedDBAdapter' },
        };

        const browser = await loadFactory(false);
        for (const [type, expected] of Object.entries(EXPECTED)) {
            expect(adapterName(storageFor(browser, type as CacheType, contextProvider))).toBe(expected.browser);
        }

        const native = await loadFactory(true);
        for (const [type, expected] of Object.entries(EXPECTED)) {
            expect(adapterName(storageFor(native, type as CacheType, contextProvider))).toBe(expected.native);
        }
    });

    // Per-domain contract versions replaced the gate's criteria (frozen set + name list + global schema number) with one
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
            // An app that reports contract versions: measured editions alongside the legacy fields.
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
            const ports = await loadFactory(true);
            if (report) ports.setNativeCacheSupport(report);

            for (const type of ALL_TYPES) {
                expect({
                    shape: label,
                    type,
                    adapter: adapterName(storageFor(ports, type, contextProvider)),
                }).toEqual({
                    shape: label,
                    type,
                    adapter: expected(type) ? 'NativeDBAdapter' : 'IndexedDBAdapter',
                });
            }
        }
    });
});

describe('webLocalCachePorts unknown route', () => {
    // Only `route()` makes routes; a storage asked for any other is a bug, not a domain for IndexedDB.
    it('refuses a route it did not make', async () => {
        jest.resetModules();
        const { webLocalCachePorts } = await import('./index');
        const cache = webLocalCachePorts(new MemoryStore());
        const provider: DataContextProvider = {
            getContext: () => ({ cid: 'c1', uid: 'u1' }),
            setContext: () => undefined,
        };

        expect(() => cache.storage('chat', 'bogus', provider, undefined)).toThrow(/unknown cache route 'bogus'/);
    });
});

describe('webLocalCachePorts chat cap injection', () => {
    const contextProvider: DataContextProvider = {
        getContext: () => ({ cid: 'c1', uid: 'u1' }),
        setContext: () => undefined,
    };

    const loadFactory = async () => {
        jest.resetModules();
        delete (window as any).ReactNativeWebView;
        return import('./index');
    };

    it('hands the per-channel chat cap to the web chat adapter', async () => {
        const ports = await loadFactory();

        const storage = storageFor(ports, 'chat', contextProvider, { maxChatsPerChannel: 5 });

        expect((storage as any).options.maxChatsPerChannel).toBe(5);
    });

    it('leaves the cap unbounded when no options are injected', async () => {
        const ports = await loadFactory();

        const storage = storageFor(ports, 'chat', contextProvider);

        expect((storage as any).options.maxChatsPerChannel).toBeUndefined();
    });
});
