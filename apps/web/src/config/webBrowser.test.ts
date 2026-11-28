import { pageStorageAreas, startRuntime, tabStorageStores, webLocalCachePorts } from '@chatic/runtime-hybrid-web';
import type { HostPorts, StartRuntimeOptions } from '@chatic/runtime-hybrid-web';

import { webBrowser } from './webBrowser';

jest.mock('./viteEnv', () => ({ readBuildValue: () => undefined, sessionMirrorDisabled: () => false }));
jest.mock('@chatic/runtime-hybrid-web', () => {
    const actual = jest.requireActual('@chatic/runtime-hybrid-web');
    return { ...actual, webLocalCachePorts: jest.fn(actual.webLocalCachePorts) };
});

const EXPECTED_PORTS = {
    storage: 'storage.resolved',
    transport: 'transport.browser',
    auth: 'auth.location',
    db: 'db.web-local',
    foreground: 'foreground.visibility',
} as const;

const EXPECTED_HOST = {
    checkout: 'checkout.host',
    media: 'media.host',
    files: 'files.host',
    links: 'links.host',
    appShell: 'appShell.host',
    signIn: 'signIn.host',
    diagnostics: 'diagnostics.host',
    push: 'push.host',
} as const;

type Read = NonNullable<StartRuntimeOptions['read']>;

const idsOf = (slots: Record<string, { default: { id: string } }>) =>
    Object.fromEntries(Object.entries(slots).map(([slot, declared]) => [slot, declared.default.id]));

const start = async (read: Read = () => undefined) => {
    const stores = tabStorageStores(pageStorageAreas());
    const declaration = webBrowser(stores);
    const config = { init: jest.fn(), isInitialized: jest.fn(() => false), snapshot: jest.fn(() => undefined) };
    const createRuntime = jest.fn((_ports: unknown) => ({}) as never);
    const initEngine = jest.fn();
    const publishHost = jest.fn((_ports: HostPorts) => undefined);
    const log = jest.fn();
    const started = await startRuntime(declaration, { config, read, createRuntime, initEngine, publishHost, log });
    return { stores, declaration, started, config, createRuntime, initEngine, publishHost, log };
};

beforeEach(() => jest.clearAllMocks());

describe('web-browser declaration', () => {
    it('declares one fixed adapter per runtime port, and the core engine', () => {
        const declaration = webBrowser(tabStorageStores(pageStorageAreas()));

        expect(declaration.name).toBe('web-browser');
        expect(idsOf(declaration.ports)).toEqual(EXPECTED_PORTS);
        for (const declared of Object.values(declaration.ports)) expect(declared.alternatives ?? []).toEqual([]);
        expect(declaration.engine?.default.id).toBe('engine.core');
        expect(declaration.engine?.alternatives ?? []).toEqual([]);
    });

    it('declares every host port as the host declared it, with nothing to switch to in a tab', () => {
        const declaration = webBrowser(tabStorageStores(pageStorageAreas()));

        expect(idsOf(declaration.host ?? {})).toEqual(EXPECTED_HOST);
        for (const declared of Object.values(declaration.host ?? {})) expect(declared.alternatives ?? []).toEqual([]);
    });

    it('resolves every slot to its default when config names none', async () => {
        const { started, log } = await start();

        const chosen = (choices: Record<string, { id: string; origin: string }>) =>
            Object.fromEntries(Object.entries(choices).map(([slot, choice]) => [slot, choice.id]));
        expect(chosen(started.choices)).toEqual(EXPECTED_PORTS);
        expect(chosen(started.hostChoices ?? {})).toEqual(EXPECTED_HOST);
        expect(started.engineChoice.id).toBe('engine.core');
        expect(Object.values(started.choices).every(choice => choice.origin === 'default')).toBe(true);
        expect(log.mock.calls.map(([line]) => line)).toContain('storage → storage.resolved (default)');
    });

    it('keeps a port on its default when a config row asks for another adapter', async () => {
        const { started } = await start(key =>
            key === 'port.storage' ? { value: 'storage.local', origin: 'local' } : undefined
        );

        expect(started.choices.storage.id).toBe('storage.resolved');
        expect(started.choices.storage.fellBack).toMatchObject({ requested: 'storage.local', from: 'local' });
    });

    it('initialises config with the declaration ports, on the entry stores and without a shell lane', async () => {
        const { declaration, config } = await start();

        expect(config.init).toHaveBeenCalledTimes(1);
        expect(config.init).toHaveBeenCalledWith(declaration.config);
        expect(declaration.config?.shell).toBeUndefined();
    });

    it('builds the session and the cache on the entry stores, not on copies of them', async () => {
        const { stores, createRuntime, initEngine, started } = await start();

        const [ports] = createRuntime.mock.calls[0] as [{ storage: Record<string, unknown> }];
        expect(ports.storage).toEqual({
            secret: stores.secret,
            plain: stores.plain,
            device: stores.device,
            tab: stores.webSession,
        });
        expect(ports.storage.secret).toBe(stores.webSession);
        expect(webLocalCachePorts).toHaveBeenCalledWith(stores.webSession);
        expect(initEngine).toHaveBeenCalledTimes(1);
        expect(started.owner).toBeUndefined();
    });

    it('hands the runtime the app policies', async () => {
        const { createRuntime } = await start();

        const [config] = createRuntime.mock.calls[0] as [
            {
                signedOutKeyPrefixes: readonly string[];
                data: { repositories: { user: { persistEmbeddedSite: (c: { cid?: string }) => boolean } } };
            },
        ];
        expect(config.signedOutKeyPrefixes.length).toBeGreaterThan(0);
        const { persistEmbeddedSite } = config.data.repositories.user;
        expect(persistEmbeddedSite({})).toBe(true);
        expect(persistEmbeddedSite({ cid: 'default' })).toBe(true);
        expect(persistEmbeddedSite({ cid: 'c1' })).toBe(false);
    });

    it("publishes a browser tab's host ports: the website sells, and the page does the rest", async () => {
        const { publishHost } = await start();

        const [ports] = publishHost.mock.calls[0];
        expect(ports.checkout.kind).toBe('web');
        expect(ports).toMatchObject({
            media: { kind: 'browser' },
            files: { kind: 'browser' },
            links: { kind: 'browser' },
            appShell: { kind: 'browser', os: null },
            signIn: { kind: 'browser', os: null },
            diagnostics: { kind: 'browser' },
            push: { kind: 'browser' },
        });
    });
});
