import { useEffect, useState } from 'react';

import { isNative } from '@chatic/bridges';

import { appBridge } from '../../../bridge';

export interface UrlMetadata {
    url: string;
    title: string;
    description?: string;
    imageUrl?: string;
    siteName?: string;
}

// Session-scoped, module-level: a page's og tags don't change while the user is scrolling, and the
// same link often appears in several messages. Bounded because a long session in a busy channel
// would otherwise accumulate entries forever. Insertion-order (FIFO) eviction, not LRU — the cache
// only has to answer "did we already look this up", so recency doesn't buy anything.
const CACHE_MAX = 500;
const cache = new Map<string, UrlMetadata | null>();
const inFlight = new Map<string, Promise<UrlMetadata | null>>();

const store = (url: string, meta: UrlMetadata | null) => {
    if (cache.size >= CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(url, meta);
};

/**
 * Resolves a link's preview metadata, or null when there is no preview to show.
 *
 * Every failure collapses to the same null: a rejected bridge request (no handler on an older
 * shell, timeout), a page with no og tags, or a page with no title. The card is optional, so none
 * of these is worth surfacing — and the null is cached so scrolling never re-asks.
 */
export const requestUrlMetadata = (url: string): Promise<UrlMetadata | null> => {
    // `!== undefined`, not a truthiness check: a cached null is a real answer.
    const cached = cache.get(url);
    if (cached !== undefined) return Promise.resolve(cached);

    const pending = inFlight.get(url);
    if (pending) return pending;

    const request = appBridge
        .fetchUrlMetadata(url)
        .then(response => {
            const data = response.data;
            if (!data?.success || !data.title) return null;
            return {
                url: data.url,
                title: data.title,
                description: data.description,
                imageUrl: data.imageUrl,
                siteName: data.siteName,
            };
        })
        .catch(() => null)
        .then(meta => {
            store(url, meta);
            inFlight.delete(url);
            return meta;
        });

    inFlight.set(url, request);
    return request;
};

/** Test seam — module-level caches otherwise leak between cases. */
export const __resetUrlMetadataCache = () => {
    cache.clear();
    inFlight.clear();
};

/**
 * Preview metadata for a link, or null while unresolved or when there is nothing to show.
 *
 * Returns null in a plain browser: parsing needs the native shell, so there is no point asking.
 */
export const useUrlMetadata = (url: string): UrlMetadata | null => {
    // Read synchronously so a row that scrolled out and back shows its card without a flash. The
    // initializer doesn't re-run for a new `url`, which is fine here: a message's content never
    // changes in place (a retry deletes the row and sends a new one), so one mounted card is one
    // URL for its whole life. The effect still re-runs, so a future in-place edit would resolve —
    // it would just show the previous card for a frame.
    const [meta, setMeta] = useState<UrlMetadata | null>(() => cache.get(url) ?? null);

    useEffect(() => {
        if (!isNative()) return;

        let active = true;
        void requestUrlMetadata(url).then(result => {
            if (active) setMeta(result);
        });
        return () => {
            active = false;
        };
    }, [url]);

    return meta;
};
