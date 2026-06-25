import { useInitWebCore, useRelaySessionKeepAlive, useTokenRefresh } from '@chatic/web-core';

export const SessionBackgroundRunner = () => {
    const isWebCoreReady = useInitWebCore();
    useRelaySessionKeepAlive(isWebCoreReady);
    useTokenRefresh(isWebCoreReady);

    return null;
};
