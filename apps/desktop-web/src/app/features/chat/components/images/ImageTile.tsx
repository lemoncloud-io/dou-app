import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ImageOff } from 'lucide-react';

import { cn } from '@chatic/ui-kit';

import type { ChatImage } from '../../utils';
import { ImageActions } from './ImageActions';
import { ImageSpinner } from './ImageSpinner';
import { hoverReveal } from '../../../../shared';

interface ImageTileProps {
    image: ChatImage;
    overflow?: number;
    onOpen: () => void;
    onDownload: () => void;
    onCopy: () => void;
    onDelete?: () => void;
    onReply?: () => void;
    onCopyLink?: () => void;
    onForward?: () => void;
    className?: string;
    onLoadError?: (src: string) => void;
}

export const ImageTile = ({
    image,
    overflow = 0,
    onOpen,
    onDownload,
    onCopy,
    onDelete,
    onReply,
    onCopyLink,
    onForward,
    className,
    onLoadError,
}: ImageTileProps) => {
    const { t } = useTranslation();
    const [deadSrcs, setDeadSrcs] = useState<readonly string[]>([]);
    const hasOverflow = overflow > 0;
    const isUploading = !!image.isUploading;
    const thumb = image.thumbUrl && !deadSrcs.includes(image.thumbUrl) ? image.thumbUrl : undefined;
    const src = thumb ?? image.url;
    const isDead = !!src && deadSrcs.includes(src);
    const isFailed = !!image.isFailed || isDead;
    const isInactive = isUploading || isFailed;
    const markDead = () => {
        setDeadSrcs(previous => [...previous, src]);
        if (src === image.url) onLoadError?.(src);
    };

    return (
        <div
            className={cn(
                'group/tile relative aspect-square overflow-hidden rounded-2xl border border-hairline bg-muted',
                className
            )}
        >
            <button
                type="button"
                onClick={() => {
                    if (!isInactive) onOpen();
                }}
                aria-disabled={isInactive || undefined}
                aria-busy={isUploading || undefined}
                aria-label={
                    isUploading
                        ? t('chat.image.uploading', { name: image.name })
                        : isFailed
                          ? t('chat.image.failed')
                          : hasOverflow
                            ? t('chat.image.more', { count: overflow })
                            : t('chat.image.open', { name: image.name })
                }
                className={cn('focus-ring absolute inset-0 rounded-2xl', isInactive && 'cursor-default')}
            >
                {src && !isFailed && (
                    <img
                        src={src}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        onError={markDead}
                        className={cn('h-full w-full object-cover', isUploading && 'scale-105 blur-[2px]')}
                    />
                )}
                {isFailed && (
                    <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                        <ImageOff size={24} aria-hidden />
                    </span>
                )}
                {(hasOverflow || isUploading) && <span aria-hidden className="absolute inset-0 bg-overlay/50" />}
                {(hasOverflow || isUploading) && (
                    <span className="absolute inset-0 flex items-center justify-center">
                        {isUploading && <ImageSpinner className="absolute h-11 w-11" />}
                        {hasOverflow && (
                            <span aria-hidden className="text-display font-semibold text-on-overlay">
                                +{overflow}
                            </span>
                        )}
                    </span>
                )}
            </button>
            {!isInactive && !hasOverflow && (
                <ImageActions
                    onDownload={onDownload}
                    onCopy={onCopy}
                    onDelete={onDelete}
                    onReply={onReply}
                    onCopyLink={onCopyLink}
                    onForward={onForward}
                    variant="overlay"
                    className={cn('absolute right-2 top-2', hoverReveal('tile'))}
                />
            )}
        </div>
    );
};
