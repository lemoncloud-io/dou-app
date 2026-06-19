import { useInitWebCore, useRelaySessionKeepAlive, useTokenRefresh, useDynamicDeviceId } from '@chatic/web-core';

export const SessionBackgroundRunner = () => {
    const isWebCoreReady = useInitWebCore();
    useRelaySessionKeepAlive(isWebCoreReady);
    useTokenRefresh(isWebCoreReady);
    useDynamicDeviceId();

    return null;
};
