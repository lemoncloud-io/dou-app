/**
 * `web-hybrid` exists to boot the page inside a shell exactly as the entry booted it before declarations:
 * every runtime port fixed, the session and the cache's tab rows on the entry's own store objects, the
 * session's owner settled before any port is built, and the host ports the shell declared — the cases the
 * entry's own host-port chooser was tested for.
 */
import {
    pageStorageAreas,
    settleSessionOwner,
    startRuntime,
    tabStorageStores,
    vaultStorageStores,
    webLocalCachePorts,
} from '@chatic/runtime-web';
import type {
    HostPorts,
    SessionOwnerChoice,
    StartRuntimeOptions,
    StorageStores,
    WebHostFacts,
} from '@chatic/runtime-web';

import { setLaunchSessionOwner } from '../app/runtime/launchSessionOwner';
import { storeCheckout } from './adapters/checkout/storeCheckout';
import { sessionMirrorDisabled } from './viteEnv';
import { webHybrid } from './webHybrid';

jest.mock('./viteEnv', () => ({ readBuildValue: () => undefined, sessionMirrorDisabled: jest.fn(() => false) }));
jest.mock('../app/runtime/launchSessionOwner', () => ({ setLaunchSessionOwner: jest.fn() }));
jest.mock('./adapters/checkout/storeCheckout', () => ({
    storeCheckout: jest.fn((store: string) => ({ kind: 'store', store })),
}));
jest.mock('@chatic/runtime-web', () => {
    const actual = jest.requireActual('@chatic/runtime-web');
    return {
        ...actual,
        settleSessionOwner: jest.fn(async () => ({ sessionOwner: 'web' })),
        webLocalCachePorts: jest.fn(actual.webLocalCachePorts),
    };
});
// The mirror over the bridge is runtime-web's own; here it only has to be told apart from the core.
const mockMirrorEngine = { mirror: true };
jest.mock('../../../../libs/runtime-web/src/createBridgedRuntime', () => ({
    ...jest.requireActual('../../../../libs/runtime-web/src/createBridgedRuntime'),
    createBridgedRuntime: jest.fn(() => mockMirrorEngine),
}));
const mockPrepare = jest.fn(async () => 'vault');
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        boot: { prepareSecretStorage: (...args: unknown[]) => mockPrepare(...(args as [])) },
    })
);

const EXPECTED_PORTS = {
    storage: 'storage.resolved',
    transport: 'transport.browser',
    auth: 'auth.location',
    cache: 'cache.web-local',
    foreground: 'foreground.visibility',
} as const;

/** Each host port's default, then the adapters a toggle may move it to. */
const EXPECTED_HOST = {
    checkout: ['checkout.host', 'checkout.store', 'checkout.web', 'checkout.none'],
    media: ['media.host', 'media.shell', 'media.browser'],
    files: ['files.host', 'files.shell', 'files.browser'],
    links: ['links.host', 'links.shell', 'links.browser'],
    appShell: ['appShell.host', 'appShell.shell', 'appShell.browser'],
    signIn: ['signIn.host', 'signIn.shell', 'signIn.browser'],
    diagnostics: ['diagnostics.host', 'diagnostics.shell', 'diagnostics.browser'],
    push: ['push.host', 'push.shell', 'push.browser'],
} as const;

type Read = NonNullable<StartRuntimeOptions['read']>;

/** The phone app as the page sees it: its bridge, its platform, and a declaration of what it does. */
const phoneFacts = (values: Record<string, unknown> = {}, version = 4): WebHostFacts => ({
    bridge: 'react-native-webview',
    platform: 'ios',
    storageMedia: [],
    runtimeOffer: undefined,
    capabilities: { kind: 'declared', version, values },
});

/** Starts the declaration with every collaborator faked except the adapters themselves. */
const start = async ({
    read = () => undefined,
    facts,
    stores = tabStorageStores(pageStorageAreas()),
}: { read?: Read; facts?: WebHostFacts; stores?: StorageStores } = {}) => {
    const declared = webHybrid(stores);
    const declaration = facts ? { ...declared, facts: () => facts } : declared;
    const config = { init: jest.fn(), isInitialized: jest.fn(() => false), snapshot: jest.fn(() => undefined) };
    const createRuntime = jest.fn((_ports: unknown) => ({ core: true }) as never);
    const initEngine = jest.fn();
    const publishHost = jest.fn((_ports: HostPorts) => undefined);
    const log = jest.fn();
    const started = await startRuntime(declaration, { config, read, createRuntime, initEngine, publishHost, log });
    return { stores, declaration, started, config, createRuntime, initEngine, publishHost, log };
};

