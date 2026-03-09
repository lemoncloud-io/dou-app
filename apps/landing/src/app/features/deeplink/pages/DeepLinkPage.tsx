import { DeepLinkUI } from '../components';
import { useDeviceDetect, useDeepLinkInfo, useAppLauncher, useWebRedirect } from '../hooks';

export const DeepLinkPage = (): JSX.Element => {
    const deviceType = useDeviceDetect();
    const deepLinkInfo = useDeepLinkInfo();
    const { state, launchApp } = useAppLauncher({ deviceType, deepLinkInfo });

    // Web redirect for "Continue in browser" button (mobile only, not auto-triggered)
    const isMobile = deviceType === 'ios' || deviceType === 'android';
    const { redirect: continueInBrowser, loading: webLoading } = useWebRedirect(deepLinkInfo, false);

    // Show web-redirecting state when Continue in browser is clicked
    const effectiveState = webLoading ? 'web-redirecting' : state;

    return (
        <DeepLinkUI
            state={effectiveState}
            deviceType={deviceType}
            onLaunchApp={launchApp}
            onContinueBrowser={isMobile ? continueInBrowser : undefined}
        />
    );
};
