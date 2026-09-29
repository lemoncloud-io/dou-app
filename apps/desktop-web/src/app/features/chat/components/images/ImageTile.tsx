import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Download, ImageOff, MoreVertical } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

import type { ChatImage } from '../../utils';
import { ImageMoreMenu } from './ImageMoreMenu';
import { ImageSpinner } from './ImageSpinner';
import { Hint } from '../../../../shared';

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
 * on click. The save + "More" bar only shows on hover or keyboard focus, and stays up
 * while its menu is open — the menu portals out of the tile, so hover alone would drop
 * the bar from under the pointer.
 */
export const ImageTile = ({ image, overflow = 0, onOpen, onDownload, onCopy, onDelete, className }: ImageTileProps) => {
    const { t } = useTranslation();
    const [isMenuOpen, setMenuOpen] = useState(false);
    const hasOverflow = overflow > 0;
    // Nothing to open or save yet (uploading) or at all (failed).
    const isInactive = !!image.isUploading || !!image.isFailed;
    // The feed draws the thumbnail when the server made one; the viewer opens the original.
    const src = image.thumbUrl ?? image.url;

    return (
        <div
            className={cn(
                'group/tile relative aspect-square overflow-hidden rounded-2xl border border-hairline bg-muted',
                className
            )}
        >
            <button
                type="button"
                onClick={onOpen}
                disabled={isInactive}
                aria-label={
                    hasOverflow
                        ? t('chat.image.more', { count: overflow })
                        : image.isFailed
                          ? t('chat.image.failed')
                          : t('chat.image.open', { name: image.name })
                }
                className="focus-ring absolute inset-0 rounded-2xl"
            >
                {src && !image.isFailed && (
                    <img
                        src={src}
                        alt={image.name}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        className={cn('h-full w-full object-cover', image.isUploading && 'scale-105 blur-[2px]')}
                    />
                )}
                {image.isFailed && (
                    <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                        <ImageOff size={24} aria-hidden />
                    </span>
                )}
                {(hasOverflow || image.isUploading) && <span aria-hidden className="absolute inset-0 bg-overlay/40" />}
                {(hasOverflow || image.isUploading) && (
                    <span className="absolute inset-0 flex items-center justify-center">
                        {image.isUploading && <ImageSpinner className="absolute h-11 w-11" />}
                        {hasOverflow && (
                            <span className="text-display font-semibold tracking-[-0.01em] text-white">
                                +{overflow}
                            </span>
                        )}
                    </span>
                )}
            </button>
            {!isInactive && !hasOverflow && (
                <div
                    className={cn(
                        'absolute right-2 top-2 flex items-center gap-2 rounded-lg border border-border bg-background/70 px-2 py-1.5 shadow-raised transition-opacity duration-150 ease-tactile',
                        isMenuOpen ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover/tile:opacity-100'
                    )}
                >
                    <Hint label={t('chat.image.download')}>
                        <button
                            type="button"
                            onClick={onDownload}
                            aria-label={t('chat.image.download')}
                            className="focus-ring flex h-9 w-9 items-center justify-center rounded text-foreground"
                        >
                            <Download size={16} aria-hidden />
                        </button>
                    </Hint>
                    <ImageMoreMenu
                        onCopy={onCopy}
                        onDelete={onDelete}
                        onOpenChange={setMenuOpen}
                        trigger={
                            <Hint label={t('chat.image.menu')}>
                                <button
                                    type="button"
                                    aria-label={t('chat.image.menu')}
                                    className="focus-ring flex h-9 w-9 items-center justify-center rounded bg-foreground/[0.08] text-foreground"
                                >
                                    <MoreVertical size={16} aria-hidden />
                                </button>
                            </Hint>
                        }
                    />
                </div>
            )}
        </div>
    );
};
