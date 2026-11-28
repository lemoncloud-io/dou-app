import type { RuntimePorts } from '../engine';

import type { MediaPort } from '../api/host/media';

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
const indexedDb = port('db', 'indexeddb');
const webStorage = port('db', 'web-storage');
const shellSqlite = port('db', 'shell-sqlite', facts => facts.shell);
const visibility = port('foreground', 'visibility');

const declare = (overrides: Partial<Parameters<typeof defineRuntime<Facts>>[0]> = {}) =>
    defineRuntime<Facts>({
        name: 'test',
        facts: () => ({ shell: false }),
        ports: {
            storage: { default: tab, alternatives: [vault] },
            transport: { default: browser },
            auth: { default: location },
            db: { default: indexedDb, alternatives: [webStorage, shellSqlite] },
            foreground: { default: visibility },
        },
        ...overrides,
    });

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
        expect(choices.db).toMatchObject({ id: 'db.indexeddb', origin: 'default' });
        expect(choices.db.adapter).toBe(indexedDb);
        expect(choices.db.fellBack).toBeUndefined();
        expect(choices.storage).toMatchObject({ id: 'storage.tab', origin: 'default' });
    });

    it('takes the default when config is not wired and reads nothing', () => {
        const choices = resolvePorts(declare(), browserTab, () => undefined);
        expect(choices.db).toMatchObject({ id: 'db.indexeddb', origin: 'default' });
    });

    it('takes an alternative a lane chose, reporting that lane', () => {
        const choices = resolvePorts(declare(), browserTab, toggles({ 'port.db': ['db.web-storage', 'local'] }));
        expect(choices.db).toMatchObject({ id: 'db.web-storage', origin: 'local' });
        expect(choices.db.adapter).toBe(webStorage);
    });

    it('reports a non-empty value from the default row as the build', () => {
        const choices = resolvePorts(declare(), browserTab, toggles({ 'port.db': ['db.web-storage', 'default'] }));
        expect(choices.db).toMatchObject({ id: 'db.web-storage', origin: 'build' });
    });

    it('falls back to the default for an id outside the declared candidates', () => {
        const choices = resolvePorts(declare(), browserTab, toggles({ 'port.db': ['db.memory', 'shell'] }));
        expect(choices.db).toMatchObject({ id: 'db.indexeddb', origin: 'default' });
        expect(choices.db.fellBack).toEqual({
            requested: 'db.memory',
            from: 'shell',
            because: expect.stringContaining('db.indexeddb, db.web-storage, db.shell-sqlite'),
        });
    });

    it('falls back when the row is not one the port lets override it', () => {
        const declaration = declare({
            ports: {
                ...declare().ports,
                db: { default: indexedDb, alternatives: [webStorage], override: ['shell'] },
            },
        });
        const fromLocal = resolvePorts(declaration, browserTab, toggles({ 'port.db': ['db.web-storage', 'local'] }));
        expect(fromLocal.db).toMatchObject({ id: 'db.indexeddb', origin: 'default' });
        expect(fromLocal.db.fellBack?.because).toBe('the local row may not change this port');

        const fromShell = resolvePorts(declaration, browserTab, toggles({ 'port.db': ['db.web-storage', 'shell'] }));
        expect(fromShell.db).toMatchObject({ id: 'db.web-storage', origin: 'shell' });
    });

    it('fixes a port to its default when override is empty', () => {
        const declaration = declare({
            ports: { ...declare().ports, db: { default: indexedDb, alternatives: [webStorage], override: [] } },
        });
        const choices = resolvePorts(
            declaration,
            browserTab,
            toggles({ 'port.db': ['db.web-storage', 'serverEnforced'] })
        );
        expect(choices.db.id).toBe('db.indexeddb');
    });

    it('falls back when the chosen adapter does not support the host', () => {
        const inTab = resolvePorts(declare(), browserTab, toggles({ 'port.db': ['db.shell-sqlite', 'local'] }));
        expect(inTab.db).toMatchObject({ id: 'db.indexeddb', origin: 'default' });
        expect(inTab.db.fellBack?.because).toBe('not supported on this host');

        const inShell = resolvePorts(declare(), shell, toggles({ 'port.db': ['db.shell-sqlite', 'local'] }));
        expect(inShell.db).toMatchObject({ id: 'db.shell-sqlite', origin: 'local' });
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
        const choices = resolvePorts(declaration, shell, toggles({ 'port.db': ['db.shell-sqlite', 'local'] }));
        expect(choices.db).toMatchObject({ id: 'db.indexeddb', origin: 'default' });
        expect(choices.db.fellBack).toEqual({
            requested: 'db.shell-sqlite',
            from: 'local',
            because: "'db.shell-sqlite' requires 'storage.vault'",
        });
    });

    it('reports a build value a constraint undid as coming from the build', () => {
        const declaration = declare({ constraints: [requires(shellSqlite, vault)] });
        const choices = resolvePorts(declaration, shell, toggles({ 'port.db': ['db.shell-sqlite', 'default'] }));
        expect(choices.db.fellBack).toMatchObject({ requested: 'db.shell-sqlite', from: 'build' });
    });

    it('keeps both sides of a requires that holds', () => {
        const declaration = declare({ constraints: [requires(shellSqlite, vault)] });
        const choices = resolvePorts(
            declaration,
            shell,
            toggles({ 'port.db': ['db.shell-sqlite', 'local'], 'port.storage': ['storage.vault', 'local'] })
        );
        expect(choices.db.id).toBe('db.shell-sqlite');
        expect(choices.storage.id).toBe('storage.vault');
    });

    it('falls back the toggled side of a conflict, leaving the default alone', () => {
        const declaration = declare({ constraints: [conflicts(tab, shellSqlite)] });
        const choices = resolvePorts(declaration, shell, toggles({ 'port.db': ['db.shell-sqlite', 'local'] }));
        expect(choices.storage.id).toBe('storage.tab');
        expect(choices.db).toMatchObject({ id: 'db.indexeddb', origin: 'default' });
        expect(choices.db.fellBack?.because).toBe("'storage.tab' conflicts with 'db.shell-sqlite'");
    });

    it('throws when the defaults alone break a constraint', () => {
        const declaration = declare({ constraints: [requires(indexedDb, vault)] });
        expect(() => resolvePorts(declaration, shell, toggles({}))).toThrow(
            "the default adapters break a constraint — 'db.indexeddb' requires 'storage.vault'"
        );
    });
});

describe('resolveHostPorts', () => {
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
