import { runtime, type LinkPreviewReader } from '@chatic/runtime';
import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';

import { cn } from '@chatic/ui-kit';

export interface UrlMetadata {
    url: string;
    title: string;
    siteName?: string;
}

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

const requestMetadata = (url: string, reader: LinkPreviewReader): Promise<UrlMetadata | null> => {
    const cached = metadataCache.get(url);
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = inFlight.get(url);
    if (pending) return pending;
    const request = reader
        .fetch(url)
        .then(data => {
            if (!data?.success || !data.title) return null;
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

export const LinkPreviewCard = ({ url }: LinkPreviewCardProps) => {
    const [meta, setMeta] = useState<UrlMetadata | null>(() => metadataCache.get(url) ?? null);

    useEffect(() => {
        const reader = runtime.links.linkPreview;
        if (!reader) return;
        let active = true;
        void requestMetadata(url, reader).then(result => {
            if (active) setMeta(result);
        });
        return () => {
            active = false;
        };
    }, [url]);

    if (!runtime.links.linkPreview) return null;

    return (
        <span
            className={cn(
                'grid transition-[grid-template-rows] duration-200 ease-tactile',
                meta ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            )}
        >
            <span className="min-h-0 overflow-hidden">{meta && <LinkChip meta={meta} />}</span>
        </span>
    );
};

const LinkChip = ({ meta }: { meta: UrlMetadata }) => {
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
