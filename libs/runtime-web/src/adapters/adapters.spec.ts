import 'fake-indexeddb/auto';

import type { CacheType } from '@chatic/bridge-messages';
import type { DataContextProvider, LocalCachePorts } from '@chatic/data';
import type { RuntimePorts } from '@chatic/runtime-core';

import type { StorageStores } from '../storage/storeSets';

jest.mock('@chatic/logger', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const TYPES: CacheType[] = ['chat', 'channel', 'invitecloud', 'join', 'site', 'user', 'meta', 'profile', 'invite'];
const context: DataContextProvider = { getContext: () => ({ cid: 'c1', uid: 'u1' }), setContext: () => undefined };
const nameOf = (value: unknown) => (value as object).constructor.name;
const emptyStorage = {} as RuntimePorts['storage'];

const load = async (inPhoneApp: boolean, storageMedia?: string[]) => {
    jest.resetModules();
    if (inPhoneApp) (window as any).ReactNativeWebView = { postMessage: jest.fn() };
    else delete (window as any).ReactNativeWebView;
    if (storageMedia) (window as any).CHATIC_APP_STORAGE_MEDIA = storageMedia;
    else delete (window as any).CHATIC_APP_STORAGE_MEDIA;
    const adapters = await import('./index');
    const localCache = await import('../localCache');
    return { ...adapters, localCache, facts: adapters.webHostFacts() };
};

const routesAndStorages = (cache: LocalCachePorts) =>
    TYPES.map(type => {
        const route = cache.route(type);
        return { type, route, storage: nameOf(cache.storage(type, route, context, undefined)) };
    });

afterEach(() => {
    jest.restoreAllMocks();
    delete (window as any).ReactNativeWebView;
    delete (window as any).CHATIC_APP_STORAGE_MEDIA;
    window.history.replaceState(null, '', '/');
});

describe('web adapters — ids and hosts', () => {
    it('names each adapter `<port>.<name>` in the port it fills', async () => {
        const all = await load(false);
        expect(
            [
                all.transportBrowser,
                all.authLocation,
                all.foregroundVisibility,
                all.storageTab,
                all.storageLocal,
                all.cacheIndexedDb,
                all.cacheWebStorage,
            ].map(adapter => [adapter.port, adapter.id])
        ).toEqual([
            ['transport', 'transport.browser'],
            ['auth', 'auth.location'],
            ['foreground', 'foreground.visibility'],
            ['storage', 'storage.tab'],
            ['storage', 'storage.local'],
            ['cache', 'cache.indexeddb'],
            ['cache', 'cache.web-storage'],
        ]);
    });

    it('reads every page as a browser: no bridge, no media, no offer, even inside a shell', async () => {
        const { facts, storageTab, storageLocal, cacheIndexedDb, cacheWebStorage } = await load(true, ['nativeSecure']);
        expect(facts).toEqual({
            bridge: null,
            platform: undefined,
            storageMedia: [],
            runtimeOffer: undefined,
            capabilities: { kind: 'absent' },
        });
        for (const adapter of [storageTab, storageLocal, cacheIndexedDb, cacheWebStorage]) {
            expect(adapter.supports?.(facts) ?? true).toBe(true);
        }
    });
});

describe('web adapters — storage', () => {
    it('storage.tab keeps the session in the tab, and storage.local in localStorage', async () => {
        const { facts, storageTab, storageLocal } = await load(false);
        const tab = await storageTab.create({ facts });
        tab.secret.set('k', 'tab');
        expect(window.sessionStorage.getItem('k')).toContain('tab');
        expect(tab.plain).toBe(tab.secret);

        const local = await storageLocal.create({ facts });
        local.secret.set('k', 'local');
        expect(window.localStorage.getItem('k')).toContain('local');
        expect(local.plain).toBe(local.secret);
    });
});

describe('web adapters — cache', () => {
    it('cache.indexeddb puts every domain in IndexedDB, in a tab and in the phone app', async () => {
        for (const inPhoneApp of [false, true]) {
            const { facts, cacheIndexedDb } = await load(inPhoneApp);
            const cache = await cacheIndexedDb.create({ facts, storage: emptyStorage });
            expect(routesAndStorages(cache).every(({ route }) => route === 'web')).toBe(true);
            expect(nameOf(cache.globalSearch())).toBe('IndexedDbGlobalSearchSource');
        }
    });

    it('cache.web-storage routes exactly as webLocalCachePorts does, the invited clouds in the tab', async () => {
        const { facts, cacheWebStorage, localCache } = await load(false);
        const adapter = await cacheWebStorage.create({ facts, storage: emptyStorage });
        const page = localCache.webLocalCachePorts(window.sessionStorage as never);
        expect(routesAndStorages(adapter)).toEqual(routesAndStorages(page));
        expect(adapter.route('invitecloud')).toBe('session');
    });
});

describe('web adapters — site data blocked', () => {
    const blockSiteData = () => {
        for (const name of ['localStorage', 'sessionStorage'] as const) {
            jest.spyOn(window, name, 'get').mockImplementation(() => {
                throw new DOMException('blocked', 'SecurityError');
            });
        }
    };

    it("puts the cache's tab rows in the same store as the session", async () => {
        const { facts, storageTab, cacheWebStorage } = await load(false);
        blockSiteData();

        const storage = (await storageTab.create({ facts })) as StorageStores;
        expect(nameOf(storage.webSession)).toBe('MemoryStore');
        const writes = jest.spyOn(storage.webSession, 'set');

        const cache = await cacheWebStorage.create({ facts, storage });
        await cache.storage('invitecloud', 'session', context, undefined).save('cl1', { id: 'cl1' } as never);

        expect(writes).toHaveBeenCalled();
        expect(storage.secret).toBe(storage.webSession);
    });
});

describe('web adapters — transport, auth, foreground', () => {
    it('build the page ports', async () => {
        const { facts, transportBrowser, authLocation, foregroundVisibility } = await load(false);
        const storage = emptyStorage;
        const transport = await transportBrowser.create({ facts, storage });
        expect(transport.online.read()).toBe(navigator.onLine);
        window.history.replaceState(null, '', '/?a=1');
        expect((await authLocation.create({ facts, storage })).currentSearch()).toBe('?a=1');
        expect((await foregroundVisibility.create({ facts, storage })).read()).toBe(
            document.visibilityState === 'visible'
        );
    });
});
