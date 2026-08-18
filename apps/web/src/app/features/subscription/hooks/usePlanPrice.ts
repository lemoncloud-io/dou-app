import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { formatPlanPrice, matchNativeProduct } from '../lib';
import { useNativeCatalog } from './useNativeCatalog';
import { usePlanCatalog } from './usePlanCatalog';

/**
 * Formats a plan's price for display, preferring the store's localized string.
 *
 * Screens outside the picker (the subscription card, the completion notice) were printing the
 * server's USD reference with a hardcoded `$`, so a Korean subscriber saw dollars for a charge
 * their store had already taken in won.
 */
export const usePlanPrice = (): ((plan: ProductView | undefined) => string | undefined) => {
    const { i18n } = useTranslation();
    const { isIOS } = usePlanCatalog();
    const { nativeProducts } = useNativeCatalog();

    return useCallback(
        (plan: ProductView | undefined) =>
            plan
                ? formatPlanPrice(
                      matchNativeProduct(nativeProducts, plan, isIOS)?.displayPrice,
                      plan.price,
                      i18n.language
                  )
                : undefined,
        [i18n.language, isIOS, nativeProducts]
    );
};
