// The IndexedDB adapter opens a real database in its constructor, so a shim must exist before
// localFactory is imported.
import 'fake-indexeddb/auto';

import type { DataContextProvider } from '@chatic/data';

/**
 * Storage routing: every cache type follows the environment strategy (native → Cold/NativeDB,
 * browser → Hot/IndexedDB) EXCEPT the types pinned to Hot, which must stay on IndexedDB even inside
 * the native WebView. `profile` is pinned because the native Cold writer overwrites the profile
 * owner's uid with the scope uid — see HOT_ONLY_CACHE_TYPES in localFactory.
 */
describe('getCacheStorage storage routing', () => {
    const contextProvider: DataContextProvider = {
        getContext: () => ({ cid: 'c1', uid: 'u1' }),
        setContext: () => undefined,
    };

    // The strategies are memoized at module scope, so each environment needs a fresh module
    // registry. Adapters are identified by constructor name rather than `instanceof`: importing the
    // classes here would either compare against a stale constructor (resetModules gives the factory
    // a different copy) or, if imported dynamically to dodge that, mark @chatic/data as lazy-loaded
    // and make every static import of it across app-runtime an @nx/enforce-module-boundaries error.
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

    it('keeps profile on hot IndexedDB inside the native WebView', async () => {
        const { getCacheStorage } = await loadFactory(true);

        expect(adapterName(getCacheStorage('profile', contextProvider))).toBe('IndexedDBAdapter');
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
});
