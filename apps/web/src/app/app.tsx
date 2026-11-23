import type { ErrorInfo } from 'react';
import { Suspense, useCallback, useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ErrorFallback, LoadingFallback } from '@chatic/shared';
import { logger } from '@chatic/bridges';

import i18n from '../i18n';
import { toError } from './utils/errors';
import { AppRuntime } from './runtime';
import { GlobalBridgeListener } from './bridge';
import { AppUpdatePromptHost, AppVersionFloorGate } from './features/appUpdate';
import { ThemeApplier } from './runtime/ThemeApplier';
import { bootSplash } from './runtime/bootSplash';
import { DebugOverlayHost } from './features/debug/overlay/DebugOverlayHost';
import { markBoot } from './features/debug/metrics/bootMarks';

const RESOURCE_TAGS = new Set(['img', 'script', 'link', 'audio', 'video', 'source']);

if (typeof window !== 'undefined') {
    window.addEventListener('error', event => {
        const error = event.error ?? new Error(event.message);
        logger.error('GLOBAL', `[window.onerror] ${event.message}`, {
            error,
            data: {
                errorWasNull: event.error == null,
                filename: event.filename || undefined,
                lineno: event.lineno || undefined,
                colno: event.colno || undefined,
            },
        });
    });
    window.addEventListener('unhandledrejection', event => {
        const error = toError(event.reason);
        logger.error('GLOBAL', `[unhandledrejection] ${error.message}`, { error });
    });
    window.addEventListener(
        'error',
        event => {
            const target = event.target as Element | null;
            if (!target || !('tagName' in target)) return;
            const tagName = target.tagName?.toLowerCase();
            if (!tagName || !RESOURCE_TAGS.has(tagName)) return;
            const url = (target as HTMLImageElement).src || (target as HTMLLinkElement).href || '(unknown url)';
            const message = `Resource load failed: <${tagName}> ${url}`;
            logger.error('GLOBAL', `[resource-error] ${message}`);
        },
        true
    );
    window.addEventListener('securitypolicyviolation', event => {
        const detail = `${event.violatedDirective} blocked ${event.blockedURI || '(inline)'}`;
        logger.error('GLOBAL', `[csp-violation] ${detail}`, {
            data: { sourceFile: event.sourceFile, lineNumber: event.lineNumber },
        });
    });
}

const queryCache = new QueryCache({
    onError: (error: Error): void => {
        logger.error('GLOBAL', `[query] ${error.message}`, { error });
    },
});

const mutationCache = new MutationCache({
    onError: (error: Error): void => {
        logger.error('GLOBAL', `[mutation] ${error.message}`, { error });
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
    useEffect(() => {
        markBoot('app-render');
    }, []);

    const handleError = useCallback((error: Error, info: ErrorInfo): void => {
        logger.error('APP', '[error-boundary] Application Error', { error, data: info });
        bootSplash.release('error');
    }, []);

    return (
        <HelmetProvider>
            <I18nextProvider i18n={i18n}>
                <QueryClientProvider client={queryClient}>
                    <ThemeApplier />
                    <ErrorBoundary FallbackComponent={ErrorFallback} onError={handleError}>
                        <AppVersionFloorGate>
                            <GlobalBridgeListener />
                            <AppUpdatePromptHost />
                            <Suspense fallback={<LoadingFallback />}>
                                <AppRuntime />
                            </Suspense>
                            <DebugOverlayHost />
                        </AppVersionFloorGate>
                    </ErrorBoundary>
                </QueryClientProvider>
            </I18nextProvider>
        </HelmetProvider>
    );
}

export default App;
