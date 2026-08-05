import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';

import { isNative, webClient } from '@chatic/bridges';

/**
 * What the chip renders — a view model, not the wire contract. The shell sends
 * more (see `OnFetchUrlMetadataPayload` in libs/app-messages); anything not
 * listed here is dropped on arrival.
 */
export interface UrlMetadata {
    url: string;
    title: string;
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
            // `data.imageUrl` is deliberately not carried over — see the component.
            return { url: data.url, title: data.title, siteName: data.siteName };
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
 * The chip shows only the source name and the title. Dropping the `og:image`
 * thumbnail is deliberate and load-bearing: rendering it would make every
 * reader's browser fetch that URL directly, handing the third-party host each
 * reader's IP, user-agent, and the moment they scrolled the message into view.
 * `unfurl.ts` in the shell never forwards image bytes for the same reason, so
 * the only way to keep that property on this side is to never request the image.
 *
 * `requestMetadata` therefore drops `imageUrl` on arrival rather than carrying
 * it unused: a URL the component does not hold cannot be rendered by accident.
 * `LinkPreviewCard.spec.tsx` pins the behaviour from the outside as well.
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
