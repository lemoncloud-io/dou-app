import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { IapProductSubscription } from '@chatic/bridge-messages';
import type { MembershipView, ProductView } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/bridges';

import { buildPurchaseProduct, getTierChangeKind, matchNativeProduct, type TierChangeKind } from '../lib';
import { PageState } from '../types';
import { usePlanCatalog } from './usePlanCatalog';
import { useSubscriptionIap } from './useSubscriptionIap';

export interface TierPurchase {
    pageState: PageState;
    isBlocked: boolean;
    changeKindOf: (plan: ProductView) => TierChangeKind;
    resolveNativeProduct: (plan: ProductView) => Promise<IapProductSubscription>;
    purchaseTier: (plan: ProductView, matched: IapProductSubscription, email?: string) => Promise<MembershipView>;
}

export const useTierPurchase = (): TierPurchase => {
    const { t } = useTranslation();
    const { isIOS, replaceablePlan, resubscribePlan } = usePlanCatalog();
    const { fetchNativeProducts, purchaseAndValidate } = useSubscriptionIap();
    const [pageState, setPageState] = useState<PageState>(PageState.Idle);

    const changeKindOf = useCallback(
        (plan: ProductView) => getTierChangeKind(replaceablePlan, plan, resubscribePlan),
        [replaceablePlan, resubscribePlan]
    );

    const resolveNativeProduct = useCallback(
        async (plan: ProductView) => {
            setPageState(PageState.Fetching);
            try {
                const matched = matchNativeProduct(await fetchNativeProducts(), plan, isIOS);
                if (!matched) {
                    logger.error('IAP', 'no native product matched tier', {
                        data: { planId: plan.id, isIOS },
                    });
                    throw new Error(t('mypage.subscription.productNotFound'));
                }
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
                currentProductId: replaceablePlan?.id,
            });
            if (!product) {
                logger.error('IAP', 'offerToken missing for tier change', {
                    data: { planId: plan.id, kind, currentProductId: replaceablePlan?.id },
                });
                throw new Error(t('mypage.subscription.offerTokenMissing'));
            }

            setPageState(PageState.Purchasing);
            try {
                return await purchaseAndValidate(product, email);
            } finally {
                setPageState(PageState.Idle);
            }
        },
        [changeKindOf, isIOS, purchaseAndValidate, replaceablePlan?.id, t]
    );

    return {
        pageState,
        isBlocked: pageState !== PageState.Idle,
        changeKindOf,
        resolveNativeProduct,
        purchaseTier,
    };
};
