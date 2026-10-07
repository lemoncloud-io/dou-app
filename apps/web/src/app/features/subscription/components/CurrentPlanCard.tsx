import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import { ROUTES } from '../../../routes/paths';
import { usePlanCatalog } from '../hooks';
import { productStatusWord } from '../lib';
import { PlanProductCard } from './PlanProductCard';

/**
 * "현재 구독 상품" — the running plan as a card that opens the subscription detail.
 *
 * Exported from the feature barrel for cloud management, which shows the plan under the cloud
 * list (Figma 4998-50957 and on). The card is the same `PlanProductCard` the subscription screens
 * draw, with the plan's own status word (`productStatusWord`): a lapsed plan reads "expired" here
 * as it does there, and nothing is re-derived outside this feature.
 *
 * Renders nothing for an account that never subscribed — the screen's empty state says that.
 */
export const CurrentPlanCard = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { summary, currentPlan, isLoading } = usePlanCatalog();

    if (isLoading || summary.state === 'none') return null;

    const word = productStatusWord(summary.state);

    return (
        <PlanProductCard
            plan={currentPlan}
            fallbackName={summary.productId}
            statusLabel={t(`mypage.subscription.state.${word.key}`)}
            statusTone={word.tone}
            entitled={summary.isEntitled}
            onClick={() => navigate(ROUTES.subscription.detail)}
        />
    );
};
