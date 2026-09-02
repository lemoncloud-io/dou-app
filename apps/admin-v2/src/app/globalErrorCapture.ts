/**
 * `app/globalErrorCapture.ts`
 * - Routes admin-v2's own uncaught errors into the shared logger.
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
 * Entries reach the collector through the batch uploader, stamped with this
 * run's context — the `cid`/`runId` on them is what keeps admin's own noise
 * separable from the frontend logs it is used to triage.
 */
import { logger } from '@chatic/bridges';

let installed = false;

/**
 * Idempotent: React 18 StrictMode double-invokes effects in dev, and a second
 * set of listeners would log every error twice.
 */
export const installGlobalErrorCapture = (): void => {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    window.addEventListener('error', event => {
        // Resource-load failures also surface on this event but only in the
        // capture phase, which is not subscribed here — anything arriving is a
        // real script exception.
        const error = event.error ?? new Error(event.message);

        // `errorWasNull` marks the Error above as ours, so its stack is this
        // handler rather than the fault; the coordinates are then the only
        // location an opaque cross-origin exception still carries.
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
        const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));

        logger.error('GLOBAL', `[unhandledrejection] ${error.message}`, { error });
    });
};