const settled = (choice: SessionOwnerChoice) => (settleSessionOwner as jest.Mock).mockResolvedValueOnce(choice);
const published = (publishHost: jest.Mock): HostPorts => publishHost.mock.calls[0][0];

beforeEach(() => jest.clearAllMocks());

describe('web-hybrid declaration', () => {
    it('declares one fixed adapter per runtime port, and the mirror engine', () => {
        const declaration = webHybrid(tabStorageStores(pageStorageAreas()));

        expect(declaration.name).toBe('web-hybrid');
        expect(
            Object.fromEntries(Object.entries(declaration.ports).map(([port, declared]) => [port, declared.default.id]))
        ).toEqual(EXPECTED_PORTS);
        for (const declared of Object.values(declaration.ports)) expect(declared.alternatives ?? []).toEqual([]);
        expect(declaration.engine?.default.id).toBe('engine.mirror');
    });

    it('declares every host port as the host declared it, with the shell and the page as alternatives', () => {
        const declaration = webHybrid(tabStorageStores(pageStorageAreas()));

        expect(
            Object.fromEntries(
                Object.entries(declaration.host ?? {}).map(([port, declared]) => [
                    port,
                    [declared.default.id, ...(declared.alternatives ?? []).map(alternative => alternative.id)],
                ])
            )
        ).toEqual(EXPECTED_HOST);
    });

    it('resolves every slot to its default when config names none', async () => {
        const { started, log } = await start({ facts: phoneFacts() });

        const chosen = (choices: Record<string, { id: string; origin: string }>) =>
            Object.fromEntries(Object.entries(choices).map(([slot, choice]) => [slot, choice.id]));
        expect(chosen(started.choices)).toEqual(EXPECTED_PORTS);
        expect(chosen(started.hostChoices ?? {})).toEqual(
            Object.fromEntries(Object.entries(EXPECTED_HOST).map(([port, [first]]) => [port, first]))
        );
        expect(started.engineChoice.id).toBe('engine.mirror');
        expect(Object.values(started.choices).every(choice => choice.origin === 'default')).toBe(true);
        expect(log.mock.calls.map(([line]) => line)).toContain('engine → engine.mirror (default)');
    });

    it("initialises config with the declaration ports, the shell's lane included", async () => {
        const { declaration, config } = await start();

        expect(config.init).toHaveBeenCalledWith(declaration.config);
        expect(declaration.config?.shell).toEqual(
            expect.objectContaining({ readBag: expect.any(Function), write: expect.any(Function) })
        );
    });
});

describe('web-hybrid — who holds the session', () => {
    it('asks with the offer in the facts, and stops asking when the build says so', async () => {
        (sessionMirrorDisabled as jest.Mock).mockReturnValueOnce(true);
        const offer = { contracts: [1] };

        await start({ facts: { ...phoneFacts(), runtimeOffer: offer } });

        expect(settleSessionOwner).toHaveBeenCalledWith({ disabled: true, offer });
    });

    it('runs the page’s own runtime on its stores, vault loaded, when the page holds the session', async () => {
        const stores = vaultStorageStores({ ...pageStorageAreas(), vault: { status: 'available' } as never });

        const { createRuntime, initEngine, started } = await start({ stores });

        expect(mockPrepare).toHaveBeenCalledWith(
            expect.objectContaining({ vault: stores.vault, tab: stores.webSession })
        );
        const [ports] = createRuntime.mock.calls[0] as [{ storage: Record<string, unknown> }];
        expect(ports.storage).toEqual({ secret: stores.vault, plain: stores.plain, device: stores.device });
        expect(webLocalCachePorts).toHaveBeenCalledWith(stores.webSession);
        expect(initEngine).toHaveBeenCalledWith({ core: true });
        expect(started.owner).toEqual({ sessionOwner: 'web' });
        expect(setLaunchSessionOwner).toHaveBeenCalledWith('web');
    });

    it('mirrors the shell and builds none of the page’s ports when the shell holds the session', async () => {
        settled({ sessionOwner: 'native', contract: 1, hello: { seq: 1, session: null as never }, port: {} as never });
        const stores = vaultStorageStores({ ...pageStorageAreas(), vault: { status: 'available' } as never });

        const { createRuntime, initEngine, started } = await start({ stores });

        expect(createRuntime).not.toHaveBeenCalled();
        expect(mockPrepare).not.toHaveBeenCalled();
        expect(initEngine).toHaveBeenCalledWith(mockMirrorEngine);
        expect(started.owner?.sessionOwner).toBe('native');
        expect(setLaunchSessionOwner).toHaveBeenCalledWith('native');
    });

    it('boots nothing when the owner could not be settled', async () => {
        settled({ sessionOwner: null, attempts: 3, lastFailure: 'timeout' });

        const { createRuntime, initEngine, started } = await start();

        expect(createRuntime).not.toHaveBeenCalled();
        expect(initEngine).not.toHaveBeenCalled();
        expect(started.engine).toBeNull();
        expect(started.owner).toEqual({ sessionOwner: null, attempts: 3, lastFailure: 'timeout' });
        expect(setLaunchSessionOwner).toHaveBeenCalledWith(undefined);
    });
});

