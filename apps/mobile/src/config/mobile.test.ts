/**
 * @jest-environment node
 */
// Node, not jsdom: the runtime's socket client needs `TextEncoder`, which jsdom leaves out.
import type { DataContextProvider } from '@chatic/data';
import type { RuntimeEngine, StartRuntimeOptions } from '@chatic/runtime-mobile';
import { NativeRuntimeEnvError, NativeRuntimeNoSessionError } from '@chatic/runtime-mobile';

import type { ICacheCrudService, ICacheSearchService } from '../app/services/cache/types';
import type { ILogService } from '../app/services/log';
import { mobile, startMobileRuntime } from './mobile';
import type { StartMobileRuntimeOptions } from './mobile';

// The runtime package reads these at import and when its ports are built; nothing here opens a socket.
jest.mock('react-native', () => ({
    AppState: { currentState: 'active', addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
    Platform: { OS: 'ios' },
}));
jest.mock('@react-native-community/netinfo', () => ({
    __esModule: true,
    default: { addEventListener: jest.fn(() => () => undefined), fetch: jest.fn() },
}));

/** The address a session's end leaves in `plain` for the next launch (`@chatic/runtime-mobile`'s auth). */
const HOME_SEARCH_KEY = 'chatic-runtime-mobile-home-search';

/** What the boot built before the declaration: one fixed adapter per port. */
const EXPECTED_DEFAULTS = {
    storage: 'storage.mobile-vault',
    transport: 'transport.mobile',
    auth: 'auth.mobile',
    cache: 'cache.mobile-sqlite',
    foreground: 'foreground.app-state',
} as const;

const FULL_ENV: Record<string, string> = {
    VITE_ENV: 'dev',
    VITE_PROJECT: 'chatic',
    VITE_HOST: 'host',
    VITE_OAUTH_ENDPOINT: 'oauth',
    VITE_SOCIAL_OAUTH_ENDPOINT: 'social',
    VITE_BACKEND_ENDPOINT: 'backend',
    VITE_WS_ENDPOINT: 'ws',
    VITE_DOU_ENDPOINT: 'dou',
};

/** What the start hands runtime-core's `createRuntime`: the built ports. */
type RuntimeConfig = Parameters<NonNullable<StartRuntimeOptions['createRuntime']>>[0];

const fakeFile = () => {
    const entries = new Map<string, string>();
    return {
        entries,
        getString: (key: string) => entries.get(key),
        set: (key: string, value: string) => void entries.set(key, value),
        remove: (key: string) => entries.delete(key),
        clearAll: () => entries.clear(),
        getAllKeys: () => [...entries.keys()],
    };
};

const setup = (vaultValues: Record<string, string> = { 'chatic-relay-token': 't' }) => {
    const vault = {
        get: jest.fn(async () => ({ status: 'available' as const, values: { ...vaultValues } })),
        save: jest.fn(async () => true),
        clear: jest.fn(async () => true),
    };
    const files = { plain: fakeFile(), device: fakeFile() };
    const crud = { fetch: jest.fn(async () => ({ id: 'u9' })) } as unknown as ICacheCrudService;
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as ILogService;
    const leaveToHome = jest.fn();
    const sources: StartMobileRuntimeOptions = {
        vault,
        files,
        cache: { crud: () => crud, search: () => ({}) as ICacheSearchService, logger },
        env: name => FULL_ENV[name],
        userAgent: 'chatic-ua',
        leaveToHome,
        owner: { owner: 'native', source: 'switch' },
        logger,
    };

    const config = { init: jest.fn(), isInitialized: jest.fn(() => false), snapshot: jest.fn(() => undefined) };
    let built: RuntimeConfig | undefined;
    const engine = { id: 'engine' } as unknown as RuntimeEngine;
    const createRuntime = jest.fn((ports: RuntimeConfig) => {
        built = ports;
        return engine;
    });
    const log = jest.fn();
    const options: StartRuntimeOptions = { config, createRuntime, initEngine: jest.fn(), log };
    const start = (overrides: Partial<StartMobileRuntimeOptions> = {}) =>
        startMobileRuntime({ ...sources, ...overrides }, options);

    return { vault, files, crud, logger, leaveToHome, config, createRuntime, log, engine, start, built: () => built };
};

describe('mobile runtime declaration', () => {
    it('fixes every port to the adapter the boot has always built', () => {
        const { vault, files } = setup();
        const declaration = mobile({
            vault,
            files,
            cache: {} as never,
            env: () => undefined,
            userAgent: 'chatic-ua',
            leaveToHome: jest.fn(),
            onSessionLoad: jest.fn(),
        });

        const declared = Object.fromEntries(
            Object.entries(declaration.ports).map(([port, declared]) => [port, declared.default.id])
        );
        expect(declared).toEqual(EXPECTED_DEFAULTS);
        for (const port of Object.values(declaration.ports)) expect(port.alternatives ?? []).toEqual([]);
        expect(declaration.engine).toBeUndefined();
    });
});

describe('startMobileRuntime', () => {
    it('starts nothing when the build lacks a value the runtime needs', async () => {
        const { start, vault, config, createRuntime, log } = setup();

        await expect(
            start({ env: name => (name === 'VITE_BACKEND_ENDPOINT' ? undefined : FULL_ENV[name]) })
        ).rejects.toEqual(new NativeRuntimeEnvError(['VITE_BACKEND_ENDPOINT']));
        expect(config.init).not.toHaveBeenCalled();
        expect(vault.get).not.toHaveBeenCalled();
        expect(log).not.toHaveBeenCalled();
        expect(createRuntime).not.toHaveBeenCalled();
    });

    it('configures from the build, answering the platform from React Native', async () => {
        const { start, config } = setup();

        await start();

        expect(config.init).toHaveBeenCalledTimes(1);
        const { env } = config.init.mock.calls[0][0];
        expect(env.platform()).toBe('ios');
        expect(env.raw('VITE_HOST')).toBe('host');
    });

    it('answers the engine and how the vault was found', async () => {
        const { start, engine } = setup();

        const boot = await start();

        expect(boot).toEqual({
            engine,
            vault: expect.objectContaining({ status: 'available' }),
            secretStorage: 'vault',
        });
    });

    it('logs the owner and its source once, beside each port on its default', async () => {
        const { start, logger, log } = setup();

        await start({ owner: { owner: 'native', source: 'page' } });

        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith('app.runtime_port', '[mobile] owner → native (page)', {
            data: { runtime: 'mobile', owner: 'native', source: 'page' },
        });
        expect(log.mock.calls.map(([line]) => line)).toEqual(
            expect.arrayContaining(Object.entries(EXPECTED_DEFAULTS).map(([port, id]) => `${port} → ${id} (default)`))
        );
    });

    it('declines a vault with no session, having created nothing', async () => {
        const { start, createRuntime, files } = setup({});
        files.plain.set(HOME_SEARCH_KEY, 'logout=1');

        const starting = start();

        await expect(starting).rejects.toBeInstanceOf(NativeRuntimeNoSessionError);
        await expect(starting).rejects.toMatchObject({ code: 'NATIVE_RUNTIME_NO_SESSION', secretStorage: 'empty' });
        expect(createRuntime).not.toHaveBeenCalled();
        expect(files.plain.entries.has(HOME_SEARCH_KEY)).toBe(false);
    });

    it('reads the secrets the pages keep in the vault, loaded before the runtime is created', async () => {
        const { start, vault, built } = setup();

        await start();
        const { storage } = built() as RuntimeConfig;

        expect(storage.secret.get('chatic-relay-token')).toBe('t');
        storage.secret.set('chatic-cloud-token', 'c');
        await (storage.secret as unknown as { flush(): Promise<void> }).flush();
        expect(vault.save).toHaveBeenCalledWith({ 'chatic-cloud-token': 'c' }, []);
    });

    it('keeps plain and device values in their own files', async () => {
        const { start, files, built } = setup();

        await start();
        const { storage } = built() as RuntimeConfig;
        storage.plain.set('chatic-selected-cloud-id', 'c1');
        storage.device.set('draft', '{"text":"hi"}');

        expect(files.plain.entries.get('chatic-selected-cloud-id')).toBe('c1');
        expect(files.device.entries.get('draft')).toBe('{"text":"hi"}');
        expect(files.plain.entries.has('draft')).toBe(false);
    });

    it("reads the cache from the app's database", async () => {
        const { start, crud, built } = setup();

        await start();
        const { cache } = built() as RuntimeConfig;
        const context = { getContext: () => ({ cid: 'c1', uid: 'u1' }) } as unknown as DataContextProvider;
        const users = cache.storage('user', cache.route('user'), context, undefined);

        await expect(users.load('u9')).resolves.toEqual({ id: 'u9' });
        expect(crud.fetch).toHaveBeenCalledWith({ type: 'user', cid: 'c1', uid: 'u1', id: 'u9' });
    });

    it("saves a session's end in the runtime's plain file, then takes the host's way home", async () => {
        const { start, files, leaveToHome, built } = setup();

        await start();
        (built() as RuntimeConfig).auth.leaveToHome(new URLSearchParams('logout=1'));

        expect(files.plain.entries.get(HOME_SEARCH_KEY)).toBe('logout=1');
        expect(leaveToHome).toHaveBeenCalledTimes(1);
    });

    it('reports the user agent with every socket device report', async () => {
        const { start, built } = setup();

        await start();

        expect((built() as RuntimeConfig).transport.device()).toMatchObject({
            appPlatform: 'ios',
            userAgent: 'chatic-ua',
        });
    });
});
