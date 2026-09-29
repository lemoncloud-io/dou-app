import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';

import type { ChatImage } from '../../utils';
import { ImageActions } from './ImageActions';
import { ImageSpinner } from './ImageSpinner';
import { hoverReveal } from '../../../../shared';

interface ImageTileProps {
    image: ChatImage;
    /** Images hidden behind this tile — draws the "+n" counter over it. */
    overflow?: number;
    onOpen: () => void;
    onDownload: () => void;
    onCopy: () => void;
    onDelete?: () => void;
    className?: string;
}

/**
 * One image in a message (Figma "Image"): rounded, hairline-bordered, opens the viewer
 * on click. Save, copy and delete sit in a bar over the corner that shows on hover or
 * keyboard focus (always, on a device without hover).
 *
 * An uploading tile stays in the tab order and says so. It used to be a disabled
 * button, which a screen reader skips, so the upload had no presence at all.
 */
export const ImageTile = ({ image, overflow = 0, onOpen, onDownload, onCopy, onDelete, className }: ImageTileProps) => {
    const { t } = useTranslation();
    const hasOverflow = overflow > 0;
    const isUploading = !!image.isUploading;

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
                    if (!isUploading) onOpen();
                }}
                aria-disabled={isUploading || undefined}
                aria-busy={isUploading || undefined}
                aria-label={
                    isUploading
                        ? t('chat.image.uploading', { name: image.name })
                        : hasOverflow
                          ? t('chat.image.more', { count: overflow })
                          : t('chat.image.open', { name: image.name })
                }
                className={cn('focus-ring absolute inset-0 rounded-2xl', isUploading && 'cursor-default')}
            >
                <img
                    src={image.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className={cn('h-full w-full object-cover', isUploading && 'scale-105 blur-[2px]')}
                />
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
            {!isUploading && !hasOverflow && (
                <ImageActions
                    onDownload={onDownload}
                    onCopy={onCopy}
                    onDelete={onDelete}
                    variant="overlay"
                    className={cn('absolute right-2 top-2', hoverReveal('tile'))}
                />
            )}
        </div>
    );
};
