import 'fake-indexeddb/auto';

import type { CacheType } from '@chatic/bridge-messages';
import type { CacheAssemblyOptions, DataContextProvider } from '@chatic/data';
import { MemoryStore } from '@chatic/storage';

import type * as LocalCache from './index';
import { readNativeCacheSupport } from './nativeCacheSupport';
import { resolveCacheBackendFor } from './routing';

const storageFor = (
    ports: Pick<typeof LocalCache, 'webLocalCachePorts'>,
    type: CacheType,
    contextProvider: DataContextProvider,
    options?: CacheAssemblyOptions
) => {
    const cache = ports.webLocalCachePorts(tabStore());
    return cache.storage(type, cache.route(type), contextProvider, options);
};

const tabStore = () => new MemoryStore();

describe('webLocalCachePorts storage routing', () => {
    const contextProvider: DataContextProvider = {
        getContext: () => ({ cid: 'c1', uid: 'u1' }),
        setContext: () => undefined,
    };

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

    it('routes invited clouds to the tab session store in a plain browser', async () => {
        const ports = await loadFactory(false);

        expect(adapterName(storageFor(ports, 'invitecloud', contextProvider))).toBe('InvitedCloudImportStorage');
    });

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

    it('routes a type the installed app cannot store to hot IndexedDB', async () => {
        const ports = await loadFactory(true);
        const futureType = 'invite';

        expect(adapterName(storageFor(ports, futureType, contextProvider))).toBe('IndexedDBAdapter');
    });

    it('routes it back to cold NativeDB once the app reports supporting it', async () => {
        const ports = await loadFactory(true);
        const { setNativeCacheSupport } = ports;
        const futureType = 'invite';

        setNativeCacheSupport({ cacheSchemaVersion: 99, supportedCacheTypes: [futureType] });

        expect(adapterName(storageFor(ports, futureType, contextProvider))).toBe('NativeDBAdapter');
    });

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
            { label: 'unreported', report: undefined, expected: (t: CacheType) => t !== 'invite' },
            {
                label: 'names only',
                report: { cacheSchemaVersion: 11, supportedCacheTypes: ALL_TYPES },
                expected: () => true,
            },
            {
                label: 'names + contract versions',
                report: {
                    cacheSchemaVersion: 11,
                    supportedCacheTypes: ALL_TYPES,
                    cacheDomainVersions: Object.fromEntries(ALL_TYPES.map(t => [t, 1])),
                },
                expected: () => true,
            },
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

describe('resolveCacheBackendFor', () => {
    it('routes by the bridge and the report it is handed', () => {
        expect(resolveCacheBackendFor('invitecloud', { bridge: null, support: null })).toBe('session');
        expect(resolveCacheBackendFor('chat', { bridge: null, support: null })).toBe('web');
        expect(resolveCacheBackendFor('invitecloud', { bridge: 'message-handler', support: null })).toBe('web');
        expect(resolveCacheBackendFor('chat', { bridge: 'webkit-message-handler', support: null })).toBe('web');
        expect(resolveCacheBackendFor('chat', { bridge: 'react-native-webview', support: null })).toBe('native');
    });

    it('sends a domain the reported shell cannot hold to IndexedDB, and one it reports to the shell', () => {
        const bridge = 'react-native-webview';

        expect(resolveCacheBackendFor('invite', { bridge, support: null })).toBe('web');
        expect(
            resolveCacheBackendFor('invite', {
                bridge,
                support: readNativeCacheSupport({ supportedCacheTypes: ['invite'] }),
            })
        ).toBe('native');
    });
});
