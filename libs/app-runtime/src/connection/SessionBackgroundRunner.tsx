import { useInitWebCore, useRelaySessionKeepAlive, useTokenRefresh, useDynamicDeviceId } from '@chatic/web-core';

export const SessionBackgroundRunner = () => {
    const isWebCoreReady = useInitWebCore();
    useRelaySessionKeepAlive(isWebCoreReady);
    // The SDK AuthController owns relay-token refresh, so this hook does NO HTTP relay refresh (neither
    // the boot one-shot nor the periodic loop). A parallel HTTP refresh would race the socket refresh on
    // the shared device auth model → 403 → spurious logout (multi-socket-design.md §6-12). Token freshness
    // now comes from the socket refresh writeback; profile + site/channel hydrate over the socket
    // (useBackgroundSync); and hard-expiry logout is owned by the SDK `expired` → onAuthExpired('relay').
    useTokenRefresh(isWebCoreReady, { sdkOwnsRefresh: true });
    useDynamicDeviceId();

    return null;
};
