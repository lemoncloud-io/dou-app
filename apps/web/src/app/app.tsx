import type { ErrorInfo } from 'react';
import { Suspense, useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ErrorFallback, LoadingFallback } from '@chatic/shared';
import { reportError } from '@chatic/web-core';
import { logger } from '@chatic/bridges';

import i18n from '../i18n';
import { AppRuntime } from './runtime';
import { GlobalBridgeListener } from './bridge';
import { ThemeApplier } from './runtime/ThemeApplier';

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

/**
 * Provider assembly only. Session readiness and the runtime connection are both owned by
 * `AppRuntime` (see `./runtime`).
 */
export function App() {
    const handleError = useCallback((error: Error, info: ErrorInfo): void => {
        logger.error('APP', 'Application Error', { error, data: info });
        reportError(error, { componentStack: info.componentStack ?? undefined });
    }, []);

    return (
        <HelmetProvider>
            <I18nextProvider i18n={i18n}>
                <QueryClientProvider client={queryClient}>
                    {/* Theme state lives in usePreferenceStore; ThemeApplier only mirrors it to <html>. */}
                    <ThemeApplier />
                    <ErrorBoundary FallbackComponent={ErrorFallback} onError={handleError}>
                        <GlobalBridgeListener />
                        <Suspense fallback={<LoadingFallback />}>
                            <AppRuntime />
                        </Suspense>
                    </ErrorBoundary>
                </QueryClientProvider>
            </I18nextProvider>
        </HelmetProvider>
    );
}

export default App;
