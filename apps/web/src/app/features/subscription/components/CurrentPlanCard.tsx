import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import { ROUTES } from '../../../routes/paths';
import { usePlanCatalog } from '../hooks';
import { productStatusWord } from '../lib';
import { PlanProductCard } from './PlanProductCard';

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
