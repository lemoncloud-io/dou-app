import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { reportError } from '@chatic/web-core';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { ROUTES } from '../../../routes/paths';
import { useAddCloudRequest } from '../../../stores/useAddCloudRequest';
import { toError } from '../../../utils/errors';
import { useAddCloud, useCloudEmailGuard, useCloudQuota } from '../hooks';
import { EmailVerifyDialog } from './EmailVerifyDialog';

/**
 * Runs the "add a cloud" flow on behalf of whoever asked for it.
 *
 * The affordances live on home, the flow belongs to subscription, and features do not import each
 * other (ADR-0046 §3) — so the request arrives through `useAddCloudRequest` and the router mounts
 * this inside the private shell (the flow navigates, so it needs router context).
 *
 * With a membership that still has room, adding a cloud is not a purchase: verify an address and
 * ask the server for it. Without one it IS a purchase, and that belongs on the 구독 안내 screen
 * rather than in a second plan picker — ADR-0034 asked home not to detour through a pitch, and the
 * pitch now lives on the purchase screen itself, so going straight there satisfies both.
 */
const AddCloudFlow = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const closeAddCloud = useAddCloudRequest(s => s.closeAddCloud);
    const { canAdd, reason, limit, isLoading } = useCloudQuota();
    const verifyEmail = useCloudEmailGuard();
    const addCloud = useAddCloud();

    useEffect(() => {
        // Wait for the verdict; acting on half-loaded inputs would show the wrong reason.
        if (isLoading || canAdd) return;

        if (reason === 'notEntitled') {
            closeAddCloud();
            navigate(ROUTES.subscription.plans);
            return;
        }

        toast({
            title:
                reason === 'limitReached'
                    ? t('addAccount.limitExceeded', { max: limit ?? 0 })
                    : t('addAccount.cancelScheduled'),
            variant: 'destructive',
        });
        closeAddCloud();
    }, [isLoading, canAdd, reason, limit, t, toast, closeAddCloud, navigate]);

    // `make` only returns once the cloud model exists (`status=init`) — workspace assignment and
    // deploy happen afterward, asynchronously, with no committed SLA. The success toast reflects
    // that a request was accepted, not that the cloud is ready; the switcher (`CloudSessionSheet`)
    // already shows the provisioning state and its own "ready" toast once `active` lands.
    const finish = async (email?: string) => {
        try {
            await addCloud(email);
            toast({ title: t('addAccount.success') });
        } catch (e) {
            reportError(toError(e));
            toast({ title: t('addAccount.addFailed'), variant: 'destructive' });
        } finally {
            closeAddCloud();
        }
    };

    return (
        <EmailVerifyDialog
            open={canAdd}
            onOpenChange={open => !open && closeAddCloud()}
            onVerified={email => void finish(email)}
            onSkip={() => void finish()}
            verifyEmail={verifyEmail}
        />
    );
};

/** Mounted once inside the private router. Renders nothing — and runs no queries — until asked. */
export const AddCloudFlowHost = () => {
    const isOpen = useAddCloudRequest(s => s.isOpen);
    return isOpen ? <AddCloudFlow /> : null;
};
