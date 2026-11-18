// The IndexedDB adapter opens a real database in its constructor, so a shim must exist first.
import 'fake-indexeddb/auto';

import type { CacheType } from '@chatic/bridge-messages';
import type { DataContextProvider, LocalCachePorts } from '@chatic/data';
import type { RuntimePorts } from '@chatic/runtime-core';
import { MemoryStore } from '@chatic/storage';

/**
 * `createWebRuntime` is the same per-port factories the package exports, chosen for the page: this
 * suite hands it the real ports (only `createRuntime` is a stand-in) and checks each port it passed
 * on answers as the factory built on its own does — in a plain tab and in the phone app.
 */
const mockCreateRuntime = jest.fn((_config: unknown) => ({ id: 'engine' }));
jest.mock('@chatic/runtime-core', () => ({ createRuntime: (config: unknown) => mockCreateRuntime(config) }));
jest.mock('@chatic/logger', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const TYPES: CacheType[] = ['chat', 'channel', 'invitecloud', 'join', 'site', 'user', 'meta', 'profile', 'invite'];
const context: DataContextProvider = { getContext: () => ({ cid: 'c1', uid: 'u1' }), setContext: () => undefined };
const nameOf = (value: unknown) => (value as object).constructor.name;

type HandedConfig = RuntimePorts & { storage: unknown; signedOutKeyPrefixes?: unknown; data?: unknown };

/** A fresh module registry for the environment, so the host profile is read again. */
const load = async (inPhoneApp: boolean) => {
    jest.resetModules();
    mockCreateRuntime.mockClear();
    if (inPhoneApp) (window as any).ReactNativeWebView = { postMessage: jest.fn() };
    else delete (window as any).ReactNativeWebView;
    const runtime = await import('./createWebRuntime');
    const factories = await import('./index');
    return { ...runtime, factories };
};

const routesAndStorages = (cache: LocalCachePorts) =>
    TYPES.map(type => {
        const route = cache.route(type);
        return { type, route, storage: nameOf(cache.storage(type, route, context, undefined)) };
    });

afterEach(() => {
    delete (window as any).ReactNativeWebView;
});

describe('createWebRuntime hands createRuntime the factories’ ports', () => {
    for (const inPhoneApp of [false, true]) {
        it(`${inPhoneApp ? 'in the phone app' : 'in a plain tab'}, every port answers as its factory does`, async () => {
            const { createWebRuntime, factories } = await load(inPhoneApp);
            const storage = { secret: new MemoryStore(), plain: new MemoryStore(), device: new MemoryStore() };
            const cacheTab = new MemoryStore();

            createWebRuntime({ storage, cacheTab });
            const config = mockCreateRuntime.mock.calls[0][0] as HandedConfig;

            expect(Object.keys(config).sort()).toEqual(
                ['auth', 'cache', 'data', 'foreground', 'signedOutKeyPrefixes', 'storage', 'transport'].sort()
            );
            expect(config.storage).toBe(storage);

            const transport = factories.webTransportPorts();
            expect(config.transport.online.read()).toBe(transport.online.read());
            expect(config.transport.device()).toEqual(transport.device());

            expect(config.auth.currentSearch()).toBe(factories.webAuthPorts().currentSearch());
            expect(config.foreground).toBe(factories.webForegroundPorts());

            expect(routesAndStorages(config.cache)).toEqual(routesAndStorages(factories.webLocalCachePorts(cacheTab)));
            const composed = factories.routedCachePorts({
                bridge: inPhoneApp ? 'react-native-webview' : null,
                support: () => null,
                indexedDb: factories.indexedDbCache(),
                shellSqlite: factories.shellSqliteCache({ support: () => null }),
                webStorage: factories.webStorageCache({ tab: cacheTab, importFrom: factories.indexedDbCache() }),
            });
            expect(routesAndStorages(config.cache)).toEqual(routesAndStorages(composed));
            expect(nameOf(config.cache.globalSearch())).toBe(nameOf(composed.globalSearch()));
        });
    }
});
