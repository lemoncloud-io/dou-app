import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { DeepLinkUI, DeepLinkDialog } from '../components';
import { useDeviceDetect } from '../../../hooks';
import { useDeepLinkInfo, useAppLauncher, useWebRedirect } from '../hooks';
import { APP_MISSING_HASH, isInviteLink, shouldAutoLaunch } from '../utils';

interface DeepLinkPageProps {
    appOnly?: boolean;
}

export const DeepLinkPage = ({ appOnly = false }: DeepLinkPageProps): JSX.Element => {
    const { t } = useTranslation();
    const deviceType = useDeviceDetect();
    const deepLinkInfo = useDeepLinkInfo();

    const autoLaunch =
        (appOnly || isInviteLink(deepLinkInfo.deepLinkUrl)) &&
        shouldAutoLaunch(deviceType, navigator.userAgent) &&
        window.location.hash !== APP_MISSING_HASH;

    const { state, dialogType, showAppConfirmDialog, confirmLaunchApp, confirmGoToStore, closeDialog } = useAppLauncher(
        { deviceType, deepLinkInfo, autoLaunch }
    );

    const { redirect: continueInBrowser, loading: webLoading } = useWebRedirect(deepLinkInfo, false);

    const effectiveState = webLoading ? 'web-redirecting' : state;

    return (
        <>
            <DeepLinkUI
                state={effectiveState}
                onLaunchApp={showAppConfirmDialog}
                onContinueBrowser={appOnly ? undefined : continueInBrowser}
            />

            {dialogType === 'app-confirm' && (
                <DeepLinkDialog
                    title={t('deeplink.dialog.appConfirm.title')}
                    cancelText={t('deeplink.dialog.cancel')}
                    confirmText={t('deeplink.dialog.confirm')}
                    onCancel={closeDialog}
                    onConfirm={confirmLaunchApp}
                />
            )}

            {dialogType === 'store-confirm' && (
                <DeepLinkDialog
                    title={t('deeplink.dialog.storeConfirm.title')}
                    subtitle={t('deeplink.dialog.storeConfirm.subtitle')}
                    cancelText={t('deeplink.dialog.cancel')}
                    confirmText={t('deeplink.dialog.confirm')}
                    onCancel={closeDialog}
                    onConfirm={confirmGoToStore}
                />
            )}
        </>
    );
};
