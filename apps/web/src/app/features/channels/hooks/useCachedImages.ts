import { useEffect, useReducer, useRef } from 'react';

import { perfNow } from '@chatic/perf';

import { ImageCache, type ImageLoadReport, type ImageVariant } from '../lib/imageCache';
import { IndexedDbImageCacheStore } from '../lib/imageCacheStore';

export interface CachedImageRequest {
    key: string;
    variant: ImageVariant;
    url: string;
}

export type CachedImage = { status: 'pending' } | { status: 'cached'; src: string } | { status: 'direct'; src: string };

let shared: ImageCache | null = null;
export type { ImageLoadReport };

export type ImageLoadObserver = () => ((report: ImageLoadReport) => void) | undefined;

let loadObserver: ImageLoadObserver | undefined;

export const setImageLoadObserver = (observer: ImageLoadObserver | undefined): void => {
    loadObserver = observer;
};

const createCache = (): ImageCache =>
    new ImageCache({
        store: typeof indexedDB === 'undefined' ? null : new IndexedDbImageCacheStore(indexedDB),
        fetch: (url, signal) => fetch(url, { mode: 'cors', credentials: 'omit', signal }),
        createObjectURL: blob => URL.createObjectURL(blob),
        revokeObjectURL: url => URL.revokeObjectURL(url),
        observe: () => loadObserver?.(),
        elapsed: perfNow,
    });

export const getImageCache = (): ImageCache => (shared ??= createCache());

export const setImageCacheForTest = (cache: ImageCache | null): void => {
    shared = cache;
};

const idOf = (request: CachedImageRequest) => `${request.key}\u0000${request.url}`;

export const useCachedImages = (
    requests: readonly (CachedImageRequest | undefined)[],
    lead?: number
): { images: (CachedImage | undefined)[]; reject: (index: number) => boolean } => {
    const cache = getImageCache();
    const direct = useRef<ReadonlySet<string>>(new Set());
    const [, rerender] = useReducer((n: number) => n + 1, 0);
    const [evictions, noteEviction] = useReducer((n: number) => n + 1, 0);
    const signature = requests.map(request => (request ? idOf(request) : '')).join('\u0001');
    const leadRequest = lead === undefined ? undefined : requests[lead];
    const leadSettled = !leadRequest || !!cache.peek(leadRequest.key) || direct.current.has(idOf(leadRequest));

    useEffect(() => cache.subscribe(noteEviction), [cache]);

    const markDirect = (id: string, current: ReadonlySet<string>) => {
        direct.current = new Set([...direct.current].filter(known => current.has(known))).add(id);
        rerender();
    };

    useEffect(() => {
        let alive = true;
        const live = requests.filter((request): request is CachedImageRequest => !!request);
        const current = new Set(live.map(idOf));
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
        markDirect(idOf(request), new Set(requests.filter(Boolean).map(r => idOf(r as CachedImageRequest))));
        cache.invalidate(request.key);
        return true;
    };

    return { images, reject };
};
