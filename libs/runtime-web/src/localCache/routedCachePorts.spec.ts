import type { CacheType } from '@chatic/bridge-messages';
import type { BridgeChannel } from '@chatic/bridges';
import type { DataContextProvider, ICacheMetricsSource, IGlobalCacheSearchSource } from '@chatic/data';

import type { SearchableWebCacheStore, WebCacheStore } from './cacheStore';
import { readNativeCacheSupport } from './nativeCacheSupport';
import type { NativeCacheSupport } from './nativeCacheSupport';
import { routedCachePorts } from './routedCachePorts';

jest.mock('@chatic/logger', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const context: DataContextProvider = { getContext: () => ({ cid: 'c1', uid: 'u1' }), setContext: () => undefined };

const fakeStore = (name: string) => ({
    storage: jest.fn((type: CacheType) => ({ store: name, type }) as never),
    globalSearch: jest.fn(() => ({ search: name }) as unknown as IGlobalCacheSearchSource),
});

const compose = (bridge: BridgeChannel | null, support: () => NativeCacheSupport | null = () => null) => {
    const indexedDb = fakeStore('indexedDb');
    const shellSqlite = fakeStore('shellSqlite');
    const webStorage = fakeStore('webStorage');
    const ports = routedCachePorts({
        bridge,
        support,
        indexedDb: indexedDb as SearchableWebCacheStore,
        shellSqlite: shellSqlite as SearchableWebCacheStore,
        webStorage: webStorage as WebCacheStore,
    });
    return { ports, indexedDb, shellSqlite, webStorage };
};

const fallbackLines = () => {
    const { logger } = jest.requireMock('@chatic/logger') as { logger: { info: jest.Mock } };
    return logger.info.mock.calls.filter(call => String(call[1]).includes('fell back'));
};

beforeEach(() => jest.clearAllMocks());

describe('routedCachePorts — route', () => {
    it('routes by the bridge it is handed: a plain tab, a desktop shell and the phone app', () => {
        expect(compose(null).ports.route('chat')).toBe('web');
        expect(compose(null).ports.route('invitecloud')).toBe('session');
        expect(compose('message-handler').ports.route('invitecloud')).toBe('web');
        expect(compose('react-native-webview').ports.route('chat')).toBe('native');
    });

    it('reads the report at each decision', () => {
        let report: NativeCacheSupport | null = null;
        const { ports } = compose('react-native-webview', () => report);

        expect(ports.route('invite')).toBe('web');
        report = readNativeCacheSupport({ supportedCacheTypes: ['invite'] });
        expect(ports.route('invite')).toBe('native');
    });
});

describe('routedCachePorts — storage', () => {
    it('asks the store each route names, with the domain, the context and the options', () => {
        const { ports, indexedDb, shellSqlite, webStorage } = compose('react-native-webview');
        const options = { maxChatsPerChannel: 3 };

        expect(ports.storage('chat', 'web', context, options)).toEqual({ store: 'indexedDb', type: 'chat' });
        expect(ports.storage('chat', 'native', context, undefined)).toEqual({ store: 'shellSqlite', type: 'chat' });
        expect(ports.storage('invitecloud', 'session', context, undefined)).toEqual({
            store: 'webStorage',
            type: 'invitecloud',
        });
        expect(indexedDb.storage).toHaveBeenCalledWith('chat', context, options);
        expect(shellSqlite.storage).toHaveBeenCalledTimes(1);
        expect(webStorage.storage).toHaveBeenCalledTimes(1);
    });

    it('refuses a route it did not make', () => {
        expect(() => compose(null).ports.storage('chat', 'bogus', context, undefined)).toThrow(
            /unknown cache route 'bogus'/
        );
    });
});

describe('routedCachePorts — search and metrics', () => {
    it("searches the shell's SQLite inside the phone app and IndexedDB elsewhere", () => {
        expect(compose('react-native-webview').ports.globalSearch()).toEqual({ search: 'shellSqlite' });
        expect(compose('message-handler').ports.globalSearch()).toEqual({ search: 'indexedDb' });
        expect(compose(null).ports.globalSearch()).toEqual({ search: 'indexedDb' });
    });

    it('takes the metrics source it is handed, and the shell bridge timings otherwise', () => {
        const metrics = { read: jest.fn(), reset: jest.fn() } as unknown as ICacheMetricsSource;
        const handed = routedCachePorts({
            bridge: null,
            support: () => null,
            indexedDb: fakeStore('i') as SearchableWebCacheStore,
            shellSqlite: fakeStore('s') as SearchableWebCacheStore,
            webStorage: fakeStore('w') as WebCacheStore,
            metrics: () => metrics,
        });

        expect(handed.metrics()).toBe(metrics);
        expect((compose(null).ports.metrics() as object).constructor.name).toBe('NativeCacheMetricsSource');
    });
});

describe('routedCachePorts — routed', () => {
    it('in the phone app, names in one line the domains the report could not hold', () => {
        const { ports } = compose('react-native-webview', () => readNativeCacheSupport({}));

        ports.routed([
            { type: 'chat', route: 'native' },
            { type: 'invite', route: 'web' },
        ]);

        expect(fallbackLines()).toHaveLength(1);
        expect(fallbackLines()[0][2].data.domains).toEqual(['invite']);
    });

    it('outside the phone app, says nothing', () => {
        compose('message-handler').ports.routed([{ type: 'invite', route: 'web' }]);
        compose(null).ports.routed([{ type: 'invite', route: 'web' }]);

        expect(fallbackLines()).toHaveLength(0);
    });
});

describe('routedCachePorts — a set without every store', () => {
    const onlyIndexedDb = (bridge: BridgeChannel | null, withWebStorage = false) => {
        const indexedDb = fakeStore('indexedDb');
        const webStorage = fakeStore('webStorage');
        const ports = routedCachePorts({
            bridge,
            support: () => readNativeCacheSupport({ supportedCacheTypes: ['chat'] }),
            indexedDb: indexedDb as SearchableWebCacheStore,
            ...(withWebStorage ? { webStorage: webStorage as WebCacheStore } : {}),
        });
        return { ports, indexedDb };
    };

    it('keeps on IndexedDB what would have gone to a store it was not handed', () => {
        expect(onlyIndexedDb('react-native-webview').ports.route('chat')).toBe('web');
        expect(onlyIndexedDb(null).ports.route('invitecloud')).toBe('web');
        expect(onlyIndexedDb(null, true).ports.route('invitecloud')).toBe('session');
    });

    it('searches IndexedDB inside the phone app when the shell database is not in the set', () => {
        const { ports, indexedDb } = onlyIndexedDb('react-native-webview');
        expect(ports.globalSearch()).toEqual({ search: 'indexedDb' });
        expect(indexedDb.globalSearch).toHaveBeenCalledTimes(1);
    });

    it('refuses a route to a store it was not handed', () => {
        const { ports } = onlyIndexedDb('react-native-webview');
        expect(() => ports.storage('chat', 'native', context, undefined)).toThrow(/unknown cache route 'native'/);
        expect(() => ports.storage('invitecloud', 'session', context, undefined)).toThrow(
            /unknown cache route 'session'/
        );
    });
});
