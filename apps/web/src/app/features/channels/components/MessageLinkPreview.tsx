import { LinkPreviewCard } from '@chatic/web-ui-kit';

import { useUrlMetadata } from '../hooks/useUrlMetadata';
import { openExternalUrl } from '../utils/openExternalUrl';

export interface MessageLinkPreviewProps {
    url: string;
}

/**
 * Unfurl card for a message's first link — the data-bound half of the preview.
 *
 * Renders nothing until (and unless) there is something to show: a plain browser can't unfurl at
 * all, an older shell has no handler, and plenty of pages carry no og tags. All three end up here
 * as "no card", never as an error or a placeholder.
 */
export const MessageLinkPreview = ({ url }: MessageLinkPreviewProps) => {
    const meta = useUrlMetadata(url);
    if (!meta) return null;

    return (
        <LinkPreviewCard
            url={meta.url}
            title={meta.title}
            description={meta.description}
            imageUrl={meta.imageUrl}
            siteName={meta.siteName}
            onPress={event => {
                event.preventDefault();
                openExternalUrl(meta.url);
            }}
            className="w-[260px]"
        />
    );
};
