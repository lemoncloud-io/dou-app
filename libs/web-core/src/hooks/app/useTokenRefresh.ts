import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';

import { reportError } from '../../api';
import type { ErrorClassification } from '../../transport/error';
import { classifyError, toError } from '../../transport/error';
import { refreshActiveCloudSession, refreshRelaySession } from '../../session';
import { useSessionAuth, useSessionLogout } from '../session';

type InitializationStatus = 'pending' | 'success' | 'failed';

const REFRESH_INTERVAL = 1000 * 60;
const MIN_REFRESH_GAP = 5000;

const isInviteFlow = (): boolean => {
    const params = new URLSearchParams(window.location.search);
    return params.get('provider') === 'invite';
};

export interface UseTokenRefreshOptions {
    /**
     * When true, skip the periodic refresh `setInterval` (the SDK AuthController owns socket-token
     * refresh in AuthController-active apps; a parallel HTTP refresh would rotate the auth model and
     * break the socket auth session). AuthController-less apps (admin, desktop-web) leave this off.
     * (app-runtime auth docs §6-4 / §2-4)
     */
    skipPeriodicRefresh?: boolean;
    /**
     * When true, ALSO skip the one-shot boot `initialize()` HTTP refresh. The SDK AuthController is
     * the SOLE relay-token refresher, so a boot HTTP refresh here would race the socket refresh on the
     * shared device-keyed auth model and 403 → spurious logout (multi-socket-design.md §6-12). Boot
     * still marks itself initialized; token freshness comes from the socket refresh writeback, profile
     * + site/channel hydrate over the socket (useBackgroundSync), and hard-expiry logout moves to the
     * SDK `expired` → `onAuthExpired('relay')` path. AuthController-less apps leave this off (they need
     * the boot HTTP refresh to hydrate). Implies the periodic refresh is also off.
     */
    skipInitialRefresh?: boolean;
}

/**
 * Maintains relay token validity for an initialized app runtime and recovers profile state when possible.
 */
