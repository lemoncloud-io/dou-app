import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { ROUTES } from '../../../routes/paths';
import { useAddCloudRequest } from '../../../stores/useAddCloudRequest';
import { useAddCloud, useCloudEmailGuard, useCloudQuota, usePlanCatalog } from '../hooks';
import { hasHigherTier } from '../lib';
import { AddCloudLimitDialog } from './AddCloudLimitDialog';
import { EmailVerifyDialog } from './EmailVerifyDialog';

/**
 * Runs the "add a cloud" flow on behalf of whoever asked for it.
 *
 * The affordances live on home and on cloud management, the flow belongs to subscription, and
 * features do not import each other — so the request arrives through
 * `useAddCloudRequest` and the router mounts this inside the private shell (the flow navigates, so
 * it needs router context).
 *
 * With a membership that still has room, adding a cloud is not a purchase: verify an address and
 * ask the server for it. Without one it IS a purchase, and that belongs on the subscription guide
 * screen rather than in a second plan picker — home was asked not to detour through a pitch, and the
 * pitch now lives on the purchase screen itself, so going straight there satisfies both.
 *
 * A used-up allowance opens `AddCloudLimitDialog` instead of a toast: the dialog can offer the plan
 * picker, and the top tier gets told it is the top tier rather than offered a change that would be
 * refused.
 */
const AddCloudFlow = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const closeAddCloud = useAddCloudRequest(s => s.closeAddCloud);
    const { canAdd, reason, limit, isLoading } = useCloudQuota();
    const { currentPlan, sellablePlans } = usePlanCatalog();
    const verifyEmail = useCloudEmailGuard();
    const addCloud = useAddCloud();

    const isLimitReached = !isLoading && !canAdd && reason === 'limitReached';

    useEffect(() => {
        // Wait for the verdict; acting on half-loaded inputs would show the wrong reason.
        if (isLoading || canAdd) return;

        logger.warn('CLOUD', 'add cloud blocked by quota', { reason, limit });

        if (reason === 'notEntitled') {
            closeAddCloud();
            navigate(ROUTES.subscription.plans);
            return;
        }
        // The allowance case stays open: the dialog below carries it.
        if (reason === 'limitReached') return;

        toast({ title: t('addAccount.cancelScheduled'), variant: 'destructive' });
        closeAddCloud();
    }, [isLoading, canAdd, reason, limit, t, toast, closeAddCloud, navigate]);

    // `make` only returns once the cloud model exists (`status=init`) — workspace assignment and
    // deploy happen afterward, asynchronously, with no committed SLA. The success toast reflects
    // that a request was accepted, not that the cloud is ready; the switcher (`CloudSessionSheet`)
    // already shows the provisioning state and its own "ready" toast once `active` lands.
    const finish = async (email?: string) => {
        try {
            await addCloud(email);
            logger.info('CLOUD', 'cloud created', { withEmail: !!email });
            toast({ title: t('addAccount.success') });
        } catch (e) {
            logger.error('CLOUD', 'cloud creation failed', { error: e });
            toast({ title: t('addAccount.addFailed'), variant: 'destructive' });
        } finally {
            closeAddCloud();
        }
    };

    return (
        <>
            <EmailVerifyDialog
                open={canAdd}
                onOpenChange={open => !open && closeAddCloud()}
                onVerified={email => void finish(email)}
                onSkip={() => void finish()}
                verifyEmail={verifyEmail}
            />
            <AddCloudLimitDialog
                open={isLimitReached}
                limit={limit ?? 0}
                canChangePlan={hasHigherTier(currentPlan, sellablePlans)}
                onClose={closeAddCloud}
                onChangePlan={() => {
                    closeAddCloud();
                    navigate(ROUTES.subscription.plans);
                }}
            />
        </>
    );
};

/** Mounted once inside the private router. Renders nothing — and runs no queries — until asked. */
export const AddCloudFlowHost = () => {
    const isOpen = useAddCloudRequest(s => s.isOpen);
    return isOpen ? <AddCloudFlow /> : null;
};
