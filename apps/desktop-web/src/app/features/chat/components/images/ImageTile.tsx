import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Download, MoreVertical } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

import type { ChatImage } from '../../utils';
import { ImageMoreMenu } from './ImageMoreMenu';
import { ImageSpinner } from './ImageSpinner';

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
 * One image in a message (Figma "이미지"): rounded, hairline-bordered, opens the viewer
 * on click. The save + "더보기" bar only shows on hover or keyboard focus, and stays up
 * while its menu is open — the menu portals out of the tile, so hover alone would drop
 * the bar from under the pointer.
 */
export const ImageTile = ({ image, overflow = 0, onOpen, onDownload, onCopy, onDelete, className }: ImageTileProps) => {
    const { t } = useTranslation();
    const [isMenuOpen, setMenuOpen] = useState(false);
    const hasOverflow = overflow > 0;

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
                disabled={image.isUploading}
                aria-label={
                    hasOverflow ? t('chat.image.more', { count: overflow }) : t('chat.image.open', { name: image.name })
                }
                className="focus-ring absolute inset-0 rounded-2xl"
            >
                <img
                    src={image.url}
                    alt={image.name}
                    draggable={false}
                    className={cn('h-full w-full object-cover', image.isUploading && 'scale-105 blur-[2px]')}
                />
                {(hasOverflow || image.isUploading) && <span aria-hidden className="absolute inset-0 bg-black/40" />}
                {(hasOverflow || image.isUploading) && (
                    <span className="absolute inset-0 flex items-center justify-center">
                        {image.isUploading && <ImageSpinner className="absolute h-11 w-11" />}
                        {hasOverflow && (
                            <span className="text-[32px] font-semibold tracking-[-0.01em] text-white">+{overflow}</span>
                        )}
                    </span>
                )}
            </button>
            {!image.isUploading && !hasOverflow && (
                <div
                    className={cn(
                        'absolute right-2 top-2 flex items-center gap-2 rounded-lg border border-border bg-background/70 px-2 py-1.5 shadow-[0_1px_4px_rgba(0,0,0,0.08)] backdrop-blur-[4px] transition-opacity duration-150 ease-tactile',
                        isMenuOpen ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover/tile:opacity-100'
                    )}
                >
                    <button
                        type="button"
                        onClick={onDownload}
                        title={t('chat.image.download')}
                        aria-label={t('chat.image.download')}
                        className="focus-ring flex h-5 w-5 items-center justify-center rounded text-foreground"
                    >
                        <Download size={16} aria-hidden />
                    </button>
                    <ImageMoreMenu
                        onCopy={onCopy}
                        onDelete={onDelete}
                        onOpenChange={setMenuOpen}
                        trigger={
                            <button
                                type="button"
                                title={t('chat.image.menu')}
                                aria-label={t('chat.image.menu')}
                                className="focus-ring flex h-5 w-5 items-center justify-center rounded bg-foreground/[0.08] text-foreground"
                            >
                                <MoreVertical size={16} aria-hidden />
                            </button>
                        }
                    />
                </div>
            )}
        </div>
    );
};
