import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime';
import { IconSpinner } from '@chatic/web-ui-kit';

import { useMembershipInfo } from '../../../hooks/useMembership';
import { WEB_SUBSCRIPTION_URL } from '../consts';
import { usePlanCatalog } from '../hooks';
import { canCheckoutOnWeb } from '../lib';

export const WebCheckoutHandoff = ({ children }: { children: ReactNode }) => {
    const { t } = useTranslation();
    const checkout = runtime.checkout;
    const { summary } = usePlanCatalog();
    const { data: membership, isSuccess, isError } = useMembershipInfo();
    const handOff = checkout.kind === 'web' && isSuccess && canCheckoutOnWeb(summary, membership?.platform);

    useEffect(() => {
        if (handOff && checkout.kind === 'web') checkout.open(WEB_SUBSCRIPTION_URL.plans, { replace: true });
    }, [handOff, checkout]);

    if (checkout.kind !== 'web' || isError || (isSuccess && !handOff)) return <>{children}</>;
    return (
        <div role="status" className="flex h-screen flex-col items-center justify-center gap-3">
            <IconSpinner className="size-6 animate-spin text-muted-foreground" />
            {handOff && (
                <span className="text-[15px] text-muted-foreground">{t('mypage.subscription.toWebCheckout')}</span>
            )}
        </div>
    );
};
