import type { ConfigRuntimePorts } from '@chatic/config';
import type { RuntimeConfig, RuntimeEngine, RuntimePorts } from '@chatic/runtime-core';

import { defineAdapter, defineRuntime } from './define';
import { RuntimeDeclarationError } from './resolvePorts';
import { formatPortChoice, startRuntime } from './startRuntime';
import type { RuntimeConfigAccess } from './startRuntime';
import type { PortChoiceReader, PortName } from './types';

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

describe('formatPortChoice', () => {
    it('names the lane that chose the adapter', () => {
        expect(formatPortChoice({ port: 'cache', id: 'cache.web-storage', origin: 'build' })).toBe(
            'cache → cache.web-storage (build)'
        );
    });
});
