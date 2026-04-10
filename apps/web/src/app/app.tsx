import { Suspense, useCallback, useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster as SonnerToaster } from 'sonner';

import { ErrorFallback, GlobalLoader, LoadingFallback, useVersionCheck, VersionUpdateBanner } from '@chatic/shared';
import { ThemeProvider } from '@chatic/theme';
import { Toaster } from '@chatic/ui-kit/components/ui/toaster';
import { reportError, useInitWebCore, useTokenRefresh, useWebCoreStore } from '@chatic/web-core';
import { initializeMessageListener } from '@chatic/app-messages';

import { ServiceUnavailableOverlay, WebSocketV2Connection } from './components';
import { Router } from './routes';
import { DeviceTokenRegistration } from './shared/hooks/useDeviceTokenRegistration';
import { useAutoSelectCloud } from './shared/hooks/useCloudSession';
import { useForegroundTokenRefresh } from './shared/hooks/useForegroundTokenRefresh';
import i18n from '../i18n';
import { useGlobalSocketRouter } from './shared/data/sync';

import type { ErrorInfo } from 'react';

const mutationCache = new MutationCache({
    onError: (error: Error): void => {
        const userId = useWebCoreStore.getState().profile?.uid;
        reportError(error, {}, 'web', userId);
    },
});

const queryClient = new QueryClient({
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
    const canRenderApp =
        isWebCoreReady && (!isAuthenticated || (isTokenInitialized && (!!profile || initStatus === 'failed')));
    const { hasUpdate, currentVersion, latestVersion, dismissUpdate } = useVersionCheck();

    useGlobalSocketRouter();

    useEffect(() => {
        const cleanup = initializeMessageListener();
        return () => {
            cleanup?.();
        };
    }, []);

    const handleError = useCallback(
        (error: Error, info: ErrorInfo): void => {
            console.error('Application Error:', error, info);
            reportError(error, { componentStack: info.componentStack ?? undefined }, 'web', profile?.uid);
        },
        [profile?.uid]
    );

    if (!canRenderApp) {
        return <LoadingFallback />;
    }

    return (
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
    );
}

export default App;
