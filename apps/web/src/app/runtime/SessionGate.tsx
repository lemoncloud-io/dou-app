import type { ReactNode } from 'react';

import { LoadingFallback } from '@chatic/shared';
import { useInitWebCore, useSessionAuth, useTokenRefresh } from '@chatic/web-core';

/**
 * Session-readiness gate — the app's entry boundary (mirrors the testbed entry flow).
 *
 * Owns webCore init + token refresh and decides splash vs. app:
 * - Fast path: a cached profile lets the app render immediately while webCore.init()
 *   and token refresh continue in the background. If the session turns out expired,
 *   `isAuthenticated` flips to false and routing redirects to login.
 * - Otherwise it waits until webCore is ready and the session is either unauthenticated,
 *   has a profile, or token refresh has settled (succeeded/failed).
 */
export const SessionGate = ({ children }: { children: ReactNode }) => {
    const isWebCoreReady = useInitWebCore();
    const { isAuthenticated, activeProfile } = useSessionAuth();
    const { isInitialized: isTokenInitialized, initStatus } = useTokenRefresh(isWebCoreReady);

    const canRenderApp =
        (isWebCoreReady && (!isAuthenticated || !!activeProfile || (isTokenInitialized && initStatus === 'failed'))) ||
        !!activeProfile;

    if (!canRenderApp) {
        return <LoadingFallback />;
    }

    return <>{children}</>;
};
