import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronLeft, ChevronRight, Download, FoldVertical, Minus, Plus, RotateCw, X } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

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
/** Pointer travel, in px, below which a press and release on the photo is a click rather than a pan. */
const PAN_THRESHOLD = 4;

/**
 * The pointer relative to the zoom layer's own centre, which is where the transform scales from.
 * The stage's padding is uneven (more on top), so its centre is not that point. offsetLeft/Top are
 * the layer's untransformed position, so a zoom already applied does not move the origin.
 */
const toLayerPoint = (clientX: number, clientY: number, stage: HTMLElement, layer: HTMLElement): Point => {
    const rect = stage.getBoundingClientRect();
    return {
        x: clientX - (rect.left + layer.offsetLeft + layer.offsetWidth / 2),
        y: clientY - (rect.top + layer.offsetTop + layer.offsetHeight / 2),
    };
};

/**
 * The photo as drawn at scale 1 and turned `turns` quarter turns (the element's own box is the
 * unturned one), and the frame it may not be dragged inside of: the layer box.
 */
const zoomBounds = (layer: HTMLElement, image: HTMLImageElement | null, turns: number) => {
    const page = { width: layer.offsetWidth, height: layer.offsetHeight };
    if (!image || image.offsetWidth <= 0) return { content: page, page };
    return { content: turnedContent({ width: image.offsetWidth, height: image.offsetHeight }, turns), page };
};

const sameZoom = (a: Zoom, b: Zoom) => a.scale === b.scale && a.x === b.x && a.y === b.y;

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
    const [zoom, setZoomState] = useState<Zoom>(IDENTITY_ZOOM);
    const zoomRef = useRef<Zoom>(IDENTITY_ZOOM);
    // A click, button or key glides to its zoom; the wheel and a drag follow the input as it comes.
    const [glide, setGlide] = useState(false);
    const [panning, setPanning] = useState(false);
    // Quarter turns clockwise since the picture was opened. It only counts up: the angle is `turns * 90`,
    // so the fourth press carries on to 360° rather than spinning back to 0°. The ref is for the wheel
    // listener, which outlives a render.
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
        /** Pressed on the photo itself, not the empty stage around it: only that zooms in. */
        onPhoto: boolean;
        /** Past the drag threshold: a pan, so letting go is not a click. */
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

    // A zoomed photo may have been dragged to an edge the turned one does not have. Measured after the
    // turn is laid out: before it, the element still has the other orientation's fitted size.
    useLayoutEffect(() => {
        const layer = layerRef.current;
        if (!layer) return;
        const { content, page } = zoomBounds(layer, imageRef.current, turns);
        setZoom(clampZoom(zoomRef.current, content, page), true);
    }, [turns, setZoom]);

    // Follows a new `openIndex` during render rather than in an effect, so opening takes
    // one render instead of two.
    if (openIndex !== seenOpenIndex) {
        setSeenOpenIndex(openIndex);
        if (openIndex !== null) setIndex(openIndex);
        setHasMoved(false);
        setNatural(null);
        resetZoom();
    }

    // A delete can shrink the set under the viewer; keep the index on a real image and
    // close once none are left.
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
                        // Chromium reports a trackpad pinch as a wheel with ctrlKey set.
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
                // A plain scrim. The frosted layer Figma drew left the app readable behind the
                // picture, competing with it, and cost a full-window blur on every frame.
                overlayClassName="bg-overlay/70"
                onKeyDown={event => {
                    // Whatever already handled the key (a control inside the viewer) keeps it.
                    if (event.defaultPrevented) return;
                    if (event.key === 'ArrowLeft') step(-1);
                    if (event.key === 'ArrowRight') step(1);
                    // Cmd/Ctrl with these is the shell's own page zoom; leave it alone.
                    if (event.metaKey || event.ctrlKey) return;
                    if (event.key === '+' || event.key === '=') zoomBy(1);
                    if (event.key === '-') zoomBy(-1);
                    if (event.key === '0') fitZoom();
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
                            <div
                                ref={setStageNode}
                                data-zoom-stage=""
                                className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-16 pb-4 pt-8"
                            >
                                {/* Fills the stage and keeps its shape, up to twice its own size:
                                    drawn at natural size, a small picture was a speck in the
                                    middle of the window. */}
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
                                        // The photo sizes itself against this box (cq units), so its
                                        // element is exactly the picture, with no letterbox around it.
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
                                        // A hand never holds perfectly still on a click; a few
                                        // pixels of drift is still a click, not a pan.
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
                                        // Zoomed, a click anywhere goes back to fit; at fit, only a
                                        // click on the photo zooms in, onto the point clicked.
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
                                            // Not while closing: the turn count resets then, and the photo
                                            // would spin backwards under the fading dialog.
                                            isOpen && 'transition-transform duration-200 ease-out',
                                            // Turned sideways its box is no longer what must fit: the
                                            // fit style bounds the turned picture instead.
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
                                        // Persistent, and on its own surface like previous/next: a
                                        // zoomed photo runs under it, and a bare glyph disappeared
                                        // into whatever the picture had there.
                                        className={cn(NAV_BUTTON, 'right-6 top-6 translate-y-0 hover:bg-accent')}
                                    >
                                        <X size={20} aria-hidden />
                                    </button>
                                )}
                            </div>
                            {/* Always on screen. It used to wait for a hover, so the only way to
                                learn the viewer could save or copy was to wave the pointer around. */}
                            <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 px-8 pb-6">
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
export const fitStyle = (natural: { width: number; height: number } | null): CSSProperties | undefined =>
    natural ? { maxWidth: natural.width * MAX_UPSCALE, maxHeight: natural.height * MAX_UPSCALE } : undefined;

