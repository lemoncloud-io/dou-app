import type { IapProductSubscription, OnPurchaseErrorPayload, OnPurchaseSuccessPayload } from '@chatic/app-messages';

import type { ShellPlatform } from '../support/fake-shell/fakeShell';
import type { ShellHandlerTable } from '../support/fake-shell/handlerTable';
import type { FakeBackend } from './backend';
import { GUEST, guestProfile, registerDeviceAnswer } from './guest';

/**
 * A subscription bought through the app's store, and the relay's half of it: the plan catalog, the
 * account's membership, and the purchase check. Every value is invented — no store or relay issued
 * any of it.
 *
 * Buying needs an account, not a guest (the page refuses a guest before it opens the store), so
 * `signedInMember` turns the scenario's guest into a signed-in member first.
 */

type Purchase = OnPurchaseSuccessPayload['purchase'];
type PurchaseErrorCode = OnPurchaseErrorPayload['error']['code'];

/** The entry tier — the only one a first subscription may start on. */
export const PLAN = {
    /** The relay's id; the store's id for the same tier is it without the `#`. */
    id: '#pro-tier-01',
    storeId: 'pro-tier-01',
    name: 'Pro 1',
    /** The Play Store's parent subscription, which every tier is a base plan of. */
    androidParentSku: 'dou_pro_subscription',
    androidOfferToken: 'e2e-offer-token-base',
    displayPrice: '$4.99',
} as const;

/** The guest as a signed-in member: the same account, with a role the purchase is allowed for. */
export const signedInMember = (backend: FakeBackend): void => {
    backend.useHttp({
        'POST /oauth/register-device': request => {
            backend.deviceId = (request.postDataJSON() as { deviceId: string }).deviceId;
            return { ...registerDeviceAnswer(backend.deviceId), userRole: 'user' };
        },
    });
    backend.useSocket({
        // With a social account linked: the page refuses a cloud subscription to an account it knows
        // has none (`link$` present, `social` missing).
        'user.profile': () => {
            const profile = guestProfile(backend.deviceId);
            return {
                ...profile,
                roles: ['user'],
                $user: { ...profile.$user, userRole: 'user', link$: { social: { provider: 'google' } } },
            };
        },
    });
};

/** The relay's plan row for the entry tier, on one store — the catalog lists one per store. */
const planRow = (platform: 'apple' | 'google') => ({
    id: PLAN.id,
    name: PLAN.name,
    nameEn: PLAN.name,
    platform,
    planId: platform === 'google' ? PLAN.androidParentSku : PLAN.storeId,
    stereo: 'subscription',
    price: 4.99,
    maxClouds: 1,
    trialDays: 0,
    sort: 1,
    grade: 1,
    createdAt: GUEST.createdAt,
    updatedAt: GUEST.createdAt,
});

/** The account's membership as `GET /memberships/0/mine` answers it, before and after buying. */
const membership = (platform: 'apple' | 'google' | null) => ({
    id: `MS${GUEST.uid}`,
    createdAt: GUEST.createdAt,
    updatedAt: GUEST.createdAt,
    deletedAt: 0,
    $: { sid: GUEST.sid, uid: GUEST.uid },
    userId: GUEST.uid,
    ...(platform
        ? {
              status: 'active',
              isValid: true,
              productId: PLAN.id,
              platform,
              validFrom: GUEST.createdAt,
              // Far ahead, so the membership reads as current on any run.
              validUntil: 4_102_444_800_000,
              renewedAt: GUEST.createdAt,
              autoRenewing: true,
              trialUsed: true,
              cloudIds: [],
              cloudNo: 0,
          }
        : { status: 'none', isValid: false }),
});

/** What the relay saw of a purchase: each check of a store receipt, in order. */
export interface RelayMembership {
    /** The body of each `POST /memberships/0` — the page asking the relay to check a purchase. */
    validations: unknown[];
    /** Whether the account holds the tier now (a check has passed). */
    active: boolean;
}

/**
 * The relay's subscription API: the catalog (the entry tier, on both stores), the membership — none
 * until a purchase is checked — and the check itself, which passes and makes the membership active.
 */
