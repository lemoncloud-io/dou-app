import type { RuntimeEngine } from './engine';
import type { ModuleName, ModuleSet, RuntimePortName } from './modules';
import type { RuntimePorts } from './ports';

export type EngineMember = keyof RuntimeEngine;

export const ENGINE_MEMBER_MODULES: { readonly [K in EngineMember]: ModuleName | 'data-graph' } = {
    session: 'session',
    commands: 'session',
    connection: 'sockets',
    connectionController: 'sockets',
    sessionController: 'sockets',
    relayCredentialGuard: 'sockets',
    cloudCredentialGuard: 'sockets',
    sync: 'sync',
    data: 'data-graph',
    pushRegistration: 'push',
};

const PORT_MODULES: { readonly [P in RuntimePortName]: string } = {
    storage: "'session'",
    auth: "'session'",
    transport: "'sockets'",
    foreground: "'sockets' or 'push'",
    db: "'sync' or 'cache'",
};

const refuse = (message: string): never => {
    throw new Error(message);
};

const INSPECTED_KEYS = new Set<PropertyKey>(['then', 'toJSON', '$$typeof', 'asymmetricMatch']);

const throwingProxy = (message: string): object =>
    new Proxy(() => undefined, {
        get: (_target, key) => (typeof key === 'symbol' || INSPECTED_KEYS.has(key) ? undefined : refuse(message)),
        apply: () => refuse(message),
        set: () => refuse(message),
    });

export const absentPort = <P extends RuntimePortName>(port: P): RuntimePorts[P] =>
    throwingProxy(
        `[runtime] the '${port}' port is not wired — this runtime was started without the ${PORT_MODULES[port]} module`
    ) as RuntimePorts[P];

export const isOn = (modules: ModuleSet, owner: ModuleName | 'data-graph'): boolean =>
    owner === 'data-graph' ? modules.dataGraph : modules.has(owner);

export const describeOwner = (owner: ModuleName | 'data-graph'): string =>
    owner === 'data-graph'
        ? "the repository graph, which needs the 'sockets' and 'http' modules and the 'db' port"
        : `the '${owner}' module`;

export const offMembers = (modules: ModuleSet): EngineMember[] =>
    (Object.keys(ENGINE_MEMBER_MODULES) as EngineMember[]).filter(
        member => !isOn(modules, ENGINE_MEMBER_MODULES[member])
    );

export const engineFor = (engine: RuntimeEngine, modules: ModuleSet): RuntimeEngine => {
    const off = offMembers(modules);
    if (off.length === 0) return engine;
    const narrowed = { ...engine } as Record<EngineMember, unknown>;
    for (const member of off) {
        narrowed[member] = throwingProxy(
            `[runtime] engine.${member} is not wired — it belongs to ${describeOwner(ENGINE_MEMBER_MODULES[member])}, ` +
                'and this runtime was started without it'
        );
    }
    return narrowed as unknown as RuntimeEngine;
};
