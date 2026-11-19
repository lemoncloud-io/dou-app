import type { ConfigRuntimePorts } from '@chatic/config';
import type { RuntimeConfig, RuntimeEngine, RuntimePorts } from '@chatic/runtime-core';

import { host } from '../host/hostPorts';
import { HOST_PORT_NAMES } from '../host/ports';
import type { HostPorts } from '../host/ports';
import { defineAdapter, defineEngineAdapter, defineHostAdapter, defineRuntime } from './define';
import { RuntimeDeclarationError } from './resolvePorts';
import { formatPortChoice, startRuntime } from './startRuntime';
import type { RuntimeConfigAccess } from './startRuntime';
import type { HostPortDeclarations, HostPortName, PortChoiceReader, PortName, RuntimeDeclaration } from './types';

interface Facts {
    shell: boolean;
}

const storagePorts = { secret: { id: 'secret' }, plain: { id: 'plain' }, device: { id: 'device' } };

const made = <P extends PortName>(p: P, name: string) => ({ made: `${p}.${name}` }) as unknown as RuntimePorts[P];

const declaration = (extra: { config?: ConfigRuntimePorts } = {}) => {
    const seen: Record<string, unknown> = {};
    const decl = defineRuntime<Facts>({
        name: 'admin',
        facts: () => ({ shell: false }),
        ports: {
            storage: {
                default: defineAdapter<'storage', Facts>({
                    id: 'storage.tab',
                    port: 'storage',
                    // Asynchronous, like a store that has to load before the runtime reads it.
                    create: async () => storagePorts as unknown as RuntimePorts['storage'],
                }),
            },
            transport: {
                default: defineAdapter<'transport', Facts>({
                    id: 'transport.browser',
                    port: 'transport',
                    create: context => {
                        seen.transport = context;
                        return made('transport', 'browser');
                    },
                }),
            },
            auth: {
                default: defineAdapter({ id: 'auth.location', port: 'auth', create: () => made('auth', 'location') }),
            },
            cache: {
                default: defineAdapter({
                    id: 'cache.indexeddb',
                    port: 'cache',
                    create: () => made('cache', 'indexeddb'),
                }),
                alternatives: [
                    defineAdapter({
                        id: 'cache.web-storage',
                        port: 'cache',
                        create: () => made('cache', 'web-storage'),
                    }),
                ],
            },
            foreground: {
                default: defineAdapter({
                    id: 'foreground.visibility',
                    port: 'foreground',
                    create: () => made('foreground', 'visibility'),
                }),
            },
        },
        signedOutKeyPrefixes: ['log.'],
        ...extra,
    });
    return { decl, seen };
};

const fakeConfig = (initialised: boolean): RuntimeConfigAccess & { init: jest.Mock } => {
    let wired = initialised;
    return {
        init: jest.fn(() => {
            wired = true;
        }),
        isInitialized: () => wired,
        snapshot: ((key: string) =>
            wired ? { key, value: '', origin: 'default' } : undefined) as unknown as RuntimeConfigAccess['snapshot'],
    };
};

const engine = { id: 'engine' } as unknown as RuntimeEngine;

const harness = (read?: PortChoiceReader, config = fakeConfig(true)) => {
    const createRuntime = jest.fn((_: RuntimeConfig) => engine);
    const initEngine = jest.fn();
    const lines: string[] = [];
    return {
        createRuntime,
        initEngine,
        lines,
        config,
        options: { config, read, createRuntime, initEngine, log: (line: string) => lines.push(line) },
    };
};

