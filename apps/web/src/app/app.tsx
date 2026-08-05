import type { ErrorInfo } from 'react';
import { Suspense, useCallback, useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ErrorFallback, LoadingFallback } from '@chatic/shared';
import { reportError } from '@chatic/web-core';
import { logger } from '@chatic/bridges';

import i18n from '../i18n';
import { toError } from './utils/errors';
import { AppRuntime } from './runtime';
import { GlobalBridgeListener } from './bridge';
import { AppUpdatePromptHost } from './features/appUpdate';
import { ThemeApplier } from './runtime/ThemeApplier';
import { DebugOverlayHost } from './features/debug/overlay/DebugOverlayHost';
import { markBoot } from './features/debug/metrics/bootMarks';

if (typeof window !== 'undefined') {
    window.addEventListener('error', event => {
        // Cross-origin script exceptions arrive with a null `event.error` and an
        // opaque "Script error." message. Forward that fact plus the position the
        // browser still exposes (filename/lineno/colno) so web-core can tag it as
        // a script-error and keep a location breadcrumb. @see ADR-0029
        reportError(event.error ?? new Error(event.message), {
            source: 'window.onerror',
            errorWasNull: event.error == null,
            filename: event.filename || undefined,
            lineno: event.lineno || undefined,
            colno: event.colno || undefined,
        });
    });
    window.addEventListener('unhandledrejection', event => {
        // event.reason is often a raw DOM Event (e.g. lemon-model's WebSocket connect races —
        // see toError's doc comment), which String() collapses to a useless "[object Event]".
        reportError(toError(event.reason), { source: 'unhandledrejection' });
    });
}

const queryCache = new QueryCache({
    onError: (error: Error): void => {
        reportError(error, { source: 'query' });
    },
});

const mutationCache = new MutationCache({
    onError: (error: Error): void => {
        reportError(error, { source: 'mutation' });
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
    // Boot timeline: first React commit of the provider tree.
    useEffect(() => {
        markBoot('app-render');
    }, []);

    const handleError = useCallback((error: Error, info: ErrorInfo): void => {
        logger.error('APP', 'Application Error', { error, data: info });
        reportError(error, { source: 'error-boundary', componentStack: info.componentStack ?? undefined });
    }, []);

    return (
        <HelmetProvider>
            <I18nextProvider i18n={i18n}>
                <QueryClientProvider client={queryClient}>
                    {/* Theme state lives in usePreferenceStore; ThemeApplier only mirrors it to <html>. */}
                    <ThemeApplier />
                    <ErrorBoundary FallbackComponent={ErrorFallback} onError={handleError}>
                        <GlobalBridgeListener />
                        <AppUpdatePromptHost />
                        <Suspense fallback={<LoadingFallback />}>
                            <AppRuntime />
                        </Suspense>
                        <DebugOverlayHost />
                    </ErrorBoundary>
                </QueryClientProvider>
            </I18nextProvider>
        </HelmetProvider>
    );
}

export default App;
