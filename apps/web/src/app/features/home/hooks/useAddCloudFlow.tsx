import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useQueryClient } from '@tanstack/react-query';

import { cloudsKeys, useCloudSessionCatalog } from '@chatic/web-core';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { SubscriptionSelectDialog } from '../components/SubscriptionSelectDialog';

/** Owned clouds allowed per account. Enforced server-side; mirrored here for the UX guard. */
const MAX_CLOUDS = 1;

export interface AddCloudFlowResult {
    /**
     * Entry point for every "add a cloud" affordance. Toasts the cap instead of opening the plan
     * picker when the account already owns one — the button stays visible either way, matching how
     * "＋ 플레이스 추가" behaves.
     */
    requestAddCloud: () => void;
    /** Render this once in the host tree; it holds the plan-picker dialog. */
    addCloudDialog: ReactNode;
}

/**
 * The subscribe-a-cloud flow (plan picker → email verify → IAP), shared by the relay home promo
 * banner and the cloud-switcher sheet.
 *
 * It returns a node rather than exposing raw open state so the cap guard, the success toast and the
 * catalog invalidation can only ever live here — the 1-cloud rule was previously inlined in the
 * sheet, and a second copy on home would be a rule waiting to drift.
 */
export const useAddCloudFlow = (): AddCloudFlowResult => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { clouds } = useCloudSessionCatalog();

    const [isOpen, setIsOpen] = useState(false);

    const requestAddCloud = useCallback(() => {
        if (clouds.length >= MAX_CLOUDS) {
            toast({ title: t('addAccount.limitExceeded'), variant: 'destructive' });
            return;
        }
        setIsOpen(true);
    }, [clouds.length, t, toast]);

    const addCloudDialog = (
        <SubscriptionSelectDialog
            open={isOpen}
            onOpenChange={setIsOpen}
            onComplete={() => {
                toast({
                    title: t('addAccount.success'),
                    description: t('mypage.subscription.purchaseSuccessDescription'),
                });
                queryClient.invalidateQueries({ queryKey: cloudsKeys.all });
            }}
            onError={e => toast({ title: e.message, variant: 'destructive' })}
        />
    );

    return { requestAddCloud, addCloudDialog };
};
