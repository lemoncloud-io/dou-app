import type { StoreOfferTokens, StoreProduct } from '@chatic/ports';
import type {
    RequestSubscriptionAndroidProps,
    SubscriptionProductReplacementParamsAndroid,
    SubscriptionReplacementModeAndroid,
} from 'react-native-iap';

import { appleSubscriptionRequest } from './strategy';
import type { StoreStrategy } from './strategy';

export interface GoogleStoreOptions {
    skus: readonly string[];
    planOrder: readonly string[];
}

type StoreOffer = NonNullable<StoreProduct['subscriptionOffers']>[number];

type BasePlan = StoreProduct & {
    androidOfferToken: StoreOfferTokens;
    subscriptionOffers: StoreOffer[];
};

const PERIOD_UNITS: Record<string, StoreProduct['periodUnit']> = {
    Y: 'year',
    M: 'month',
    W: 'week',
    D: 'day',
};

const parseBillingPeriod = (
    billingPeriod: string | undefined
): { periodUnit?: StoreProduct['periodUnit']; periodNumber?: number } => {
    const match = billingPeriod?.match(/^P(\d+)([YMWD])$/);
    if (!match) return {};
    return { periodNumber: parseInt(match[1], 10), periodUnit: PERIOD_UNITS[match[2] as string] };
};

const basePlansOf = (product: StoreProduct): BasePlan[] => {
    const offers = product.subscriptionOffers ?? [];
    const uniqueBasePlans = new Map<StoreOffer['basePlanIdAndroid'], BasePlan>();

    offers.forEach(offer => {
        const basePlanId = offer.basePlanIdAndroid;
        const phases = offer.pricingPhasesAndroid?.pricingPhaseList ?? [];
        const regularPhase = phases[phases.length - 1];
        const isFreeTrial = phases.some(phase => String(phase.priceAmountMicros) === '0');
        const { periodUnit, periodNumber } = parseBillingPeriod(regularPhase?.billingPeriod);

        if (!uniqueBasePlans.has(basePlanId)) {
            uniqueBasePlans.set(basePlanId, {
                ...product,
                id: product.id,
                basePlanId: basePlanId as string | undefined,
                displayName: `${product.title}\n(${basePlanId})`,
                displayPrice: regularPhase?.formattedPrice ?? product.displayPrice,
                billingPeriod: regularPhase?.billingPeriod,
                periodUnit,
                periodNumber,
                androidOfferToken: {
                    freeTrial: null,
                    base: null,
                },
                subscriptionOffers: [],
            });
        }

        const planData = uniqueBasePlans.get(basePlanId) as BasePlan;
        planData.subscriptionOffers.push(offer);

        if (isFreeTrial) {
            planData.androidOfferToken.freeTrial = offer.offerTokenAndroid as string | null;
        } else if (!planData.androidOfferToken.base) {
            planData.androidOfferToken.base = offer.offerTokenAndroid as string | null;
        }
    });

    return Array.from(uniqueBasePlans.values());
};

const rankIn =
    (planOrder: readonly string[]) =>
    (sku: string): number => {
        const index = planOrder.indexOf(sku);
        return index !== -1 ? index + 1 : 0;
    };

export const replacementModeFor = (
    planOrder: readonly string[],
    oldSku: string,
    newSku: string
): SubscriptionReplacementModeAndroid => {
    const rank = rankIn(planOrder);
    return rank(newSku) < rank(oldSku) ? 'deferred' : 'with-time-proration';
};

export const googleStore = ({ skus, planOrder }: GoogleStoreOptions): StoreStrategy => ({
    store: 'google',
    skus,
    managementUrl: 'https://play.google.com/store/account/subscriptions',
    products: fetched => (fetched as StoreProduct[]).flatMap(basePlansOf),
    check: ({ offerToken }) => {
        if (!offerToken) throw new Error('Require offerToken for purchasing Android');
    },
    purchaseRequest: async ({ id, offerToken, oldPlanId, newPlanId }, { logger, currentPurchases }) => {
        const googleRequest: RequestSubscriptionAndroidProps = {
            skus: [id],
            subscriptionOffers: [{ sku: id, offerToken: offerToken as string }],
            subscriptionProductReplacementParams: undefined,
        };

        if (oldPlanId && newPlanId) {
            logger.debug('IAP', 'Looking up existing purchase for plan change');
            const availablePurchases = await currentPurchases();
            const oldPurchase = availablePurchases.find(p => p.productId === id);
            if (oldPurchase) {
                googleRequest.subscriptionProductReplacementParams = {
                    oldPurchaseToken: oldPurchase.purchaseToken,
                    replacementMode: replacementModeFor(planOrder, oldPlanId, newPlanId),
                } as unknown as SubscriptionProductReplacementParamsAndroid;
            }
        }

        return { apple: appleSubscriptionRequest(id), google: googleRequest };
    },
});
