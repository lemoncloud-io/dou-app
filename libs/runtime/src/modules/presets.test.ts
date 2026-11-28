import type * as StorageLib from '@chatic/storage';
import type * as TransportLib from '@chatic/transport';
import type * as TransportTesting from '@chatic/transport/testing/platform';
import type * as AuthTesting from '@chatic/auth/testing/platform';
import type { RuntimePorts } from '../engine';
import type * as Declare from '../declare';
import type * as Engine from '../engine';
import type { PortDeclaration, PortName, RuntimeDeclaration } from '../declare';
import type { ModulesChecked, RuntimeGroups, RuntimeModuleError, RuntimeOf } from '../declare/types';

import { defineAdapter, defineRuntime } from '../declare';
import { allModules, headlessModules, minimalModules, sessionModule, syncModule } from '.';
import type { RuntimeModules, socketsModule } from '.';

jest.mock('@chatic/logger', () => ({
    logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const memoryStorage = () => {
    const { MemoryStore } = jest.requireActual<typeof StorageLib>('@chatic/storage');
    return { secret: new MemoryStore(), plain: new MemoryStore(), device: new MemoryStore() };
};

const cachePorts = () =>
    ({
        route: () => 'web',
        storage: () => {
            throw new Error('[test] boot built a cache storage');
        },
        routed: () => undefined,
        globalSearch: () => ({}),
        metrics: () => ({}),
    }) as unknown as RuntimePorts['db'];

const portMakers: { [P in PortName]: () => RuntimePorts[P] } = {
    storage: () => memoryStorage() as unknown as RuntimePorts['storage'],
    auth: () =>
        jest
            .requireActual<typeof AuthTesting>('@chatic/auth/testing/platform')
            .fakeAuthPorts({ currentSearch: () => '' }),
    transport: () =>
        jest.requireActual<typeof TransportTesting>('@chatic/transport/testing/platform').fakeTransportPorts({
            online: { read: () => true, subscribe: () => () => undefined },
            device: () => ({ userAgent: 'node' }),
        }),
    db: cachePorts,
    foreground: () => ({ read: () => true, subscribe: () => () => undefined }),
};

const portsFor = (names: readonly PortName[]) =>
    Object.fromEntries(
        names.map(port => [
            port,
            { default: defineAdapter({ id: `${port}.node-test`, port, create: () => portMakers[port]() as never }) },
        ])
    ) as { [P in PortName]?: PortDeclaration<P, unknown> };

const config = { init: jest.fn(), isInitialized: () => true, snapshot: () => undefined } as never;

interface Loaded {
    readonly declare: typeof Declare;
    readonly engine: typeof Engine;
    readonly transport: typeof TransportLib;
}

const fresh = (): Loaded => {
    let loaded: Loaded | undefined;
    jest.isolateModules(() => {
        loaded = {
            declare: jest.requireActual<typeof Declare>('../declare'),
            engine: jest.requireActual<typeof Engine>('../engine'),
            transport: jest.requireActual<typeof TransportLib>('@chatic/transport'),
        };
    });
    return loaded as Loaded;
};

const boot = async (modules: RuntimeModules | undefined, ports: readonly PortName[]) => {
    const loaded = fresh();
    const declaration = {
        name: 'node-preset',
        facts: () => ({}),
        ...(modules ? { modules } : {}),
        ports: portsFor(ports),
    } as unknown as RuntimeDeclaration<unknown>;
    const lines: string[] = [];
    const started = await loaded.declare.startRuntime(declaration, {
        config,
        read: () => undefined,
        log: line => lines.push(line),
    });
    return { ...loaded, started, lines };
};

const ALL_PORTS: readonly PortName[] = ['storage', 'transport', 'auth', 'db', 'foreground'];

describe('module presets boot in Node', () => {
    it('all modules — the wiring every app has today', async () => {
        const { started, lines } = await boot(allModules(), ALL_PORTS);

        expect(started.modules).toEqual(['session', 'http', 'sockets', 'sync', 'cache', 'push']);
        expect(Object.keys(started.runtime).sort()).toEqual(
            ['connection', 'data', 'push', 'report', 'session', 'settings', 'sync'].sort()
        );
        expect(lines.map(line => line.split(' → ')[0])).toEqual([...ALL_PORTS, 'engine']);
        expect(started.engine?.session.snapshot()).toBeDefined();
        expect(typeof started.engine?.connection.snapshot).toBe('function');
    });

    it('a declaration with no modules boots all of them, as before', async () => {
        const { started } = await boot(undefined, ALL_PORTS);

        expect(started.modules).toEqual(['session', 'http', 'sockets', 'sync', 'cache', 'push']);
    });

    it('headless — session · http · sockets · sync, no push', async () => {
        const { started, lines } = await boot(headlessModules(), ['storage', 'transport', 'auth', 'db', 'foreground']);

        expect(started.modules).toEqual(['session', 'http', 'sockets', 'sync']);
        expect(Object.keys(started.runtime).sort()).toEqual(
            ['connection', 'data', 'report', 'session', 'settings', 'sync'].sort()
        );
        expect(lines.map(line => line.split(' → ')[0])).toEqual([...ALL_PORTS, 'engine']);
        expect(() => (started.runtime as unknown as { push: unknown }).push).toThrow(/runtime\.push .*'push' module/);
        expect(() => started.engine?.pushRegistration({} as never)).toThrow(/engine\.pushRegistration .*'push' module/);
        expect(typeof started.engine?.connection.snapshot).toBe('function');
    });

    it('minimal — session · http, with no transport, cache or foreground port', async () => {
        const { started, lines, transport } = await boot(minimalModules(), ['storage', 'auth']);

        expect(started.modules).toEqual(['session', 'http']);
        expect(Object.keys(started.runtime).sort()).toEqual(['session', 'settings']);
        expect(lines.map(line => line.split(' → ')[0])).toEqual(['storage', 'auth', 'engine']);

        expect(started.runtime.session.getGlobalSessionContext()).toBeDefined();
        expect(started.engine?.session.snapshot()).toBeDefined();

        for (const group of ['connection', 'data', 'sync', 'push', 'report']) {
            expect(() => (started.runtime as unknown as Record<string, unknown>)[group]).toThrow(
                new RegExp(`runtime\\.${group} is not in this runtime`)
            );
        }
        expect(() => started.engine?.connection.snapshot()).toThrow(/engine\.connection .*'sockets' module/);
        expect(() => started.engine?.data.repositories()).toThrow(/engine\.data .*repository graph/);
        expect(() => transport.transportPlatform.ports().device()).toThrow(/'transport' port is not wired/);
    });

    it('a declaration that leaves out a module another one needs fails at start, naming it', async () => {
        const loaded = fresh();
        const declaration = {
            name: 'broken',
            facts: () => ({}),
            modules: [sessionModule(), syncModule()],
            ports: portsFor(['storage', 'auth']),
        } as unknown as RuntimeDeclaration<unknown>;

        await expect(loaded.declare.startRuntime(declaration, { config, read: () => undefined })).rejects.toThrow(
            /broken: .*'sync' module needs the 'sockets' module.*'sync' module needs the 'db' port/
        );
    });

    it('a declaration with no session module fails at start', async () => {
        const loaded = fresh();
        const declaration = {
            name: 'sessionless',
            facts: () => ({}),
            modules: [],
            ports: portsFor(ALL_PORTS),
        } as unknown as RuntimeDeclaration<unknown>;

        await expect(loaded.declare.startRuntime(declaration, { config, read: () => undefined })).rejects.toThrow(
            /every runtime needs the 'session' module/
        );
    });
});

type Assert<T extends true> = T;
type Session = ReturnType<typeof sessionModule>;
type Sockets = ReturnType<typeof socketsModule>;
type Sync = ReturnType<typeof syncModule>;
type Minimal = ReturnType<typeof minimalModules>;
type Headless = ReturnType<typeof headlessModules>;
type All = ReturnType<typeof allModules>;
type DeclarationOf<M extends RuntimeModules> = RuntimeDeclaration<unknown, never, M>;
type Ports<M extends RuntimeModules> = DeclarationOf<M>['ports'];
type Required<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type CompilerChecks = [
    Assert<Same<Required<Ports<Minimal>>, 'storage' | 'auth'>>,
    Assert<Same<Required<Ports<readonly [Session, Sockets]>>, 'storage' | 'auth' | 'transport' | 'foreground'>>,
    Assert<Same<Required<Ports<Headless>>, PortName>>,
    Assert<Same<Required<Ports<All>>, PortName>>,
    Assert<Same<Required<Ports<RuntimeModules>>, PortName>>,
    Assert<
        Same<
            ModulesChecked<readonly [Session, Sync]>,
            RuntimeModuleError<"a module needs 'sockets', which is not in `modules`">
        >
    >,
    Assert<
        Same<
            ModulesChecked<readonly [Sockets]>,
            RuntimeModuleError<"a module needs 'session', which is not in `modules`">
        >
    >,
    Assert<Same<ModulesChecked<Headless>, Headless>>,
    Assert<Same<keyof RuntimeOf<Minimal>, 'session' | 'settings'>>,
    Assert<Same<keyof RuntimeOf<Headless>, 'session' | 'connection' | 'data' | 'sync' | 'report' | 'settings'>>,
    Assert<Same<keyof RuntimeOf<All>, keyof RuntimeGroups>>,
    Assert<Same<keyof RuntimeOf, keyof RuntimeGroups>>,
];

describe('module presets — the compiler checks', () => {
    it('holds the port, dependency and group rules as types', () => {
        const checks: CompilerChecks = [true, true, true, true, true, true, true, true, true, true, true, true];
        expect(checks.every(Boolean)).toBe(true);
    });

    it('a declaration names only the ports its modules need', () => {
        const storage = { default: defineAdapter({ id: 'storage.x', port: 'storage', create: () => ({}) as never }) };
        const auth = { default: defineAdapter({ id: 'auth.x', port: 'auth', create: () => ({}) as never }) };
        const minimal = defineRuntime({
            name: 'minimal',
            facts: () => ({}),
            modules: minimalModules(),
            ports: { storage, auth },
        });
        expect(minimal.modules?.map(module => module.name)).toEqual(['session', 'http']);
    });
});
