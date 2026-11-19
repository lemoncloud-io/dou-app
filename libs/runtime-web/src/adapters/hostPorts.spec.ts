import { buildHostProfile, logger } from '@chatic/bridges';
import { HOST_PORT_NAMES, defineRuntime, startRuntime } from '@chatic/runtime-client';
import type { HostPorts, PortChoiceReader, RuntimeDeclaration, StoreCheckout } from '@chatic/runtime-client';
import type { RuntimeEngine, RuntimePorts } from '@chatic/runtime-core';

import { readWebHostFacts } from '../hostFacts';
import type { WebHostFacts } from '../hostFacts';
import {
    resolveAppShell,
    resolveCheckoutMethod,
    resolveDiagnosticsMethod,
    resolveFilesMethod,
    resolveLinksMethod,
    resolveMediaMethod,
    resolvePushMethod,
    resolveSignIn,
} from '../hostCapabilities';
import {
    appShellAdapters,
    checkoutFromHost,
    checkoutNone,
    checkoutStore,
    checkoutWeb,
    diagnosticsAdapters,
    filesAdapters,
    linksAdapters,
    mediaAdapters,
    pushAdapters,
    signInAdapters,
} from './hostPorts';
import type { ShellOrBrowserImplementations } from './hostPorts';

// The app's implementations, reduced to which one was built and from what, so a port's value shows it.
const builtFrom = <P extends Exclude<keyof HostPorts, 'checkout'>>() =>
    ({
        shell: jest.fn((base: object, facts: WebHostFacts) => ({ ...base, built: 'shell', bridge: facts.bridge })),
        browser: jest.fn((base: object, facts: WebHostFacts) => ({ ...base, built: 'browser', bridge: facts.bridge })),
    }) as unknown as ShellOrBrowserImplementations<P>;
const linksImplementations = builtFrom<'links'>();
const { host: linksHost } = linksAdapters(linksImplementations);
const {
    host: appShellHost,
    shell: appShellShell,
    browser: appShellBrowser,
} = appShellAdapters(builtFrom<'appShell'>());
const { host: diagnosticsHost } = diagnosticsAdapters(builtFrom<'diagnostics'>());
const { host: mediaHost, shell: mediaShell, browser: mediaBrowser } = mediaAdapters(builtFrom<'media'>());
const { host: filesHost, browser: filesBrowser } = filesAdapters(builtFrom<'files'>());
const { host: signInHost } = signInAdapters(builtFrom<'signIn'>());
const { host: pushHost } = pushAdapters(builtFrom<'push'>());

const post = { postMessage: jest.fn() };
type Globals = Record<string, unknown>;
const phone = (platform: string, extra: Globals = {}) =>
    buildHostProfile({ ReactNativeWebView: post, CHATIC_APP_PLATFORM: platform, ...extra });
const desktop = (extra: Globals = {}) => buildHostProfile({ ChaticMessageHandler: post, ...extra });
const browser = (extra: Globals = {}) => buildHostProfile({ ...extra });
const declared = (keys: Globals) => ({
    CHATIC_APP_CAPABILITIES: {
        version: 4,
        checkout: [],
        media: 'shell',
        files: 'shell',
        links: 'shell',
        appShell: 'shell',
        signIn: 'shell',
        diagnostics: 'shell',
        push: 'shell',
        ...keys,
    },
});
const factsOf = (profile: ReturnType<typeof buildHostProfile>): WebHostFacts => readWebHostFacts({ profile });

const HOSTS = {
    'an iPhone app that declares nothing': phone('ios'),
    'an Android app that declares the browser for media and files': phone(
        'android',
        declared({ media: 'browser', files: 'browser', checkout: ['google'] })
    ),
    'a desktop shell that declares the shell for links only': desktop(
        declared({ media: 'browser', files: 'browser', appShell: 'browser', signIn: 'browser', push: 'browser' })
    ),
    'a browser tab': browser(),
    'a shell whose declaration cannot be read': phone('ios', { CHATIC_APP_CAPABILITIES: 'nope' }),
};

const store = (name: 'apple' | 'google'): StoreCheckout => ({ kind: 'store', store: name }) as unknown as StoreCheckout;
const web = () => ({ kind: 'web' as const, open: jest.fn() });