describe('web-hybrid — checkout', () => {
    it.each(['apple', 'google'] as const)("sells through %s's store when the host says so", async store => {
        const { publishHost } = await start({ facts: phoneFacts({ checkout: [store] }) });

        expect(published(publishHost).checkout).toEqual({ kind: 'store', store });
        expect(storeCheckout).toHaveBeenCalledWith(store);
    });

    it('hands over to the website when the host sells there', async () => {
        const { publishHost } = await start({ facts: phoneFacts({ checkout: ['web'] }) });

        expect(published(publishHost).checkout.kind).toBe('web');
    });

    it('sells nothing when the host sells nothing', async () => {
        const { publishHost } = await start({ facts: phoneFacts({ checkout: [] }) });

        expect(published(publishHost).checkout).toEqual({ kind: 'none' });
    });

    it("answers a shell from before declarations by its platform's store", async () => {
        const { publishHost } = await start({ facts: { ...phoneFacts(), capabilities: { kind: 'absent' } } });

        expect(published(publishHost).checkout).toEqual({ kind: 'store', store: 'apple' });
    });

    it('moves to the website on a toggle where the host offers it', async () => {
        const { publishHost, started } = await start({
            facts: phoneFacts({ checkout: ['apple', 'web'] }),
            read: key => (key === 'port.checkout' ? { value: 'checkout.web', origin: 'local' } : undefined),
        });

        expect(started.hostChoices?.checkout.id).toBe('checkout.web');
        expect(published(publishHost).checkout.kind).toBe('web');
    });
});

describe('web-hybrid — the other host ports', () => {
    it.each(['shell', 'browser'] as const)('lets %s pick and move files when the host says so', async method => {
        const { publishHost } = await start({ facts: phoneFacts({ media: method, files: method }) });

        expect(published(publishHost).media).toEqual({ kind: method });
        expect(published(publishHost).files).toEqual({ kind: method });
    });

    it('publishes the shell domains the host declared, with the phone platform behind the shell', async () => {
        const shell = { links: 'shell', appShell: 'shell', signIn: 'shell', diagnostics: 'shell', push: 'shell' };

        const { publishHost } = await start({ facts: phoneFacts(shell) });

        expect(published(publishHost)).toMatchObject({
            links: { kind: 'shell' },
            appShell: { kind: 'shell', os: 'ios' },
            signIn: { kind: 'shell', os: 'ios' },
            diagnostics: { kind: 'shell' },
            push: { kind: 'shell' },
        });
    });

    it('moves one port to the page on a toggle while the rest stay on the shell', async () => {
        const { publishHost } = await start({
            facts: phoneFacts({ media: 'shell', files: 'shell' }),
            read: key => (key === 'port.media' ? { value: 'media.browser', origin: 'local' } : undefined),
        });

        expect(published(publishHost).media).toEqual({ kind: 'browser' });
        expect(published(publishHost).files).toEqual({ kind: 'shell' });
    });
});
