import type { NetworkLogFields } from './networkLog';

/**
 * One finished HTTP request as an `api_request` statistic: which endpoint, how it ended, how long
 * it took. Built from the same fields the network log already collects, so measuring adds no work
 * to the request itself.
 */
export interface ApiRequestSample {
    attrs: { endpoint: string; method: string; status_class: string; outcome: string };
    metrics: { rtt_ms: number; res_bytes?: number };
}

/** Statistics attribute values are capped at 100 characters; the endpoint keeps its head. */
const MAX_ENDPOINT_LENGTH = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A prefixed id such as `U:1002053` — an upper-case kind, a colon, then the id. */
const PREFIXED_ID = /^[A-Z]+:.+$/;
/** A long opaque token (a receipt or transaction id): 20+ id characters with at least one digit. */
const OPAQUE_ID = /^(?=.*\d)[A-Za-z0-9._~=-]{20,}$/;

const isIdSegment = (segment: string): boolean =>
    /^\d+$/.test(segment) || UUID.test(segment) || PREFIXED_ID.test(segment) || OPAQUE_ID.test(segment);

/**
 * The endpoint as a template: the path only, with every id segment replaced by `:id` and the query
 * dropped — `/clouds/1000002/release?x=1` → `/clouds/:id/release`.
 *
 * The host is left out on purpose. Cloud backends sit on hosts of their own, and one group per
 * cloud would split the statistic as surely as an id in the path would. What counts as an id: a
 * number (`0` included, which the relay uses as "mine"), a UUID, a prefixed id (`U:1002053`), or a
 * long opaque token. A new id shape that slips through shows up as a long tail of endpoints, and
 * belongs in this list.
 */
export const endpointTemplateOf = (url: string): string => {
    let path: string;
    try {
        path = new URL(url, 'http://template.invalid').pathname;
    } catch {
        path = url.split(/[?#]/)[0];
    }
    const template = path
        .split('/')
        .map(segment => {
            if (!segment) return segment;
            let decoded = segment;
            try {
                decoded = decodeURIComponent(segment);
            } catch {
                /* keep it as it came */
            }
            return isIdSegment(decoded) ? ':id' : segment;
        })
        .join('/');
    return template.slice(0, MAX_ENDPOINT_LENGTH) || '/';
};

/** `2xx` … `5xx`, or `none` when no response came back. */
export const statusClassOf = (status: number | undefined): string =>
    status !== undefined && status >= 100 && status <= 599 ? `${Math.floor(status / 100)}xx` : 'none';

export const toApiRequestSample = (fields: NetworkLogFields): ApiRequestSample => ({
    attrs: {
        endpoint: endpointTemplateOf(fields.url),
        method: String(fields.method).toUpperCase(),
        status_class: statusClassOf(fields.status),
        outcome: fields.outcome === 'success' ? 'ok' : 'error',
    },
    metrics: {
        rtt_ms: Math.max(0, Math.round(fields.durationMs)),
        ...(fields.responseBytes !== undefined ? { res_bytes: fields.responseBytes } : {}),
    },
});

/**
 * A budget of `limit` per fixed one-minute window, which opens at the first request after the last
 * one closed: answers whether one more may go, and counts it when so. Requests are the most frequent
 * thing the app does; a burst — a sync storm, a retry loop — must not become a burst of statistics.
 *
 * The first requests of a window are kept, so the start of a run or a return from the background —
 * where requests cluster — is over-represented. Read `api_request` with that in mind.
 */
export const createPerMinuteCap = (limit: number, now: () => number = Date.now): (() => boolean) => {
    let windowStart = 0;
    let used = 0;
    return () => {
        const at = now();
        if (at - windowStart >= 60_000) {
            windowStart = at;
            used = 0;
        }
        if (used >= limit) return false;
        used += 1;
        return true;
    };
};