export const useTokenRefresh = (webCoreReady: boolean, options: UseTokenRefreshOptions = {}) => {
    const { skipPeriodicRefresh = false, skipInitialRefresh = false } = options;
    const { isAuthenticated } = useSessionAuth();
    const logout = useSessionLogout();

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isRefreshingRef = useRef(false);
    const lastRefreshTime = useRef(0);
    const isInitializedRef = useRef(false);
    const hasFailedRef = useRef(false);
    const networkRetryRef = useRef(0);
    const [initStatus, setInitStatus] = useState<InitializationStatus>('pending');
    const wasInviteFlowRef = useRef(isInviteFlow());

    const refreshToken = useCallback(async (): Promise<boolean> => {
        const now = Date.now();
        const isDuplicated = now - lastRefreshTime.current < MIN_REFRESH_GAP || isRefreshingRef.current;
        if (isDuplicated) {
            return true;
        }

        isRefreshingRef.current = true;
        lastRefreshTime.current = now;

        // Cloud refresh runs in parallel with relay. It is cloudToken-based and, even on failure,
        // never triggers logout — relay stays the continuity baseline (independent failure).
        void refreshActiveCloudSession().catch(error =>
            logger.error('AUTH', '[tokenRefresh] cloud refresh failed (keeping relay)', { error })
        );

        try {
            // Refresh the relay token AND hydrate the profile from the same response (no profile GET).
            await refreshRelaySession({ syncProfile: true });
            return true;
        } catch (error) {
            logger.error('AUTH', 'Token refresh failed', { error });
            reportError(toError(error));
            const errorClassification: ErrorClassification = classifyError(error);
            if (errorClassification.shouldLogout) {
                logger.info('AUTH', 'Token completely expired or invalid - logging out');
                // Preserve the URL when the CURRENT navigation is an invite deep-link (URL-based, via
                // wasInviteFlowRef) so the invite params survive the logout redirect.
                await logout(wasInviteFlowRef.current ? { preserveUrl: true } : undefined);
                return false;
            }
            logger.info('AUTH', 'Temporary refresh failure, will retry later');
            return true;
        } finally {
            isRefreshingRef.current = false;
        }
    }, [logout]);

    const startInterval = useCallback(() => {
        // AuthController-active apps skip the recurring refresh (SDK owns socket-token refresh);
        // the one-shot boot initialize() still ran before this is called.
        if (skipPeriodicRefresh) {
            return;
        }
        if (intervalRef.current) {
            return;
        }

        logger.info('AUTH', 'Starting token refresh interval', { interval: REFRESH_INTERVAL });
        intervalRef.current = setInterval(refreshToken, REFRESH_INTERVAL);
    }, [refreshToken, skipPeriodicRefresh]);

    const stopInterval = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            logger.info('AUTH', 'Stopped token refresh interval');
        }
    }, []);

    const initialize = useCallback(async () => {
        if (!isAuthenticated || !webCoreReady || isInitializedRef.current || hasFailedRef.current) {
            logger.info('AUTH', '[tokenRefresh] initialize skipped', {
                data: {
                    isAuthenticated,
                    webCoreReady,
                    isInitialized: isInitializedRef.current,
                    hasFailed: hasFailedRef.current,
                },
            });
            return;
        }

        // SDK-AuthController apps own relay refresh on the socket, so they skip the boot HTTP refresh
        // entirely: it would race the socket refresh on the shared device auth model and 403 → spurious
        // logout (§6-12). Token freshness comes from the socket refresh writeback, profile + site/channel
        // hydrate over the socket, and hard-expiry logout is owned by the SDK `expired` → onAuthExpired.
        if (skipInitialRefresh) {
            logger.info('AUTH', '[tokenRefresh] boot refresh skipped (SDK owns relay refresh)');
            isInitializedRef.current = true;
            networkRetryRef.current = 0;
            setInitStatus('success');
            return;
        }

        logger.info('AUTH', '[tokenRefresh] Initializing: refreshing token + profile');
        // A single relay refresh refreshes the token AND hydrates the profile from the same
        // response (no separate profile GET). refreshToken() classifies errors and performs
        // hard-expiry logout internally, returning false only when the session is unrecoverable.
        const refreshSuccess = await refreshToken();
        if (!refreshSuccess) {
            logger.warn('AUTH', '[tokenRefresh] token refresh failed, marking as failed');
            hasFailedRef.current = true;
            setInitStatus('failed');
            return;
        }

        isInitializedRef.current = true;
        networkRetryRef.current = 0;
        setInitStatus('success');
    }, [isAuthenticated, webCoreReady, refreshToken, skipInitialRefresh]);

    useEffect(() => {
        if (isAuthenticated && webCoreReady) {
            initialize().then(() => {
                if (isInitializedRef.current) {
                    startInterval();
                }
            });
        } else {
            stopInterval();
            isInitializedRef.current = false;
            hasFailedRef.current = false;
            networkRetryRef.current = 0;
            setInitStatus('pending');
        }

        return stopInterval;
    }, [isAuthenticated, initialize, startInterval, stopInterval, webCoreReady]);

    useEffect(() => {
        if (initStatus !== 'failed' || !isAuthenticated || !webCoreReady) return;

        const handleVisibility = () => {
            if (document.visibilityState !== 'visible') return;
            logger.info('AUTH', 'App resumed with failed init state, retrying');
            hasFailedRef.current = false;
            networkRetryRef.current = 0;
            setInitStatus('pending');
            initialize().then(() => {
                if (isInitializedRef.current) {
                    startInterval();
                }
            });
        };

        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [initStatus, isAuthenticated, webCoreReady, initialize, startInterval]);

    const isInitialized = initStatus === 'success' || initStatus === 'failed';

    return {
        refreshToken,
        isRefreshing: isRefreshingRef.current,
        isInitialized,
        initStatus,
    };
};
