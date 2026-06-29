import type { IapProductSubscription } from '@chatic/app-messages';
import type { PurchaseProduct } from '../../../subscription/types';

export enum PageState {
    Idle = 'idle',
    Fetching = 'fetching',
    Purchasing = 'purchasing',
}

const IS_DEV = import.meta.env.VITE_ENV === 'DEV' || import.meta.env.VITE_ENV === 'LOCAL';

export const POLICY_BASE_URL = IS_DEV ? 'https://app-dev.chatic.io' : 'https://app.chatic.io';
export const ALLOWED_PRODUCT_ID_IOS = IS_DEV ? '#pro_tier_01_dev' : '#pro_tier_01';
export const ALLOWED_PRODUCT_ID_ANDROID = IS_DEV ? '#pro-tier-01-dev' : '#pro-tier-01';

export const buildPurchaseProduct = (matched: IapProductSubscription, isIOS: boolean): PurchaseProduct | null => {
    const offerToken = matched.androidOfferToken?.freeTrial ?? matched.androidOfferToken?.base ?? undefined;
    if (!isIOS && !offerToken) return null;
    return isIOS
        ? {
              id: matched.id,
              ...(matched.basePlanId && { newPlanId: matched.basePlanId }),
          }
        : {
              id: matched.id,
              ...(matched.basePlanId && { newPlanId: matched.basePlanId }),
              ...(offerToken && { offerToken }),
          };
};
