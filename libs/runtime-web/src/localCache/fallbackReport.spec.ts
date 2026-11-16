import type { CacheType } from '@chatic/bridge-messages';
import { MemoryStore } from '@chatic/storage';

/**
 * The fallback report: a cache domain the phone shell could not hold went to web storage, and the
 * result is a cold cache — the answer to "why is it re-downloading everything". One line per boot,
 * from the routes the assembly hands to `routed()`.
 */
jest.mock('@chatic/logger', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const ALL_TYPES: CacheType[] = ['chat', 'channel', 'invitecloud', 'join', 'site', 'user', 'meta', 'profile', 'invite'];

describe('webLocalCachePorts.routed — the web-storage fallback report', () => {
    /** The capability snapshot is module state, so each environment needs a fresh module registry. */
    const load = async (inPhoneApp: boolean) => {
        jest.resetModules();
        if (inPhoneApp) (window as any).ReactNativeWebView = { postMessage: jest.fn() };
        else delete (window as any).ReactNativeWebView;
        // `jest.requireMock`, never `await import('@chatic/logger')`: a dynamic import marks the library
        // as lazy-loaded, which turns every static import of it into an `@nx/enforce-module-boundaries`
        // error.
        const { logger } = jest.requireMock('@chatic/logger') as { logger: { info: jest.Mock } };
        const ports = await import('./index');
        const cache = ports.webLocalCachePorts(new MemoryStore());
        const routeAll = () => cache.routed(ALL_TYPES.map(type => ({ type, route: cache.route(type) })));
        return { ...ports, routeAll, info: logger.info };
    };

    const fallbackLines = (info: jest.Mock) => info.mock.calls.filter(call => String(call[1]).includes('fell back'));

    afterEach(() => {
        delete (window as any).ReactNativeWebView;
    });

    it('in the phone app, names the domains that fell back, in one line', async () => {
        const { routeAll, setNativeCacheSupport, info } = await load(true);
        // A shell reporting no storable types at all: every gateable domain falls back.
        setNativeCacheSupport({ supportedCacheTypes: [], cacheDomainVersions: {} });

        routeAll();

        expect(fallbackLines(info)).toHaveLength(1);
        expect(fallbackLines(info)[0][2].data.domains.length).toBeGreaterThan(0);
    });

    // In a plain browser everything on web storage is normal — not a fallback, so nothing to say.
    it('in a plain browser, says nothing', async () => {
        const { routeAll, info } = await load(false);

        routeAll();

        expect(fallbackLines(info)).toHaveLength(0);
    });
});
