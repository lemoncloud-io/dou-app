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

/**
 * Runs the "add a cloud" flow on behalf of whoever asked for it.
 *
 * The affordances live on home and on cloud management, the flow belongs to subscription, and
 * features do not import each other — so the request arrives through
 * `useAddCloudRequest` and the router mounts this inside the private shell (the flow navigates, so
 * it needs router context).
 *
 * With a membership that still has room, adding a cloud is not a purchase: the request goes straight
 * to the server. No email is asked for on the way — a cloud's recovery email is registered, or left
 * out, from cloud management only. Without room it IS a purchase, and that belongs on the
 * subscription guide screen rather than in a second plan picker — home was asked not to detour
 * through a pitch, and the pitch now lives on the purchase screen itself, so going straight there
 * satisfies both.
 *
 * A used-up allowance opens `AddCloudLimitDialog` instead of a toast: the dialog can offer the plan
 * picker, and the top tier gets told it is the top tier — and sent to the subscription list, MyPage's
 * own entry to it — rather than offered a change that would be refused.
 */
const AddCloudFlow = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const closeAddCloud = useAddCloudRequest(s => s.closeAddCloud);
    const { canAdd, reason, limit, isLoading, isFetching } = useCloudQuota();
    const { currentPlan, catalogPlans } = usePlanCatalog();
    const addCloud = useAddCloud();
    // Set once `make` is asked for. `make` invalidates the very queries the quota reads, so the
    // verdict re-resolves mid-request — usually to "full" now that this cloud counts — and acting on
    // it again would either ask for a second cloud or flash the limit dialog over a success. The ref
    // is the guard, set in the same tick as the request: state alone is still `false` if the effect
    // runs again before the next render, which StrictMode does to every mount in dev. The state is
    // only for rendering.
    const startedRef = useRef(false);
    const [started, setStarted] = useState(false);

    // The verdict is judged on fresh data only. Mounting this flow re-reads the clouds and the
    // membership, and the cache it answers from meanwhile may be out of date — another device may have
    // used the last slot — which would turn a limit dialog into a failed `make`.
    const isSettled = !isLoading && !isFetching;
    const isLimitReached = !started && isSettled && !canAdd && reason === 'limitReached';

    useEffect(() => {
        // Wait for the verdict; acting on half-loaded or stale inputs would show the wrong reason.
        if (!isSettled || startedRef.current) return;

        if (canAdd) {
            startedRef.current = true;
            setStarted(true);
            // `make` only returns once the cloud model exists (`status=init`) — workspace assignment
            // and deploy happen afterward, asynchronously, with no committed SLA. The success toast
            // reflects that a request was accepted, not that the cloud is ready; the switcher
            // (`CloudSessionSheet`) already shows the provisioning state and its own "ready" toast
            // once `active` lands.
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
        // The allowance case stays open: the dialog below carries it.
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

/** Mounted once inside the private router. Renders nothing — and runs no queries — until asked. */
export const AddCloudFlowHost = () => {
    const isOpen = useAddCloudRequest(s => s.isOpen);
    return isOpen ? <AddCloudFlow /> : null;
};
