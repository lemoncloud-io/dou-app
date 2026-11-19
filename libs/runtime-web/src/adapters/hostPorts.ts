import type {
    HostAdapter,
    HostPortName,
    HostPorts,
    ShellOrBrowser,
    StoreCheckout,
    StoreName,
    WebCheckout,
} from '@chatic/runtime-client';

import type { WebHostFacts } from '../hostFacts';
import { offeredCheckoutMethods, offeredStore, resolveCheckoutMethod } from '../hostCapabilities/checkout';
import { FILES_INTRODUCED_IN } from '../hostCapabilities/files';
import { MEDIA_INTRODUCED_IN } from '../hostCapabilities/media';
import {
    SHELL_DOMAINS_INTRODUCED_IN,
    hostOsOf,
    resolveShellOrBrowser,
    type DeclaredHost,
} from '../hostCapabilities/shellOrBrowser';

/** A host port adapter for a web page, asked about this page's `WebHostFacts`. */
export type WebHostAdapter<P extends HostPortName> = HostAdapter<P, HostPorts[P], WebHostFacts>;

/**
 * The host the readers ask, read from the facts the start was resolved against rather than from the
 * live profile: the same values — the facts are the profile's — fixed once per start.
 */
const declaredHostOf = (facts: WebHostFacts): DeclaredHost => ({
    bridge: facts.bridge,
    capabilities: facts.capabilities,
    globals: { CHATIC_APP_PLATFORM: facts.platform },
});

/** The three ways of filling one `'shell' | 'browser'` port. */
export interface ShellOrBrowserAdapters<P extends HostPortName> {
    /** `<port>.host` — what the host declared, exactly as the entry points published it before. */
    readonly host: WebHostAdapter<P>;
    /** `<port>.shell` — the shell does it; only where the host declared that it does. */
    readonly shell: WebHostAdapter<P>;
    /** `<port>.browser` — the page does it with what any browser offers; every host can. */
    readonly browser: WebHostAdapter<P>;
}

/** What a port's value starts from: the choice, and for `appShell` and `signIn` the phone platform behind it. */
export type ShellOrBrowserBase<P extends HostPortName> = Pick<HostPorts[P], Extract<keyof HostPorts[P], 'kind' | 'os'>>;

/**
 * The app's two ways of doing one port's work, each built only when chosen: through its shell, and with
 * what the page has. Both take the port's choice (`base`) and the facts the start was resolved against,
 * and return the whole port with `base` in it.
 *
 * The app hands these in, as it does for `checkout`: the shell side talks to the app's own bridge wrapper
 * (the web's `appBridge`, desktop-web's `webClient` requests), and the page side can need the app's own
 * data — a store's address, a toast — so neither belongs in a library.
 */
export interface ShellOrBrowserImplementations<P extends HostPortName> {
    readonly shell: (base: ShellOrBrowserBase<P>, facts: WebHostFacts) => HostPorts[P];
    readonly browser: (base: ShellOrBrowserBase<P>, facts: WebHostFacts) => HostPorts[P];
}

/**
 * The adapters of one port whose value is the choice, and for `appShell` and `signIn` the phone platform
 * behind a `'shell'` answer (`withOs`). With `implementations`, the value is the app's implementation for
 * that choice; without, it is the choice alone (the ports whose work still branches in the app).
 *
 * `.shell` is supported only where the host's declaration resolves to the shell, so a toggle cannot hand
 * the work to a shell that never said it does it. `.browser` is supported everywhere, which is the same
 * rule the readers hold — every host can do what a browser does, and a declaration that cannot be read
 * is answered with the browser — and is what lets a toggle move one port to the page while the rest stay
 * on the shell.
 */
const shellOrBrowserAdapters = <P extends HostPortName>(
    port: P,
    introducedIn: number,
    withOs: boolean,
    implementations?: ShellOrBrowserImplementations<P>
): ShellOrBrowserAdapters<P> => {
    const valueOf = (facts: WebHostFacts, kind: ShellOrBrowser) => {
        const host = declaredHostOf(facts);
        const base = (withOs ? { kind, os: hostOsOf(host, kind) } : { kind }) as ShellOrBrowserBase<P>;
        return implementations ? implementations[kind](base, facts) : (base as HostPorts[P]);
    };
    const declared = (facts: WebHostFacts): ShellOrBrowser =>
        resolveShellOrBrowser(declaredHostOf(facts), port, introducedIn);
    return {
        host: {
            id: `${port}.host`,
            port,
            create: ({ facts }) => valueOf(facts, declared(facts)),
        },
        shell: {
            id: `${port}.shell`,
            port,
            supports: facts => declared(facts) === 'shell',
            create: ({ facts }) => valueOf(facts, 'shell'),
        },
        browser: {
            id: `${port}.browser`,
            port,
            create: ({ facts }) => valueOf(facts, 'browser'),
        },
    };
};

