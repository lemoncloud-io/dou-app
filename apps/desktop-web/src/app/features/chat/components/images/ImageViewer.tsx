import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { avatarStyle } from '../../../../shared';
import type { ChatImage } from '../../utils';
import { ImageActions } from './ImageActions';

/** Who sent the images — the viewer's thread column repeats the message header. */
export interface ImageAuthor {
    name: string;
    avatar?: string;
    colorSeed: string;
    time: string;
}

interface ImageViewerProps {
    images: ChatImage[];
    /** Index to open on; the viewer is closed while this is null. */
    openIndex: number | null;
    onClose: () => void;
    author: ImageAuthor;
    onDownload: (image: ChatImage) => void;
    onDownloadAll: () => void;
    onCopy: (image: ChatImage) => void;
    /** Absent when the viewer cannot delete these files. */
    onDelete?: (image: ChatImage) => void;
    /** Continue in the thread panel. Absent inside the thread panel itself. */
    onReply?: () => void;
}

/** Shared shape of the round prev/next controls over the image. */
const NAV_BUTTON =
    'focus-ring absolute top-1/2 z-raised flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-elevated text-foreground shadow-raised disabled:hidden';

/** How far past its own size the stage may draw a small picture before it turns to mush. */
const MAX_UPSCALE = 2;

/**
 * Full-view image viewer (Figma "#full image view").
 *
 * One image: the picture alone with its name, save and "More" along the bottom. Several:
 * the picture with previous/next, and a thread column beside it that repeats the message
 * — author, "n files · Download all" and every image as a thumbnail — so the viewer can
 * jump anywhere in the set and carry on into the thread.
 */
