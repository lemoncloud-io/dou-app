import { Suspense, useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { LoadingFallback } from '@chatic/shared';
import { ThemeProvider } from '@chatic/theme';
import { Toaster } from '@chatic/ui-kit/components/ui/toaster';
import { useInitWebCore, useTokenRefresh, useWebCoreStore } from '@chatic/web-core';
import { DataProvider, GlobalChatSync, WebSocketV2Connection, useAutoSelectCloud } from '@chatic/app-runtime';

import i18n from '../i18n';
import { AppRouter } from './routes';
import { AppShellSkeleton, ConnectionBanner, UpdateBanner } from './shared';
import {
    useCrossCloudPushBadge,
    useCrossCloudPushToast,
    useDesktopBadge,
    useDesktopNotifications,
    useDeviceTokenRegistration,
    useMentionCapture,
    usePlaceUnreadCounts,
    useRetainLeavingCloudBadge,
    useSocketWedgeReload,
    useUnreadStore,
} from './shared';

/** Mounts desktop OS-notification wiring inside DataProvider (needs engine repositories). */
const DesktopNotifications = () => {
    useDesktopNotifications();
    // Cross-cloud push: register this device's FCM token with the broker.
    useDeviceTokenRegistration();
    // Cross-cloud push: in-app toast when focused (macOS hides OS banners then).
    useCrossCloudPushToast();
    // Cross-cloud push: mark the source cloud's rail tile until it's visited.
    useCrossCloudPushBadge();
    // Capture @me messages across all channels into the device-local Activity inbox.
    useMentionCapture();
    // Self-heal a socket left unverified after sleep/wake (cloud-token 400 loop)
    // by reloading the Electron renderer — automatic equivalent of a manual ctrl+r.
    useSocketWedgeReload();
    return null;
};

/**
 * Always-mounted unread sync: runs the per-place unread aggregation once and
 * publishes it to useUnreadStore, then mirrors the total onto the OS badge and
 * the window title. Lives here (not in HomePage) so the badge/title keep
 * updating on /profile and /settings where HomePage is unmounted.
 */
const ShellUnreadSync = () => {
    const byPlace = usePlaceUnreadCounts();
    const setByPlace = useUnreadStore(s => s.setByPlace);
    useEffect(() => {
        setByPlace(byPlace);
    }, [byPlace, setByPlace]);

    const total = Object.values(byPlace).reduce((sum, n) => sum + n, 0);
    // Keep a cloud's rail dot when switching away from it with unread still pending.
    useRetainLeavingCloudBadge(total);
    useDesktopBadge(total);
    useEffect(() => {
        document.title = total > 0 ? `(${total > 99 ? '99+' : total}) DoU` : 'DoU';
    }, [total]);

    return null;
};

/** Bootstraps cloud selection for multi-cloud users (issues token for the active cloud). */
const CloudBootstrap = () => {
    useAutoSelectCloud();
    return null;
};

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: Infinity,
            retry: 1,
        },
    },
});

export function App() {
    const isWebCoreReady = useInitWebCore();
    const { isAuthenticated, profile } = useWebCoreStore();
    const { isInitialized: isTokenInitialized, initStatus } = useTokenRefresh(isWebCoreReady);

    // Fast path mirrors apps/web: render once webCore is ready and either the
    // session is unauthenticated, a cached profile exists, or refresh resolved.
    const canRenderApp =
        (isWebCoreReady && (!isAuthenticated || !!profile || (isTokenInitialized && initStatus === 'failed'))) ||
        !!profile;

    // Authenticated boots land on the chat shell, so show the shell skeleton (not a
    // bare spinner) for better perceived performance; pre-auth keeps the plain loader.
    const BootFallback = isAuthenticated ? <AppShellSkeleton /> : <LoadingFallback />;

    if (!canRenderApp) {
        return BootFallback;
    }

    return (
        <I18nextProvider i18n={i18n}>
            <Suspense fallback={BootFallback}>
                <QueryClientProvider client={queryClient}>
                    <ThemeProvider>
                        <DataProvider>
                            {isAuthenticated && isWebCoreReady && <WebSocketV2Connection />}
                            {isAuthenticated && isWebCoreReady && <GlobalChatSync />}
                            {isAuthenticated && isWebCoreReady && <CloudBootstrap />}
                            {isAuthenticated && isWebCoreReady && <DesktopNotifications />}
                            {isAuthenticated && isWebCoreReady && <ShellUnreadSync />}
                            {isAuthenticated && isWebCoreReady && <ConnectionBanner />}
                            {/* Desktop auto-update banner — always mounted (no-op in browser). */}
                            <UpdateBanner />
                            <AppRouter />
                            <Toaster />
                        </DataProvider>
                    </ThemeProvider>
                </QueryClientProvider>
            </Suspense>
        </I18nextProvider>
    );
}

export default App;
