import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertDialog } from '@chatic/web-ui-kit';

import { appBridge } from '../../../bridge';
import { WEB_SUBSCRIPTION_URL } from '../consts';

export interface WebSubscriptionNotice {
    show: () => void;
    notice: ReactNode;
}

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
                onConfirm={() => appBridge.openURL(WEB_SUBSCRIPTION_URL.list)}
            />
        ),
        [open, t]
    );

    return { show, notice };
};
