import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { isNative } from '@chatic/bridges';
import { IconSpinner } from '@chatic/web-ui-kit';

import { useMembershipInfo } from '../../../hooks/useMembership';
import { WEB_SUBSCRIPTION_URL } from '../consts';
import { usePlanCatalog } from '../hooks';
import { canCheckoutOnWeb } from '../lib';
import { leaveForWeb } from './leaveForWeb';

/**
 * Stands in front of the screens that sell a tier (`plans`, `confirm`), and only outside the app.
 *
 * A browser has no store to sell through, so every way into those screens — MY, the guide, home's
 * banner and cloud switcher, the allowance dialog — goes on to the website's checkout instead. The one
 * reader who stays is someone a store is billing right now (`canCheckoutOnWeb`): the website cannot act
 * on that subscription, and the screen behind says where it can.
 *
 * Only a membership actually read decides. One that failed to load, or is waiting on a connection,
 * would read as "no subscription" and send a store subscriber to a website that refuses them, so the
 * screen behind is shown instead, as it was before the website sold anything.
 *
 * The entry is replaced, not pushed: back from the website returns to the screen that led here rather
 * than to this one, which would only send the reader out again.
 */
export const WebCheckoutHandoff = ({ children }: { children: ReactNode }) => {
    const { t } = useTranslation();
    const native = isNative();
    const { summary } = usePlanCatalog();
    const { data: membership, isSuccess, isError } = useMembershipInfo();
    const handOff = !native && isSuccess && canCheckoutOnWeb(summary, membership?.platform);

    useEffect(() => {
        if (handOff) leaveForWeb(WEB_SUBSCRIPTION_URL.plans, { replace: true });
    }, [handOff]);

    if (native || isError || (isSuccess && !handOff)) return <>{children}</>;
    return (
        <div role="status" className="flex h-screen flex-col items-center justify-center gap-3">
            <IconSpinner className="size-6 animate-spin text-muted-foreground" />
            {handOff && (
                <span className="text-[15px] text-muted-foreground">{t('mypage.subscription.toWebCheckout')}</span>
            )}
        </div>
    );
};
