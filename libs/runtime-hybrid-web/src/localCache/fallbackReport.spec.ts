import type { CacheType } from '@chatic/bridge-messages';
import { MemoryStore } from '@chatic/storage';

jest.mock('@chatic/logger', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const ALL_TYPES: CacheType[] = ['chat', 'channel', 'invitecloud', 'join', 'site', 'user', 'meta', 'profile', 'invite'];

describe('webLocalCachePorts.routed — the web-storage fallback report', () => {
    const load = async (inPhoneApp: boolean) => {
        jest.resetModules();
        if (inPhoneApp) (window as any).ReactNativeWebView = { postMessage: jest.fn() };
        else delete (window as any).ReactNativeWebView;
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
        setNativeCacheSupport({ supportedCacheTypes: [], cacheDomainVersions: {} });

        routeAll();

        expect(fallbackLines(info)).toHaveLength(1);
        expect(fallbackLines(info)[0][2].data.domains.length).toBeGreaterThan(0);
    });

    it('in a plain browser, says nothing', async () => {
        const { routeAll, info } = await load(false);

        routeAll();

        expect(fallbackLines(info)).toHaveLength(0);
    });
});
