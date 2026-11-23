import { LinkPreviewCard } from '@chatic/web-ui-kit';

import { useUrlMetadata } from '../hooks/useUrlMetadata';
import { openExternalUrl } from '../utils/openExternalUrl';

export interface MessageLinkPreviewProps {
    url: string;
}

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
            className="w-full max-w-[260px]"
        />
    );
};
