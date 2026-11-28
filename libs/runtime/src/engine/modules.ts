import type { RuntimePorts } from './ports';

export type ModuleName = 'session' | 'http' | 'sockets' | 'sync' | 'cache' | 'push';

export type RuntimePortName = keyof RuntimePorts;

export interface RuntimeModule<
    N extends ModuleName = ModuleName,
    R extends RuntimePortName = RuntimePortName,
    D extends ModuleName = ModuleName,
> {
    readonly name: N;
    readonly requires: readonly R[];
    readonly dependsOn: readonly D[];
}

export type AnyRuntimeModule = RuntimeModule<ModuleName, RuntimePortName, ModuleName>;

export type RuntimeModules = readonly AnyRuntimeModule[];

const moduleOf = <N extends ModuleName, R extends RuntimePortName = never, D extends ModuleName = never>(
    name: N,
    requires: readonly R[],
    dependsOn: readonly D[]
): RuntimeModule<N, R, D> => ({ name, requires, dependsOn });

export const sessionModule = (): RuntimeModule<'session', 'storage' | 'auth', never> =>
    moduleOf('session', ['storage', 'auth'], []);

export const httpModule = (): RuntimeModule<'http', never, 'session'> => moduleOf('http', [], ['session']);

export const socketsModule = (): RuntimeModule<'sockets', 'transport' | 'foreground', 'session'> =>
    moduleOf('sockets', ['transport', 'foreground'], ['session']);

export const syncModule = (): RuntimeModule<'sync', 'db', 'sockets'> => moduleOf('sync', ['db'], ['sockets']);

export const cacheModule = (): RuntimeModule<'cache', 'db', 'session'> => moduleOf('cache', ['db'], ['session']);

export const pushModule = (): RuntimeModule<'push', 'foreground', 'session'> =>
    moduleOf('push', ['foreground'], ['session']);

export const allModules = () =>
    [sessionModule(), httpModule(), socketsModule(), syncModule(), cacheModule(), pushModule()] as const;

export const headlessModules = () => [sessionModule(), httpModule(), socketsModule(), syncModule()] as const;

export const minimalModules = () => [sessionModule(), httpModule()] as const;

export type ModuleNames<M extends RuntimeModules> = M[number]['name'];

export type RequiredPorts<M extends RuntimeModules> = M[number]['requires'][number];

export type MissingModules<M extends RuntimeModules> = Exclude<M[number]['dependsOn'][number], ModuleNames<M>>;

export type DataGraphModules = 'sockets' | 'http';

export type HasDataGraph<M extends RuntimeModules> = [DataGraphModules] extends [ModuleNames<M>]
    ? 'db' extends RequiredPorts<M>
        ? true
        : false
    : false;

export interface ModuleSet {
    readonly names: ReadonlySet<ModuleName>;
    readonly ports: ReadonlySet<RuntimePortName>;
    has(name: ModuleName): boolean;
    readonly dataGraph: boolean;
}

export const moduleSetOf = (modules: RuntimeModules): ModuleSet => {
    const names = new Set<ModuleName>(modules.map(module => module.name));
    const ports = new Set<RuntimePortName>(modules.flatMap(module => module.requires));
    return {
        names,
        ports,
        has: name => names.has(name),
        dataGraph: names.has('sockets') && names.has('http') && ports.has('db'),
    };
};

export interface ModuleGap {
    readonly module: ModuleName;
    readonly needs: ModuleName | RuntimePortName;
    readonly kind: 'module' | 'port';
}

export const moduleGaps = (modules: RuntimeModules, givenPorts: Iterable<RuntimePortName>): ModuleGap[] => {
    const set = moduleSetOf(modules);
    const given = new Set(givenPorts);
    const gaps: ModuleGap[] = [];
    if (!set.has('session')) gaps.push({ module: 'session', needs: 'session', kind: 'module' });
    for (const module of modules) {
        for (const dependency of module.dependsOn) {
            if (!set.has(dependency)) gaps.push({ module: module.name, needs: dependency, kind: 'module' });
        }
        for (const port of module.requires) {
            if (!given.has(port)) gaps.push({ module: module.name, needs: port, kind: 'port' });
        }
    }
    return gaps;
};

export const describeModuleGap = (gap: ModuleGap): string => {
    if (gap.kind === 'module' && gap.module === gap.needs) {
        return `every runtime needs the '${gap.module}' module, and it is not in \`modules\``;
    }
    return gap.kind === 'module'
        ? `the '${gap.module}' module needs the '${gap.needs}' module, which is not in \`modules\``
        : `the '${gap.module}' module needs the '${gap.needs}' port, which was not given`;
};
