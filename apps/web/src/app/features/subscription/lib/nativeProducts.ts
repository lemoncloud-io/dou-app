import type { IapProductSubscription } from '@chatic/app-messages';
import type { ProductView } from '@lemoncloud/chatic-backend-api';

import type { PurchaseProduct } from '../types';
import { stripPlanId } from './plans';

/**
 * Pairs a server plan with the store's own catalog entry.
 *
 * The join key differs per store, and the difference is easy to get wrong: on Apple the config key
 * IS the productId, while on Google every tier shares one parent SKU and the key is the *base plan*
 * id. `ProductView.planId` holds that shared parent SKU (`dou_pro_subscription`) — matching against
 * it can never resolve a tier, which is exactly how the home sheet's Android purchase used to run
 * the whole email verification and then quietly do nothing.
 */
export const matchNativeProduct = (
    nativeProducts: IapProductSubscription[],
    plan: ProductView,
    isIOS: boolean
): IapProductSubscription | undefined => {
    const key = stripPlanId(plan.id);
    if (!key) return undefined;
    return nativeProducts.find(p => (isIOS ? p.id === key : p.basePlanId === key));
};

export interface BuildPurchaseOptions {
    isIOS: boolean;
    /** Replacing a running subscription rather than starting one. */
    isTierChange?: boolean;
    /** The membership's current `productId` (`#`-prefixed). Required for an Android tier change. */
    currentProductId?: string;
}

/**
 * Assembles the bridge purchase payload, or `null` when Android has no usable offer token.
 *
 * Two things are specific to a tier change:
 *  - the offer is always `base`. The free trial exists once, on the first tier-1 subscription, so
 *    attaching its token to a replacement is either refused or bills the wrong offer.
 *  - `oldPlanId` must be present. Android derives the replacement mode from old-vs-new plan rank;
 *    without it the store books a brand-new subscription instead of an upgrade or downgrade.
 */
export const buildPurchaseProduct = (
    matched: IapProductSubscription,
    { isIOS, isTierChange = false, currentProductId }: BuildPurchaseOptions
): PurchaseProduct | null => {
    const offerToken = isTierChange
        ? matched.androidOfferToken?.base
        : (matched.androidOfferToken?.freeTrial ?? matched.androidOfferToken?.base);
    if (!isIOS && !offerToken) return null;

    const oldPlanId = isTierChange ? stripPlanId(currentProductId) : '';

    return {
        id: matched.id,
        ...(matched.basePlanId && { newPlanId: matched.basePlanId }),
        ...(!isIOS && {
            ...(offerToken && { offerToken }),
            ...(oldPlanId && { oldPlanId }),
        }),
    };
};