/**
 * The viewer's picture at the largest size that fits the zoom layer and keeps its shape, capped at
 * `MAX_UPSCALE` times its own size. Sizing the element itself, rather than letterboxing it with
 * object-contain, keeps the zoom-in cursor and click on the photo and off the empty stage.
 * Turned a quarter, the element's height is what the layer's width must hold and its width what the
 * layer's height must hold, so the two bounds trade places.
 * Until the photo has loaded, max-width/max-height alone keep it inside.
 */
export const stageFitStyle = (natural: { width: number; height: number } | null, turns: number): CSSProperties | undefined => {
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

/** What a focused range input does with the keyboard, and so what the viewer must not also act on. */
const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

const BAR_DIVIDER = <span aria-hidden className="mx-1 h-5 w-px bg-hairline" />;

/**
 * The picture's controls on one raised pill: turn it, zoom out, a slider for the zoom in between, zoom
 * in, and back to fit. The wheel, a pinch and a click on the photo all zoom too, but none of them shows
 * on screen; this says that zooming exists and how far in it is.
 */
const ZoomControls = ({ scale, onRotate, onZoomOut, onZoomIn, onZoomTo, onFit }: ZoomControlsProps) => {
    const { t } = useTranslation();
    return (
        <div className="flex items-center rounded-lg bg-elevated p-1 shadow-raised">
            <Hint label={t('chat.image.rotate')}>
                <button type="button" onClick={onRotate} aria-label={t('chat.image.rotate')} className={ZOOM_BUTTON}>
                    <RotateCw size={16} aria-hidden />
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
                    <Minus size={16} aria-hidden />
                </button>
            </Hint>
            <input
                type="range"
                min={MIN_ZOOM_SCALE}
                max={MAX_ZOOM_SCALE}
                step={0.05}
                value={scale}
                onChange={event => onZoomTo(event.currentTarget.valueAsNumber)}
                // The slider's own keys move its thumb; they are not the viewer's ←/→ between pictures.
                onKeyDown={event => {
                    if (SLIDER_KEYS.has(event.key)) event.stopPropagation();
                }}
                aria-label={t('chat.image.zoomSlider')}
                aria-valuetext={`${Math.round(scale * 100)}%`}
                className="focus-ring mx-1 h-1 w-28 cursor-pointer accent-primary"
            />
            <Hint label={t('chat.image.zoomIn')}>
                <button
                    type="button"
                    onClick={onZoomIn}
                    disabled={scale >= MAX_ZOOM_SCALE}
                    aria-label={t('chat.image.zoomIn')}
                    className={ZOOM_BUTTON}
                >
                    <Plus size={16} aria-hidden />
                </button>
            </Hint>
            {BAR_DIVIDER}
            <Hint label={t('chat.image.zoomFit')}>
                <button type="button" onClick={onFit} aria-label={t('chat.image.zoomFit')} className={ZOOM_BUTTON}>
                    <FoldVertical size={16} aria-hidden />
                </button>
            </Hint>
        </div>
    );
};

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

/** The sender's avatar, as the message header draws it: the picture, or an initial on their color. */
export const AuthorAvatar = ({ author }: { author: ImageAuthor }) => (
    <Avatar className="h-9 w-9 shrink-0">
        {author.avatar && <AvatarImage src={author.avatar} alt={author.name} />}
        <AvatarFallback className="text-caption font-semibold" style={avatarStyle(author.colorSeed)}>
            {author.name.charAt(0).toUpperCase() || '?'}
        </AvatarFallback>
    </Avatar>
);
