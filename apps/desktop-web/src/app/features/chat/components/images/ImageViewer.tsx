import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Download, MoreVertical, X } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import {
    Dialog,
    DialogDescription,
    DialogOverlay,
    DialogPortal,
    DialogTitle,
} from '@chatic/ui-kit/components/ui/dialog';

import { avatarStyle } from '../../../../shared';
import type { ChatImage } from '../../utils';
import { ImageMoreMenu } from './ImageMoreMenu';

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
    'focus-ring absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-raised transition-opacity duration-150 ease-tactile disabled:hidden';

/** Controls that surface on hover or focus ("메뉴나 닫기 버튼 호버 시 노출"). */
const REVEAL = 'opacity-0 group-hover/viewer:opacity-100 focus-visible:opacity-100 focus-within:opacity-100';

/**
 * Full-view image viewer (Figma "#이미지 전체보기").
 *
 * One image: the picture alone with its name, save and "더보기" along the bottom. Several:
 * the picture with previous/next, and a thread column beside it that repeats the message
 * — author, "n개 파일 · 전체 다운로드" and every image as a thumbnail — so the viewer can
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
    const [index, setIndex] = useState(0);
    const [isMenuOpen, setMenuOpen] = useState(false);
    const isOpen = openIndex !== null;
    const isMulti = images.length > 1;

    useEffect(() => {
        if (openIndex !== null) setIndex(openIndex);
    }, [openIndex]);

    // A delete can shrink the set under the viewer; keep the index on a real image and
    // close once none are left.
    useEffect(() => {
        if (!isOpen) return;
        if (images.length === 0) onClose();
        else if (index > images.length - 1) setIndex(images.length - 1);
    }, [images.length, index, isOpen, onClose]);

    const current = images[Math.min(index, images.length - 1)];
    const step = (delta: number) => setIndex(i => Math.min(images.length - 1, Math.max(0, i + delta)));

    return (
        <Dialog open={isOpen && !!current} onOpenChange={open => !open && onClose()}>
            <DialogPortal>
                {/* Figma: the app stays visible behind the viewer, frosted rather than blacked out. */}
                <DialogOverlay className="bg-background/40 backdrop-blur-md" />
                <DialogPrimitive.Content
                    onKeyDown={event => {
                        if (event.key === 'ArrowLeft') step(-1);
                        if (event.key === 'ArrowRight') step(1);
                    }}
                    // 32px from every edge is the Figma frame, and it holds on any window size.
                    className="group/viewer fixed inset-8 z-50 flex overflow-hidden rounded-[20px] bg-background shadow-overlay outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
                >
                    <DialogTitle className="sr-only">{current?.name ?? t('chat.image.viewer')}</DialogTitle>
                    <DialogDescription className="sr-only">
                        {t('chat.image.position', { index: index + 1, count: images.length })}
                    </DialogDescription>
                    {current && (
                        <>
                            <div className="relative flex min-w-0 flex-1 flex-col bg-muted">
                                <div className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-4 pt-8">
                                    <img
                                        src={current.url}
                                        alt={current.name}
                                        draggable={false}
                                        className="max-h-full max-w-full select-none rounded-sm object-contain"
                                    />
                                    {isMulti && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => step(-1)}
                                                disabled={index === 0}
                                                aria-label={t('chat.image.previous')}
                                                className={cn(NAV_BUTTON, 'left-7', REVEAL)}
                                            >
                                                <ChevronLeft size={18} aria-hidden />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => step(1)}
                                                disabled={index === images.length - 1}
                                                aria-label={t('chat.image.next')}
                                                className={cn(NAV_BUTTON, 'right-7', REVEAL)}
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
                                            className={cn(
                                                'focus-ring absolute right-6 top-6 flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-opacity hover:bg-foreground/[0.08]',
                                                REVEAL
                                            )}
                                        >
                                            <X size={20} aria-hidden />
                                        </button>
                                    )}
                                </div>
                                <div
                                    className={cn(
                                        'flex shrink-0 items-center gap-3 px-8 pb-6',
                                        isMenuOpen ? 'opacity-100' : REVEAL
                                    )}
                                >
                                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                                        {current.name}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => onDownload(current)}
                                        title={t('chat.image.download')}
                                        aria-label={t('chat.image.download')}
                                        className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-foreground hover:bg-foreground/[0.08]"
                                    >
                                        <Download size={18} aria-hidden />
                                    </button>
                                    <ImageMoreMenu
                                        side="top"
                                        onCopy={() => onCopy(current)}
                                        onDelete={onDelete && (() => onDelete(current))}
                                        onOpenChange={setMenuOpen}
                                        trigger={
                                            <button
                                                type="button"
                                                title={t('chat.image.menu')}
                                                aria-label={t('chat.image.menu')}
                                                className="focus-ring flex h-7 w-7 items-center justify-center rounded-md bg-foreground/[0.08] text-foreground"
                                            >
                                                <MoreVertical size={18} aria-hidden />
                                            </button>
                                        }
                                    />
                                </div>
                            </div>
                            {isMulti && (
                                <aside className="flex w-[346px] shrink-0 flex-col border-l border-hairline bg-background">
                                    <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-hairline px-6">
                                        <span className="text-[18px] font-semibold tracking-[-0.01em] text-foreground">
                                            {t('chat.thread.title')}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            aria-label={t('chat.image.close')}
                                            className="focus-ring flex h-8 w-8 items-center justify-center rounded-md text-foreground hover:bg-accent"
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
                                                <span className="truncate text-[16px] font-bold text-foreground">
                                                    {author.name}
                                                </span>
                                                <span className="shrink-0 text-[13px] font-medium text-description">
                                                    {author.time}
                                                </span>
                                            </div>
                                            <ImageSetMeta count={images.length} onDownloadAll={onDownloadAll} />
                                            <div className="grid grid-cols-2 gap-2">
                                                {images.map((image, i) => (
                                                    <button
                                                        key={image.id}
                                                        type="button"
                                                        onClick={() => setIndex(i)}
                                                        aria-label={t('chat.image.open', { name: image.name })}
                                                        aria-current={i === index ? 'true' : undefined}
                                                        className={cn(
                                                            'focus-ring aspect-square overflow-hidden rounded-2xl border border-hairline transition-shadow',
                                                            i === index &&
                                                                'ring-2 ring-main-accent ring-offset-2 ring-offset-background'
                                                        )}
                                                    >
                                                        <img
                                                            src={image.url}
                                                            alt=""
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
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    onClose();
                                                    onReply();
                                                }}
                                                className="focus-ring flex w-full items-center rounded-2xl border border-input bg-background px-5 py-4 text-left text-[15px] text-placeholder transition-colors hover:border-main-accent"
                                            >
                                                {t('chat.image.reply')}
                                            </button>
                                        </div>
                                    )}
                                </aside>
                            )}
                        </>
                    )}
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
};

interface ImageSetMetaProps {
    count: number;
    onDownloadAll: () => void;
}

/** "n개 파일 · 전체 다운로드" — the line above a multi-image grid, in the feed and in the viewer. */
export const ImageSetMeta = ({ count, onDownloadAll }: ImageSetMetaProps) => {
    const { t } = useTranslation();
    return (
        <div className="flex items-center gap-3 text-[13px] font-medium tracking-[-0.005em] text-placeholder">
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
