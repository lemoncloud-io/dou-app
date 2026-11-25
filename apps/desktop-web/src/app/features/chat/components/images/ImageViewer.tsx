import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronLeft, ChevronRight, Download, FoldVertical, Minus, Plus, RotateCw, X } from 'lucide-react';

import {
    cn,
    Avatar,
    AvatarFallback,
    AvatarImage,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@chatic/ui-kit';

import { avatarStyle, Hint } from '../../../../shared';
import type { ChatImage } from '../../utils';
import { ImageActions } from './ImageActions';
import {
    clampZoom,
    IDENTITY_ZOOM,
    isZoomed,
    MAX_ZOOM_SCALE,
    MIN_ZOOM_SCALE,
    stepZoom,
    toggleZoom,
    turnedContent,
    type Point,
    type Size,
    type Zoom,
    wheelZoom,
    zoomTo,
} from './imageZoom';

export interface ImageAuthor {
    name: string;
    avatar?: string;
    colorSeed: string;
    time: string;
}

interface ImageViewerProps {
    images: ChatImage[];
    openIndex: number | null;
    onClose: () => void;
    author: ImageAuthor;
    onDownload: (image: ChatImage) => void;
    onDownloadAll: () => void;
    onCopy: (image: ChatImage) => void;
    onDelete?: (image: ChatImage) => void;
    onReply?: () => void;
    onLoadError?: (src: string) => void;
}

const NAV_BUTTON =
    'focus-ring absolute top-1/2 z-raised flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-elevated text-foreground shadow-raised disabled:hidden';

const MAX_UPSCALE = 2;
const PAN_THRESHOLD = 4;

const toLayerPoint = (clientX: number, clientY: number, stage: HTMLElement, layer: HTMLElement): Point => {
    const rect = stage.getBoundingClientRect();
    return {
        x: clientX - (rect.left + layer.offsetLeft + layer.offsetWidth / 2),
        y: clientY - (rect.top + layer.offsetTop + layer.offsetHeight / 2),
    };
};

const zoomBounds = (layer: HTMLElement, image: HTMLImageElement | null, turns: number) => {
    const page = { width: layer.offsetWidth, height: layer.offsetHeight };
    if (!image || image.offsetWidth <= 0) return { content: page, page };
    return { content: turnedContent({ width: image.offsetWidth, height: image.offsetHeight }, turns), page };
};

const sameZoom = (a: Zoom, b: Zoom) => a.scale === b.scale && a.x === b.x && a.y === b.y;

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
    onLoadError,
}: ImageViewerProps) => {
    const { t } = useTranslation();
    const [index, setIndex] = useState(openIndex ?? 0);
    const [hasMoved, setHasMoved] = useState(false);
    const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
    const [seenOpenIndex, setSeenOpenIndex] = useState(openIndex);
    const [zoom, setZoomState] = useState<Zoom>(IDENTITY_ZOOM);
    const zoomRef = useRef<Zoom>(IDENTITY_ZOOM);
    const [glide, setGlide] = useState(false);
    const [panning, setPanning] = useState(false);
    const [turns, setTurnsState] = useState(0);
    const turnsRef = useRef(0);
    const setTurns = (next: number) => {
        turnsRef.current = next;
        setTurnsState(next);
    };
    const setZoom = useCallback((next: Zoom, animate = false) => {
        if (sameZoom(zoomRef.current, next)) return;
        zoomRef.current = next;
        setGlide(animate);
        setZoomState(next);
    }, []);
    const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
    const setStageNode = useCallback((node: HTMLDivElement | null) => {
        setStageEl(previous => (previous === node ? previous : node));
    }, []);
    const imageRef = useRef<HTMLImageElement>(null);
    const layerRef = useRef<HTMLDivElement>(null);
    const panRef = useRef<{
        from: Zoom;
        startClientX: number;
        startClientY: number;
        content: Size;
        page: Size;
        onPhoto: boolean;
        moved: boolean;
    } | null>(null);
    const isOpen = openIndex !== null;
    const isMulti = images.length > 1;

    const endPan = () => {
        panRef.current = null;
        setPanning(false);
    };
    const zoomBy = (direction: 1 | -1) => {
        const layer = layerRef.current;
        if (!layer) return;
        const { content, page } = zoomBounds(layer, imageRef.current, turnsRef.current);
        setZoom(clampZoom(stepZoom(zoomRef.current, direction), content, page), true);
    };
    const zoomToScale = (scale: number) => {
        const layer = layerRef.current;
        if (!layer) return;
        const { content, page } = zoomBounds(layer, imageRef.current, turnsRef.current);
        setZoom(clampZoom(zoomTo(zoomRef.current, scale), content, page));
    };
    const fitZoom = () => setZoom(IDENTITY_ZOOM, true);
    const rotate = () => setTurns(turnsRef.current + 1);
    const resetZoom = () => {
        endPan();
        setZoom(IDENTITY_ZOOM);
        setTurns(0);
    };

    useLayoutEffect(() => {
        const layer = layerRef.current;
        if (!layer) return;
        const { content, page } = zoomBounds(layer, imageRef.current, turns);
        setZoom(clampZoom(zoomRef.current, content, page), true);
    }, [turns, setZoom]);

    if (openIndex !== seenOpenIndex) {
        setSeenOpenIndex(openIndex);
        if (openIndex !== null) setIndex(openIndex);
        setHasMoved(false);
        setNatural(null);
        resetZoom();
    }

    useEffect(() => {
        if (!isOpen) return;
        if (images.length === 0) onClose();
        else if (index > images.length - 1) setIndex(images.length - 1);
    }, [images.length, index, isOpen, onClose]);

    useEffect(() => {
        if (!stageEl) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const layer = layerRef.current;
            if (!layer) return;
            const { content, page } = zoomBounds(layer, imageRef.current, turnsRef.current);
            setZoom(
                clampZoom(
                    wheelZoom(
                        zoomRef.current,
                        event.deltaY,
                        toLayerPoint(event.clientX, event.clientY, stageEl, layer),
                        event.ctrlKey
                    ),
                    content,
                    page
                )
            );
        };
        stageEl.addEventListener('wheel', onWheel, { passive: false });
        return () => stageEl.removeEventListener('wheel', onWheel);
    }, [stageEl]);

    const current = images[Math.min(index, images.length - 1)];
    const position = Math.min(index, images.length - 1) + 1;
    const moveTo = (next: number) => {
        if (next !== index) {
            setNatural(null);
            resetZoom();
        }
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
                overlayClassName="bg-overlay/70"
                onKeyDown={event => {
                    if (event.defaultPrevented) return;
                    if (event.key === 'ArrowLeft') step(-1);
                    if (event.key === 'ArrowRight') step(1);
                    if (event.metaKey || event.ctrlKey) return;
                    if (event.key === '+' || event.key === '=') zoomBy(1);
                    if (event.key === '-') zoomBy(-1);
                    if (event.key === '0') fitZoom();
                }}
                className="inset-8 flex gap-0 overflow-hidden rounded-[20px] shadow-overlay outline-none"
            >
                <DialogTitle className="sr-only">{current?.name ?? t('chat.image.viewer')}</DialogTitle>
                <DialogDescription className="sr-only">
                    {t('chat.image.position', { index: position, count: images.length })}
                </DialogDescription>
                {isMulti && (
                    <span role="status" aria-live="polite" className="sr-only">
                        {hasMoved && t('chat.image.position', { index: position, count: images.length })}
                    </span>
                )}
                {current && (
                    <>
                        <div className="relative flex min-w-0 flex-1 flex-col bg-muted">
                            <div
                                ref={setStageNode}
                                data-zoom-stage=""
                                className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-16 pb-4 pt-8"
                            >
                                <div
                                    ref={layerRef}
                                    data-zoom-layer=""
                                    className={cn(
                                        'flex h-full w-full items-center justify-center',
                                        glide && 'transition-transform duration-200 ease-out',
                                        panning ? 'cursor-grabbing' : isZoomed(zoom) && 'cursor-zoom-out'
                                    )}
                                    style={{
                                        transform: `translate3d(${zoom.x}px, ${zoom.y}px, 0) scale(${zoom.scale})`,
                                        containerType: 'size',
                                    }}
                                    onPointerDown={event => {
                                        if (event.button !== 0) return;
                                        panRef.current = {
                                            from: zoomRef.current,
                                            startClientX: event.clientX,
                                            startClientY: event.clientY,
                                            ...zoomBounds(event.currentTarget, imageRef.current, turnsRef.current),
                                            onPhoto: event.target === imageRef.current,
                                            moved: false,
                                        };
                                        if (isZoomed(zoomRef.current)) {
                                            event.currentTarget.setPointerCapture(event.pointerId);
                                        }
                                    }}
                                    onPointerMove={event => {
                                        const pan = panRef.current;
                                        if (!pan || !isZoomed(pan.from)) return;
                                        const dx = event.clientX - pan.startClientX;
                                        const dy = event.clientY - pan.startClientY;
                                        if (!pan.moved && Math.hypot(dx, dy) < PAN_THRESHOLD) return;
                                        if (!pan.moved) {
                                            pan.moved = true;
                                            setPanning(true);
                                        }
                                        setZoom(
                                            clampZoom(
                                                { ...pan.from, x: pan.from.x + dx, y: pan.from.y + dy },
                                                pan.content,
                                                pan.page
                                            )
                                        );
                                    }}
                                    onPointerUp={event => {
                                        const pan = panRef.current;
                                        endPan();
                                        if (!pan || pan.moved || !stageEl) return;
                                        if (isZoomed(zoomRef.current)) {
                                            fitZoom();
                                            return;
                                        }
                                        if (!pan.onPhoto) return;
                                        const at = toLayerPoint(
                                            event.clientX,
                                            event.clientY,
                                            stageEl,
                                            event.currentTarget
                                        );
                                        setZoom(
                                            clampZoom(toggleZoom(zoomRef.current, at), pan.content, pan.page),
                                            true
                                        );
                                    }}
                                    onPointerCancel={endPan}
                                >
                                    <img
                                        ref={imageRef}
                                        key={current.id}
                                        src={current.url}
                                        alt={t('chat.image.alt', {
                                            index: position,
                                            count: images.length,
                                            name: author.name,
                                        })}
                                        draggable={false}
                                        onError={() => onLoadError?.(current.url)}
                                        onLoad={event =>
                                            setNatural({
                                                width: event.currentTarget.naturalWidth,
                                                height: event.currentTarget.naturalHeight,
                                            })
                                        }
                                        style={{
                                            ...stageFitStyle(natural, turns),
                                            transform: turns ? `rotate(${turns * 90}deg)` : undefined,
                                        }}
                                        className={cn(
                                            'select-none rounded-sm',
                                            isOpen && 'transition-transform duration-200 ease-out',
                                            (turns % 2 === 0 || !natural) && 'max-h-full max-w-full',
                                            !isZoomed(zoom) && 'cursor-zoom-in'
                                        )}
                                    />
                                </div>
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
                                        className={cn(NAV_BUTTON, 'right-6 top-6 translate-y-0 hover:bg-accent')}
                                    >
                                        <X size={20} aria-hidden />
                                    </button>
                                )}
                            </div>
                            <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 px-8 py-4">
                                <span className="min-w-0 truncate text-caption font-medium text-foreground">
                                    {current.name}
                                </span>
                                <ZoomControls
                                    scale={zoom.scale}
                                    onRotate={rotate}
                                    onZoomOut={() => zoomBy(-1)}
                                    onZoomIn={() => zoomBy(1)}
                                    onZoomTo={zoomToScale}
                                    onFit={fitZoom}
                                />
                                <div className="flex justify-end">
                                    <ImageActions
                                        onDownload={() => onDownload(current)}
                                        onCopy={() => onCopy(current)}
                                        onDelete={onDelete && (() => onDelete(current))}
                                    />
                                </div>
                            </div>
                        </div>
                        {isMulti && (
                            <aside className="flex w-[346px] shrink-0 flex-col border-l border-hairline bg-background">
                                <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-hairline px-6">
                                    <span className="text-title font-semibold text-foreground">
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
                                    <AuthorAvatar author={author} />
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
                                                        src={image.thumbUrl ?? image.url}
                                                        alt=""
                                                        loading="lazy"
                                                        decoding="async"
                                                        draggable={false}
                                                        onError={() => onLoadError?.(image.thumbUrl ?? image.url)}
                                                        className="h-full w-full object-cover"
                                                    />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                {onReply && (
                                    <div className="shrink-0 px-4 pb-4 pt-2">
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

export const fitStyle = (natural: { width: number; height: number } | null): CSSProperties | undefined =>
    natural ? { maxWidth: natural.width * MAX_UPSCALE, maxHeight: natural.height * MAX_UPSCALE } : undefined;

export const stageFitStyle = (
    natural: { width: number; height: number } | null,
    turns: number
): CSSProperties | undefined => {
    if (!natural || natural.width <= 0 || natural.height <= 0) return undefined;
    const ratio = natural.width / natural.height;
    const bound = turns % 2 === 0 ? `100cqw, calc(100cqh * ${ratio})` : `100cqh, calc(100cqw * ${ratio})`;
    return { width: `min(${natural.width * MAX_UPSCALE}px, ${bound})`, height: 'auto' };
};

interface ZoomControlsProps {
    scale: number;
    onRotate: () => void;
    onZoomOut: () => void;
    onZoomIn: () => void;
    onZoomTo: (scale: number) => void;
    onFit: () => void;
}

const ZOOM_BUTTON =
    'focus-ring flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors ease-tactile hover:bg-foreground/[0.08] disabled:pointer-events-none disabled:opacity-40';

const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

const BAR_DIVIDER = <span aria-hidden className="mx-1.5 h-5 w-px bg-foreground/15" />;

const ZoomControls = ({ scale, onRotate, onZoomOut, onZoomIn, onZoomTo, onFit }: ZoomControlsProps) => {
    const { t } = useTranslation();
    return (
        <div className="flex items-center rounded-xl border border-white/60 bg-white/70 p-1.5 shadow-raised backdrop-blur-xl dark:border-white/10 dark:bg-white/10">
            <Hint label={t('chat.image.rotate')}>
                <button type="button" onClick={onRotate} aria-label={t('chat.image.rotate')} className={ZOOM_BUTTON}>
                    <RotateCw size={20} strokeWidth={1.75} aria-hidden />
                </button>
            </Hint>
            {BAR_DIVIDER}
            <Hint label={t('chat.image.zoomOut')}>
                <button
                    type="button"
                    onClick={onZoomOut}
                    disabled={scale <= MIN_ZOOM_SCALE}
                    aria-label={t('chat.image.zoomOut')}
                    className={ZOOM_BUTTON}
                >
                    <Minus size={20} strokeWidth={1.75} aria-hidden />
                </button>
            </Hint>
            <input
                type="range"
                min={MIN_ZOOM_SCALE}
                max={MAX_ZOOM_SCALE}
                step={0.05}
                value={scale}
                onChange={event => onZoomTo(event.currentTarget.valueAsNumber)}
                onKeyDown={event => {
                    if (SLIDER_KEYS.has(event.key)) event.stopPropagation();
                }}
                aria-label={t('chat.image.zoomSlider')}
                aria-valuetext={`${Math.round(scale * 100)}%`}
                className="zoom-slider focus-ring mx-1 w-28 cursor-pointer"
            />
            <Hint label={t('chat.image.zoomIn')}>
                <button
                    type="button"
                    onClick={onZoomIn}
                    disabled={scale >= MAX_ZOOM_SCALE}
                    aria-label={t('chat.image.zoomIn')}
                    className={ZOOM_BUTTON}
                >
                    <Plus size={20} strokeWidth={1.75} aria-hidden />
                </button>
            </Hint>
            {BAR_DIVIDER}
            <Hint label={t('chat.image.zoomFit')}>
                <button type="button" onClick={onFit} aria-label={t('chat.image.zoomFit')} className={ZOOM_BUTTON}>
                    <FoldVertical size={20} strokeWidth={1.75} aria-hidden />
                </button>
            </Hint>
        </div>
    );
};

interface ImageSetMetaProps {
    count: number;
    onDownloadAll: () => void;
}

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

export const AuthorAvatar = ({ author }: { author: ImageAuthor }) => (
    <Avatar className="h-9 w-9 shrink-0">
        {author.avatar && <AvatarImage src={author.avatar} alt={author.name} />}
        <AvatarFallback className="text-caption font-semibold" style={avatarStyle(author.colorSeed)}>
            {author.name.charAt(0).toUpperCase() || '?'}
        </AvatarFallback>
    </Avatar>
);
