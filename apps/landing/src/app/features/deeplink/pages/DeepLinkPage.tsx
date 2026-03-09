import { useTranslation } from 'react-i18next';

import { DeepLinkUI, DeepLinkDialog } from '../components';
import { useDeviceDetect, useDeepLinkInfo, useAppLauncher, useWebRedirect } from '../hooks';

/**
 * Deep link landing page component.
 *
 * Flow:
 * - Desktop: Show desktop UI (dark theme with mobile access instructions)
 * - Mobile: Show landing page with "앱 열기" and "웹으로 보기" buttons
 *   - "앱 열기" → confirm dialog → launch app
 *   - App not installed → store confirm dialog → go to store
 *   - "웹으로 보기" → redirect to web app
 */
export const DeepLinkPage = (): JSX.Element => {
    const { t } = useTranslation();
    const deviceType = useDeviceDetect();
    const deepLinkInfo = useDeepLinkInfo();

    const { state, dialogType, showAppConfirmDialog, confirmLaunchApp, confirmGoToStore, closeDialog } = useAppLauncher(
        { deviceType, deepLinkInfo }
    );

    // Web redirect hook - manual trigger only (no auto-redirect)
    const { redirect: continueInBrowser, loading: webLoading } = useWebRedirect(deepLinkInfo, false);

    // Determine effective state (loading states override)
    const effectiveState = webLoading ? 'web-redirecting' : state;

    return (
        <>
            <DeepLinkUI
                state={effectiveState}
                onLaunchApp={showAppConfirmDialog}
                onContinueBrowser={continueInBrowser}
            />

            {/* App confirmation dialog */}
            {dialogType === 'app-confirm' && (
                <DeepLinkDialog
                    title={t('deeplink.dialog.appConfirm.title')}
                    cancelText={t('deeplink.dialog.cancel')}
                    confirmText={t('deeplink.dialog.confirm')}
                    onCancel={closeDialog}
                    onConfirm={confirmLaunchApp}
                />
            )}

            {/* Store confirmation dialog */}
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
