/**
 * @jest-environment ../../tools/jest/jsdom-environment.js
 *
 * A page, because this case drives one: the fixtures read `window.location`, `localStorage` or the
 * document's visibility (through `@chatic/perf`). The package's own tests run in `node` otherwise.
 */
import type * as Session from '@chatic/session';
import type * as StorageLib from '@chatic/storage';
import type * as AuthRepository from '@chatic/auth/session/authRepository';
import type * as SyncDataGraph from '@chatic/sync/dataGraph';
import type * as TransportLib from '@chatic/transport';
import type * as TransportTesting from '@chatic/transport/testing/platform';
import type * as AuthLib from '@chatic/auth';
import type * as AuthTesting from '@chatic/auth/testing/platform';

const mockWarn = jest.fn();
const mockInfo = jest.fn();
jest.mock('@chatic/logger', () => ({
    logger: { warn: mockWarn, info: mockInfo, error: jest.fn(), debug: jest.fn() },
}));

const load = async () => {
    jest.resetModules();
    const init = await import('./createRuntime');
    const store = jest.requireActual<typeof Session>('@chatic/session');
    return { ...init, ...store };
};

const memoryStorage = () => {
    const { MemoryStore } = jest.requireActual<typeof StorageLib>('@chatic/storage');
    return { secret: new MemoryStore(), plain: new MemoryStore(), device: new MemoryStore() };
};

const foregroundPorts = () => ({ read: () => true, subscribe: () => () => undefined });

const cachePorts = () =>
    ({
        route: () => 'web',
        storage: () => {
            throw new Error('[test] boot built a cache storage');
        },
        routed: () => undefined,
        globalSearch: () => ({}),
        metrics: () => ({}),
    }) as never;

const transport = () =>
    jest.requireActual<typeof TransportTesting>('@chatic/transport/testing/platform').fakeTransportPorts();

const authPorts = () => jest.requireActual<typeof AuthTesting>('@chatic/auth/testing/platform').fakeAuthPorts();

