import { useEffect, useState } from 'react';

import { runtime, type LinkPreviewReader } from '@chatic/runtime-react';

export interface UrlMetadata {
    url: string;
    title: string;
    description?: string;
    imageUrl?: string;
    siteName?: string;
}

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

export const requestUrlMetadata = (url: string, reader: LinkPreviewReader): Promise<UrlMetadata | null> => {
    const cached = cache.get(url);
    if (cached !== undefined) return Promise.resolve(cached);

    const pending = inFlight.get(url);
    if (pending) return pending;

    const request = reader
        .fetch(url)
        .then(data => {
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

export const __resetUrlMetadataCache = () => {
    cache.clear();
    inFlight.clear();
};

export const useUrlMetadata = (url: string): UrlMetadata | null => {
    const [meta, setMeta] = useState<UrlMetadata | null>(() => cache.get(url) ?? null);

    useEffect(() => {
        const reader = runtime.links.linkPreview;
        if (!reader) return;

        let active = true;
        void requestUrlMetadata(url, reader).then(result => {
            if (active) setMeta(result);
        });
        return () => {
            active = false;
        };
    }, [url]);

    return meta;
};
