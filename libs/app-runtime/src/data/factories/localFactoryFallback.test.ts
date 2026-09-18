// The IndexedDB adapter opens a real database in its constructor, so a shim must exist before
// localFactory is imported.
import 'fake-indexeddb/auto';

import type { DataContextProvider } from '@chatic/data';

/**
 * The web-storage fallback entry (ADR-0099).
 *
 * Kept in its own file rather than added to `localFactory.test.ts`: exercising it means letting the
 * real storage factory run (an injected one records no routing at all), and it needs `@chatic/bridges`
 * mocked — which the routing suite next door deliberately does not do.
 */
jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    webClient: { request: jest.fn().mockResolvedValue(undefined), post: jest.fn() },
}));

describe('createLocalDataSources — 네이티브 셸이 담을 수 없는 도메인의 웹 폴백', () => {
    const contextProvider: DataContextProvider = {
        getContext: () => ({ cid: 'c1', uid: 'u1' }),
        setContext: () => undefined,
    };

    /**
     * The native capability snapshot lives at module scope, so each environment needs a fresh module
     * registry — and therefore a freshly resolved logger mock from the same registry.
     */
    const load = async (isNative: boolean) => {
        jest.resetModules();
        if (isNative) (window as any).ReactNativeWebView = { postMessage: jest.fn() };
        else delete (window as any).ReactNativeWebView;

        // `jest.requireMock`, never `await import('@chatic/bridges')`: a dynamic import marks the
        // library as lazy-loaded, which turns every STATIC import of it across app-runtime into an
        // `@nx/enforce-module-boundaries` error. The sibling routing suite documents the same trap
        // for `@chatic/data`.
        const bridges = jest.requireMock('@chatic/bridges') as { logger: { info: jest.Mock } };
        const factory = await import('./localFactory');
        const support = await import('../nativeCacheSupport');
        return { ...factory, ...support, info: bridges.logger.info };
    };

    afterEach(() => {
        delete (window as any).ReactNativeWebView;
    });

    // A domain the shell can't hold goes to web storage, and the result is a cold cache — the answer
    // to "why is it re-downloading everything".
    it('네이티브에서 폴백이 있으면 도메인 목록을 한 줄로 남긴다', async () => {
        const { createLocalDataSources, setNativeCacheSupport, info } = await load(true);
        // A shell reporting no storable types at all: every gateable domain falls back.
        setNativeCacheSupport({ supportedCacheTypes: [], cacheDomainVersions: {} });

        createLocalDataSources({ contextProvider });

        const fallbackCalls = info.mock.calls.filter(call => String(call[1]).includes('fell back to web storage'));
        expect(fallbackCalls).toHaveLength(1);
        expect(fallbackCalls[0][2].data.domains.length).toBeGreaterThan(0);
    });

    // On a plain browser, everything using web storage is normal — it isn't a fallback, so there's
    // nothing to log.
    it('브라우저 단독 접속에서는 남기지 않는다', async () => {
        const { createLocalDataSources, info } = await load(false);

        createLocalDataSources({ contextProvider });

        expect(info.mock.calls.filter(call => String(call[1]).includes('fell back to web storage'))).toHaveLength(0);
    });

    // An injected factory doesn't record routing, so there's nothing to judge from.
    it('팩터리가 주입되면(테스트 경로) 남기지 않는다', async () => {
        const { createLocalDataSources, setNativeCacheSupport, info } = await load(true);
        setNativeCacheSupport({ supportedCacheTypes: [], cacheDomainVersions: {} });

        createLocalDataSources({
            contextProvider,
            cacheStorageFactory: () =>
                ({
                    save: jest.fn(),
                    saveAll: jest.fn(),
                    load: jest.fn(),
                    loadAll: jest.fn(),
                    delete: jest.fn(),
                    clearAll: jest.fn(),
                }) as never,
        });

        expect(info.mock.calls.filter(call => String(call[1]).includes('fell back to web storage'))).toHaveLength(0);
    });
});
