// Local error helpers. These were previously imported from `@chatic/web-core`,
// but that package no longer re-exports them from its public barrel. They are
// trivial, dependency-free utilities, so we keep an app-local copy (mirrors
// apps/web/src/app/utils/errors.ts + the extractErrorMessage impl from
// libs/web-core/src/transport/error.ts).

/** Coerce an unknown thrown value into a real Error instance. */
export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

const DEFAULT_ERROR_MESSAGE = '알 수 없는 오류가 발생했습니다';

// `any` is deliberate: error shapes are heterogeneous (Error | axios | string | api payload).
export const extractErrorMessage = (error: any): string => {
    if (!error) {
        return DEFAULT_ERROR_MESSAGE;
    }

    if (error.message) {
        return error.message;
    }

    if (error.status || error.statusText) {
        return `${error.status || ''} ${error.statusText || ''}`.trim();
    }

    if (typeof error === 'string') {
        return error;
    }

    if (error.toString && error.toString() !== '[object Object]') {
        return error.toString();
    }

    if (error.response?.data) {
        if (error.response.data.error) {
            return error.response.data.error;
        }
        if (error.response.data.message) {
            return error.response.data.message;
        }
    }

    return DEFAULT_ERROR_MESSAGE;
};

/** What a backend failure means, as far as its wire text says. */
export type WireErrorKind = 'expired' | 'notFound' | 'conflict' | 'denied' | 'network' | 'invalid' | 'unknown';

/**
 * Classify a backend's wire text, e.g. `403 NOT ALLOWED - action[update] is
 * invalid @doPut(...)`. That text is useful in a console and useless in front
 * of a person, so callers map the kind to a sentence of their own and keep the
 * raw text for the log.
 *
 * Status codes match as whole numbers only: the text carries ids such as
 * `channels/U:1000404`. The order matters where one text carries two signals.
 * An expired invite is also reported as invalid, and a wrong code arrives as
 * `400 INVALID ... (not-found)`, so the specific kinds are tested first and a
 * bare 400 last.
 */
export const classifyWireError = (raw: string): WireErrorKind => {
    const text = raw.toUpperCase();
    if (text.includes('EXPIRED')) return 'expired';
    if (/\b404\b/.test(text) || text.includes('NOT FOUND') || text.includes('NOT-FOUND')) return 'notFound';
    if (/\b409\b/.test(text) || text.includes('CONFLICT') || text.includes('ALREADY')) return 'conflict';
    if (/\b403\b/.test(text) || text.includes('NOT ALLOWED') || text.includes('FORBIDDEN')) return 'denied';
    if (text.includes('NETWORK') || text.includes('TIMEOUT') || text.includes('FAILED TO FETCH')) return 'network';
    if (/\b400\b/.test(text) || text.includes('INVALID')) return 'invalid';
    return 'unknown';
};
