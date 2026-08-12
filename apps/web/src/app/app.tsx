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

/** Resource-bearing elements whose load failures are worth reporting (ADR-0047). */
const RESOURCE_TAGS = new Set(['img', 'script', 'link', 'audio', 'video', 'source']);

if (typeof window !== 'undefined') {
    window.addEventListener('error', event => {
        // Cross-origin script exceptions arrive with a null `event.error` and an
        // opaque "Script error." message. Forward that fact plus the position the
        // browser still exposes (filename/lineno/colno) so web-core can tag it as
        // a script-error and keep a location breadcrumb. @see ADR-0029
        const error = event.error ?? new Error(event.message);
        // Log BEFORE reporting (ADR-0047): the error becomes a first-class buffer
        // entry — visible in future breadcrumbs and recorded even when the report
        // itself is throttled.
        logger.error('GLOBAL', `[window.onerror] ${event.message}`, { error });
        reportError(error, {
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
        const error = toError(event.reason);
        logger.error('GLOBAL', `[unhandledrejection] ${error.message}`, { error });
        reportError(error, { source: 'unhandledrejection' });
    });
    // Resource load failures (img/script/link/...) fire on the element and do
    // NOT bubble — only a capture-phase window listener sees them. There is no
    // JS Error object; synthesize one carrying the element/URL (ADR-0047).
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
            reportError(new Error(message), { source: 'resource-error', categoryOverride: 'resource-error' });
        },
        true
    );
    // CSP violations never reach window.onerror; a blocked script inside the
    // WebView is a prime "Script error." root-cause correlate (ADR-0047).
    window.addEventListener('securitypolicyviolation', event => {
        const detail = `${event.violatedDirective} blocked ${event.blockedURI || '(inline)'}`;
        logger.error('GLOBAL', `[csp-violation] ${detail}`, {
            data: { sourceFile: event.sourceFile, lineNumber: event.lineNumber },
        });
        reportError(new Error(`CSP violation: ${detail}`), {
            source: 'csp-violation',
            categoryOverride: 'csp-violation',
            filename: event.sourceFile || undefined,
            lineno: event.lineNumber || undefined,
        });
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
