import { useCallback } from 'react';

import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { formatPlanPrice, matchNativeProduct } from '../lib';
import { useNativeCatalog } from './useNativeCatalog';
import { usePlanCatalog } from './usePlanCatalog';

export const usePlanPrice = (): ((plan: ProductView | undefined) => string | undefined) => {
    const { isIOS } = usePlanCatalog();
    const { nativeProducts } = useNativeCatalog();

    return useCallback(
        (plan: ProductView | undefined) =>
            plan ? formatPlanPrice(matchNativeProduct(nativeProducts, plan, isIOS)?.displayPrice) : undefined,
        [isIOS, nativeProducts]
    );
};
