import * as Dialog from '@radix-ui/react-dialog';
import * as React from 'react';

import { cn } from '@chatic/ui-kit';
import { useToastLift } from '@chatic/ui-kit/components/ui/toaster';

import {
    IconBack,
    IconChevronRight,
    IconClose,
    IconImage,
    IconPlaySolid,
    IconSpinner,
} from '@chatic/design-system-assets/icons';
import {
    clampZoom,
    doubleTapZoom,
    IDENTITY_ZOOM,
    isZoomed,
    pinchZoom,
    settleZoom,
    type Pinch,
    type Point,
    type Size,
    type Zoom,
} from './imageZoom';
import {
    DRAG_SLOP_PX,
    FLICK_MAX_MS,
    isOwnEvent,
    pagerDragOffset,
    pagerReleaseStep,
    VIEWER_MOTION,
} from './viewerShell';

export interface MediaViewerItem {
    key: string;
    kind: 'image' | 'video';
    src?: string;
    preview?: string;
    state: 'ready' | 'sending' | 'broken';
}

export interface MediaViewerLabels {
    title: string;
    close: string;
    previous: string;
    next: string;
    play: string;
}

const DEFAULT_LABELS: MediaViewerLabels = {
    title: 'Media',
    close: 'Close',
    previous: 'Previous',
    next: 'Next',
    play: 'Play video',
};

export interface MediaViewerProps {
    items: readonly MediaViewerItem[];
    index: number | null;
    onIndexChange: (index: number) => void;
    onClose: () => void;
    onError?: (index: number) => void;
    autoPlay?: boolean;
    renderFooter?: (index: number) => React.ReactNode;
    labels?: Partial<MediaViewerLabels>;
}

export interface MediaViewerActionButtonProps {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    busy?: boolean;
    progress?: number | null;
    children: React.ReactNode;
}

const RING_RADIUS = 14;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export const MediaViewerActionButton = ({
    label,
    onClick,
    disabled,
    busy,
    progress,
    children,
}: MediaViewerActionButtonProps) => (
    <button
        type="button"
        aria-label={label}
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        disabled={disabled && !busy}
        onClick={() => {
            if (!busy) onClick();
        }}
        className={cn(
            'flex size-9 items-center justify-center rounded-full bg-white/20 text-white',
            disabled && !busy && 'opacity-40'
        )}
    >
        {!busy ? (
            children
        ) : progress !== null && progress !== undefined ? (
            <svg
                viewBox="0 0 32 32"
                className="size-6 -rotate-90"
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                data-progress={Math.round(progress * 100)}
            >
                <circle
                    cx="16"
                    cy="16"
                    r={RING_RADIUS}
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity={0.3}
                    strokeWidth={3}
                />
                <circle
                    cx="16"
                    cy="16"
                    r={RING_RADIUS}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeDasharray={RING_LENGTH}
                    strokeDashoffset={RING_LENGTH * (1 - Math.min(Math.max(progress, 0), 1))}
                    strokeLinecap="round"
                />
            </svg>
        ) : (
            <IconSpinner className="size-5 animate-spin" aria-hidden="true" />
        )}
    </button>
);

const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_SLOP_PX = 30;
const VIDEO_CONTROLS_PX = 72;
const DISMISS_MIN_PX = 96;
const DISMISS_FLICK_MIN_PX = 48;
const DISMISS_FADE_PX = 480;

const dismissBackdropOpacity = (offset: number): number => Math.max(0, 1 - offset / DISMISS_FADE_PX);

const shouldDismiss = (offset: number, elapsedMs: number, height: number): boolean =>
    offset >= Math.max(DISMISS_MIN_PX, height / 6) || (elapsedMs <= FLICK_MAX_MS && offset >= DISMISS_FLICK_MIN_PX);

interface Press {
    x: number;
    y: number;
    at: number;
    axis: 'x' | 'y' | null;
}

const releaseVideo = (video: HTMLVideoElement) => {
    video.pause();
    video.currentTime = 0;
    video.removeAttribute('src');
    video.load();
};

interface ViewerVideoProps {
    src: string;
    poster?: string;
    playOnMount: boolean;
    playLabel: string;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    onError: () => void;
}

