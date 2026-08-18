import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { IapProductSubscription } from '@chatic/app-messages';
import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { buildPurchaseProduct, getTierChangeKind, matchNativeProduct, type TierChangeKind } from '../lib';
import { PageState } from '../types';
import { usePlanCatalog } from './usePlanCatalog';
import { useSubscriptionIap } from './useSubscriptionIap';

export interface TierPurchase {
    pageState: PageState;
    isBlocked: boolean;
    /** What picking this plan would do, given the running subscription. */
    changeKindOf: (plan: ProductView) => TierChangeKind;
    /** Looks the plan up in the store catalog. Rejects with a user-facing message when absent. */
    resolveNativeProduct: (plan: ProductView) => Promise<IapProductSubscription>;
    /** Buys (or replaces) the plan. `email` is only for a new cloud — a tier change creates none. */
    purchaseTier: (plan: ProductView, matched: IapProductSubscription, email?: string) => Promise<void>;
}

/**
 * The purchase half of the plan picker, shared by the plans page and the home subscribe sheet.
 *
 * Both screens used to carry their own copy of "find the store product, then build the payload", and
 * the copies had already drifted — the sheet matched Android against the shared parent SKU and so
 * never resolved a tier. One implementation, two callers.
 */
export const useTierPurchase = (): TierPurchase => {
    const { t } = useTranslation();
    const { isIOS, replaceablePlan, summary } = usePlanCatalog();
    const { fetchNativeProducts, purchaseAndValidate } = useSubscriptionIap();
    const [pageState, setPageState] = useState<PageState>(PageState.Idle);

    const changeKindOf = useCallback(
        (plan: ProductView) => getTierChangeKind(replaceablePlan, plan),
        [replaceablePlan]
    );

    const resolveNativeProduct = useCallback(
        async (plan: ProductView) => {
            setPageState(PageState.Fetching);
            try {
                const matched = matchNativeProduct(await fetchNativeProducts(), plan, isIOS);
                if (!matched) throw new Error(t('mypage.subscription.productNotFound'));
                return matched;
            } finally {
                setPageState(PageState.Idle);
            }
        },
        [fetchNativeProducts, isIOS, t]
    );

    const purchaseTier = useCallback(
        async (plan: ProductView, matched: IapProductSubscription, email?: string) => {
            const kind = changeKindOf(plan);
            const product = buildPurchaseProduct(matched, {
                isIOS,
                isTierChange: kind === 'upgrade' || kind === 'downgrade',
                currentProductId: summary.productId,
            });
            if (!product) throw new Error(t('mypage.subscription.offerTokenMissing'));

            setPageState(PageState.Purchasing);
            try {
                await purchaseAndValidate(product, email);
            } finally {
                setPageState(PageState.Idle);
            }
        },
        [changeKindOf, isIOS, purchaseAndValidate, summary.productId, t]
    );

    return {
        pageState,
        isBlocked: pageState !== PageState.Idle,
        changeKindOf,
        resolveNativeProduct,
        purchaseTier,
    };
};