let warn: jest.SpyInstance;
beforeEach(() => {
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

describe('the `<port>.host` adapters', () => {
    it.each(Object.entries(HOSTS))('follow what %s declared exactly as the readers do', (_name, profile) => {
        const facts = factsOf(profile);
        expect(mediaHost.create({ facts })).toMatchObject({
            kind: resolveMediaMethod(profile),
            built: resolveMediaMethod(profile),
        });
        expect(filesHost.create({ facts })).toMatchObject({
            kind: resolveFilesMethod(profile),
            built: resolveFilesMethod(profile),
        });
        expect(linksHost.create({ facts })).toMatchObject({
            kind: resolveLinksMethod(profile),
            built: resolveLinksMethod(profile),
        });
        expect(appShellHost.create({ facts })).toMatchObject({
            ...resolveAppShell(profile),
            built: resolveAppShell(profile).kind,
        });
        expect(signInHost.create({ facts })).toMatchObject({
            ...resolveSignIn(profile),
            built: resolveSignIn(profile).kind,
        });
        expect(diagnosticsHost.create({ facts })).toMatchObject({
            kind: resolveDiagnosticsMethod(profile),
            built: resolveDiagnosticsMethod(profile),
        });
        expect(pushHost.create({ facts })).toMatchObject({
            kind: resolvePushMethod(profile),
            built: resolvePushMethod(profile),
        });
    });

    it('run on every host', () => {
        for (const adapter of [mediaHost, filesHost, linksHost, appShellHost, signInHost, diagnosticsHost, pushHost]) {
            expect(adapter.supports).toBeUndefined();
        }
    });

    it('are named `<port>.host` in the port they fill', () => {
        expect([mediaHost, appShellHost, signInHost].map(adapter => [adapter.port, adapter.id])).toEqual([
            ['media', 'media.host'],
            ['appShell', 'appShell.host'],
            ['signIn', 'signIn.host'],
        ]);
    });
});

describe('the `.shell` and `.browser` adapters', () => {
    it('allow the shell only where the host declared it does the work', () => {
        expect(mediaShell.supports?.(factsOf(phone('ios')))).toBe(true);
        expect(mediaShell.supports?.(factsOf(phone('android', declared({ media: 'browser' }))))).toBe(false);
        expect(mediaShell.supports?.(factsOf(browser()))).toBe(false);
    });

    it('allow the browser on every host', () => {
        expect(mediaBrowser.supports).toBeUndefined();
        expect(filesBrowser.supports).toBeUndefined();
    });

    it('carry the phone platform behind the shell, and none behind the browser', () => {
        const facts = factsOf(phone('IOS'));
        expect(appShellShell.create({ facts })).toMatchObject({ kind: 'shell', os: 'ios' });
        expect(appShellBrowser.create({ facts })).toMatchObject({ kind: 'browser', os: null });
    });
});

describe('the ports built from the app implementations', () => {
    it('build the implementation for the choice, from the choice and the facts', () => {
        const facts = factsOf(phone('android'));
        expect(appShellShell.create({ facts })).toEqual({
            kind: 'shell',
            os: 'android',
            built: 'shell',
            bridge: facts.bridge,
        });
        expect(appShellBrowser.create({ facts })).toEqual({
            kind: 'browser',
            os: null,
            built: 'browser',
            bridge: facts.bridge,
        });
    });

    it('build only the side that was chosen', () => {
        jest.mocked(linksImplementations.shell).mockClear();
        jest.mocked(linksImplementations.browser).mockClear();
        linksHost.create({ facts: factsOf(browser()) });
        expect(linksImplementations.browser).toHaveBeenCalledTimes(1);
        expect(linksImplementations.shell).not.toHaveBeenCalled();
    });

    it('keep the shell for a host that declared it, and the browser everywhere', () => {
        const { shell, browser: page } = linksAdapters(builtFrom<'links'>());
        expect(shell.supports?.(factsOf(phone('ios')))).toBe(true);
        expect(shell.supports?.(factsOf(browser()))).toBe(false);
        expect(page.supports).toBeUndefined();
    });
});

describe('the checkout adapters', () => {
    const offering = (checkout: string[]) => factsOf(phone('ios', declared({ checkout })));

    it.each([
        ['a store first', ['apple', 'web'], { kind: 'store', store: 'apple' }],
        ['the website first', ['web', 'apple'], { kind: 'web' }],
        ['nothing', [], { kind: 'none' }],
    ])('checkout.host builds what a host offering %s prefers', (_name, checkout, expected) => {
        const facts = offering(checkout as string[]);
        expect(checkoutFromHost({ store, web }).create({ facts })).toMatchObject(expected);
    });

    it('checkout.host sells by the same method the reader answers', () => {
        const profile = phone('android', declared({ checkout: ['google', 'web'] }));
        expect(checkoutFromHost({ store, web }).create({ facts: factsOf(profile) })).toMatchObject({
            store: resolveCheckoutMethod(profile),
        });
    });

    it('checkout.host follows the legacy rule for a host that declares nothing', () => {
        expect(checkoutFromHost({ store, web }).create({ facts: factsOf(phone('android')) })).toMatchObject({
            kind: 'store',
            store: 'google',
        });
        expect(checkoutFromHost({ store, web }).create({ facts: factsOf(browser()) })).toMatchObject({ kind: 'web' });
    });

    it('checkout.web runs only where the host offers the website', () => {
        const adapter = checkoutWeb(web);
        expect(adapter.supports?.(offering(['apple', 'web']))).toBe(true);
        expect(adapter.supports?.(offering(['apple']))).toBe(false);
        expect(adapter.supports?.(factsOf(browser()))).toBe(true);
        expect(adapter.create({ facts: offering(['apple', 'web']) })).toMatchObject({ kind: 'web' });
    });

    it('checkout.store runs only where the host offers a store, and opens the first one offered', () => {
        const adapter = checkoutStore(store);
        expect(adapter.supports?.(offering(['web', 'google', 'apple']))).toBe(true);
        expect(adapter.supports?.(offering(['web']))).toBe(false);
        expect(adapter.create({ facts: offering(['web', 'google', 'apple']) })).toMatchObject({ store: 'google' });
    });

    it('checkout.none sells nothing on every host', () => {
        expect(checkoutNone.supports).toBeUndefined();
        expect(checkoutNone.create({ facts: offering(['apple']) })).toEqual({ kind: 'none' });
    });
});

describe('host ports through startRuntime', () => {
    const runtimePort = <P extends 'storage' | 'transport' | 'auth' | 'cache' | 'foreground'>(port: P) => ({
        default: { id: `${port}.fake` as `${P}.fake`, port, create: () => ({}) as RuntimePorts[P] },
    });

    /** apps/web's host ports: each follows the host, with the toggles a developer may reach for. */
    const declaration = (profile: ReturnType<typeof buildHostProfile>): RuntimeDeclaration<WebHostFacts> =>
        defineRuntime<WebHostFacts>({
            name: 'web',
            facts: () => factsOf(profile),
            ports: {
                storage: runtimePort('storage'),
                transport: runtimePort('transport'),
                auth: runtimePort('auth'),
                cache: runtimePort('cache'),
                foreground: runtimePort('foreground'),
            },
            host: {
                checkout: { default: checkoutFromHost({ store, web }), alternatives: [checkoutWeb(web), checkoutNone] },
                media: { default: mediaHost, alternatives: [mediaShell, mediaBrowser] },
                files: { default: filesHost, alternatives: [filesBrowser] },
                links: { default: linksHost },
                appShell: { default: appShellHost },
                signIn: { default: signInHost },
                diagnostics: { default: diagnosticsHost },
                push: { default: pushHost },
            },
        });

    const start = async (profile: ReturnType<typeof buildHostProfile>, toggles: Record<string, string> = {}) => {
        const published: HostPorts[] = [];
        const read: PortChoiceReader = key =>
            toggles[key] ? { value: toggles[key], origin: 'local' } : { value: '', origin: 'default' };
        const started = await startRuntime(declaration(profile), {
            config: { init: jest.fn(), isInitialized: () => true, snapshot: (() => undefined) as never },
            read,
            createRuntime: () => ({}) as RuntimeEngine,
            initEngine: jest.fn(),
            publishHost: ports => published.push(ports),
            log: () => undefined,
        });
        return { started, published };
    };

    it('publishes, by default, what the host declared — the ports the entry point published by hand', async () => {
        const profile = phone('ios', declared({ checkout: ['apple', 'web'], files: 'browser' }));
        const { published } = await start(profile);

        expect(published).toHaveLength(1);
        expect(Object.keys(published[0]).sort()).toEqual([...HOST_PORT_NAMES].sort());
        expect(published[0]).toMatchObject({
            checkout: { kind: 'store', store: 'apple' },
            media: { kind: 'shell' },
            files: { kind: 'browser' },
            appShell: { kind: 'shell', os: 'ios' },
        });
    });

    it('lets a toggle move checkout to the website while the rest stays on the shell', async () => {
        const profile = phone('ios', declared({ checkout: ['apple', 'web'] }));
        const { published, started } = await start(profile, { 'port.checkout': 'checkout.web' });

        expect(started.hostChoices?.checkout).toMatchObject({ id: 'checkout.web', origin: 'local' });
        expect(published[0].checkout).toMatchObject({ kind: 'web' });
        expect(published[0].media).toMatchObject({ kind: 'shell' });
    });

    it('lets a toggle force the browser for one port', async () => {
        const { published } = await start(phone('ios'), { 'port.media': 'media.browser' });
        expect(published[0].media).toMatchObject({ kind: 'browser' });
    });

    it('refuses a toggle to a method the host lacks, falling back to what it declared', async () => {
        const { published, started } = await start(browser(), {
            'port.media': 'media.shell',
            'port.checkout': 'checkout.web',
        });
        expect(started.hostChoices?.media).toMatchObject({
            id: 'media.host',
            fellBack: { requested: 'media.shell', because: 'not supported on this host' },
        });
        expect(published[0].media).toMatchObject({ kind: 'browser' });
        // A browser offers the website, so that toggle stands.
        expect(published[0].checkout).toMatchObject({ kind: 'web' });
    });
});