const media = shellOrBrowserAdapters('media', MEDIA_INTRODUCED_IN, false);
const files = shellOrBrowserAdapters('files', FILES_INTRODUCED_IN, false);
const signIn = shellOrBrowserAdapters('signIn', SHELL_DOMAINS_INTRODUCED_IN, true);
const push = shellOrBrowserAdapters('push', SHELL_DOMAINS_INTRODUCED_IN, false);

// Each named after its id, as the runtime ports' adapters are (`media.host` → `mediaHost`).
export const { host: mediaHost, shell: mediaShell, browser: mediaBrowser } = media;
export const { host: filesHost, shell: filesShell, browser: filesBrowser } = files;
export const { host: signInHost, shell: signInShell, browser: signInBrowser } = signIn;
export const { host: pushHost, shell: pushShell, browser: pushBrowser } = push;

// --- links, appShell, diagnostics: the implementations are the app's ----------------------------------
//
// The same three ways — as declared, the shell, the page — each built from the app's implementation for
// that choice, so a feature calls the port and never asks which side it is on.

/** `links.host` / `links.shell` / `links.browser`, from the app's implementations of the links port. */
export const linksAdapters = (
    implementations: ShellOrBrowserImplementations<'links'>
): ShellOrBrowserAdapters<'links'> =>
    shellOrBrowserAdapters('links', SHELL_DOMAINS_INTRODUCED_IN, false, implementations);

/** `appShell.host` / `appShell.shell` / `appShell.browser`, from the app's implementations of the frame. */
export const appShellAdapters = (
    implementations: ShellOrBrowserImplementations<'appShell'>
): ShellOrBrowserAdapters<'appShell'> =>
    shellOrBrowserAdapters('appShell', SHELL_DOMAINS_INTRODUCED_IN, true, implementations);

/** `diagnostics.host` / `diagnostics.shell` / `diagnostics.browser`, from the app's diagnostics implementations. */
export const diagnosticsAdapters = (
    implementations: ShellOrBrowserImplementations<'diagnostics'>
): ShellOrBrowserAdapters<'diagnostics'> =>
    shellOrBrowserAdapters('diagnostics', SHELL_DOMAINS_INTRODUCED_IN, false, implementations);

// --- checkout: the implementations are the app's ------------------------------------------------------
//
// A store purchase talks to the app's own bridge wrapper and a website hand-off to the app's own
// navigation, so the values are built from what the app hands in. Only the choice between them is here.

/** The app's two ways of selling, each built only when chosen. */
export interface CheckoutImplementations {
    /** The store checkout for the store the host sells through. */
    readonly store: (store: StoreName) => StoreCheckout;
    /** The website's checkout. */
    readonly web: () => WebCheckout;
}

/**
 * `checkout.host` — what the host declared, as the entry point chose it before: the first method it
 * offers that the page knows, built from the app's implementation of it, or nothing.
 */
export const checkoutFromHost = ({ store, web }: CheckoutImplementations): WebHostAdapter<'checkout'> => ({
    id: 'checkout.host',
    port: 'checkout',
    create: ({ facts }) => {
        const method = resolveCheckoutMethod(declaredHostOf(facts));
        if (method === 'apple' || method === 'google') return store(method);
        if (method === 'web') return web();
        return { kind: 'none' };
    },
});

/**
 * `checkout.store` — the store the host offers, even where it prefers another method. Only on a host
 * that offers a store: a toggle cannot open a purchase sheet the shell has none of.
 */
export const checkoutStore = (store: CheckoutImplementations['store']): WebHostAdapter<'checkout'> => ({
    id: 'checkout.store',
    port: 'checkout',
    supports: facts => offeredStore(declaredHostOf(facts)) !== undefined,
    create: ({ facts }) => {
        const offered = offeredStore(declaredHostOf(facts));
        // `supports` held, so a store is offered; the guard keeps the type honest.
        return offered ? store(offered) : { kind: 'none' };
    },
});

/**
 * `checkout.web` — the website sells, even where the host prefers a store: the virtual shell running
 * checkout on the web while the rest stays on the shell. Only on a host that offers the website — a
 * store's rules can forbid sending a buyer there.
 */
export const checkoutWeb = (web: CheckoutImplementations['web']): WebHostAdapter<'checkout'> => ({
    id: 'checkout.web',
    port: 'checkout',
    supports: facts => offeredCheckoutMethods(declaredHostOf(facts)).includes('web'),
    create: () => web(),
});

/** `checkout.none` — this app sells nothing, whatever the host offers. Every host. */
export const checkoutNone: WebHostAdapter<'checkout'> = {
    id: 'checkout.none',
    port: 'checkout',
    create: () => ({ kind: 'none' }),
};
