import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { ROUTES } from '../../../routes/paths';
import { useAddCloudRequest } from '../../../stores/useAddCloudRequest';
import { useAddCloud, useCloudQuota, usePlanCatalog } from '../hooks';
import { hasHigherTier } from '../lib';
import { AddCloudLimitDialog } from './AddCloudLimitDialog';

const AddCloudFlow = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const closeAddCloud = useAddCloudRequest(s => s.closeAddCloud);
    const { canAdd, reason, limit, isLoading, isFetching } = useCloudQuota();
    const { currentPlan, catalogPlans } = usePlanCatalog();
    const addCloud = useAddCloud();
    const startedRef = useRef(false);
    const [started, setStarted] = useState(false);

    const isSettled = !isLoading && !isFetching;
    const isLimitReached = !started && isSettled && !canAdd && reason === 'limitReached';

    useEffect(() => {
        if (!isSettled || startedRef.current) return;

        if (canAdd) {
            startedRef.current = true;
            setStarted(true);
            void addCloud()
                .then(() => {
                    logger.info('CLOUD', 'cloud created');
                    toast({ title: t('addAccount.success') });
                })
                .catch(error => {
                    logger.error('CLOUD', 'cloud creation failed', { error });
                    toast({ title: t('addAccount.addFailed'), variant: 'destructive' });
                })
                .finally(closeAddCloud);
            return;
        }

        logger.warn('CLOUD', 'add cloud blocked by quota', { reason, limit });

        if (reason === 'notEntitled') {
            closeAddCloud();
            navigate(ROUTES.subscription.plans);
            return;
        }
        if (reason === 'limitReached') return;

        toast({ title: t('addAccount.subscriptionCanceled'), variant: 'destructive' });
        closeAddCloud();
    }, [isSettled, canAdd, reason, limit, addCloud, t, toast, closeAddCloud, navigate]);

    return (
        <AddCloudLimitDialog
            open={isLimitReached}
            limit={limit ?? 0}
            canChangePlan={hasHigherTier(currentPlan, catalogPlans)}
            onClose={closeAddCloud}
            onChangePlan={() => {
                closeAddCloud();
                navigate(ROUTES.subscription.plans);
            }}
            onManageSubscription={() => {
                closeAddCloud();
                navigate(ROUTES.subscription.root);
            }}
        />
    );
};

export const AddCloudFlowHost = () => {
    const isOpen = useAddCloudRequest(s => s.isOpen);
    return isOpen ? <AddCloudFlow /> : null;
};
