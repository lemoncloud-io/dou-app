import { hostProfile, logger, resolveCapability, type HostProfile } from '@chatic/bridges';
import type { CheckoutMethod } from '@chatic/runtime-client';

/** The declaration version that introduced `checkout`. */
export const CHECKOUT_INTRODUCED_IN = 1;

const CHECKOUT_METHODS: readonly CheckoutMethod[] = ['apple', 'google', 'web'];

/**
 * What a shell built before declarations sells through — the answer the page gave before the port
 * existed: a phone app's store, chosen by the injected platform, and the website anywhere without a
 * bridge. (A desktop shell has a bridge too and so reads as Google's store, which is why no screen of
 * the desktop app sells; its own declaration will say `[]`.)
 */
const legacyCheckoutMethod = (profile: HostProfile): CheckoutMethod => {
    if (profile.bridge === null) return 'web';
    // Read once, at boot: a platform that is not a string must not stop the page from starting.
    const platform: unknown = profile.globals.CHATIC_APP_PLATFORM;
    return typeof platform === 'string' && platform.toLowerCase() === 'ios' ? 'apple' : 'google';
};

/**
 * How this host sells. A declaration lists the methods it offers, preferred first; the first one the
 * page knows is taken, so a method added later is skipped by an older page rather than misread. An
 * empty list sells nothing. Anything else is a bug in the shell and is answered as nothing, never
 * guessed.
 */
export const resolveCheckoutMethod = (profile: HostProfile = hostProfile()): CheckoutMethod => {
    const source = resolveCapability(profile.capabilities, 'checkout', CHECKOUT_INTRODUCED_IN);
    switch (source.from) {
        case 'legacy':
            return legacyCheckoutMethod(profile);
        case 'unavailable':
            return 'none';
        case 'declaration': {
            if (!Array.isArray(source.value)) {
                logger.warn('BRIDGE', '[host] the declared checkout is not a list; this host sells nothing', {
                    value: source.value,
                });
                return 'none';
            }
            const known = source.value.find((method): method is CheckoutMethod => CHECKOUT_METHODS.includes(method));
            return known ?? 'none';
        }
    }
};
