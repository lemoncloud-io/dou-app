import { REDACTED } from '@chatic/logger';

const PRESERVED_PARAMS = new Set(['code']);

interface QueryParams {
    keys(): IterableIterator<string>;
    get(name: string): string | null;
}

export const redactQueryString = (search: string): string => {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) as unknown as QueryParams;
    const keys = [...new Set(params.keys())];
    if (!keys.length) return '';

    const rendered = keys.map(key =>
        PRESERVED_PARAMS.has(key) ? `${key}=${encodeURIComponent(params.get(key) ?? '')}` : `${key}=${REDACTED}`
    );
    return `?${rendered.join('&')}`;
};

export const sanitizeReportUrl = (href: string): string => {
    const base = href.split(/[?#]/)[0];
    const queryAt = href.indexOf('?');
    if (queryAt === -1) return base;

    const hashAt = href.indexOf('#');
    if (hashAt !== -1 && hashAt < queryAt) return base;

    const search = hashAt === -1 ? href.slice(queryAt + 1) : href.slice(queryAt + 1, hashAt);
    return `${base}${redactQueryString(search)}`;
};
