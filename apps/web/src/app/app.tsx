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

import { webBridge } from './shared/bridges';

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

    const minTimeElapsed = true;

    // Fast path: cached profile in localStorage → render app immediately.
    // webCore.init() and token refresh continue in the background.
    // If session turns out to be expired, isAuthenticated flips to false → redirect to login.
    const canRenderApp =
        (isWebCoreReady && (!isAuthenticated || !!profile || (isTokenInitialized && initStatus === 'failed'))) ||
        !!profile;
    const showSplash = !canRenderApp || !minTimeElapsed;

    const { hasUpdate, currentVersion, latestVersion, dismissUpdate } = useVersionCheck();

    useForegroundResync(refreshToken);

    useEffect(() => {
        const cleanup = initializeMessageListener();
        return () => {
            cleanup?.();
        };
    }, []);

    // React 마운트 완료 → 네이티브 APP LOADER 해제
    useEffect(() => {
        webBridge.post('WebAppReady');
    }, []);

    const handleError = useCallback((error: Error, info: ErrorInfo): void => {
        logger.error('APP', 'Application Error', { error, data: info });
        reportError(error, { componentStack: info.componentStack ?? undefined });
    }, []);

    return (
        <>
            {showSplash && <LoadingFallback />}
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
                                            {isAuthenticated && isWebCoreReady && <WebSocketV2Connection />}
                                            {isAuthenticated && isWebCoreReady && <GlobalChatSync />}
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