describe('startRuntime', () => {
    it('builds every port, storage first and handed to the others, and assembles the runtime', async () => {
        const { decl, seen } = declaration();
        const h = harness();
        const started = await startRuntime(decl, h.options);

        expect(seen.transport).toEqual({ facts: { shell: false }, storage: storagePorts });
        expect(h.createRuntime).toHaveBeenCalledWith({
            storage: storagePorts,
            transport: { made: 'transport.browser' },
            auth: { made: 'auth.location' },
            cache: { made: 'cache.indexeddb' },
            foreground: { made: 'foreground.visibility' },
            signedOutKeyPrefixes: ['log.'],
            data: undefined,
        });
        expect(h.initEngine).toHaveBeenCalledWith(engine);
        expect(started.engine).toBe(engine);
        expect(started.facts).toEqual({ shell: false });
        expect(started.choices.cache.id).toBe('cache.indexeddb');
    });

    it('builds the adapter a toggle chose', async () => {
        const { decl } = declaration();
        const h = harness(key =>
            key === 'port.cache' ? { value: 'cache.web-storage', origin: 'local' } : { value: '', origin: 'default' }
        );
        await startRuntime(decl, h.options);
        expect(h.createRuntime.mock.calls[0][0].cache).toEqual({ made: 'cache.web-storage' });
    });

    it('logs one line per port, in build order, with the fallback reason', async () => {
        const { decl } = declaration();
        const h = harness(key =>
            key === 'port.cache' ? { value: 'cache.memory', origin: 'local' } : { value: '', origin: 'default' }
        );
        await startRuntime(decl, h.options);
        expect(h.lines).toEqual([
            'storage → storage.tab (default)',
            'transport → transport.browser (default)',
            'auth → auth.location (default)',
            "cache → cache.indexeddb (default, fell back: local asked for 'cache.memory', not one of this runtime's cache adapters (cache.indexeddb, cache.web-storage))",
            'foreground → foreground.visibility (default)',
            'engine → engine.core (default)',
        ]);
    });

    it('reads the toggles from config when no reader is handed in', async () => {
        const { decl } = declaration();
        const config = fakeConfig(true);
        config.snapshot = ((key: string) =>
            key === 'port.cache'
                ? { value: 'cache.web-storage', origin: 'shell' }
                : { value: '', origin: 'default' }) as unknown as RuntimeConfigAccess['snapshot'];
        const h = harness(undefined, config);
        const started = await startRuntime(decl, h.options);
        expect(started.choices.cache).toMatchObject({ id: 'cache.web-storage', origin: 'shell' });
    });

    it('initialises config from the declaration when nothing has yet', async () => {
        const ports = { env: {} } as unknown as ConfigRuntimePorts;
        const { decl } = declaration({ config: ports });
        const h = harness(undefined, fakeConfig(false));
        await startRuntime(decl, h.options);
        expect(h.config.init).toHaveBeenCalledWith(ports);
    });

    it('does not initialise config twice', async () => {
        const { decl } = declaration({ config: { env: {} } as unknown as ConfigRuntimePorts });
        const h = harness(undefined, fakeConfig(true));
        await startRuntime(decl, h.options);
        expect(h.config.init).not.toHaveBeenCalled();
    });

    it('takes config as initialised from the facade, not from whether it holds a port key', async () => {
        // A facade made over an app's own modules may hold no `port.*` key at all.
        const config = fakeConfig(true);
        config.snapshot = (() => undefined) as unknown as RuntimeConfigAccess['snapshot'];
        const { decl } = declaration({ config: { env: {} } as unknown as ConfigRuntimePorts });
        const h = harness(() => ({ value: '', origin: 'default' }), config);
        await startRuntime(decl, h.options);
        expect(config.init).not.toHaveBeenCalled();
        expect(h.createRuntime).toHaveBeenCalled();
    });

    it('refuses to start when config was never initialised and the declaration names no ports for it', async () => {
        const { decl } = declaration();
        const h = harness(undefined, fakeConfig(false));
        await expect(startRuntime(decl, h.options)).rejects.toThrow(RuntimeDeclarationError);
        expect(h.createRuntime).not.toHaveBeenCalled();
    });
});

