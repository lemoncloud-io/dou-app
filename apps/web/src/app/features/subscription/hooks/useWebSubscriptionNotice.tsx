import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertDialog } from '@chatic/web-ui-kit';

import { appBridge } from '../../../bridge';
import { WEB_SUBSCRIPTION_URL } from '../consts';

export interface WebSubscriptionNotice {
    /** Opens the notice. */
    show: () => void;
    /** The dialog itself — the caller renders it once, anywhere in its tree. */
    notice: ReactNode;
}

/**
 * "You already pay for a subscription on the website" — shown when the relay refuses a store receipt
 * (purchase or restore) because a website subscription is running. The store cannot change that
 * subscription, so the only useful action is going to where it is managed.
 *
 * A hook that hands back its own dialog because the refusal is reachable from the confirm screen and
 * from every restore button, and each of them would otherwise carry the same open-state and wording.
 */
export const useWebSubscriptionNotice = (): WebSubscriptionNotice => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    const show = useCallback(() => setOpen(true), []);

    const notice = useMemo(
        () => (
            <AlertDialog
                open={open}
                onOpenChange={setOpen}
                title={t('mypage.subscription.webActive.title')}
                description={t('mypage.subscription.webActive.description')}
                cancelLabel={t('common.cancel')}
                confirmLabel={t('mypage.subscription.webActive.manage')}
                // Inside the app the website is opened by the native shell, the same way the policy
                // pages are; replacing the webview's own page would drop the user's place.
                onConfirm={() => appBridge.openURL(WEB_SUBSCRIPTION_URL.list)}
            />
        ),
        [open, t]
    );

    return { show, notice };
};
