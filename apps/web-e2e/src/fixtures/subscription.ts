import type { IapProductSubscription, OnPurchaseErrorPayload, OnPurchaseSuccessPayload } from '@chatic/bridge-messages';

import type { ShellPlatform } from '../support/fake-shell/fakeShell';
import type { ShellHandlerTable } from '../support/fake-shell/handlerTable';
import type { FakeBackend } from './backend';
import { GUEST, guestProfile, registerDeviceAnswer } from './guest';

type Purchase = OnPurchaseSuccessPayload['purchase'];
type PurchaseErrorCode = OnPurchaseErrorPayload['error']['code'];

export const PLAN = {
    id: '#pro-tier-01',
    storeId: 'pro-tier-01',
    name: 'Pro 1',
    androidParentSku: 'dou_pro_subscription',
    androidOfferToken: 'e2e-offer-token-base',
    displayPrice: '$4.99',
} as const;

export const signedInMember = (backend: FakeBackend): void => {
    backend.useHttp({
        'POST /oauth/register-device': request => {
            backend.deviceId = (request.postDataJSON() as { deviceId: string }).deviceId;
            return { ...registerDeviceAnswer(backend.deviceId), userRole: 'user' };
        },
    });
    backend.useSocket({
        'auth.switch': () => ({ ...registerDeviceAnswer(backend.deviceId), userRole: 'user' }),
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

export const planRow = (platform: 'apple' | 'google') => ({
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
              validUntil: 4_102_444_800_000,
              renewedAt: GUEST.createdAt,
              autoRenewing: true,
              trialUsed: true,
              cloudIds: [],
              cloudNo: 0,
          }
        : { status: 'none', isValid: false }),
});

export interface RelayMembership {
    validations: unknown[];
    active: boolean;
}

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

export const storeError = (code: 'user-cancelled' | 'service-error', message: string) => ({
    error: { code: code as PurchaseErrorCode, message, productId: PLAN.storeId },
});

export const storeHandlers = (platform: ShellPlatform): ShellHandlerTable => ({
    FetchProducts: () => ({ products: [storeProduct(platform)] }),
    Purchase: () => undefined,
    FinishPurchaseTransaction: data => ({ purchase: data.purchase }),
    FetchCurrentPurchases: () => ({ purchases: [] }),
});