/** Every host port on one `browser` adapter (`checkout` on `none`), each recording when it was built. */
const hostDeclarations = (built: string[]): HostPortDeclarations<Facts> => {
    const browser = <P extends HostPortName>(port: P, value: HostPorts[P]) =>
        defineHostAdapter<P, Facts>({
            id: `${port}.browser`,
            port,
            create: () => {
                built.push(port);
                return value;
            },
        });
    return {
        checkout: { default: browser('checkout', { kind: 'none' }) },
        media: { default: browser('media', { kind: 'browser' }) },
        files: { default: browser('files', { kind: 'browser' }) },
        links: { default: browser('links', { kind: 'browser' } as HostPorts['links']) },
        appShell: { default: browser('appShell', { kind: 'browser', os: null } as HostPorts['appShell']) },
        signIn: { default: browser('signIn', { kind: 'browser', os: null }) },
        diagnostics: { default: browser('diagnostics', { kind: 'browser' } as HostPorts['diagnostics']) },
        push: {
            default: browser('push', { kind: 'browser' }),
            alternatives: [
                defineHostAdapter<'push', Facts>({
                    id: 'push.shell',
                    port: 'push',
                    supports: facts => facts.shell,
                    create: () => ({ kind: 'shell' }),
                }),
            ],
        },
    };
};

describe('startRuntime with host ports', () => {
    afterEach(() => host.resetForTests());

    it('publishes every host port, once, before any runtime port is built or the engine assembled', async () => {
        const order: string[] = [];
        const { decl } = declaration();
        const withHost = defineRuntime<Facts>({ ...decl, host: hostDeclarations(order) });
        const h = harness();
        const publishHost = jest.fn((ports: HostPorts) => order.push(`publish:${Object.keys(ports).length}`));
        h.createRuntime.mockImplementation(() => {
            order.push('createRuntime');
            return engine;
        });

        const started = await startRuntime(withHost, { ...h.options, publishHost });

        expect(publishHost).toHaveBeenCalledTimes(1);
        expect(order).toEqual([...HOST_PORT_NAMES, 'publish:8', 'createRuntime']);
        expect(publishHost.mock.calls[0][0].appShell).toEqual({ kind: 'browser', os: null });
        expect(started.hostChoices?.push).toMatchObject({ id: 'push.browser', origin: 'default' });
    });

    it('publishes through the process holder by default', async () => {
        const { decl } = declaration();
        await startRuntime(defineRuntime<Facts>({ ...decl, host: hostDeclarations([]) }), harness().options);

        expect(host.isPublished).toBe(true);
        expect(host.ports.checkout).toEqual({ kind: 'none' });
    });

    it('publishes nothing for a declaration that names no host port', async () => {
        const { decl } = declaration();
        const publishHost = jest.fn();
        const started = await startRuntime(decl, { ...harness().options, publishHost });

        expect(publishHost).not.toHaveBeenCalled();
        expect(host.isPublished).toBe(false);
        expect(started.hostChoices).toBeUndefined();
    });

    it('settles a host port toggle by the same rules as a runtime port', async () => {
        const { decl } = declaration();
        const withHost = defineRuntime<Facts>({ ...decl, host: hostDeclarations([]) });
        const publishHost = jest.fn();
        const h = harness(key =>
            key === 'port.push' ? { value: 'push.shell', origin: 'local' } : { value: '', origin: 'default' }
        );

        const started = await startRuntime(withHost, { ...h.options, publishHost });

        // The facts say this is no shell, so the toggle falls back and the log says why.
        expect(started.hostChoices?.push).toMatchObject({
            id: 'push.browser',
            fellBack: { requested: 'push.shell', from: 'local', because: 'not supported on this host' },
        });
        expect(publishHost.mock.calls[0][0].push).toEqual({ kind: 'browser' });
        expect(h.lines).toContain(
            "push → push.browser (default, fell back: local asked for 'push.shell', not supported on this host)"
        );
    });
});