export const ImageViewer = ({
    images,
    openIndex,
    onClose,
    author,
    onDownload,
    onDownloadAll,
    onCopy,
    onDelete,
    onReply,
}: ImageViewerProps) => {
    const { t } = useTranslation();
    const [index, setIndex] = useState(openIndex ?? 0);
    // The description says the position on open; the live line only speaks once it changes.
    const [hasMoved, setHasMoved] = useState(false);
    // The picture's own size, so the stage can fit it without blowing a thumbnail up to fill a monitor.
    const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
    const [seenOpenIndex, setSeenOpenIndex] = useState(openIndex);
    const isOpen = openIndex !== null;
    const isMulti = images.length > 1;

    // Follows a new `openIndex` during render rather than in an effect, so opening takes
    // one render instead of two.
    if (openIndex !== seenOpenIndex) {
        setSeenOpenIndex(openIndex);
        if (openIndex !== null) setIndex(openIndex);
        setHasMoved(false);
        setNatural(null);
    }

    // A delete can shrink the set under the viewer; keep the index on a real image and
    // close once none are left.
    useEffect(() => {
        if (!isOpen) return;
        if (images.length === 0) onClose();
        else if (index > images.length - 1) setIndex(images.length - 1);
    }, [images.length, index, isOpen, onClose]);

    const current = images[Math.min(index, images.length - 1)];
    const position = Math.min(index, images.length - 1) + 1;
    const moveTo = (next: number) => {
        if (next !== index) setNatural(null);
        setIndex(next);
        setHasMoved(true);
    };
    const step = (delta: number) => moveTo(Math.min(images.length - 1, Math.max(0, index + delta)));

    return (
        <Dialog open={isOpen && !!current} onOpenChange={open => !open && onClose()}>
            <DialogContent
                closeLabel={t('common.close')}
                variant="bare"
                hideClose
                // A plain scrim. The frosted layer Figma drew left the app readable behind the
                // picture, competing with it, and cost a full-window blur on every frame.
                overlayClassName="bg-overlay/70"
                onKeyDown={event => {
                    // Whatever already handled the key (a control inside the viewer) keeps it.
                    if (event.defaultPrevented) return;
                    if (event.key === 'ArrowLeft') step(-1);
                    if (event.key === 'ArrowRight') step(1);
                }}
                // 32px from every edge is the Figma frame, and it holds on any window size.
                className="inset-8 flex gap-0 overflow-hidden rounded-[20px] shadow-overlay outline-none"
            >
                <DialogTitle className="sr-only">{current?.name ?? t('chat.image.viewer')}</DialogTitle>
                <DialogDescription className="sr-only">
                    {t('chat.image.position', { index: position, count: images.length })}
                </DialogDescription>
                {/* The description is read once, on open. Stepping with the arrows changed the
                    picture in silence, so the position is also said as it changes. */}
                {isMulti && (
                    <span role="status" aria-live="polite" className="sr-only">
                        {hasMoved && t('chat.image.position', { index: position, count: images.length })}
                    </span>
                )}
                {current && (
                    <>
                        <div className="relative flex min-w-0 flex-1 flex-col bg-muted">
                            <div className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-4 pt-8">
                                {/* Fills the stage and keeps its shape, up to twice its own size:
                                    drawn at natural size, a small picture was a speck in the
                                    middle of the window. */}
                                <img
                                    key={current.id}
                                    src={current.url}
                                    alt={t('chat.image.alt', {
                                        index: position,
                                        count: images.length,
                                        name: author.name,
                                    })}
                                    draggable={false}
                                    onLoad={event =>
                                        setNatural({
                                            width: event.currentTarget.naturalWidth,
                                            height: event.currentTarget.naturalHeight,
                                        })
                                    }
                                    style={fitStyle(natural)}
                                    className="h-full w-full select-none rounded-sm object-contain"
                                />
                                {isMulti && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => step(-1)}
                                            disabled={index === 0}
                                            aria-label={t('chat.image.previous')}
                                            className={cn(NAV_BUTTON, 'left-7')}
                                        >
                                            <ChevronLeft size={18} aria-hidden />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => step(1)}
                                            disabled={index === images.length - 1}
                                            aria-label={t('chat.image.next')}
                                            className={cn(NAV_BUTTON, 'right-7')}
                                        >
                                            <ChevronRight size={18} aria-hidden />
                                        </button>
                                    </>
                                )}
                                {!isMulti && (
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        aria-label={t('chat.image.close')}
                                        // Persistent, unlike the secondary controls: with the app
                                        // still visible behind a frosted layer, nothing else on
                                        // screen says how to leave.
                                        className="focus-ring absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-foreground/[0.08]"
                                    >
                                        <X size={20} aria-hidden />
                                    </button>
                                )}
                            </div>
                            {/* Always on screen. It used to wait for a hover, so the only way to
                                learn the viewer could save or copy was to wave the pointer around. */}
                            <div className="flex shrink-0 items-center gap-3 px-8 pb-6">
                                <span className="min-w-0 flex-1 truncate text-caption font-medium text-foreground">
                                    {current.name}
                                </span>
                                <ImageActions
                                    onDownload={() => onDownload(current)}
                                    onCopy={() => onCopy(current)}
                                    onDelete={onDelete && (() => onDelete(current))}
                                />
                            </div>
                        </div>
                        {isMulti && (
                            <aside className="flex w-[346px] shrink-0 flex-col border-l border-hairline bg-background">
                                <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-hairline px-6">
                                    <span className="text-title font-semibold tracking-[-0.01em] text-foreground">
                                        {t('chat.image.setTitle', { count: images.length })}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        aria-label={t('chat.image.close')}
                                        className="focus-ring flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-accent"
                                    >
                                        <X size={20} aria-hidden />
                                    </button>
                                </header>
                                <div className="scrollbar-thin flex min-h-0 flex-1 gap-2.5 overflow-y-auto px-4 py-6">
                                    <Avatar className="h-9 w-9 shrink-0">
                                        {author.avatar && <AvatarImage src={author.avatar} alt={author.name} />}
                                        <AvatarFallback
                                            className="text-caption font-semibold"
                                            style={avatarStyle(author.colorSeed)}
                                        >
                                            {author.name.charAt(0).toUpperCase() || '?'}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                                        <div className="flex items-baseline gap-2">
                                            <span className="truncate text-lead font-bold text-foreground">
                                                {author.name}
                                            </span>
                                            <span className="shrink-0 text-caption font-medium text-description">
                                                {author.time}
                                            </span>
                                        </div>
                                        <ImageSetMeta count={images.length} onDownloadAll={onDownloadAll} />
                                        <div className="grid grid-cols-2 gap-2">
                                            {images.map((image, i) => (
                                                <button
                                                    key={image.id}
                                                    type="button"
                                                    onClick={() => moveTo(i)}
                                                    aria-label={t('chat.image.open', { name: image.name })}
                                                    aria-current={i === index ? 'true' : undefined}
                                                    className={cn(
                                                        'focus-ring aspect-square overflow-hidden rounded-2xl border border-hairline transition-shadow',
                                                        i === index &&
                                                            'ring-2 ring-ring ring-offset-2 ring-offset-background'
                                                    )}
                                                >
                                                    <img
                                                        src={image.url}
                                                        alt=""
                                                        loading="lazy"
                                                        decoding="async"
                                                        draggable={false}
                                                        className="h-full w-full object-cover"
                                                    />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                {onReply && (
                                    <div className="shrink-0 px-4 pb-4 pt-2">
                                        {/* It used to borrow the composer's shape — input border,
                                            placeholder colour, composer radius — so it read as
                                            typeable and instead closed the viewer. It is a button,
                                            and now looks like one. */}
                                        <Button
                                            variant="outline"
                                            className="w-full"
                                            onClick={() => {
                                                onClose();
                                                onReply();
                                            }}
                                        >
                                            {t('chat.image.reply')}
                                        </Button>
                                    </div>
                                )}
                            </aside>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
};

/** Caps the picture at `MAX_UPSCALE` times its own size; until it has loaded, no cap. */
const fitStyle = (natural: { width: number; height: number } | null): CSSProperties | undefined =>
    natural ? { maxWidth: natural.width * MAX_UPSCALE, maxHeight: natural.height * MAX_UPSCALE } : undefined;

interface ImageSetMetaProps {
    count: number;
    onDownloadAll: () => void;
}

/** "n files · Download all" — the line above a multi-image grid, in the feed and in the viewer. */
export const ImageSetMeta = ({ count, onDownloadAll }: ImageSetMetaProps) => {
    const { t } = useTranslation();
    return (
        <div className="flex items-center gap-3 text-caption font-medium text-muted-foreground">
            <span>{t('chat.image.fileCount', { count })}</span>
            <button
                type="button"
                onClick={onDownloadAll}
                className="focus-ring flex items-center gap-1 rounded transition-colors hover:text-foreground"
            >
                <Download size={14} aria-hidden />
                {t('chat.image.downloadAll')}
            </button>
        </div>
    );
};
