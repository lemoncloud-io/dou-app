import { useEffect, useReducer, useRef } from 'react';

import { ImageCache, type ImageVariant } from '../lib/imageCache';
import { IndexedDbImageCacheStore } from '../lib/imageCacheStore';

export interface CachedImageRequest {
    /** `imageCacheKey(...)` — stable across the image's signed addresses. */
    key: string;
    variant: ImageVariant;
    /** The signed address to fetch on a miss, and to draw directly if that fetch cannot be made. */
    url: string;
}

/**
 * - `pending` — being looked up; draw nothing yet rather than start a download of `url` in parallel.
 * - `cached` — `src` is an object URL for the kept bytes.
 * - `direct` — the fetch could not be made; `src` is the signed address, drawn as before this cache.
 */
export type CachedImage = { status: 'pending' } | { status: 'cached'; src: string } | { status: 'direct'; src: string };

let shared: ImageCache | null = null;

const createCache = (): ImageCache =>
    new ImageCache({
        store: typeof indexedDB === 'undefined' ? null : new IndexedDbImageCacheStore(indexedDB),
        // No credentials: the signature is the whole authorization, and a credentialed request would
        // need the bucket to name this origin instead of answering `*`.
        fetch: (url, signal) => fetch(url, { mode: 'cors', credentials: 'omit', signal }),
        createObjectURL: blob => URL.createObjectURL(blob),
        revokeObjectURL: url => URL.revokeObjectURL(url),
    });

/** The page's one cache, so the room and its thread share what either has loaded. */
export const getImageCache = (): ImageCache => (shared ??= createCache());

/** Test seam — swaps the page's cache; `null` makes the next call build a real one again. */
export const setImageCacheForTest = (cache: ImageCache | null): void => {
    shared = cache;
};

const idOf = (request: CachedImageRequest) => `${request.key}\u0000${request.url}`;

/**
 * Resolves each request to what an `<img>` should draw, aligned with `requests`. An undefined request
 * — an image nobody draws right now, or one the caller has its own source for — resolves to undefined
 * and costs nothing.
 *
 * `cached` is only ever read from the cache's memory at render time, never remembered here: an object
 * URL remembered past its entry could already be revoked. So a key already in memory resolves in the
 * same render — a redraw with a new signed address does not blink — and one that left memory goes back
 * to `pending` and is loaded again. What is remembered is the addresses to draw directly, by key and
 * address, so a refreshed address gets its own try.
 *
 * `reject(index)` is for an `<img>` that failed on a cached source: the entry is dropped and that image
 * falls back to its signed address.
 *
 * `lead` names the request that goes first: until it is kept or drawn from its address, the others are
 * held but not fetched, and draw only what memory already has. The viewer leads with the photo on
 * screen, so on a slow network its original does not share the bandwidth with its neighbours'.
 */
export const useCachedImages = (
    requests: readonly (CachedImageRequest | undefined)[],
    lead?: number
): { images: (CachedImage | undefined)[]; reject: (index: number) => boolean } => {
    const cache = getImageCache();
    // A ref, not state: the effect below must see a reject made in the same tick, before the render.
    const direct = useRef<ReadonlySet<string>>(new Set());
    const [, rerender] = useReducer((n: number) => n + 1, 0);
    // Moves when an entry leaves memory, so the effect looks up what it holds again.
    const [evictions, noteEviction] = useReducer((n: number) => n + 1, 0);
    // A dependency on the content rather than the array, which a caller rebuilds every render.
    const signature = requests.map(request => (request ? idOf(request) : '')).join('\u0001');
    const leadRequest = lead === undefined ? undefined : requests[lead];
    // Read at render, so the load that settles the lead re-renders and re-runs the effect below.
    const leadSettled = !leadRequest || !!cache.peek(leadRequest.key) || direct.current.has(idOf(leadRequest));

    useEffect(() => cache.subscribe(noteEviction), [cache]);

    // Remembers `id` as drawn directly, forgetting ids no longer asked for so the set cannot grow with
    // every address a long-lived row is handed.
    const markDirect = (id: string, current: ReadonlySet<string>) => {
        direct.current = new Set([...direct.current].filter(known => current.has(known))).add(id);
        rerender();
    };

    useEffect(() => {
        let alive = true;
        const live = requests.filter((request): request is CachedImageRequest => !!request);
        const current = new Set(live.map(idOf));
        // A request held back behind the lead is taken only when memory already has it, so the copy it
        // draws is not revoked. One still downloading is let go, so the cache cancels that download
        // rather than let it share the bandwidth with the lead.
        const held = live.filter(request => leadSettled || request === leadRequest || !!cache.peek(request.key));
        held.forEach(request => cache.retain(request.key));
        live.forEach(request => {
            const id = idOf(request);
            if (cache.peek(request.key) || direct.current.has(id)) return;
            if (!leadSettled && request !== leadRequest) return;
            void cache.load(request.key, request.variant, request.url).then(src => {
                if (!alive) return;
                if (src) rerender();
                else markDirect(id, current);
            });
        });
        return () => {
            alive = false;
            held.forEach(request => cache.release(request.key));
        };
        // `signature` is the content of `requests`, and `lead` picks one of them; `markDirect` only touches
        // the ref.
    }, [cache, signature, lead, evictions, leadSettled]);

    const images = requests.map((request): CachedImage | undefined => {
        if (!request) return undefined;
        if (direct.current.has(idOf(request))) return { status: 'direct', src: request.url };
        const kept = cache.peek(request.key);
        return kept ? { status: 'cached', src: kept } : { status: 'pending' };
    });

    const reject = (index: number): boolean => {
        const request = requests[index];
        if (!request || images[index]?.status !== 'cached') return false;
        // Marked first: dropping the entry makes every holder look it up again, this one included.
        markDirect(idOf(request), new Set(requests.filter(Boolean).map(r => idOf(r as CachedImageRequest))));
        cache.invalidate(request.key);
        return true;
    };

    return { images, reject };
};
