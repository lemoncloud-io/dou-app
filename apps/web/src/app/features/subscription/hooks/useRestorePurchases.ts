import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime-react';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { asWebSubscriptionActive } from '../lib/webSubscriptionActive';
import { useSubscriptionIap } from './useSubscriptionIap';
import { useWebSubscriptionNotice } from './useWebSubscriptionNotice';

export interface RestorePurchases {
    restore: () => Promise<void>;
    isRestoring: boolean;
    canRestore: boolean;
    notice: ReactNode;
}

export const useRestorePurchases = (): RestorePurchases => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { restorePurchases } = useSubscriptionIap();
    const { isGuest } = runtime.session.useRuntimeProfile();
    const { show: showWebActive, notice } = useWebSubscriptionNotice();
    const [isRestoring, setIsRestoring] = useState(false);

    const restore = useCallback(async () => {
        if (isRestoring) return;
        setIsRestoring(true);
        try {
            const count = await restorePurchases();
            toast({
                title:
                    count > 0
                        ? t('mypage.subscription.restoreSuccess', { count })
                        : t('mypage.subscription.restoreEmpty'),
            });
        } catch (e) {
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
