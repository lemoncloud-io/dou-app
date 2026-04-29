import type { ErrorInfo } from 'react';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster as SonnerToaster } from 'sonner';

import { ErrorFallback, GlobalLoader, LoadingFallback, useVersionCheck, VersionUpdateBanner } from '@chatic/shared';
import { ThemeProvider } from '@chatic/theme';
import { Toaster } from '@chatic/ui-kit/components/ui/toaster';
import { reportError, useInitWebCore, useTokenRefresh, useWebCoreStore, useSplashStore } from '@chatic/web-core';

import { initializeMessageListener } from '@chatic/app-messages';

import { ServiceUnavailableOverlay, SplashOverlay, WebSocketV2Connection } from './components';
import { Router } from './routes';
import { DeviceTokenRegistration } from './shared/hooks/useDeviceTokenRegistration';
import { useAutoSelectCloud } from './shared/hooks/useCloudSession';
import { useForegroundTokenRefresh } from './shared/hooks/useForegroundTokenRefresh';
import { useForegroundResync } from './shared/hooks/useForegroundResync';
import i18n from '../i18n';
import { useDataSync } from '@chatic/data';

if (typeof window !== 'undefined') {
    window.addEventListener('error', event => {
        reportError(event.error ?? new Error(event.message));
    });
    window.addEventListener('unhandledrejection', event => {
        const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
        reportError(error);
    });
}

const queryCache = new QueryCache({
    onError: (error: Error): void => {
        reportError(error);
    },
});

const mutationCache = new MutationCache({
    onError: (error: Error): void => {
        reportError(error);
    },
});

const queryClient = new QueryClient({
    queryCache,
    mutationCache,
    defaultOptions: {
        queries: {
            staleTime: Infinity,
            retry: 1,
        },
    },
});

const AutoSelectCloud = () => {
    useAutoSelectCloud();
    return null;
};

const ForegroundTokenRefresh = ({ refreshToken }: { refreshToken: () => Promise<boolean> }) => {
    useForegroundTokenRefresh(refreshToken);
    return null;
};

export function App() {
    const isWebCoreReady = useInitWebCore();
    const { isAuthenticated, profile } = useWebCoreStore();
    const { isInitialized: isTokenInitialized, initStatus, refreshToken } = useTokenRefresh(isWebCoreReady);
    // Render immediately whenever we have something to show:
    // - Unauthenticated users: public routes
    // - Mobile WebView bootstrap cache: explicit opt-in
    // - Cached profile in localStorage: render app, let token refresh / profile
    //   fetch run in the background (do NOT block UI on network work)
    // - Token init explicitly failed: avoid infinite loading (logout path handles the rest)
    const canRenderApp =
        isWebCoreReady && (!isAuthenticated || !!profile || (isTokenInitialized && initStatus === 'failed'));
    const { hasUpdate, currentVersion, latestVersion, dismissUpdate } = useVersionCheck();

    // 세션 내 스플래시가 이미 표시된 경우 즉시 렌더링 (1.5s 딜레이 스킵)
    const { isShown: splashAlreadyShown } = useSplashStore();
    const [isSplashReady, setIsSplashReady] = useState(splashAlreadyShown);
    useEffect(() => {
        if (!canRenderApp || splashAlreadyShown) return;
        const timer = setTimeout(() => setIsSplashReady(true), 1500);
        return () => clearTimeout(timer);
    }, [canRenderApp]);

    useDataSync();
    useForegroundResync(refreshToken);

    useEffect(() => {
        const cleanup = initializeMessageListener();
        return () => {
            cleanup?.();
        };
    }, []);

    const handleError = useCallback((error: Error, info: ErrorInfo): void => {
        console.error('Application Error:', error, info);
        reportError(error, { componentStack: info.componentStack ?? undefined });
    }, []);

    return (
        <>
            <SplashOverlay isAppReady={isSplashReady} />
            {canRenderApp && (
                <I18nextProvider i18n={i18n}>
                    <VersionUpdateBanner
                        isVisible={hasUpdate}
                        currentVersion={currentVersion}
                        latestVersion={latestVersion}
                        onDismiss={dismissUpdate}
                    />
                    <Suspense fallback={<LoadingFallback />}>
                        <ErrorBoundary FallbackComponent={ErrorFallback} onError={handleError}>
                            <HelmetProvider>
                                <QueryClientProvider client={queryClient}>
                                    <ThemeProvider>
                                        <AutoSelectCloud />
                                        <ForegroundTokenRefresh refreshToken={refreshToken} />
                                        {isAuthenticated && <WebSocketV2Connection />}
                                        <ServiceUnavailableOverlay />
                                        <DeviceTokenRegistration />
                                        <Router />
                                        <GlobalLoader />
                                        <SonnerToaster />
                                        <Toaster />
                                    </ThemeProvider>
                                    {/*{process.env.NODE_ENV !== 'prod' && <ReactQueryDevtools buttonPosition="bottom-left" />}*/}
                                </QueryClientProvider>
                            </HelmetProvider>
                        </ErrorBoundary>
                    </Suspense>
                </I18nextProvider>
            )}
        </>
    );
}

export default App;
