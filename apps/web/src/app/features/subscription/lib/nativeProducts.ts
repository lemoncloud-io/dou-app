import type { IapProductSubscription } from '@chatic/bridge-messages';
import type { ProductView } from '@lemoncloud/chatic-backend-api';

import type { PurchaseProduct } from '../types';
import { stripPlanId } from './plans';

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
    isTierChange?: boolean;
    currentProductId?: string;
}

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
