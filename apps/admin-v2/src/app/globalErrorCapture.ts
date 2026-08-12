/**
 * `app/globalErrorCapture.ts`
 * - Routes admin-v2's own uncaught errors into the shared logger + report path.
 *
 * Until this existed admin-v2 caught nothing: no `window.onerror`, no
 * `unhandledrejection`, and the only ErrorBoundary (socket-lab) ended at a bare
 * `console.error`. So the one app the team uses to *read* error reports was the
 * one app whose failures left no trace — including a failure in the report
 * viewer itself.
 *
 * Deliberately smaller than the web app's six-path capture
 * (`apps/web/src/app/app.tsx`): resource-load and CSP-violation capture exist
 * there to chase opaque `Script error.` reports from the mobile WebView, a
 * problem an internal desktop-only tool does not have. What is here is the set
 * that actually fires for admin: uncaught throws, rejected promises, and the
 * React Query caches every admin screen reads through.
 *
 * Reports arrive as `[admin] <category>` — `reportError` derives that bracket
 * from `VITE_PROJECT`, so admin's own noise stays filterable apart from the
 * frontend reports it is used to triage.
 */
import { logger } from '@chatic/bridges';
import { reportError } from '@chatic/web-core';

let installed = false;

/**
 * Idempotent: React 18 StrictMode double-invokes effects in dev, and a second
 * set of listeners would report every error twice.
 */
export const installGlobalErrorCapture = (): void => {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    window.addEventListener('error', event => {
        // Resource-load failures also surface on this event but only in the
        // capture phase, which is not subscribed here — anything arriving is a
        // real script exception.
        const error = event.error ?? new Error(event.message);

        // Log before reporting so the error is a first-class buffer entry even
        // when the report itself fails to send (ADR-0047).
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
        const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));

        logger.error('GLOBAL', `[unhandledrejection] ${error.message}`, { error });
        reportError(error, { source: 'unhandledrejection' });
    });
};
