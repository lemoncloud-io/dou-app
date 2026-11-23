import type { NetworkLogFields } from './networkLog';

export interface ApiRequestSample {
    attrs: { endpoint: string; method: string; status_class: string; outcome: string; backend?: ApiBackend };
    metrics: { rtt_ms: number; res_bytes?: number };
}

const MAX_ENDPOINT_LENGTH = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIXED_ID = /^[A-Z]+:.+$/;
const OPAQUE_ID = /^(?=.*\d)[A-Za-z0-9._~=-]{20,}$/;

const isIdSegment = (segment: string): boolean =>
    /^\d+$/.test(segment) || UUID.test(segment) || PREFIXED_ID.test(segment) || OPAQUE_ID.test(segment);

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

export type ApiBackend = 'relay' | 'cloud';

export interface ApiBackendEndpoints {
    relay: string;
    others: readonly string[];
}

const isUnder = (url: string, endpoint: string): boolean => {
    const base = endpoint.replace(/\/+$/, '');
    return !!base && (url === base || url.startsWith(`${base}/`) || url.startsWith(`${base}?`));
};

export const apiBackendOf = (url: string, endpoints: ApiBackendEndpoints): ApiBackend | undefined => {
    if (!/^https?:\/\//i.test(url)) return undefined;
    if (isUnder(url, endpoints.relay)) return 'relay';
    if (endpoints.others.some(endpoint => isUnder(url, endpoint))) return undefined;
    return 'cloud';
};

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
