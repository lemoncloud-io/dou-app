import { useMemo } from 'react';

import { runtime } from '@chatic/runtime-react';
import { useMembershipInfo, useProductPlans } from '../../../hooks/useMembership';

import type { ProductView } from '@lemoncloud/chatic-backend-api';

import {
    findPlanById,
    findResubscribePlan,
    isHeldByWeb,
    isTrialEligible,
    selectSellablePlans,
    summarizeMembership,
    webPlanPlatform,
    type StorePlatform,
} from '../lib';
import type { SubscriptionSummary } from '../lib';

export interface PlanCatalog {
    sellsInStore: boolean;
    isIOS: boolean;
    platform: StorePlatform | undefined;
    sellablePlans: ProductView[];
    catalogPlans: ProductView[];
    currentPlan: ProductView | undefined;
    replaceablePlan: ProductView | undefined;
    resubscribePlan: ProductView | undefined;
    isOtherStore: boolean;
    pendingPlan: ProductView | undefined;
    summary: SubscriptionSummary;
    trialEligible: boolean;
    isLoading: boolean;
}

export const usePlanCatalog = (): PlanCatalog => {
    const checkout = runtime.checkout;
    const platform: StorePlatform | undefined = checkout.kind === 'store' ? checkout.store : undefined;
    const sellsInStore = platform !== undefined;
    const isIOS = platform === 'apple';

    const { data: plansData, isLoading: isPlansLoading } = useProductPlans({ limit: -1 });
    const { data: membership, isLoading: isMembershipLoading } = useMembershipInfo();
    const webPlatform = webPlanPlatform(membership?.platform);
    const { data: webPlansData, isLoading: isWebPlansLoading } = useProductPlans(
        { limit: -1, platform: webPlatform },
        { enabled: !!webPlatform }
    );

    const plans = useMemo(
        () => [...(plansData?.list ?? []), ...(webPlatform ? (webPlansData?.list ?? []) : [])],
        [plansData, webPlansData, webPlatform]
    );
    const receiptPlan = findPlanById(plans, membership?.productId);
    const pendingPlan = findPlanById(plans, membership?.pendingProductId);

    const summary = useMemo(() => summarizeMembership(membership, receiptPlan, Date.now()), [membership, receiptPlan]);

    const currentPlan = findPlanById(plans, summary.productId) ?? receiptPlan;
    const replaceablePlan = summary.hasLiveReceipt ? receiptPlan : undefined;
    const sellablePlans = selectSellablePlans(plans, platform);
    const resubscribePlan = summary.state === 'expired' ? findResubscribePlan(receiptPlan, sellablePlans) : undefined;

    return {
        sellsInStore,
        isIOS,
        platform,
        sellablePlans,
        catalogPlans: plans,
        currentPlan,
        replaceablePlan,
        resubscribePlan,
        isOtherStore:
            !!platform &&
            ((!!replaceablePlan?.platform && replaceablePlan.platform !== platform) ||
                isHeldByWeb(summary, membership?.platform, membership?.status)),
        pendingPlan,
        summary,
        trialEligible: isTrialEligible(membership),
        isLoading: isPlansLoading || isMembershipLoading || isWebPlansLoading,
    };
};
