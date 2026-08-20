import { useCallback } from 'react';

import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { formatPlanPrice, matchNativeProduct } from '../lib';
import { useNativeCatalog } from './useNativeCatalog';
import { usePlanCatalog } from './usePlanCatalog';

/**
 * A plan's price as the store states it, for screens outside the picker.
 *
 * The subscription card and the completion notice used to print the server's USD reference with a
 * hardcoded `$`, so a Korean subscriber read dollars for a charge their store had taken in won.
 * Returns `undefined` when the store has no entry for the plan — off-native, or a membership bought
 * on the other store — and callers drop the line rather than substitute a number.
 */
export const usePlanPrice = (): ((plan: ProductView | undefined) => string | undefined) => {
    const { isIOS } = usePlanCatalog();
    const { nativeProducts } = useNativeCatalog();

    return useCallback(
        (plan: ProductView | undefined) =>
            plan ? formatPlanPrice(matchNativeProduct(nativeProducts, plan, isIOS)?.displayPrice) : undefined,
        [isIOS, nativeProducts]
    );
};
