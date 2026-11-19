import type { RuntimePorts } from '@chatic/runtime-core';

import type { MediaPort } from '../host/media';

import { conflicts, defineAdapter, defineEngineAdapter, defineHostAdapter, defineRuntime, requires } from './define';
import { engineCore } from './engine';
import { RuntimeDeclarationError, resolveEngine, resolveHostPorts, resolvePorts } from './resolvePorts';
import type { PortChoiceReader, PortChoiceKey, PortName } from './types';

interface Facts {
    shell: boolean;
}

const port = <P extends PortName>(p: P, name: string, supports?: (facts: Facts) => boolean) =>
    defineAdapter<P, Facts>({
        id: `${p}.${name}`,
        port: p,
        ...(supports ? { supports } : {}),
        create: () => ({}) as RuntimePorts[P],
    });

const tab = port('storage', 'tab');
const vault = port('storage', 'vault', facts => facts.shell);
const browser = port('transport', 'browser');
const location = port('auth', 'location');
const indexedDb = port('cache', 'indexeddb');
const webStorage = port('cache', 'web-storage');
const shellSqlite = port('cache', 'shell-sqlite', facts => facts.shell);
const visibility = port('foreground', 'visibility');

const declare = (overrides: Partial<Parameters<typeof defineRuntime<Facts>>[0]> = {}) =>
    defineRuntime<Facts>({
        name: 'test',
        facts: () => ({ shell: false }),
        ports: {
            storage: { default: tab, alternatives: [vault] },
            transport: { default: browser },
            auth: { default: location },
            cache: { default: indexedDb, alternatives: [webStorage, shellSqlite] },
            foreground: { default: visibility },
        },
        ...overrides,
    });

/** A reader over fixed toggles: `{ 'port.cache': ['cache.web-storage', 'local'] }`. */
const toggles =
    (values: Partial<Record<PortChoiceKey, [string, string]>>): PortChoiceReader =>
    key => {
        const entry = values[key];
        return { value: entry?.[0] ?? '', origin: (entry?.[1] ?? 'default') as never };
    };

const browserTab: Facts = { shell: false };
const shell: Facts = { shell: true };

