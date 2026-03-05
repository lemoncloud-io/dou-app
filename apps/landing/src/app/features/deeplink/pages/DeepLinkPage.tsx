import { DeepLinkUI } from '../components';
import { useDeviceDetect, useDeepLinkInfo, useAppLauncher } from '../hooks';

export const DeepLinkPage = (): JSX.Element => {
    const deviceType = useDeviceDetect();
    const deepLinkInfo = useDeepLinkInfo();
    const { state, launchApp } = useAppLauncher({ deviceType, deepLinkInfo });

    return <DeepLinkUI state={state} deviceType={deviceType} onLaunchApp={launchApp} />;
};
