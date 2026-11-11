/**
 * @jest-environment jsdom
 *
 * A page, because this case drives one: the fixtures read `window.location`, `localStorage` or the
 * document's visibility (through `@chatic/perf`). The package's own tests run in `node` otherwise.
 */
/**
 * The boot contract. What is worth testing here is not that `createRuntime` calls three functions —
 * it is the two things that changed when the import side effects were removed:
 *
 *  1. A session read WITHOUT the call fails loudly and names the fix. Before, importing the session
 *     barrel wired the resolvers, so this state was unreachable; now it is reachable and its failure
 *     mode is the whole safety story.
 *  2. The call is what makes the session readable — nothing else does.
 *
 * Every case reloads the modules: the resolvers and the boot flag are module state, so a case that
 * inherited a previous one's would be testing the wrong tree.
 */
import type * as Session from '@chatic/session';
import type * as StorageLib from '@chatic/storage';
import type * as AuthRepository from '@chatic/auth/session/authRepository';
import type * as SyncDataGraph from '@chatic/sync/dataGraph';
import type * as TransportLib from '@chatic/transport';
import type * as TransportTesting from '@chatic/transport/testing/platform';
import type * as AuthLib from '@chatic/auth';
import type * as AuthTesting from '@chatic/auth/testing/platform';

// The spy is held OUTSIDE the factory (hence the `mock` prefix jest requires) so it survives
// `resetModules`: the factory re-runs per reload, and a reference captured from the module would
// point at the previous run's object.
const mockWarn = jest.fn();
const mockInfo = jest.fn();
jest.mock('@chatic/logger', () => ({
    logger: { warn: mockWarn, info: mockInfo, error: jest.fn(), debug: jest.fn() },
}));

const load = async () => {
    jest.resetModules();
    const init = await import('./createRuntime');
    // Reached through the package barrel, the way a consumer reads it — not the raw store file. Not a
    // dynamic `import()`: Nx reads one as a lazy-loaded dependency and then rejects every static import
    // of the package. After `resetModules` this loads the same fresh copy `./createRuntime` just did.
    const store = jest.requireActual<typeof Session>('@chatic/session');
    return { ...init, ...store };
};

/** The session's two ports over fresh memory — the store every case here is indifferent to. */
const memoryStorage = () => {
    const { MemoryStore } = jest.requireActual<typeof StorageLib>('@chatic/storage');
    return { secret: new MemoryStore(), plain: new MemoryStore(), device: new MemoryStore() };
};

/** Cache ports that are never reached: boot only hands them over, and builds no storage. */
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

/** A jsdom page's transport ports — what every case here is indifferent to. */
const transport = () =>
    jest.requireActual<typeof TransportTesting>('@chatic/transport/testing/platform').fakeTransportPorts();

/** A jsdom page's auth ports — what every case here is indifferent to. */
const authPorts = () => jest.requireActual<typeof AuthTesting>('@chatic/auth/testing/platform').fakeAuthPorts();

