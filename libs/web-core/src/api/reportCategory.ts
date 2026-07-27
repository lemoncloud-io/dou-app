import { ErrorType, classifyError } from '../transport/error';

import type { ErrorCategory, ErrorReportContext } from './types';

/**
 * Derive the report category for an error, combining the delivery context
 * (from the global handlers) with the HTTP/network classification already used
 * by the transport layer. @see ADR-0029
 *
 * Priority: channel-shaped categories that carry no other signal come first
 * (`script-error` has no real error/stack; `react-render` is defined by its
 * component stack). The error's own HTTP/network nature is checked before the
 * generic `unhandled-rejection` channel tag, so a rejected axios/network
 * promise still surfaces as `network`/`http-*` rather than being masked by the
 * fact that it arrived as a rejection.
 */
export const classifyReport = (error: Error, ctx?: ErrorReportContext): ErrorCategory => {
    // Opaque cross-origin script exception: browser erased message/stack and
    // window.onerror handed us a null `error`. Nothing else to go on.
    if (ctx?.errorWasNull && ctx.source === 'window.onerror') return 'script-error';

    // React render crash — the component stack is the actionable signal.
    if (ctx?.componentStack) return 'react-render';

    // Classify by the error's own nature (HTTP status / network) via the shared
    // transport classifier.
    switch (classifyError(error).type) {
        case ErrorType.AUTHENTICATION:
            return 'auth';
        case ErrorType.SERVER:
            return 'http-5xx';
        case ErrorType.CLIENT:
            return 'http-4xx';
        case ErrorType.NETWORK:
            return 'network';
        default:
            break;
    }

    // Nature is unknown — fall back to the delivery channel when informative.
    if (ctx?.source === 'unhandledrejection') return 'unhandled-rejection';

    return 'unknown';
};
