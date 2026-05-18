import type { ErrorInfo } from 'react';
import { Suspense, useCallback, useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster as SonnerToaster } from 'sonner';

import { ErrorFallback, GlobalLoader, LoadingFallback, useVersionCheck, VersionUpdateBanner } from '@chatic/shared';
import { ThemeProvider } from '@chatic/theme';
import { Toaster } from '@chatic/ui-kit/components/ui/toaster';
import { reportError, useInitWebCore, useTokenRefresh, useWebCoreStore } from '@chatic/web-core';

import { initializeMessageListener, logger } from '@chatic/app-messages';

import { ServiceUnavailableOverlay, WebSocketV2Connection } from './components';
import { GlobalChatSync } from './components/GlobalChatSync';
import { DataProvider } from './shared/data';
import { Router } from './routes';
import { DeviceTokenRegistration } from './shared/hooks/useDeviceTokenRegistration';

import { useForegroundTokenRefresh } from './shared/hooks/useForegroundTokenRefresh';
import { useForegroundResync } from './shared/hooks/useForegroundResync';
import i18n from '../i18n';

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

    useEffect(() => {
        logger.info('APP', '[canRenderApp]', {
            data: {
                isWebCoreReady,
                isAuthenticated,
                hasProfile: !!profile,
                isTokenInitialized,
                initStatus,
                canRenderApp,
            },
        });
    }, [isWebCoreReady, isAuthenticated, profile, isTokenInitialized, initStatus, canRenderApp]);
    const { hasUpdate, currentVersion, latestVersion, dismissUpdate } = useVersionCheck();

    useForegroundResync(refreshToken);

    useEffect(() => {
        const cleanup = initializeMessageListener();
        return () => {
            cleanup?.();
        };
    }, []);

    const handleError = useCallback((error: Error, info: ErrorInfo): void => {
        logger.error('APP', 'Application Error', { error, data: info });
        reportError(error, { componentStack: info.componentStack ?? undefined });
    }, []);

    return (
        <>
            {!canRenderApp && <LoadingFallback />}
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
                                        <DataProvider>
                                            <ForegroundTokenRefresh refreshToken={refreshToken} />
                                            {isAuthenticated && <WebSocketV2Connection />}
                                            {isAuthenticated && <GlobalChatSync />}
                                            <ServiceUnavailableOverlay />
                                            <DeviceTokenRegistration />
                                            <Router />
                                            <GlobalLoader />
                                            <SonnerToaster />
                                            <Toaster />
                                        </DataProvider>
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
