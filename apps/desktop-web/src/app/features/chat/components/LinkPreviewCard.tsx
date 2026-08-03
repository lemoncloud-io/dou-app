import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';

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
 * Compact unfurl chip under a message link. Desktop shell only — the renderer
 * can't read cross-origin pages, so the main process fetches and parses og:
 * tags (FetchUrlMetadata). Renders nothing in a plain browser or when the page
 * yields no usable metadata. Block-level <span>s because the host paragraph
 * is a <p>.
 *
 * The chip shows only `siteName` + `title`. `description` and `imageUrl` keep
 * arriving from the shell (main still sends both — see
 * apps/desktop/src/main/unfurl.ts) and stay on the type because that is the
 * shell's contract, not because the chip wants them.
 *
 * Dropping the thumbnail is deliberate and load-bearing: rendering `imageUrl`
 * would make every reader's browser fetch that URL directly, handing the
 * third-party host each reader's IP, user-agent, and the moment they scrolled
 * the message into view. Unfurl itself never forwards image bytes, so the only
 * way to keep that property is to not request the image. `LinkPreviewCard.spec.tsx`
 * pins it — this comment alone would not stop the thumbnail coming back.
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
            className="focus-ring my-1 flex max-w-sm items-center gap-2.5 overflow-hidden rounded-md border border-hairline bg-elevated px-2.5 py-2 no-underline transition-colors ease-tactile hover:bg-accent/40"
        >
            <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-accent/60 text-muted-foreground"
                aria-hidden
            >
                <Link2 size={14} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
                {meta.siteName && (
                    <span className="block truncate text-micro text-muted-foreground">{meta.siteName}</span>
                )}
                <span className="block truncate text-caption font-medium text-foreground">{meta.title}</span>
            </span>
        </a>
    );
};
