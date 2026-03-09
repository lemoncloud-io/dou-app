import { DeepLinkUI } from '../components';
import { useDeviceDetect, useDeepLinkInfo, useAppLauncher, useWebRedirect } from '../hooks';

export const DeepLinkPage = (): JSX.Element => {
    const deviceType = useDeviceDetect();
    const deepLinkInfo = useDeepLinkInfo();
    const { state, launchApp } = useAppLauncher({ deviceType, deepLinkInfo });

    // For desktop users, fetch from Firebase and redirect to web app
    const isDesktop = deviceType === 'desktop';
    const { loading: webLoading, error: webError } = useWebRedirect(deepLinkInfo, isDesktop);

    // Override state for desktop with web redirect states
    const effectiveState = isDesktop
        ? webLoading
            ? 'web-redirecting'
            : webError
              ? 'desktop' // Show desktop fallback on error
              : 'web-redirecting'
        : state;

    return <DeepLinkUI state={effectiveState} deviceType={deviceType} onLaunchApp={launchApp} webError={webError} />;
};
