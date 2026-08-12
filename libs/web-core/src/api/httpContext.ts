/**
 * `api/httpContext.ts`
 * - Pulls the request/response detail out of a failed HTTP call for a report.
 *
 * "Network Error" on its own is unactionable: the first questions are always
 * which endpoint, what we sent, and what came back. axios hangs all of that off
 * the error (`config` for the request, `response` for the reply), but it is
 * spread across differently-shaped fields depending on how the call failed —
 * a 500 has `response`, a DNS failure has only `config`, and a wrapped error
 * may have neither.
 *
 * Everything that can carry a body goes through `redactSensitive` (drops
 * password/token-ish keys) and `truncate` (bounds size), the same pair the
 * transport's network log uses. Request bodies routinely hold credentials and
 * responses routinely hold personal data, so neither is safe to copy verbatim
 * into a report that is stored and read by humans.
 */
import { redactSensitive, truncate } from '@chatic/logger';

export interface HttpContext {
    /** Endpoint, absolute when the client configured a `baseURL`. */
    url?: string;
    method?: string;
    /** Query string params, redacted and size-bounded. */
    params?: unknown;
    /** What we sent, redacted and size-bounded. */
    requestBody?: unknown;
    status?: number | string;
    statusText?: string;
    /** Transport-level code (`ERR_NETWORK`, `ECONNABORTED`, …) when there is no status. */
    code?: string;
    /**
     * The server's own words for why it failed, dug out of the response body.
     * axios throws `Request failed with status code 500` regardless of what the
     * body said, so without this the reason exists only inside `responseData` —
     * and admin's list, which groups by message, shows every unrelated 500 as
     * one row.
     */
    reason?: string;
    /** What came back, redacted and size-bounded. */
    responseData?: unknown;
}

/** Longest reason worth carrying into the grouped message. */
const MAX_REASON_CHARS = 200;

interface AxiosLikeError {
    status?: unknown;
    statusCode?: unknown;
    statusText?: unknown;
    code?: unknown;
    config?: { url?: unknown; baseURL?: unknown; method?: unknown; params?: unknown; data?: unknown };
    request?: { responseURL?: unknown };
    response?: { status?: unknown; statusText?: unknown; data?: unknown };
}

const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** Absolute endpoint when a `baseURL` is configured, so reports are comparable across clients. */
const readUrl = (err: AxiosLikeError): string | undefined => {
    const url = asString(err.config?.url) ?? asString(err.request?.responseURL);
    if (!url) return undefined;

    const base = asString(err.config?.baseURL);
    if (!base || /^https?:\/\//i.test(url)) return url;

    return `${base.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
};

/**
 * axios keeps the request body on `config.data`, already serialized to a string
 * for JSON calls. Parsing it back means the report shows fields rather than an
 * escaped blob — and, more importantly, that `redactSensitive` can see the keys
 * at all. A body that is not JSON is left as the string it is.
 */
const readRequestBody = (raw: unknown): unknown => {
    if (typeof raw !== 'string') return raw;

    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
};

const isPresent = (value: unknown): boolean => value !== undefined && value !== null && value !== '';

/**
 * The failure reason the server stated, across the body shapes this backend
 * actually returns: a bare string, `{ error }` (the convention `throwIfApiError`
 * relies on), `{ message }`, or a nested `{ error: { message } }`.
 */
const readReason = (data: unknown): string | undefined => {
    if (typeof data === 'string') return data.trim() || undefined;
    if (!data || typeof data !== 'object') return undefined;

    const body = data as { error?: unknown; message?: unknown };
    if (typeof body.error === 'string' && body.error.trim()) return body.error.trim();
    if (typeof body.message === 'string' && body.message.trim()) return body.message.trim();

    const nested = (body.error as { message?: unknown } | undefined)?.message;
    return typeof nested === 'string' && nested.trim() ? nested.trim() : undefined;
};

/**
 * The HTTP story of a failed call, or `undefined` when the error carries none
 * (most errors are not network errors).
 */
export const describeHttp = (error: unknown): HttpContext | undefined => {
    const err = (error ?? {}) as AxiosLikeError;

    const status = (err.status ?? err.response?.status ?? err.statusCode) as number | string | undefined;
    const url = readUrl(err);
    const code = asString(err.code);
    const method = asString(err.config?.method)?.toUpperCase();
    const hasBody = isPresent(err.config?.data);
    const hasParams = isPresent(err.config?.params);
    const reason = readReason(err.response?.data);

    // Nothing HTTP-shaped here at all — leave the field off rather than
    // attaching an object of undefineds.
    if (!isPresent(status) && !url && !code) return undefined;

    const context: HttpContext = {
        ...(url ? { url } : {}),
        ...(method ? { method } : {}),
        ...(hasParams ? { params: truncate(redactSensitive(err.config?.params)) } : {}),
        ...(hasBody ? { requestBody: truncate(redactSensitive(readRequestBody(err.config?.data))) } : {}),
        ...(isPresent(status) ? { status } : {}),
        ...(isPresent(err.response?.statusText ?? err.statusText)
            ? { statusText: asString(err.response?.statusText) ?? asString(err.statusText) }
            : {}),
        ...(code ? { code } : {}),
        ...(reason ? { reason: reason.slice(0, MAX_REASON_CHARS) } : {}),
        ...(isPresent(err.response?.data) ? { responseData: truncate(redactSensitive(err.response?.data)) } : {}),
    };

    return context;
};