describe('resolvePorts', () => {
    it('takes every default when no toggle is set', () => {
        const choices = resolvePorts(declare(), browserTab, toggles({}));
        expect(choices.cache).toMatchObject({ id: 'cache.indexeddb', origin: 'default' });
        expect(choices.cache.adapter).toBe(indexedDb);
        expect(choices.cache.fellBack).toBeUndefined();
        expect(choices.storage).toMatchObject({ id: 'storage.tab', origin: 'default' });
    });

    it('takes the default when config is not wired and reads nothing', () => {
        const choices = resolvePorts(declare(), browserTab, () => undefined);
        expect(choices.cache).toMatchObject({ id: 'cache.indexeddb', origin: 'default' });
    });

    it('takes an alternative a lane chose, reporting that lane', () => {
        const choices = resolvePorts(declare(), browserTab, toggles({ 'port.cache': ['cache.web-storage', 'local'] }));
        expect(choices.cache).toMatchObject({ id: 'cache.web-storage', origin: 'local' });
        expect(choices.cache.adapter).toBe(webStorage);
    });

    it('reports a non-empty value from the default row as the build', () => {
        const choices = resolvePorts(
            declare(),
            browserTab,
            toggles({ 'port.cache': ['cache.web-storage', 'default'] })
        );
        expect(choices.cache).toMatchObject({ id: 'cache.web-storage', origin: 'build' });
    });

    it('falls back to the default for an id outside the declared candidates', () => {
        const choices = resolvePorts(declare(), browserTab, toggles({ 'port.cache': ['cache.memory', 'shell'] }));
        expect(choices.cache).toMatchObject({ id: 'cache.indexeddb', origin: 'default' });
        expect(choices.cache.fellBack).toEqual({
            requested: 'cache.memory',
            from: 'shell',
            because: expect.stringContaining('cache.indexeddb, cache.web-storage, cache.shell-sqlite'),
        });
    });

    it('falls back when the row is not one the port lets override it', () => {
        const declaration = declare({
            ports: {
                ...declare().ports,
                cache: { default: indexedDb, alternatives: [webStorage], override: ['shell'] },
            },
        });
        const fromLocal = resolvePorts(
            declaration,
            browserTab,
            toggles({ 'port.cache': ['cache.web-storage', 'local'] })
        );
        expect(fromLocal.cache).toMatchObject({ id: 'cache.indexeddb', origin: 'default' });
        expect(fromLocal.cache.fellBack?.because).toBe('the local row may not change this port');

        const fromShell = resolvePorts(
            declaration,
            browserTab,
            toggles({ 'port.cache': ['cache.web-storage', 'shell'] })
        );
        expect(fromShell.cache).toMatchObject({ id: 'cache.web-storage', origin: 'shell' });
    });

    it('fixes a port to its default when override is empty', () => {
        const declaration = declare({
            ports: { ...declare().ports, cache: { default: indexedDb, alternatives: [webStorage], override: [] } },
        });
        const choices = resolvePorts(
            declaration,
            browserTab,
            toggles({ 'port.cache': ['cache.web-storage', 'serverEnforced'] })
        );
        expect(choices.cache.id).toBe('cache.indexeddb');
    });

    it('falls back when the chosen adapter does not support the host', () => {
        const inTab = resolvePorts(declare(), browserTab, toggles({ 'port.cache': ['cache.shell-sqlite', 'local'] }));
        expect(inTab.cache).toMatchObject({ id: 'cache.indexeddb', origin: 'default' });
        expect(inTab.cache.fellBack?.because).toBe('not supported on this host');

        const inShell = resolvePorts(declare(), shell, toggles({ 'port.cache': ['cache.shell-sqlite', 'local'] }));
        expect(inShell.cache).toMatchObject({ id: 'cache.shell-sqlite', origin: 'local' });
    });

    it('throws when the default does not support the host', () => {
        const declaration = declare({
            ports: { ...declare().ports, storage: { default: vault } },
        });
        expect(() => resolvePorts(declaration, browserTab, toggles({}))).toThrow(RuntimeDeclarationError);
        expect(() => resolvePorts(declaration, browserTab, toggles({}))).toThrow(
            "the default storage adapter 'storage.vault' does not support this host"
        );
    });

    it('falls back the dependent side of a broken requires', () => {
        const declaration = declare({ constraints: [requires(shellSqlite, vault)] });
        const choices = resolvePorts(declaration, shell, toggles({ 'port.cache': ['cache.shell-sqlite', 'local'] }));
        expect(choices.cache).toMatchObject({ id: 'cache.indexeddb', origin: 'default' });
        expect(choices.cache.fellBack).toEqual({
            requested: 'cache.shell-sqlite',
            from: 'local',
            because: "'cache.shell-sqlite' requires 'storage.vault'",
        });
    });

    it('reports a build value a constraint undid as coming from the build', () => {
        const declaration = declare({ constraints: [requires(shellSqlite, vault)] });
        const choices = resolvePorts(declaration, shell, toggles({ 'port.cache': ['cache.shell-sqlite', 'default'] }));
        expect(choices.cache.fellBack).toMatchObject({ requested: 'cache.shell-sqlite', from: 'build' });
    });

    it('keeps both sides of a requires that holds', () => {
        const declaration = declare({ constraints: [requires(shellSqlite, vault)] });
        const choices = resolvePorts(
            declaration,
            shell,
            toggles({ 'port.cache': ['cache.shell-sqlite', 'local'], 'port.storage': ['storage.vault', 'local'] })
        );
        expect(choices.cache.id).toBe('cache.shell-sqlite');
        expect(choices.storage.id).toBe('storage.vault');
    });

    it('falls back the toggled side of a conflict, leaving the default alone', () => {
        const declaration = declare({ constraints: [conflicts(tab, shellSqlite)] });
        const choices = resolvePorts(declaration, shell, toggles({ 'port.cache': ['cache.shell-sqlite', 'local'] }));
        expect(choices.storage.id).toBe('storage.tab');
        expect(choices.cache).toMatchObject({ id: 'cache.indexeddb', origin: 'default' });
        expect(choices.cache.fellBack?.because).toBe("'storage.tab' conflicts with 'cache.shell-sqlite'");
    });

    it('throws when the defaults alone break a constraint', () => {
        const declaration = declare({ constraints: [requires(indexedDb, vault)] });
        expect(() => resolvePorts(declaration, shell, toggles({}))).toThrow(
            "the default adapters break a constraint — 'cache.indexeddb' requires 'storage.vault'"
        );
    });
});

