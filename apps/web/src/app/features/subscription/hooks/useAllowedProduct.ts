import { isNative } from '@chatic/bridges';
import { useProductPlans } from '@chatic/web-core';

import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { ALLOWED_PRODUCT_ID_ANDROID, ALLOWED_PRODUCT_ID_IOS } from '../consts';

export interface AllowedProductResult {
    /** Running inside the native shell — the only context where IAP (and a real store price) exists. */
    isOnMobileApp: boolean;
    isIOS: boolean;
    /** Store platform for the plans query; undefined off-native. */
    platform: 'apple' | 'google' | undefined;
    /** The single subscription product this build is allowed to sell on the current platform. */
    allowedProductId: string;
    /**
     * The matching product, or undefined. **Only resolved on native**: off-native we cannot know
     * which store's product applies, and `GET /products/plans` does not filter by platform, so an
     * unfiltered match would surface (say) the Android product's terms to a desktop or iOS-Safari
     * visitor. Callers that render store-specific copy — prices, trial length — must treat
     * `undefined` as "no store terms to show" rather than falling back to another platform's.
     */
    product: ProductView | undefined;
    isLoading: boolean;
}

/**
 * Resolves the current platform's allowed subscription product. Extracted because the plan picker
 * and the cloud guide both need it, and a drifting copy of this platform sniffing is exactly how one
 * screen ends up advertising the other store's terms.
 */
export const useAllowedProduct = (): AllowedProductResult => {
    const isOnMobileApp = isNative();
    const isIOS = isOnMobileApp && typeof window !== 'undefined' && window.CHATIC_APP_PLATFORM?.toLowerCase() === 'ios';
    const platform = isOnMobileApp ? (isIOS ? 'apple' : 'google') : undefined;

    const { data: plansData, isLoading } = useProductPlans(platform ? { platform, limit: -1 } : { limit: -1 });

    const allowedProductId = isIOS ? ALLOWED_PRODUCT_ID_IOS : ALLOWED_PRODUCT_ID_ANDROID;
    const product = isOnMobileApp ? (plansData?.list ?? []).find(p => p.id === allowedProductId) : undefined;

    return { isOnMobileApp, isIOS, platform, allowedProductId, product, isLoading };
};
