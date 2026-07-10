import { useInitWebCore, useRelaySessionKeepAlive, useTokenRefresh, useDynamicDeviceId } from '@chatic/web-core';

export const SessionBackgroundRunner = () => {
    const isWebCoreReady = useInitWebCore();
    useRelaySessionKeepAlive(isWebCoreReady);
    // The SDK AuthController owns socket-token refresh, so the periodic HTTP refresh must be OFF here
    // to avoid double-rotation (auth model churn → `no auth model @auth.refresh`). Boot init, profile
    // hydration, and hard-expiry logout stay ON. (multi-socket-design.md §6-4)
    useTokenRefresh(isWebCoreReady, { skipPeriodicRefresh: true });
    useDynamicDeviceId();

    return null;
};