describe('resolveHostPorts', () => {
    // These ports are told apart by their choice alone; their members do not matter here.
    const mediaHost = defineHostAdapter<'media', Facts>({
        id: 'media.host',
        port: 'media',
        create: ({ facts }) => ({ kind: facts.shell ? 'shell' : 'browser' }) as MediaPort,
    });
    const mediaShell = defineHostAdapter<'media', Facts>({
        id: 'media.shell',
        port: 'media',
        supports: facts => facts.shell,
        create: () => ({ kind: 'shell' }) as MediaPort,
    });
    const mediaBrowser = defineHostAdapter<'media', Facts>({
        id: 'media.browser',
        port: 'media',
        create: () => ({ kind: 'browser' }) as MediaPort,
    });
    const fixed = <P extends 'checkout' | 'files' | 'links' | 'appShell' | 'signIn' | 'diagnostics' | 'push'>(
        port: P
    ) => ({ default: defineHostAdapter<P, Facts>({ id: `${port}.none`, port, create: () => ({}) as never }) });
    const withHost = () =>
        declare({
            host: {
                checkout: fixed('checkout'),
                media: { default: mediaHost, alternatives: [mediaShell, mediaBrowser] },
                files: fixed('files'),
                links: fixed('links'),
                appShell: fixed('appShell'),
                signIn: fixed('signIn'),
                diagnostics: fixed('diagnostics'),
                push: fixed('push'),
            },
        });

    it('answers nothing for a declaration that names no host port', () => {
        expect(resolveHostPorts(declare(), browserTab, toggles({}))).toBeUndefined();
    });

    it('follows the host default when no toggle is set', () => {
        const choices = resolveHostPorts(withHost(), shell, toggles({}));
        expect(choices?.media).toMatchObject({ id: 'media.host', origin: 'default' });
        expect(choices?.media.adapter).toBe(mediaHost);
        expect(choices?.push.id).toBe('push.none');
    });

    it('takes the browser method a toggle forces, even where the host declared the shell', () => {
        const choices = resolveHostPorts(withHost(), shell, toggles({ 'port.media': ['media.browser', 'shell'] }));
        expect(choices?.media).toMatchObject({ id: 'media.browser', origin: 'shell' });
    });

    it('falls back to the host default when a toggle forces a method the host lacks', () => {
        const choices = resolveHostPorts(withHost(), browserTab, toggles({ 'port.media': ['media.shell', 'local'] }));
        expect(choices?.media).toMatchObject({
            id: 'media.host',
            fellBack: { requested: 'media.shell', from: 'local', because: 'not supported on this host' },
        });
    });
});

describe('resolveEngine', () => {
    const mirror = defineEngineAdapter<Facts, string>({
        id: 'engine.mirror',
        port: 'engine',
        supports: facts => facts.shell,
        create: () => ({ engine: null }),
    });

    it('takes engine.core when the declaration names no engine', () => {
        const choice = resolveEngine(declare(), browserTab, toggles({}));
        expect(choice).toMatchObject({ id: 'engine.core', origin: 'default' });
        expect(choice.adapter).toBe(engineCore);
    });

    it('takes the declared engine, and an alternative a toggle chose', () => {
        const declared = defineRuntime<Facts, string>({
            ...declare(),
            engine: { default: engineCore, alternatives: [mirror] },
        });
        expect(resolveEngine(declared, shell, toggles({}))).toMatchObject({ id: 'engine.core' });
        expect(resolveEngine(declared, shell, toggles({ 'port.engine': ['engine.mirror', 'local'] }))).toMatchObject({
            id: 'engine.mirror',
            origin: 'local',
        });
        expect(
            resolveEngine(declared, browserTab, toggles({ 'port.engine': ['engine.mirror', 'local'] }))
        ).toMatchObject({ id: 'engine.core', fellBack: { because: 'not supported on this host' } });
    });
});
