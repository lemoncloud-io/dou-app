import { Suspense, useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';

import { ErrorFallback, GlobalLoader, LoadingFallback } from '@chatic/shared';
import { ThemeProvider } from '@chatic/theme';
import { reportError, useInitWebCore, useTokenRefresh, useWebCoreStore } from '@chatic/web-core';

import { Router } from './routes';
import i18n from '../i18n';

import type { ErrorInfo } from 'react';

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

export function App() {
    const isWebCoreReady = useInitWebCore();
    const { isAuthenticated } = useWebCoreStore();
    const { isInitialized: isTokenInitialized } = useTokenRefresh(isWebCoreReady);
    const canRenderApp = isWebCoreReady && (!isAuthenticated || isTokenInitialized);

    const handleError = useCallback((error: Error, info: ErrorInfo): void => {
        console.error('Application Error:', error, info);
        reportError(error, { componentStack: info.componentStack ?? undefined });
    }, []);

    if (!canRenderApp) {
        return <LoadingFallback />;
    }

    return (
        <I18nextProvider i18n={i18n}>
            <Suspense fallback={<LoadingFallback />}>
                <ErrorBoundary FallbackComponent={ErrorFallback} onError={handleError}>
                    <HelmetProvider>
                        <QueryClientProvider client={queryClient}>
                            <ThemeProvider>
                                <Router />
                                <GlobalLoader />
                                <Toaster />
                            </ThemeProvider>
                            {process.env.NODE_ENV !== 'prod' && <ReactQueryDevtools />}
                        </QueryClientProvider>
                    </HelmetProvider>
                </ErrorBoundary>
            </Suspense>
        </I18nextProvider>
    );
}

export default App;
