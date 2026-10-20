// Local error helpers. These were previously imported from `@chatic/web-core`,
// but that package no longer re-exports them from its public barrel. They are
// trivial, dependency-free utilities, so we keep an app-local copy (mirrors
// apps/web/src/app/utils/errors.ts + the extractErrorMessage impl from
// libs/web-core/src/transport/error.ts).

import i18next from 'i18next';

/** Coerce an unknown thrown value into a real Error instance. */
export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

// Read at call time, not module load: i18next.t must run after the desktop-web
// i18n bundle (see src/i18n.ts) has initialized, and the active language can
// change while this module stays loaded.
const defaultErrorMessage = (): string => i18next.t('errors.unknown');

// `any` is deliberate: error shapes are heterogeneous (Error | axios | string | api payload).
export const extractErrorMessage = (error: any): string => {
    if (!error) {
        return defaultErrorMessage();
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

    return defaultErrorMessage();
};

/** Longer than any refusal the backend writes; past it the text is a page or a dump, not a reason. */
const RAW_TEXT_MAX = 300;

/**
 * The failure's own words — the backend's when it answered, else the error's message — or `''`
 * when there are none. Unlike `extractErrorMessage` it never substitutes a translated default: it
 * is the raw text shown under a failure's sentence (toast description, dialog detail line) so the
 * actual reason can be read without a console. A body that is markup (a proxy's error page) is
 * dropped, and anything longer than `RAW_TEXT_MAX` is cut.
 * Covers both paths:
 *  - `throwIfApiError` rethrows `new Error(data.error)` → it's already `err.message`.
 *  - an HTTP-level throw carries the body on `err.response.data` (`{ error | message }`
 *    or a bare string).
 */
export const serverErrorText = (error: unknown): string => {
    const text = rawErrorText(error);
    if (text.startsWith('<')) return '';
    return text.length > RAW_TEXT_MAX ? `${text.slice(0, RAW_TEXT_MAX)}…` : text;
};

const rawErrorText = (error: unknown): string => {
    if (!error) return '';
    const data = (error as { response?: { data?: unknown } }).response?.data;
    if (typeof data === 'string' && data.trim()) return data.trim();
    if (data && typeof data === 'object') {
        const { error: wire, message } = data as { error?: unknown; message?: unknown };
        if (typeof wire === 'string' && wire.trim()) return wire.trim();
        if (typeof message === 'string' && message.trim()) return message.trim();
    }
    if (typeof error === 'string') return error.trim();
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message.trim() : '';
};

/** Answers that mean the request reached no one who could act on it: a timeout or a gateway. */
const UNREACHED_STATUSES = new Set([408, 502, 503, 504]);

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
    // A text that leads with a status is an answer, so the request got through and its wording
    // (`400 INVALID - grace-timeout by invite[…]`) is never a connection failure. Only the
    // statuses that mean "nothing behind this answered in time" read as one.
    const status = /^\s*([1-5]\d{2})\b/.exec(text)?.[1];
    if (status && UNREACHED_STATUSES.has(Number(status))) return 'network';
    if (!status && (text.includes('NETWORK') || text.includes('TIMEOUT') || text.includes('FAILED TO FETCH'))) {
        return 'network';
    }
    if (/\b400\b/.test(text) || text.includes('INVALID')) return 'invalid';
    return 'unknown';
};

/**
 * The status a rejected socket request carries, or `undefined` when it carries none. A numeric
 * `errorCode` on the Error comes first: the socket library drops the server's code when it rejects,
 * and `@chatic/app-runtime`'s socket manager puts it back on every request made through it — the only
 * source of a status for a refusal whose message does not lead with one (a parameter check is coded
 * 400 with nothing in front). Otherwise the status is read from the message prefix
 * (`403 FORBIDDEN - …`, and the client's own `503 …`/`408 …`) — never from the wording after it.
 * Prefer this over `classifyWireError` where one status means one thing and the wording is not a
 * contract: the phone sign-in's wrong code and expired code differ by status alone.
 *
 * The same rule is in `@chatic/app-runtime` (internal) and `apps/web`'s `getSocketErrorCode`; a change
 * to the convention belongs in all three.
 */
export const socketErrorStatus = (error: unknown): number | undefined => {
    const carried = (error as { errorCode?: unknown } | null)?.errorCode;
    if (typeof carried === 'number') return carried;
    const leading = /^\s*([1-5]\d{2})\b/.exec(toError(error).message);
    return leading ? Number(leading[1]) : undefined;
};
