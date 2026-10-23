import type { NetworkLogFields } from './networkLog';

/**
 * One finished HTTP request as an `api_request` statistic: which endpoint, how it ended, how long
 * it took. Built from the same fields the network log already collects, so measuring adds no work
 * to the request itself.
 */
export interface ApiRequestSample {
    attrs: { endpoint: string; method: string; status_class: string; outcome: string; backend?: ApiBackend };
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

/**
 * Which kind of server a request went to: the relay, or a customer cloud's own backend.
 *
 * The endpoint template keeps no host (see {@link endpointTemplateOf}), so without this a
 * `/oauth/login-invite` sent to the relay and the same path sent to a cloud's backend would read as
 * one. Two values, not a host: one group per cloud would split the statistic the way a host would.
 */
export type ApiBackend = 'relay' | 'cloud';

/** The configured hosts a request URL is compared against. */
export interface ApiBackendEndpoints {
    /** The relay's endpoint. */
    relay: string;
    /**
     * The other services this app talks to that are neither the relay nor a cloud (the OAuth and
     * in-app-purchase hosts). A request to one of them gets no `backend`.
     */
    others: readonly string[];
}

const isUnder = (url: string, endpoint: string): boolean => {
    const base = endpoint.replace(/\/+$/, '');
    return !!base && (url === base || url.startsWith(`${base}/`) || url.startsWith(`${base}?`));
};

/**
 * `relay` for a request under the relay's endpoint, `cloud` for any other absolute http(s) URL, and
 * `undefined` for one of the {@link ApiBackendEndpoints.others} or a URL that is not absolute.
 *
 * "Any other" is `cloud` because of how requests are addressed here: every gateway builds its URL
 * from a configured endpoint, except the ones that go to a cloud's backend, which carry the host the
 * cloud's token or invite names. A cloud backend that shares the relay's host reads `relay` — the
 * request did go to the relay's server.
 */
export const apiBackendOf = (url: string, endpoints: ApiBackendEndpoints): ApiBackend | undefined => {
    if (!/^https?:\/\//i.test(url)) return undefined;
    if (isUnder(url, endpoints.relay)) return 'relay';
    if (endpoints.others.some(endpoint => isUnder(url, endpoint))) return undefined;
    return 'cloud';
};

/** `2xx` … `5xx`, or `none` when no response came back. */
export const statusClassOf = (status: number | undefined): string =>
    status !== undefined && status >= 100 && status <= 599 ? `${Math.floor(status / 100)}xx` : 'none';

export const toApiRequestSample = (fields: NetworkLogFields, backend?: ApiBackend): ApiRequestSample => ({
    attrs: {
        endpoint: endpointTemplateOf(fields.url),
        method: String(fields.method).toUpperCase(),
        status_class: statusClassOf(fields.status),
        outcome: fields.outcome === 'success' ? 'ok' : 'error',
        ...(backend ? { backend } : {}),
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
