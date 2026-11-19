import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { asWebSubscriptionActive } from '../lib/webSubscriptionActive';
import { useSubscriptionIap } from './useSubscriptionIap';
import { useWebSubscriptionNotice } from './useWebSubscriptionNotice';

export interface RestorePurchases {
    /** Runs the restore and reports the outcome as a toast. Never throws. */
    restore: () => Promise<void>;
    /** Store round-trip in flight — disable the control rather than letting it re-enter. */
    isRestoring: boolean;
    /**
     * Whether a restore control should be rendered at all. Where this host sells through no store
     * there is none to ask, and
     * a guest has no account for a recovered receipt to attach to.
     */
    canRestore: boolean;
    /**
     * The "subscribed on the website" dialog, raised when the relay refuses the restored receipt.
     * The caller renders it once beside its restore control.
     */
    notice: ReactNode;
}

/**
 * "구매 복원" — the recovery path for a purchase the store already took but this account never got.
 *
 * A purchase is two steps that can come apart: the store charges, then we validate the receipt and
 * attach the membership. A crash, a dropped connection or a reinstall between those two leaves a paid
 * user with nothing to show for it, and `restorePurchases` is the only way back — it re-validates
 * every receipt the store still holds.
 *
 * Lives in a hook rather than on one screen because that failure is reachable from more than one
 * place: the subscription status screen (arrived later, wondering where the plan went) and the plan
 * picker's policy footer (just watched the purchase fail). Both need identical behaviour, and the
 * two copies had to stay in step — so there is one.
 */
export const useRestorePurchases = (): RestorePurchases => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { restorePurchases } = useSubscriptionIap();
    const { isGuest } = runtime.session.useRuntimeProfile();
    const { show: showWebActive, notice } = useWebSubscriptionNotice();
    const [isRestoring, setIsRestoring] = useState(false);

    const restore = useCallback(async () => {
        // Guard re-entry here rather than relying on every caller to disable its own control: a
        // second concurrent restore would re-validate the same receipts and double-count the toast.
        if (isRestoring) return;
        setIsRestoring(true);
        try {
            const count = await restorePurchases();
            // A count of 0 is a normal outcome, not a failure — the store simply holds nothing for
            // this account. Saying "restore failed" there would send the user hunting for a problem
            // that does not exist.
            toast({
                title:
                    count > 0
                        ? t('mypage.subscription.restoreSuccess', { count })
                        : t('mypage.subscription.restoreEmpty'),
            });
        } catch (e) {
            // A website subscription is running: nothing failed, the store just cannot be the one to
            // hold it. Say that instead of "restore failed".
            if (asWebSubscriptionActive(e)) {
                showWebActive();
                return;
            }
            logger.error('IAP', '[useRestorePurchases] restore failed', { error: e });
            toast({ title: t('mypage.subscription.restoreFailed'), variant: 'destructive' });
        } finally {
            setIsRestoring(false);
        }
    }, [isRestoring, restorePurchases, showWebActive, t, toast]);

    return { restore, isRestoring, canRestore: runtime.checkout.kind === 'store' && !isGuest, notice };
};
