import { hostProfile, logger, resolveCapability, type HostProfile } from '@chatic/bridges';

import type { IapProductSubscription, WebMessageResponse } from '@chatic/bridge-messages';

/** The two app stores a host may sell through. */
export type StoreName = 'apple' | 'google';

/** A purchase as the store reports it — the same shape the shell's purchase messages carry. */
export type StorePurchase = WebMessageResponse<'FetchCurrentPurchases'>['data']['purchases'][number];

/** What to buy. The Android fields are ignored by the App Store. */
export interface StorePurchaseRequest {
    id: string;
    newPlanId?: string;
    offerToken?: string;
    /**
     * (Android) the base plan being replaced. Android derives the replacement mode from old-vs-new
     * plan rank, so a tier change without this is booked as a brand-new subscription.
     */
    oldPlanId?: string;
}

/** Why a purchase did not complete. `user-cancelled` is an ordinary outcome, not a failure. */
export interface StorePurchaseError {
    code: string;
    message?: string;
}

/** This host sells through an app store, inside the app. */
export interface StoreCheckout {
    readonly kind: 'store';
    readonly store: StoreName;
    /** The store's catalog for this app, with the store's own localized prices. */
    products(): Promise<IapProductSubscription[]>;
    /**
     * Opens the store's purchase sheet. Resolves with the store's purchase once the store has taken
     * the payment; rejects with a `StorePurchaseError` — a cancellation and a timeout included.
     */
    purchase(request: StorePurchaseRequest): Promise<StorePurchase>;
    /** Tells the store a purchase is done with. Until it is, the store presents it again. */
    finish(purchase: StorePurchase): Promise<void>;
    /** The purchases the store still holds for this user. */
    currentPurchases(): Promise<StorePurchase[]>;
    /** Opens the store's own subscription management. */
    openManagement(): void;
}

/**
 * This host hands the buyer to the website's checkout. The purchase completes there, not here: a
 * caller learns of it only when the membership it reads says so.
 */
export interface WebCheckout {
    readonly kind: 'web';
    /** Leaves for a page of the website. `replace` keeps that page out of back's way. */
    open(url: string, options?: { replace?: boolean }): void;
}

/** This host sells nothing. */
export interface NoCheckout {
    readonly kind: 'none';
}

export type CheckoutPort = StoreCheckout | WebCheckout | NoCheckout;

/** The way a host sells, as its declaration or the legacy rule says. */
export type CheckoutMethod = StoreName | 'web' | 'none';

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