describe('startRuntime with an engine adapter', () => {
    type Owner = { side: 'web' | 'native' | null };

    const withEngine = (
        create: Parameters<typeof defineEngineAdapter<Facts, Owner>>[0]['create']
    ): { decl: RuntimeDeclaration<Facts, Owner>; storageContexts: unknown[] } => {
        const { decl } = declaration();
        const storageContexts: unknown[] = [];
        const storage = defineAdapter<'storage', Facts>({
            id: 'storage.vault',
            port: 'storage',
            create: context => {
                storageContexts.push(context);
                return storagePorts as unknown as RuntimePorts['storage'];
            },
        });
        return {
            decl: defineRuntime<Facts, Owner>({
                ...decl,
                ports: { ...decl.ports, storage: { default: storage } },
                engine: { default: defineEngineAdapter<Facts, Owner>({ id: 'engine.fake', port: 'engine', create }) },
            }),
            storageContexts,
        };
    };

    it('boots the engine the adapter made without building a port, and hands back what it settled', async () => {
        const mirrored = { id: 'mirror' } as unknown as RuntimeEngine;
        const { decl, storageContexts } = withEngine(() => ({ engine: mirrored, owner: { side: 'native' } }));
        const h = harness();

        const started = await startRuntime(decl, h.options);

        expect(storageContexts).toEqual([]);
        expect(h.createRuntime).not.toHaveBeenCalled();
        expect(h.initEngine).toHaveBeenCalledWith(mirrored);
        expect(started.engine).toBe(mirrored);
        expect(started.owner).toEqual({ side: 'native' });
        expect(started.engineChoice).toMatchObject({ id: 'engine.fake', origin: 'default' });
    });

    it('builds the core over the declared ports when the adapter asks, telling storage who owns the session', async () => {
        const { decl, storageContexts } = withEngine(async ({ core }) => ({
            engine: await core({ sessionOwner: 'web' }),
            owner: { side: 'web' },
        }));
        const h = harness();

        const started = await startRuntime(decl, h.options);

        expect(storageContexts).toEqual([{ facts: { shell: false }, sessionOwner: 'web' }]);
        expect(h.createRuntime).toHaveBeenCalledTimes(1);
        expect(started.engine).toBe(engine);
        expect(started.owner).toEqual({ side: 'web' });
    });

    it('builds the ports once however often the adapter asks for the core', async () => {
        const { decl, storageContexts } = withEngine(async ({ core }) => {
            const [first, second] = await Promise.all([core(), core()]);
            return { engine: first === second ? first : null };
        });
        const h = harness();

        const started = await startRuntime(decl, h.options);

        expect(storageContexts).toHaveLength(1);
        expect(h.createRuntime).toHaveBeenCalledTimes(1);
        expect(started.engine).toBe(engine);
    });

    it('boots nothing when the adapter decides no engine may run this launch', async () => {
        const { decl, storageContexts } = withEngine(() => ({ engine: null, owner: { side: null } }));
        const h = harness();

        const started = await startRuntime(decl, h.options);

        expect(storageContexts).toEqual([]);
        expect(h.initEngine).not.toHaveBeenCalled();
        expect(started.engine).toBeNull();
        expect(started.owner).toEqual({ side: null });
    });

    it('builds every port with no sessionOwner and hands back no owner when no engine is declared', async () => {
        const { decl } = declaration();
        const h = harness();

        const started = await startRuntime(decl, h.options);

        expect(started.engineChoice.id).toBe('engine.core');
        expect(started).not.toHaveProperty('owner');
        expect(h.initEngine).toHaveBeenCalledWith(engine);
    });
});

describe('formatPortChoice', () => {
    it('names the lane that chose the adapter', () => {
        expect(formatPortChoice({ port: 'cache', id: 'cache.web-storage', origin: 'build' })).toBe(
            'cache → cache.web-storage (build)'
        );
    });
});