const ViewerVideo = ({ src, poster, playOnMount, playLabel, videoRef, onError }: ViewerVideoProps) => {
    const [blocked, setBlocked] = React.useState(false);

    const play = (video: HTMLVideoElement, isLive: () => boolean) => {
        const started = video.play() as Promise<void> | undefined;
        started?.catch?.((error: unknown) => {
            if (isLive() && (error as { name?: string } | null)?.name === 'NotAllowedError') setBlocked(true);
        });
    };

    React.useLayoutEffect(() => {
        const video = videoRef.current;
        if (!video) return undefined;
        let live = true;
        video.setAttribute('src', src);
        if (playOnMount) play(video, () => live);
        return () => {
            live = false;
            releaseVideo(video);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src, videoRef]);

    return (
        <>
            <video
                ref={videoRef}
                poster={poster}
                controls
                playsInline
                preload="metadata"
                className="size-full object-contain"
                onPlay={() => setBlocked(false)}
                onError={onError}
            />
            {blocked && (
                <button
                    type="button"
                    aria-label={playLabel}
                    onClick={() => {
                        const video = videoRef.current;
                        if (video) play(video, () => true);
                    }}
                    className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50"
                >
                    <IconPlaySolid size={36} className="text-white" />
                </button>
            )}
        </>
    );
};

export const MEDIA_VIEWER_FOOTER_TOAST_LIFT = 76;

export const MediaViewer = ({
    items,
    index,
    onIndexChange,
    onClose,
    onError,
    autoPlay = false,
    renderFooter,
    labels,
}: MediaViewerProps) => {
    const text = { ...DEFAULT_LABELS, ...labels };
    const open = index !== null && index >= 0 && index < items.length;
    const [lastShown, setLastShown] = React.useState(open ? index : 0);
    if (open && lastShown !== index) setLastShown(index);
    const current = open ? index : Math.min(lastShown, Math.max(items.length - 1, 0));
    const many = items.length > 1;
    const hasPrevious = many && current > 0;
    const hasNext = many && current < items.length - 1;
    const showingItem = open ? items[current] : undefined;
    const showingVideo = showingItem?.kind === 'video';

    useToastLift(open && renderFooter !== undefined ? MEDIA_VIEWER_FOOTER_TOAST_LIFT : null);

    const go = (step: -1 | 1) => {
        if (!open) return;
        const target = current + step;
        if (target >= 0 && target < items.length) onIndexChange(target);
    };

    const [session, setSession] = React.useState<{ open: boolean; at: number | null }>({ open: false, at: null });
    const [dismissY, setDismissY] = React.useState(0);
    const [dismissHeld, setDismissHeld] = React.useState(false);
    if (session.open !== open) {
        setSession({ open, at: open ? current : null });
        if (open) setDismissY(0);
    } else if (session.at !== null && session.at !== current) setSession({ open, at: null });

    const [loaded, setLoaded] = React.useState<ReadonlySet<string>>(() => new Set());
    const markLoaded = (src: string) =>
        setLoaded(previous =>
            previous.has(src)
                ? previous
                : new Set([...previous].filter(known => items.some(item => item.src === known))).add(src)
        );

    const [dragX, setDragX] = React.useState(0);
    const [dragging, setDragging] = React.useState(false);
    const pressRef = React.useRef<Press | null>(null);
    const swipedRef = React.useRef(false);
    const stripRef = React.useRef<HTMLDivElement>(null);
    const contentRef = React.useRef<HTMLDivElement>(null);
    const imageRef = React.useRef<HTMLImageElement | null>(null);
    const videoRef = React.useRef<HTMLVideoElement | null>(null);

    const [zoom, setZoomState] = React.useState<Zoom>(IDENTITY_ZOOM);
    const zoomRef = React.useRef<Zoom>(IDENTITY_ZOOM);
    const setZoom = (next: Zoom) => {
        zoomRef.current = next;
        setZoomState(next);
    };
    const [gesturing, setGesturing] = React.useState(false);
    const pointersRef = React.useRef(new Map<number, Point>());
    const pinchRef = React.useRef<Pinch | null>(null);
    const panRef = React.useRef<{ from: Zoom; start: Point } | null>(null);
    const tapStartRef = React.useRef<Point | null>(null);
    const lastTapRef = React.useRef<{ at: number; point: Point } | null>(null);

    React.useEffect(() => {
        if (!open) return;
        zoomRef.current = IDENTITY_ZOOM;
        setZoomState(IDENTITY_ZOOM);
        pinchRef.current = null;
        panRef.current = null;
        lastTapRef.current = null;
        pointersRef.current.clear();
    }, [current, open]);

    const toPage = (event: React.PointerEvent): Point => {
        const rect = contentRef.current?.getBoundingClientRect();
        if (!rect) return { x: event.clientX, y: event.clientY };
        return { x: event.clientX - (rect.left + rect.width / 2), y: event.clientY - (rect.top + rect.height / 2) };
    };
    const pageSize = (): Size => ({
        width: contentRef.current?.clientWidth ?? 0,
        height: contentRef.current?.clientHeight ?? 0,
    });
    const contentSize = (): Size => {
        const image = imageRef.current;
        return image && image.offsetWidth > 0 ? { width: image.offsetWidth, height: image.offsetHeight } : pageSize();
    };
    const onVideoControls = (event: React.PointerEvent) => {
        const video = showingVideo ? videoRef.current : null;
        if (!video) return false;
        const rect = video.getBoundingClientRect();
        return event.clientY <= rect.bottom && event.clientY >= rect.bottom - VIDEO_CONTROLS_PX;
    };

    const capture = (event: React.PointerEvent) => {
        try {
            (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
        } catch {
            // A synthetic or already-released pointer — the moves still arrive while inside.
        }
    };

    const endDrag = () => {
        pressRef.current = null;
        setDragging(false);
        setDragX(0);
        setDismissHeld(false);
        setDismissY(0);
    };

    const onPointerDown = (event: React.PointerEvent) => {
        const point = toPage(event);
        const pointers = pointersRef.current;
        pointers.set(event.pointerId, point);

        if (pointers.size === 2) {
            pinchRef.current = null;
            if (!showingVideo) {
                const [a, b] = [...pointers.values()] as [Point, Point];
                pinchRef.current = { from: zoomRef.current, start: [a, b] };
                setGesturing(true);
                capture(event);
            }
            panRef.current = null;
            tapStartRef.current = null;
            swipedRef.current = true;
            endDrag();
            return;
        }
        if (pointers.size > 2) return;

        swipedRef.current = false;
        if (onVideoControls(event)) {
            tapStartRef.current = null;
            pressRef.current = null;
            return;
        }
        tapStartRef.current = point;
        if (isZoomed(zoomRef.current)) {
            panRef.current = { from: zoomRef.current, start: point };
            pressRef.current = null;
            return;
        }
        pressRef.current = { x: event.clientX, y: event.clientY, at: Date.now(), axis: null };
    };

    const onPointerMove = (event: React.PointerEvent) => {
        const pointers = pointersRef.current;
        if (!pointers.has(event.pointerId)) return;
        const point = toPage(event);
        pointers.set(event.pointerId, point);

        const pinch = pinchRef.current;
        if (pinch) {
            if (pointers.size < 2) return;
            const [a, b] = [...pointers.values()] as [Point, Point];
            setZoom(pinchZoom(pinch, [a, b]));
            return;
        }

        const tapStart = tapStartRef.current;
        if (tapStart && Math.hypot(point.x - tapStart.x, point.y - tapStart.y) >= DRAG_SLOP_PX) {
            tapStartRef.current = null;
        }

        const pan = panRef.current;
        if (pan) {
            if (tapStartRef.current) return;
            swipedRef.current = true;
            setGesturing(true);
            capture(event);
            const moved = { ...pan.from, x: pan.from.x + point.x - pan.start.x, y: pan.from.y + point.y - pan.start.y };
            setZoom(clampZoom(moved, contentSize(), pageSize()));
            return;
        }

        const press = pressRef.current;
        if (!press) return;
        const dx = event.clientX - press.x;
        const dy = event.clientY - press.y;
        if (!press.axis) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_SLOP_PX) return;
            press.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            if ((press.axis === 'x' && !many) || (press.axis === 'y' && dy <= 0)) {
                pressRef.current = null;
                return;
            }
            if (press.axis === 'x') setDragging(true);
            else setDismissHeld(true);
            capture(event);
        }
        if (press.axis === 'y') {
            setDismissY(Math.max(0, dy));
            return;
        }
        setDragX(pagerDragOffset(dx, hasPrevious, hasNext));
    };

    const onTap = (event: React.PointerEvent, point: Point) => {
        if (showingVideo) {
            lastTapRef.current = null;
            return;
        }
        const onImage = (event.target as HTMLElement).dataset?.current !== undefined;
        const last = lastTapRef.current;
        const now = Date.now();
        const second =
            last &&
            now - last.at <= DOUBLE_TAP_MS &&
            Math.hypot(point.x - last.point.x, point.y - last.point.y) <= DOUBLE_TAP_SLOP_PX;
        if (second && (onImage || isZoomed(zoomRef.current))) {
            lastTapRef.current = null;
            swipedRef.current = true;
            setZoom(clampZoom(doubleTapZoom(zoomRef.current, point), contentSize(), pageSize()));
            return;
        }
        lastTapRef.current = { at: now, point };
    };

    const onPointerUp = (event: React.PointerEvent) => {
        const pointers = pointersRef.current;
        if (!pointers.has(event.pointerId)) return;
        const point = toPage(event);
        pointers.delete(event.pointerId);

        if (pinchRef.current) {
            if (pointers.size >= 2) return;
            pinchRef.current = null;
            const settled = settleZoom(clampZoom(zoomRef.current, contentSize(), pageSize()));
            setZoom(settled);
            setGesturing(false);
            const [left] = [...pointers.values()];
            panRef.current = left && isZoomed(settled) ? { from: settled, start: left } : null;
            tapStartRef.current = null;
            return;
        }

        const wasTap = tapStartRef.current !== null;
        tapStartRef.current = null;
        if (panRef.current) {
            panRef.current = null;
            setGesturing(false);
            if (wasTap) onTap(event, point);
            return;
        }

        const press = pressRef.current;
        if (press?.axis === 'y') {
            swipedRef.current = true;
            const offset = Math.max(0, event.clientY - press.y);
            if (shouldDismiss(offset, Date.now() - press.at, contentRef.current?.clientHeight ?? 0)) {
                pressRef.current = null;
                setDismissHeld(false);
                setDismissY(offset);
                onClose();
            } else {
                endDrag();
            }
            return;
        }
        if (!press || press.axis !== 'x') {
            pressRef.current = null;
            if (wasTap) onTap(event, point);
            return;
        }
        swipedRef.current = true;
        const step = pagerReleaseStep(
            event.clientX - press.x,
            Date.now() - press.at,
            stripRef.current?.clientWidth ?? 0
        );
        if (step !== 0) go(step);
        endDrag();
    };

    const onPointerCancel = (event: React.PointerEvent) => {
        pointersRef.current.delete(event.pointerId);
        if (pinchRef.current && pointersRef.current.size < 2) {
            pinchRef.current = null;
            setZoom(settleZoom(clampZoom(zoomRef.current, contentSize(), pageSize())));
        }
        panRef.current = null;
        tapStartRef.current = null;
        setGesturing(false);
        endDrag();
    };

    const arrow = 'absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/20';
    const videoFrame = cn(
        'absolute inset-x-0 top-[calc(var(--safe-top,0px)+56px)] flex items-center justify-center',
        renderFooter ? 'bottom-[calc(var(--safe-bottom,0px)+76px)]' : 'bottom-[var(--safe-bottom,0px)]'
    );
    const brokenPlaceholder = (
        <span
            data-broken=""
            className="flex size-24 items-center justify-center rounded-2xl bg-white/10"
            aria-hidden="true"
        >
            <IconImage className="size-8 text-white/60" />
        </span>
    );

    return (
        <Dialog.Root
            open={open}
            onOpenChange={value => {
                if (value) return;
                endDrag();
                onClose();
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay
                    className={cn(
                        'fixed inset-0 z-50 bg-black data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
                        VIEWER_MOTION,
                        !dismissHeld && 'transition-opacity'
                    )}
                    style={{ opacity: dismissBackdropOpacity(dismissY) }}
                />
                <Dialog.Content
                    ref={contentRef}
                    aria-describedby={undefined}
                    onInteractOutside={event => event.preventDefault()}
                    onPointerDown={event => isOwnEvent(event) && onPointerDown(event)}
                    onPointerMove={event => isOwnEvent(event) && onPointerMove(event)}
                    onPointerUp={event => isOwnEvent(event) && onPointerUp(event)}
                    onPointerCancel={event => isOwnEvent(event) && onPointerCancel(event)}
                    onKeyDown={event => {
                        if (!isOwnEvent(event)) return;
                        if (event.target instanceof HTMLVideoElement) return;
                        if (event.key === 'ArrowLeft') go(-1);
                        if (event.key === 'ArrowRight') go(1);
                    }}
                    onClick={event => {
                        if (!isOwnEvent(event)) return;
                        if (swipedRef.current) {
                            swipedRef.current = false;
                            return;
                        }
                        if (isZoomed(zoomRef.current)) return;
                        const target = event.target as HTMLElement;
                        if (target === event.currentTarget || target.dataset.backdrop !== undefined) onClose();
                    }}
                    className={cn(
                        'fixed inset-0 z-50 touch-none overflow-hidden outline-none',
                        'data-[state=closed]:!pointer-events-none',
                        'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-full data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-full',
                        VIEWER_MOTION,
                        !dismissHeld && 'transition-transform'
                    )}
                    style={dismissY > 0 ? { transform: `translate3d(0, ${dismissY}px, 0)` } : undefined}
                >
                    <Dialog.Title className="sr-only">{text.title}</Dialog.Title>
                    <div
                        ref={stripRef}
                        data-backdrop=""
                        className={cn(
                            'flex h-full w-full',
                            !dragging && 'transition-transform duration-300 ease-out motion-reduce:transition-none'
                        )}
                        style={{ transform: `translate3d(calc(${-current * 100}% + ${dragX}px), 0, 0)` }}
                    >
                        {items.map((item, i) => {
                            const drawn = Math.abs(i - current) <= 1;
                            const showing = i === current;
                            const { src, preview } = item;
                            const broken = item.state === 'broken';
                            return (
                                <div
                                    key={item.key}
                                    data-backdrop=""
                                    data-page=""
                                    aria-hidden={!showing || undefined}
                                    className="relative h-full w-full shrink-0"
                                >
                                    {item.kind === 'video' ? (
                                        <div data-backdrop="" data-video-frame="" className={videoFrame}>
                                            {drawn && broken && brokenPlaceholder}
                                            {drawn &&
                                                !broken &&
                                                (open && showing && src && item.state === 'ready' ? (
                                                    <ViewerVideo
                                                        src={src}
                                                        poster={preview}
                                                        playOnMount={autoPlay && session.at === i}
                                                        playLabel={text.play}
                                                        videoRef={videoRef}
                                                        onError={() => onError?.(i)}
                                                    />
                                                ) : (
                                                    preview && (
                                                        <img
                                                            src={preview}
                                                            alt=""
                                                            data-poster=""
                                                            className="pointer-events-none size-full select-none object-contain"
                                                            draggable={false}
                                                        />
                                                    )
                                                ))}
                                            {drawn && item.state === 'sending' && (
                                                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                                    <IconSpinner className="size-8 animate-spin text-white" />
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <div
                                            data-backdrop=""
                                            data-zoom-layer={showing || undefined}
                                            className={cn(
                                                'absolute inset-0 flex items-center justify-center',
                                                !gesturing &&
                                                    'transition-transform duration-200 ease-out motion-reduce:transition-none'
                                            )}
                                            style={
                                                showing
                                                    ? {
                                                          transform: `translate3d(${zoom.x}px, ${zoom.y}px, 0) scale(${zoom.scale})`,
                                                      }
                                                    : undefined
                                            }
                                        >
                                            {drawn && broken && brokenPlaceholder}
                                            {drawn && !broken && preview && !(src && loaded.has(src)) && (
                                                <img
                                                    src={preview}
                                                    alt=""
                                                    aria-hidden
                                                    data-placeholder=""
                                                    className="pointer-events-none absolute inset-0 size-full select-none object-contain"
                                                    draggable={false}
                                                />
                                            )}
                                            {drawn && !broken && src && (
                                                <img
                                                    ref={showing ? imageRef : undefined}
                                                    src={src}
                                                    alt=""
                                                    data-current={showing || undefined}
                                                    className="relative max-h-full max-w-full select-none object-contain"
                                                    draggable={false}
                                                    onLoad={() => markLoaded(src)}
                                                    onError={() => onError?.(i)}
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {many && (
                        <span
                            aria-live="polite"
                            className="absolute left-1/2 top-[calc(var(--safe-top,0px)+20px)] -translate-x-1/2 text-[15px] font-medium text-white"
                        >
                            {current + 1} / {items.length}
                        </span>
                    )}
                    {hasPrevious && (
                        <button
                            type="button"
                            aria-label={text.previous}
                            onClick={() => go(-1)}
                            className={cn(arrow, 'left-3')}
                        >
                            <IconBack className="size-6 text-white" />
                        </button>
                    )}
                    {hasNext && (
                        <button
                            type="button"
                            aria-label={text.next}
                            onClick={() => go(1)}
                            className={cn(arrow, 'right-3')}
                        >
                            <IconChevronRight className="size-6 text-white" />
                        </button>
                    )}
                    {renderFooter && (
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent px-4 pb-[calc(var(--safe-bottom,0px)+16px)] pt-6">
                            {renderFooter(current)}
                        </div>
                    )}
                    <Dialog.Close
                        aria-label={text.close}
                        className="absolute right-4 top-[calc(var(--safe-top,0px)+12px)] flex size-9 items-center justify-center rounded-full bg-white/20"
                    >
                        <IconClose className="size-5 text-white" />
                    </Dialog.Close>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};
