import { useTranslation } from 'react-i18next';

import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { getTierChangeKind, isSelectableTier, matchNativeProduct, type TierChangeKind } from '../lib';
import { useNativeCatalog } from './useNativeCatalog';
import { usePlanCatalog } from './usePlanCatalog';

export interface PlanOption {
    plan: ProductView;
    kind: TierChangeKind;
    isSelectable: boolean;
    isCurrent: boolean;
    /** Set only when the tier is refused — the card shows it instead of going quietly grey. */
    disabledReason?: string;
    /** A new cloud (and therefore an email) is created. A tier change only moves the allowance. */
    needsEmail: boolean;
    /**
     * The store's localized, tax-inclusive price (e.g. `₩8,600`). Absent off-native or when the
     * store has no entry for the plan — callers fall back to the server's USD reference value.
     */
    displayPrice?: string;
}

/**
 * Per-tier state for the plan picker, derived once and consumed by both the plans page and the home
 * subscribe sheet. Deriving it in each screen is how the two drifted apart the first time.
 *
 * Reads the catalog directly rather than borrowing `useTierPurchase.changeKindOf`: the screens call
 * both hooks, and going through the purchase hook would stand up a second `useSubscriptionIap` —
 * meaning a duplicate `OnPurchaseSuccess` bridge subscription and a second, unused resolver ref.
 */
export const usePlanOptions = (): { options: PlanOption[]; isLoading: boolean } => {
    const { t } = useTranslation();
    const { sellablePlans, replaceablePlan, isIOS, isLoading } = usePlanCatalog();
    const { nativeProducts, isLoading: isCatalogLoading } = useNativeCatalog();

    const options = sellablePlans.map<PlanOption>(plan => {
        const kind = getTierChangeKind(replaceablePlan, plan);
        return {
            plan,
            kind,
            isSelectable: isSelectableTier(kind),
            isCurrent: kind === 'current',
            disabledReason: kind === 'blocked' ? t('mypage.subscription.adjacentTierOnly') : undefined,
            needsEmail: kind === 'new',
            displayPrice: matchNativeProduct(nativeProducts, plan, isIOS)?.displayPrice,
        };
    });

    return { options, isLoading: isLoading || isCatalogLoading };
};
