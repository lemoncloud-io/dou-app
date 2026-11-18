import { hostProfile, logger, resolveCapability } from '@chatic/bridges';
import type { CheckoutMethod, StoreName } from '@chatic/runtime-client';

import type { DeclaredHost } from './shellOrBrowser';

/** The declaration version that introduced `checkout`. */
export const CHECKOUT_INTRODUCED_IN = 1;

/** A way a host can sell: one of the two stores, or the website. */
export type OfferedCheckoutMethod = Exclude<CheckoutMethod, 'none'>;

const CHECKOUT_METHODS: readonly OfferedCheckoutMethod[] = ['apple', 'google', 'web'];

/**
 * What a shell built before declarations sells through — the answer the page gave before the port
 * existed: a phone app's store, chosen by the injected platform, and the website anywhere without a
 * bridge. (A desktop shell has a bridge too and so reads as Google's store, which is why no screen of
 * the desktop app sells; its own declaration will say `[]`.)
 */
const legacyCheckoutMethod = (profile: DeclaredHost): OfferedCheckoutMethod => {
    if (profile.bridge === null) return 'web';
    // Read once, at boot: a platform that is not a string must not stop the page from starting.
    const platform: unknown = profile.globals.CHATIC_APP_PLATFORM;
    return typeof platform === 'string' && platform.toLowerCase() === 'ios' ? 'apple' : 'google';
};

/**
 * Every way this host can sell, preferred first. A declaration lists the methods it offers; the ones the
 * page knows are kept in that order, so a method added later is skipped by an older page rather than
 * misread. An empty list offers nothing. Anything else is a bug in the shell and offers nothing, never a
 * guess. A host from before declarations offers what the page sold through before the port existed.
 */
export const offeredCheckoutMethods = (profile: DeclaredHost = hostProfile()): OfferedCheckoutMethod[] => {
    const source = resolveCapability(profile.capabilities, 'checkout', CHECKOUT_INTRODUCED_IN);
    switch (source.from) {
        case 'legacy':
            return [legacyCheckoutMethod(profile)];
        case 'unavailable':
            return [];
        case 'declaration': {
            if (!Array.isArray(source.value)) {
                logger.warn('BRIDGE', '[host] the declared checkout is not a list; this host sells nothing', {
                    value: source.value,
                });
                return [];
            }
            return source.value.filter((method): method is OfferedCheckoutMethod => CHECKOUT_METHODS.includes(method));
        }
    }
};

/** The store this host sells through, the first one it offers; `undefined` when it offers neither. */
export const offeredStore = (profile: DeclaredHost = hostProfile()): StoreName | undefined =>
    offeredCheckoutMethods(profile).find((method): method is StoreName => method !== 'web');

/** How this host sells: the first method it offers that the page knows, or nothing. */
export const resolveCheckoutMethod = (profile: DeclaredHost = hostProfile()): CheckoutMethod =>
    offeredCheckoutMethods(profile)[0] ?? 'none';
