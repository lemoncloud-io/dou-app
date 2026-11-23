import { hostProfile, logger, resolveCapability } from '@chatic/bridges';
import type { CheckoutMethod, StoreName } from '@chatic/runtime-client';

import type { DeclaredHost } from './shellOrBrowser';

export const CHECKOUT_INTRODUCED_IN = 1;

export type OfferedCheckoutMethod = Exclude<CheckoutMethod, 'none'>;

const CHECKOUT_METHODS: readonly OfferedCheckoutMethod[] = ['apple', 'google', 'web'];

const legacyCheckoutMethod = (profile: DeclaredHost): OfferedCheckoutMethod => {
    if (profile.bridge === null) return 'web';
    const platform: unknown = profile.globals.CHATIC_APP_PLATFORM;
    return typeof platform === 'string' && platform.toLowerCase() === 'ios' ? 'apple' : 'google';
};

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

export const offeredStore = (profile: DeclaredHost = hostProfile()): StoreName | undefined =>
    offeredCheckoutMethods(profile).find((method): method is StoreName => method !== 'web');

export const resolveCheckoutMethod = (profile: DeclaredHost = hostProfile()): CheckoutMethod =>
    offeredCheckoutMethods(profile)[0] ?? 'none';
