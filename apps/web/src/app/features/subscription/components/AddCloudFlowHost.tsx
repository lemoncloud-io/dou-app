import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { reportError } from '@chatic/web-core';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useAddCloudRequest } from '../../../stores/useAddCloudRequest';
import { EmailVerifyDialog } from './EmailVerifyDialog';
import { toError } from '../../../utils/errors';
import { useAddCloud, useCloudEmailGuard, useCloudQuota } from '../hooks';
import { SubscriptionSelectDialog } from './SubscriptionSelectDialog';

/**
 * Runs the "add a cloud" flow on behalf of whoever asked for it.
 *
 * The affordances live on home, the flow belongs to subscription, and features do not import each
 * other (ADR-0046 §3) — so the request arrives through `useAddCloudRequest` and the runtime mounts
 * this inside the router (the flow navigates for guests, so it needs router context).
 *
 * Which flow depends on the membership: without one, adding a cloud IS subscribing, so the plan
 * picker opens. With one that still has room, no purchase is involved — verify an address and ask
 * the server for the cloud.
 */
const AddCloudFlow = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const closeAddCloud = useAddCloudRequest(s => s.closeAddCloud);
    const { canAdd, reason, limit, isLoading } = useCloudQuota();
    const verifyEmail = useCloudEmailGuard();
    const addCloud = useAddCloud();

    const isSubscribing = reason === 'notEntitled';

    useEffect(() => {
        // Wait for the verdict; refusing on half-loaded inputs would show the wrong reason.
        if (isLoading || canAdd || isSubscribing) return;
        toast({
            title:
                reason === 'limitReached'
                    ? t('addAccount.limitExceeded', { max: limit ?? 0 })
                    : t('addAccount.cancelScheduled'),
            variant: 'destructive',
        });
        closeAddCloud();
    }, [isLoading, canAdd, isSubscribing, reason, limit, t, toast, closeAddCloud]);

    const handleVerified = async (email: string) => {
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

    if (isSubscribing) {
        return (
            <SubscriptionSelectDialog
                open
                onOpenChange={open => !open && closeAddCloud()}
                onComplete={() => {
                    toast({
                        title: t('addAccount.success'),
                        description: t('mypage.subscription.purchaseSuccessDescription'),
                    });
                    closeAddCloud();
                }}
                onError={e => toast({ title: e.message, variant: 'destructive' })}
            />
        );
    }

    return (
        <EmailVerifyDialog
            open={canAdd}
            onOpenChange={open => !open && closeAddCloud()}
            onVerified={handleVerified}
            verifyEmail={verifyEmail}
        />
    );
};

/**
 * Mounted once inside the private router. Renders nothing — and runs no queries — until asked.
 */
export const AddCloudFlowHost = () => {
    const isOpen = useAddCloudRequest(s => s.isOpen);
    return isOpen ? <AddCloudFlow /> : null;
};