describe('createRuntime', () => {
    beforeEach(() => {
        mockWarn.mockClear();
        mockInfo.mockClear();
    });

    it('reading the session before boot throws, and the error names the fix', async () => {
        const { getActiveServerContext } = await load();

        // relayStore's resolvers are unset, and it refuses to guess: an empty host would produce
        // requests against '' instead of a diagnosable failure.
        expect(() => getActiveServerContext()).toThrow(/initAppRuntime/);
    });

    it('boots the session store — the same read succeeds afterwards', async () => {
        const { createRuntime, getActiveServerContext } = await load();

        createRuntime({ storage: memoryStorage(), transport: transport(), auth: authPorts(), cache: cachePorts() });

        expect(() => getActiveServerContext()).not.toThrow();
    });

    it('hands the transport its platform — before boot, opening a socket or reading the link throws', async () => {
        const { createRuntime } = await load();
        // The same fresh copy `./createRuntime` just loaded, through the package barrel.
        const { transportPlatform } = jest.requireActual<typeof TransportLib>('@chatic/transport');
        const ports = transport();

        expect(() => transportPlatform.ports()).toThrow(/initAppRuntime/);
        createRuntime({ storage: memoryStorage(), transport: ports, auth: authPorts(), cache: cachePorts() });

        expect(transportPlatform.ports()).toBe(ports);
    });

    it('hands auth its platform before the boot sweep reads the logout flag', async () => {
        const { createRuntime } = await load();
        const { authPlatform } = jest.requireActual<typeof AuthLib>('@chatic/auth');
        const currentSearch = jest.fn(() => '');
        const ports = { ...authPorts(), currentSearch };

        expect(() => authPlatform.ports()).toThrow(/initAppRuntime/);
        createRuntime({ storage: memoryStorage(), transport: transport(), auth: ports, cache: cachePorts() });

        expect(authPlatform.ports()).toBe(ports);
        // The sweep is what read it, during boot.
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
        // Not `await import(…)`: Nx would then call the package lazy-loaded and fail every static import
        // of it. After `resetModules`, `requireActual` returns the same fresh copy.
        const { authRepositorySource } = jest.requireActual<typeof AuthRepository>(
            '@chatic/auth/session/authRepository'
        );
        const { syncDataGraph } = jest.requireActual<typeof SyncDataGraph>('@chatic/sync/dataGraph');

        createRuntime({ storage: memoryStorage(), transport: transport(), auth: authPorts(), cache: cachePorts() });

        // Boot only installs the accessors; the graph is still built on first use.
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

        createRuntime({ storage: memoryStorage(), transport: transport(), auth: authPorts(), cache: cachePorts() });

        // Passing `{}` through would trip the runtime's own late-registration warning for nothing.
        expect(configureDataRuntime).not.toHaveBeenCalled();
    });

    it('turns a pending cache-clear request into the cursor watermark before the data runtime exists', async () => {
        const storage = memoryStorage();
        storage.device.set('chatic.syncCursors.resetPending', '1');
        const { createRuntime } = await load();
        const { getSyncCursorsValidAfter } = await import('./data/syncCursorWatermark');
        const before = Date.now();

        createRuntime({ storage, transport: transport(), auth: authPorts(), cache: cachePorts() });

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
            signedOutKeyPrefixes: ['@chatic/web.log.'],
        });

        expect(plain.keys()).toEqual(['@chatic/config.ui.theme']);
        window.history.replaceState({}, '', '/');
    });

    it('is safe to call twice, and says so — a duplicate boot means two owners', async () => {
        const { createRuntime, getActiveServerContext } = await load();

        createRuntime({ storage: memoryStorage(), transport: transport(), auth: authPorts(), cache: cachePorts() });
        createRuntime({ storage: memoryStorage(), transport: transport(), auth: authPorts(), cache: cachePorts() });

        expect(mockWarn).toHaveBeenCalledWith('WEB_CORE', expect.stringContaining('more than once'));
        // The wiring is assignment, not accumulation: the second call leaves a working runtime.
        expect(() => getActiveServerContext()).not.toThrow();
    });

    it('does not warn on the first call', async () => {
        const { createRuntime } = await load();

        createRuntime({ storage: memoryStorage(), transport: transport(), auth: authPorts(), cache: cachePorts() });

        expect(mockWarn).not.toHaveBeenCalled();
    });

    // The state log is the only way anyone learns what a device was actually configured with
    // (ADR-0079 Decision 16), and nothing else in the app asks for it — if this call goes missing the
    // feature is simply absent, with no failing screen to notice. The registry is unwired here,
    // which is the point: the anchor line still goes out.
    it('records the config boot state', async () => {
        const { createRuntime } = await load();

        createRuntime({ storage: memoryStorage(), transport: transport(), auth: authPorts(), cache: cachePorts() });

        expect(mockInfo).toHaveBeenCalledWith('CONFIG', expect.stringContaining('Boot state:'), {
            overrides: [],
        });
    });
});
