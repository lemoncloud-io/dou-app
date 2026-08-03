import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface LinkPreviewCardProps {
    /** The link the card stands for — used as the anchor href. */
    url: string;
    /** Page title. A card without one isn't worth showing, so this is required. */
    title: string;
    description?: string;
    /** Thumbnail URL. Must be https — http images are blocked as mixed content. */
    imageUrl?: string;
    /** Publisher name (og:site_name), shown above the title when present. */
    siteName?: string;
    /** Tap handler. The host decides where the link opens; call preventDefault to take over. */
    onPress?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
    className?: string;
}

/**
 * Link unfurl card shown under a chat bubble — publisher, title, snippet, and a square thumbnail.
 *
 * Purely presentational: it knows nothing about the bridge, the native shell, or how the metadata
 * was fetched, and it never decides whether a preview should exist. The host resolves the metadata
 * and only mounts this once there is something to show.
 */
export const LinkPreviewCard = ({
    url,
    title,
    description,
    imageUrl,
    siteName,
    onPress,
    className,
}: LinkPreviewCardProps) => {
    // A broken-image glyph under a message bubble reads worse than a card with no thumbnail.
    const [imageFailed, setImageFailed] = React.useState(false);
    const showImage = !!imageUrl && !imageFailed;

    return (
        <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={onPress}
            className={cn(
                'flex max-w-full items-stretch gap-2.5 overflow-hidden rounded-[14px] border border-border bg-card p-2.5 no-underline',
                className
            )}
        >
            {/* `min-w-0` so a long unbroken title can't push the card past its container. */}
            <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                {siteName && (
                    <span className="truncate text-[12px] font-medium tracking-[-0.12px] text-description">
                        {siteName}
                    </span>
                )}
                <span className="truncate text-[14px] font-semibold tracking-[-0.28px] text-foreground">{title}</span>
                {description && (
                    <span className="line-clamp-2 text-[12px] leading-[1.4] tracking-[-0.12px] text-description">
                        {description}
                    </span>
                )}
            </span>
            {showImage && (
                <img
                    src={imageUrl}
                    alt=""
                    loading="lazy"
                    // The webview fetches this straight from the publisher, so the request would
                    // otherwise carry our page URL to them.
                    referrerPolicy="no-referrer"
                    onError={() => setImageFailed(true)}
                    // `bg-secondary` fills the square while the request is in flight — a slow or
                    // stalled thumbnail reads as a neutral tile instead of a hole in the card.
                    className="size-14 shrink-0 rounded-lg bg-secondary object-cover"
                />
            )}
        </a>
    );
};
