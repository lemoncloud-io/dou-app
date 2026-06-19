import { useEffect, useState } from 'react';

import { isNative, webClient } from '@chatic/bridges';

export interface UrlMetadata {
    url: string;
    title: string;
    description?: string;
    imageUrl?: string;
    siteName?: string;
}

// Module-level caches: previews are immutable per URL within a session, and a
// failed unfurl is cached too (null) so scrolling never re-asks the shell.
// Bounded: oldest entry evicted past the cap (long sessions with many links).
const METADATA_CACHE_MAX = 500;
const metadataCache = new Map<string, UrlMetadata | null>();
const inFlight = new Map<string, Promise<UrlMetadata | null>>();

const storeMetadata = (url: string, meta: UrlMetadata | null) => {
    if (metadataCache.size >= METADATA_CACHE_MAX) {
        const oldest = metadataCache.keys().next().value;
        if (oldest !== undefined) metadataCache.delete(oldest);
    }
    metadataCache.set(url, meta);
};

const requestMetadata = (url: string): Promise<UrlMetadata | null> => {
    const cached = metadataCache.get(url);
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = inFlight.get(url);
    if (pending) return pending;
    const request = webClient
        .request({ type: 'FetchUrlMetadata', data: { url } })
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
            storeMetadata(url, meta);
            inFlight.delete(url);
            return meta;
        });
    inFlight.set(url, request);
    return request;
};

interface LinkPreviewCardProps {
    url: string;
}

/**
 * Slack-style unfurl card under a message link. Desktop shell only — the
 * renderer can't read cross-origin pages, so the main process fetches and
 * parses og: tags (FetchUrlMetadata). Renders nothing in a plain browser or
 * when the page yields no usable metadata. Block-level <span>s because the
 * host paragraph is a <p>.
 */
export const LinkPreviewCard = ({ url }: LinkPreviewCardProps) => {
    const [meta, setMeta] = useState<UrlMetadata | null>(() => metadataCache.get(url) ?? null);

    useEffect(() => {
        if (!isNative()) return;
        let active = true;
        void requestMetadata(url).then(result => {
            if (active) setMeta(result);
        });
        return () => {
            active = false;
        };
    }, [url]);

    if (!meta) return null;

    return (
        <a
            href={meta.url}
            target="_blank"
            rel="noreferrer noopener"
            className="focus-ring my-1 flex max-w-md items-stretch gap-3 overflow-hidden rounded-md border border-hairline bg-elevated p-2.5 no-underline shadow-raised transition-colors ease-tactile hover:bg-accent/40"
        >
            <span className="block w-1 shrink-0 rounded-full bg-primary/40" aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                {meta.siteName && (
                    <span className="block truncate text-caption font-medium text-muted-foreground">
                        {meta.siteName}
                    </span>
                )}
                <span className="block truncate text-callout font-semibold text-primary-ink">{meta.title}</span>
                {meta.description && (
                    <span className="line-clamp-2 block text-caption text-muted-foreground">{meta.description}</span>
                )}
            </span>
            {meta.imageUrl && (
                <img src={meta.imageUrl} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-md object-cover" />
            )}
        </a>
    );
};