describe('createRuntime', () => {
    beforeEach(() => {
        mockWarn.mockClear();
        mockInfo.mockClear();
    });

    it('reading the session before boot throws, and the error names the fix', async () => {
        const { getActiveServerContext } = await load();

        expect(() => getActiveServerContext()).toThrow(/createRuntime/);
    });

    it('boots the session store — the same read succeeds afterwards', async () => {
        const { createRuntime, getActiveServerContext } = await load();

        createRuntime({
            storage: memoryStorage(),
            transport: transport(),
            auth: authPorts(),
            cache: cachePorts(),
            foreground: foregroundPorts(),
        });

        expect(() => getActiveServerContext()).not.toThrow();
    });

    it('hands the transport its platform — before boot, opening a socket or reading the link throws', async () => {
        const { createRuntime } = await load();
        const { transportPlatform } = jest.requireActual<typeof TransportLib>('@chatic/transport');
        const ports = transport();

        expect(() => transportPlatform.ports()).toThrow(/createRuntime/);
        createRuntime({
            storage: memoryStorage(),
            transport: ports,
            auth: authPorts(),
            cache: cachePorts(),
            foreground: foregroundPorts(),
        });

        expect(transportPlatform.ports()).toBe(ports);
    });

    it('hands auth its platform before the boot sweep reads the logout flag', async () => {
        const { createRuntime } = await load();
        const { authPlatform } = jest.requireActual<typeof AuthLib>('@chatic/auth');
        const currentSearch = jest.fn(() => '');
        const ports = { ...authPorts(), currentSearch };

        expect(() => authPlatform.ports()).toThrow(/createRuntime/);
        createRuntime({
            storage: memoryStorage(),
            transport: transport(),
            auth: ports,
            cache: cachePorts(),
            foreground: foregroundPorts(),
        });

        expect(authPlatform.ports()).toBe(ports);
        expect(currentSearch).toHaveBeenCalled();
    });

    it('forwards data policies to the data runtime', async () => {
        jest.resetModules();
        const configureDataRuntime = jest.fn();
        jest.doMock('./data/runtime', () => ({ configureDataRuntime }));
        const { createRuntime } = await import('./createRuntime');

        const data = { cache: { maxChatsPerChannel: 1000 } };
        createRuntime({
            storage: memoryStorage(),
            transport: transport(),
            auth: authPorts(),
            cache: cachePorts(),
            foreground: foregroundPorts(),
            data,
        });

        expect(configureDataRuntime).toHaveBeenCalledWith(data);
    });

    it('hands the repository graph to auth and sync without building it', async () => {
        jest.resetModules();
        const auth = { delegateCloud: jest.fn() };
        const manager = { getScopedRepositories: jest.fn(), getScopedContext: jest.fn() };
        const getRepositories = jest.fn(() => ({ auth }));
        const getDataManager = jest.fn(() => manager);
        jest.doMock('./data/runtime', () => ({ configureDataRuntime: jest.fn(), getRepositories, getDataManager }));
        const { createRuntime } = await import('./createRuntime');
        const { authRepositorySource } = jest.requireActual<typeof AuthRepository>(
            '@chatic/auth/session/authRepository'
        );
        const { syncDataGraph } = jest.requireActual<typeof SyncDataGraph>('@chatic/sync/dataGraph');

        createRuntime({
            storage: memoryStorage(),
            transport: transport(),
            auth: authPorts(),
            cache: cachePorts(),
            foreground: foregroundPorts(),
        });

        expect(getRepositories).not.toHaveBeenCalled();
        expect(getDataManager).not.toHaveBeenCalled();
        expect(authRepositorySource.get()).toBe(auth);
        expect(syncDataGraph.get()).toBe(manager);
    });

    it('registers nothing with the data runtime when no policy is given', async () => {
        jest.resetModules();
        const configureDataRuntime = jest.fn();
        jest.doMock('./data/runtime', () => ({ configureDataRuntime }));
        const { createRuntime } = await import('./createRuntime');

        createRuntime({
            storage: memoryStorage(),
            transport: transport(),
            auth: authPorts(),
            cache: cachePorts(),
            foreground: foregroundPorts(),
        });

        expect(configureDataRuntime).not.toHaveBeenCalled();
    });

    it('turns a pending cache-clear request into the cursor watermark before the data runtime exists', async () => {
        const storage = memoryStorage();
        storage.device.set('chatic.syncCursors.resetPending', '1');
        const { createRuntime } = await load();
        const { getSyncCursorsValidAfter } = await import('./data/syncCursorWatermark');
        const before = Date.now();

        createRuntime({
            storage,
            transport: transport(),
            auth: authPorts(),
            cache: cachePorts(),
            foreground: foregroundPorts(),
        });

        expect(getSyncCursorsValidAfter()).toBeGreaterThanOrEqual(before);
        expect(storage.device.get('chatic.syncCursors.resetPending')).toBeNull();
    });

    it("keeps the runtime's own state in the device store the entry point hands over", async () => {
        const { MemoryStore } = jest.requireActual<typeof StorageLib>('@chatic/storage');
        const device = new MemoryStore();
        device.set('chatic.syncCursors.resetPending', '1');
        const { createRuntime } = await load();
        const { getSyncCursorsValidAfter } = await import('./data/syncCursorWatermark');

        createRuntime({
            storage: { secret: new MemoryStore(), plain: new MemoryStore(), device },
            transport: transport(),
            auth: authPorts(),
            cache: cachePorts(),
            foreground: foregroundPorts(),
        });

        expect(device.get('chatic.syncCursors.resetPending')).toBeNull();
        expect(getSyncCursorsValidAfter()).toBeGreaterThan(0);
        expect(localStorage.length).toBe(0);
    });

    it('sweeps the signed-out keys the app declared on a document opened by logout', async () => {
        const { MemoryStore } = jest.requireActual<typeof StorageLib>('@chatic/storage');
        const plain = new MemoryStore();
        plain.set('@chatic/web.log.pending.tab-1', '[]');
        plain.set('@chatic/config.ui.theme', '"dark"');
        window.history.replaceState({}, '', '/?logout=1');
        const { createRuntime } = await load();

        createRuntime({
            storage: { secret: new MemoryStore(), plain, device: new MemoryStore() },
            transport: transport(),
            auth: authPorts(),
            cache: cachePorts(),
            foreground: foregroundPorts(),
            signedOutKeyPrefixes: ['@chatic/web.log.'],
        });

        expect(plain.keys()).toEqual(['@chatic/config.ui.theme']);
        window.history.replaceState({}, '', '/');
    });

    it('is safe to call twice, and says so — a duplicate boot means two owners', async () => {
        const { createRuntime, getActiveServerContext } = await load();

        createRuntime({
            storage: memoryStorage(),
            transport: transport(),
            auth: authPorts(),
            cache: cachePorts(),
            foreground: foregroundPorts(),
        });
        createRuntime({
            storage: memoryStorage(),
            transport: transport(),
            auth: authPorts(),
            cache: cachePorts(),
            foreground: foregroundPorts(),
        });

        expect(mockWarn).toHaveBeenCalledWith('WEB_CORE', expect.stringContaining('more than once'));
        expect(() => getActiveServerContext()).not.toThrow();
    });

    it('does not warn on the first call', async () => {
        const { createRuntime } = await load();

        createRuntime({
            storage: memoryStorage(),
            transport: transport(),
            auth: authPorts(),
            cache: cachePorts(),
            foreground: foregroundPorts(),
        });

        expect(mockWarn).not.toHaveBeenCalled();
    });

    it('records the config boot state', async () => {
        const { createRuntime } = await load();

        createRuntime({
            storage: memoryStorage(),
            transport: transport(),
            auth: authPorts(),
            cache: cachePorts(),
            foreground: foregroundPorts(),
        });

        expect(mockInfo).toHaveBeenCalledWith('CONFIG', expect.stringContaining('Boot state:'), {
            overrides: [],
        });
    });
});
