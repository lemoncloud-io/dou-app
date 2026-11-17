import { host, resolveCheckoutMethod, resolveFilesMethod, resolveMediaMethod, type CheckoutPort } from '@chatic/host';

import { storeCheckout } from './checkout/storeCheckout';
import { webCheckout } from './checkout/webCheckout';

const chooseCheckout = (): CheckoutPort => {
    const method = resolveCheckoutMethod();
    if (method === 'apple' || method === 'google') return storeCheckout(method);
    if (method === 'web') return webCheckout();
    return { kind: 'none' };
};

/**
 * The one file in this app that chooses how the host is reached: it picks an implementation for each
 * of `@chatic/host`'s ports and publishes them, once, from `main.tsx` before the first render.
 *
 * It is also the one file, beside `@chatic/bridges`' host profile, that may ask the host what it is —
 * `isNative()` and the shell's `CHATIC_APP_*` globals — and lint holds that (`@nx/workspace-host-facts`).
 * A feature asks a port, never the host. Each port's choice reads what the host declared, through the
 * profile; a host built before declarations is answered by the port's legacy rule.
 */
export const publishHostPorts = (): void => {
    host.publish({
        checkout: chooseCheckout(),
        media: { kind: resolveMediaMethod() },
        files: { kind: resolveFilesMethod() },
    });
};
