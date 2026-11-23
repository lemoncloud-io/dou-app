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

export type WebHostAdapter<P extends HostPortName> = HostAdapter<P, HostPorts[P], WebHostFacts>;

const declaredHostOf = (facts: WebHostFacts): DeclaredHost => ({
    bridge: facts.bridge,
    capabilities: facts.capabilities,
    globals: { CHATIC_APP_PLATFORM: facts.platform },
});

export interface ShellOrBrowserAdapters<P extends HostPortName> {
    readonly host: WebHostAdapter<P>;
    readonly shell: WebHostAdapter<P>;
    readonly browser: WebHostAdapter<P>;
}

export type ShellOrBrowserBase<P extends HostPortName> = Pick<HostPorts[P], Extract<keyof HostPorts[P], 'kind' | 'os'>>;

export interface ShellOrBrowserImplementations<P extends HostPortName> {
    readonly shell: (base: ShellOrBrowserBase<P>, facts: WebHostFacts) => HostPorts[P];
    readonly browser: (base: ShellOrBrowserBase<P>, facts: WebHostFacts) => HostPorts[P];
}

const shellOrBrowserAdapters = <P extends HostPortName>(
    port: P,
    introducedIn: number,
    withOs: boolean,
    implementations: ShellOrBrowserImplementations<P>
): ShellOrBrowserAdapters<P> => {
    const valueOf = (facts: WebHostFacts, kind: ShellOrBrowser) => {
        const host = declaredHostOf(facts);
        const base = (withOs ? { kind, os: hostOsOf(host, kind) } : { kind }) as ShellOrBrowserBase<P>;
        return implementations[kind](base, facts);
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

export const mediaAdapters = (
    implementations: ShellOrBrowserImplementations<'media'>
): ShellOrBrowserAdapters<'media'> => shellOrBrowserAdapters('media', MEDIA_INTRODUCED_IN, false, implementations);

export const filesAdapters = (
    implementations: ShellOrBrowserImplementations<'files'>
): ShellOrBrowserAdapters<'files'> => shellOrBrowserAdapters('files', FILES_INTRODUCED_IN, false, implementations);

export const linksAdapters = (
    implementations: ShellOrBrowserImplementations<'links'>
): ShellOrBrowserAdapters<'links'> =>
    shellOrBrowserAdapters('links', SHELL_DOMAINS_INTRODUCED_IN, false, implementations);

export const appShellAdapters = (
    implementations: ShellOrBrowserImplementations<'appShell'>
): ShellOrBrowserAdapters<'appShell'> =>
    shellOrBrowserAdapters('appShell', SHELL_DOMAINS_INTRODUCED_IN, true, implementations);

export const diagnosticsAdapters = (
    implementations: ShellOrBrowserImplementations<'diagnostics'>
): ShellOrBrowserAdapters<'diagnostics'> =>
    shellOrBrowserAdapters('diagnostics', SHELL_DOMAINS_INTRODUCED_IN, false, implementations);

export const signInAdapters = (
    implementations: ShellOrBrowserImplementations<'signIn'>
): ShellOrBrowserAdapters<'signIn'> =>
    shellOrBrowserAdapters('signIn', SHELL_DOMAINS_INTRODUCED_IN, true, implementations);

export const pushAdapters = (implementations: ShellOrBrowserImplementations<'push'>): ShellOrBrowserAdapters<'push'> =>
    shellOrBrowserAdapters('push', SHELL_DOMAINS_INTRODUCED_IN, false, implementations);

export interface CheckoutImplementations {
    readonly store: (store: StoreName) => StoreCheckout;
    readonly web: () => WebCheckout;
}

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

export const checkoutStore = (store: CheckoutImplementations['store']): WebHostAdapter<'checkout'> => ({
    id: 'checkout.store',
    port: 'checkout',
    supports: facts => offeredStore(declaredHostOf(facts)) !== undefined,
    create: ({ facts }) => {
        const offered = offeredStore(declaredHostOf(facts));
        return offered ? store(offered) : { kind: 'none' };
    },
});

export const checkoutWeb = (web: CheckoutImplementations['web']): WebHostAdapter<'checkout'> => ({
    id: 'checkout.web',
    port: 'checkout',
    supports: facts => offeredCheckoutMethods(declaredHostOf(facts)).includes('web'),
    create: () => web(),
});

export const checkoutNone: WebHostAdapter<'checkout'> = {
    id: 'checkout.none',
    port: 'checkout',
    create: () => ({ kind: 'none' }),
};
