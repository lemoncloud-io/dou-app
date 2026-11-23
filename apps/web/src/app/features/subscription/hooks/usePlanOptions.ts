import { useTranslation } from 'react-i18next';

import type { ProductView } from '@lemoncloud/chatic-backend-api';

import {
    getTierChangeKind,
    getTierRefusal,
    isSelectableTier,
    matchNativeProduct,
    type TierChangeKind,
    type TierRefusal,
} from '../lib';
import { useNativeCatalog } from './useNativeCatalog';
import { usePlanCatalog } from './usePlanCatalog';

export interface PlanOption {
    plan: ProductView;
    kind: TierChangeKind;
    isSelectable: boolean;
    isCurrent: boolean;
    disabledReason?: string;
    refusal?: TierRefusal;
    displayPrice?: string;
}

const REFUSAL_LINE: Record<Exclude<TierRefusal, 'current'>, string> = {
    entryTier: 'mypage.subscription.startAtEntryTier',
    resubscribeSame: 'mypage.subscription.startAtLapsedTier',
    tierJump: 'mypage.subscription.adjacentTierOnly',
    otherStore: 'mypage.subscription.otherStoreOnly',
};

export const usePlanOptions = (): { options: PlanOption[]; isLoading: boolean } => {
    const { t } = useTranslation();
    const { sellablePlans, replaceablePlan, resubscribePlan, isIOS, isLoading, isOtherStore } = usePlanCatalog();
    const { nativeProducts, isLoading: isCatalogLoading } = useNativeCatalog();
    const billedElsewhereUnknown = isOtherStore && !replaceablePlan;

    const options = sellablePlans.map<PlanOption>(plan => {
        const kind: TierChangeKind = billedElsewhereUnknown
            ? 'blocked'
            : getTierChangeKind(replaceablePlan, plan, resubscribePlan);
        const refusal: TierRefusal | undefined = billedElsewhereUnknown
            ? 'otherStore'
            : getTierRefusal(replaceablePlan, kind, plan, resubscribePlan);
        return {
            plan,
            kind,
            isSelectable: isSelectableTier(kind),
            isCurrent: kind === 'current',
            refusal,
            disabledReason: refusal && refusal !== 'current' ? t(REFUSAL_LINE[refusal]) : undefined,
            displayPrice: matchNativeProduct(nativeProducts, plan, isIOS)?.displayPrice,
        };
    });

    return { options, isLoading: isLoading || isCatalogLoading };
};
