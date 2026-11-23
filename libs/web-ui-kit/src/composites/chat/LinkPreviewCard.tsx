import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface LinkPreviewCardProps {
    url: string;
    title: string;
    description?: string;
    imageUrl?: string;
    siteName?: string;
    onPress?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
    className?: string;
}

export const LinkPreviewCard = ({
    url,
    title,
    description,
    imageUrl,
    siteName,
    onPress,
    className,
}: LinkPreviewCardProps) => {
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
                    referrerPolicy="no-referrer"
                    onError={() => setImageFailed(true)}
                    className="size-14 shrink-0 rounded-lg bg-secondary object-cover"
                />
            )}
        </a>
    );
};