export const installSubscriptions = (backend: FakeBackend, platform: ShellPlatform): RelayMembership => {
    const store = platform === 'ios' ? 'apple' : 'google';
    const relay: RelayMembership = { validations: [], active: false };
    backend.useHttp({
        'GET /products/plans': () => ({
            list: [planRow('apple'), planRow('google')],
            total: 2,
            page: 0,
            limit: -1,
        }),
        'GET /memberships/0/mine': () => membership(relay.active ? store : null),
        'POST /memberships/0': request => {
            relay.validations.push(request.postDataJSON());
            relay.active = true;
            return membership(store);
        },
    });
    return relay;
};

/** The entry tier as each store's catalog describes it to the app (`FetchProducts`). */
export const storeProduct = (platform: ShellPlatform): IapProductSubscription =>
    platform === 'ios'
        ? {
              platform: 'ios',
              type: 'subs',
              id: PLAN.storeId,
              title: PLAN.name,
              displayName: PLAN.name,
              displayNameIOS: PLAN.name,
              description: 'One cloud',
              displayPrice: PLAN.displayPrice,
              currency: 'USD',
              billingPeriod: 'P1M',
              periodUnit: 'month',
              periodNumber: 1,
              introductoryPricePaymentModeIOS: 'empty',
              isFamilyShareableIOS: false,
              jsonRepresentationIOS: '{}',
              typeIOS: 'auto-renewable-subscription',
          }
        : {
              platform: 'android',
              type: 'subs',
              // One entry per base plan, under the parent SKU, as the app maps the Play catalog.
              id: PLAN.androidParentSku,
              basePlanId: PLAN.storeId,
              title: PLAN.name,
              displayName: PLAN.name,
              nameAndroid: PLAN.name,
              description: 'One cloud',
              displayPrice: PLAN.displayPrice,
              currency: 'USD',
              androidOfferToken: { freeTrial: null, base: PLAN.androidOfferToken },
              subscriptionOfferDetailsAndroid: [],
              subscriptionOffers: [],
          };

/** A completed store purchase of the entry tier, as the app hands it over in `OnPurchaseSuccess`. */
export const storePurchase = (platform: ShellPlatform): Purchase =>
    platform === 'ios'
        ? {
              platform: 'ios',
              store: 'apple',
              id: 'e2e-transaction-1',
              productId: PLAN.storeId,
              transactionId: 'e2e-transaction-1',
              purchaseToken: 'e2e-ios-jws',
              purchaseState: 'purchased',
              isAutoRenewing: true,
              quantity: 1,
              transactionDate: GUEST.createdAt,
          }
        : {
              platform: 'android',
              store: 'google',
              id: 'GPA.e2e-order-1',
              productId: PLAN.androidParentSku,
              transactionId: 'GPA.e2e-order-1',
              purchaseToken: 'e2e-play-purchase-token',
              purchaseState: 'purchased',
              isAutoRenewing: true,
              quantity: 1,
              transactionDate: GUEST.createdAt,
          };

/**
 * A store error as the app hands it over in `OnPurchaseError`. The code is react-native-iap's
 * `ErrorCode` value; it is named here by its string, which is what crosses the bridge, because that
 * library's runtime enum is React Native code this process cannot load.
 */
export const storeError = (code: 'user-cancelled' | 'service-error', message: string) => ({
    error: { code: code as PurchaseErrorCode, message, productId: PLAN.storeId },
});

/**
 * The shell's store, in the shape of the app's own handlers (`useSubscriptionIapHandler`): the
 * catalog, and `Purchase` acknowledged with nothing the page reads — the outcome comes afterwards as
 * an event of its own, `OnPurchaseSuccess` or `OnPurchaseError`, which the scenario pushes.
 * `FinishPurchaseTransaction` closes the transaction and echoes it; `FetchCurrentPurchases` reads the
 * store's current purchases, none.
 */
export const storeHandlers = (platform: ShellPlatform): ShellHandlerTable => ({
    FetchProducts: () => ({ products: [storeProduct(platform)] }),
    Purchase: () => undefined,
    FinishPurchaseTransaction: data => ({ purchase: data.purchase }),
    FetchCurrentPurchases: () => ({ purchases: [] }),
});
