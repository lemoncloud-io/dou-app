import * as Dialog from '@radix-ui/react-dialog';
import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconBack, IconChevronRight, IconClose, IconSpinner } from '../../resources/icons';
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

export interface ImageViewerProps {
    /**
     * The images that can be shown, in order — a message's images. An entry may be undefined while the
     * host is still resolving its address; its page then shows the placeholder, if any, or black.
     */
    images: (string | undefined)[];
    /**
     * A small copy of each image, drawn under it until it has loaded — the tile the viewer was opened
     * from, which is usually already on hand while the original is still on its way.
     */
    placeholders?: (string | undefined)[];
    /** Which one is showing. `null` closes the viewer. */
    index: number | null;
    /** Asks to show another image. The host owns the index. */
    onIndexChange: (index: number) => void;
    onClose: () => void;
    /** Accessible name of the viewer. Not drawn. */
    title?: string;
    closeLabel?: string;
    previousLabel?: string;
    nextLabel?: string;
    /** Fired with the index of an image that fails to load — a signed address may have expired. */
    onError?: (index: number) => void;
    /**
     * Buttons for the showing image, drawn in a bar along the bottom edge — the host decides what
     * they do (the viewer knows nothing of chats). Called with the showing index; the bar spreads
     * what it returns from edge to edge, so two buttons sit at the two ends. Without it there is no
     * bar. Use `ImageViewerActionButton` so they match the close button.
     *
     * The bottom rather than the top bar: a toast slides in at the top of the screen, and one there
     * would cover the buttons the user is about to press again.
     */
    renderFooter?: (index: number) => React.ReactNode;
}

export interface ImageViewerActionButtonProps {
    /** Accessible name — the button shows an icon only. */
    label: string;
    onClick: () => void;
    disabled?: boolean;
    /** Working: the icon gives way to a spinner, or to a ring when `progress` is known. */
    busy?: boolean;
    /** `0`..`1` while busy and the total is known; `null` or absent for a spinner. */
    progress?: number | null;
    children: React.ReactNode;
}

const RING_RADIUS = 14;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * A round icon button for the viewer's top bar, the same size and tint as its close button.
 *
 * While busy it stays focusable and only ignores presses (`aria-disabled`): disabling the button
 * the user just pressed would drop keyboard and screen-reader focus out of it.
 */
export const ImageViewerActionButton = ({
    label,
    onClick,
    disabled,
    busy,
    progress,
    children,
}: ImageViewerActionButtonProps) => (
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

/**
 * Whether an event happened in the viewer's own DOM. React events bubble through portals, so a sheet a
 * host opens from its buttons is inside the viewer for React though it is drawn elsewhere — a drag or
 * an arrow key on it must not turn the page behind it.
 */
const isOwnEvent = (event: React.SyntheticEvent) => event.currentTarget.contains(event.target as Node);

/** How far a drag has to travel before it is read as a swipe or a scroll rather than a tap. */
const DRAG_SLOP_PX = 8;
/** A release past this — or past a fifth of the width, whichever is more — turns the page. */
const SWIPE_MIN_PX = 48;
/** A quick flick turns the page with less travel. */
const FLICK_MAX_MS = 300;
const FLICK_MIN_PX = 24;
/** Past the first or last image the strip gives only a little, to show there is nothing more. */
const EDGE_RESISTANCE = 0.3;
/**
 * Two taps closer together than this, in time and in place, are a double tap. On the generous side:
 * a single tap on the photo does nothing, so a longer window delays nothing.
 */
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_SLOP_PX = 30;

interface Press {
    x: number;
    y: number;
    at: number;
    /** Which way the drag went once it passed the slop — only a horizontal one moves the strip. */
    axis: 'x' | 'y' | null;
}

/**
 * A chat message's images, full screen: the original on black, a close button, and a tap anywhere
 * outside the image to leave. When the message carries more than one image they sit side by side on
 * a strip: a horizontal drag moves the strip under the finger, and on release it slides on to the
 * next image or back to the same one. The arrow buttons at the sides and the arrow keys slide it the
 * same way, and a count says where it is ("2 / 3"). It stops at the ends rather than wrapping: a count
 * that jumps from the last back to "1" reads as a different message. The host may put buttons for the
 * showing image in a bar along the bottom (`renderFooter`) — the chat puts share and save there.
 *
 * The showing image zooms: a pinch scales it around the point between the fingers (up to four times),
 * and a double tap on it zooms in on that point or back out. While it is zoomed a one-finger drag
 * pans it — kept from pulling its edge off the page — instead of turning the page, and a tap beside
 * it does not close the viewer. Turning the page or closing resets the zoom. The browser's own pinch
 * cannot do this: the app fixes the page scale, and it would zoom the whole screen, not the photo.
 *
 * Only the showing image and its neighbours are drawn, so ten originals are not loaded at once and a
 * neighbour is ready by the time it slides in. An original can be several megabytes, so while one is
 * on its way its `placeholder` — the small copy the tile drew — stands in for it instead of black.
 *
 * Stateless: the index belongs to the host, which is also what lets a refreshed address reach an
 * image that is already open. The drag offset and the zoom are the only things held here.
 *
 * On `@radix-ui/react-dialog` directly rather than `ui-kit`'s styled `dialog`: that wrapper centres a
 * card with padding and its own close mark, and a full-bleed viewer would spend its whole className
 * undoing it. Focus, escape and the portal are what is wanted from the primitive.
 */
export const ImageViewer = ({
    images,
    placeholders,
    index,
    onIndexChange,
    onClose,
    title = 'Photo',
    closeLabel = 'Close',
    previousLabel = 'Previous photo',
    nextLabel = 'Next photo',
    onError,
    renderFooter,
}: ImageViewerProps) => {
    const open = index !== null && index >= 0 && index < images.length;
    const current = open ? index : 0;
    const many = images.length > 1;
    const hasPrevious = many && current > 0;
    const hasNext = many && current < images.length - 1;

    const go = (step: -1 | 1) => {
        const target = current + step;
        if (target >= 0 && target < images.length) onIndexChange(target);
    };

    // The addresses that have finished loading, so their placeholder can go. Kept by address rather
    // than by position: a refreshed address has to load again before it covers the placeholder.
    const [loaded, setLoaded] = React.useState<ReadonlySet<string>>(() => new Set());
    // Only addresses still in `images` are kept, so a viewer handed a new address per refresh does not
    // collect every one it was ever given.
    const markLoaded = (src: string) =>
        setLoaded(previous =>
            previous.has(src) ? previous : new Set([...previous].filter(known => images.includes(known))).add(src)
        );

    // How far the strip is pulled off its resting place, while a finger holds it.
    const [dragX, setDragX] = React.useState(0);
    const [dragging, setDragging] = React.useState(false);
    const pressRef = React.useRef<Press | null>(null);
    // Whether the last press turned into a swipe, a pan, a pinch or a double tap. Any of them that ends
    // on the backdrop is followed by a click there, which must not read as "tap outside to close".
    const swipedRef = React.useRef(false);
    const stripRef = React.useRef<HTMLDivElement>(null);
    const contentRef = React.useRef<HTMLDivElement>(null);
    const imageRef = React.useRef<HTMLImageElement | null>(null);

    // The showing image's zoom. Mirrored in a ref so a pointer event reads the value the last event
    // set, not the one from the last render.
    const [zoom, setZoomState] = React.useState<Zoom>(IDENTITY_ZOOM);
    const zoomRef = React.useRef<Zoom>(IDENTITY_ZOOM);
    const setZoom = (next: Zoom) => {
        zoomRef.current = next;
        setZoomState(next);
    };
    // While fingers move the image it follows them exactly; otherwise a change eases in.
    const [gesturing, setGesturing] = React.useState(false);
    // Every finger down, measured from the centre of the page.
    const pointersRef = React.useRef(new Map<number, Point>());
    const pinchRef = React.useRef<Pinch | null>(null);
    const panRef = React.useRef<{ from: Zoom; start: Point } | null>(null);
    // Where the single finger went down, to tell a tap from a drag whether or not the strip moves.
    const tapStartRef = React.useRef<Point | null>(null);
    const lastTapRef = React.useRef<{ at: number; point: Point } | null>(null);

    // Another page, or the viewer closing, starts from the image fitting the page.
    React.useEffect(() => {
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
    // The image as laid out at scale 1. Before the original has loaded there is nothing to measure,
    // and the placeholder fills the page.
    const contentSize = (): Size => {
        const image = imageRef.current;
        return image && image.offsetWidth > 0 ? { width: image.offsetWidth, height: image.offsetHeight } : pageSize();
    };

    const capture = (event: React.PointerEvent) => {
        // Keep the moves coming when the finger leaves the image or the screen edge.
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
    };

    const onPointerDown = (event: React.PointerEvent) => {
        const point = toPage(event);
        const pointers = pointersRef.current;
        pointers.set(event.pointerId, point);

        if (pointers.size === 2) {
            // A second finger turns whatever the first was doing into a pinch.
            const [a, b] = [...pointers.values()] as [Point, Point];
            pinchRef.current = { from: zoomRef.current, start: [a, b] };
            panRef.current = null;
            tapStartRef.current = null;
            swipedRef.current = true;
            endDrag();
            setGesturing(true);
            capture(event);
            return;
        }
        if (pointers.size > 2) return;

        swipedRef.current = false;
        tapStartRef.current = point;
        if (isZoomed(zoomRef.current)) {
            panRef.current = { from: zoomRef.current, start: point };
            pressRef.current = null;
            return;
        }
        pressRef.current = many ? { x: event.clientX, y: event.clientY, at: Date.now(), axis: null } : null;
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
            // Not clamped while the fingers are down, so the image stays under them; the release does.
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
            if (press.axis === 'x') {
                setDragging(true);
                capture(event);
            }
        }
        if (press.axis !== 'x') return;
        const pastEdge = (dx > 0 && !hasPrevious) || (dx < 0 && !hasNext);
        setDragX(pastEdge ? dx * EDGE_RESISTANCE : dx);
    };

    /** A tap that did not move: the second of two close together zooms. */
    const onTap = (event: React.PointerEvent, point: Point) => {
        const onImage = (event.target as HTMLElement).dataset?.current !== undefined;
        const last = lastTapRef.current;
        const now = Date.now();
        const second =
            last &&
            now - last.at <= DOUBLE_TAP_MS &&
            Math.hypot(point.x - last.point.x, point.y - last.point.y) <= DOUBLE_TAP_SLOP_PX;
        // Zooming in starts on the photo; zooming back out works anywhere, since the photo may fill it.
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
            // One finger still down carries on as a pan from where it is.
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
        if (!press || press.axis !== 'x') {
            pressRef.current = null;
            if (wasTap) onTap(event, point);
            return;
        }
        swipedRef.current = true;
        const dx = event.clientX - press.x;
        const width = stripRef.current?.clientWidth ?? 0;
        const far = Math.abs(dx) >= Math.max(SWIPE_MIN_PX, width * 0.2);
        const flick = Date.now() - press.at <= FLICK_MAX_MS && Math.abs(dx) >= FLICK_MIN_PX;
        // Dropping the offset and moving the index in the same render lets the strip slide on from
        // wherever the finger left it.
        if (far || flick) go(dx < 0 ? 1 : -1);
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
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black" />
                <Dialog.Content
                    ref={contentRef}
                    aria-describedby={undefined}
                    // The viewer fills the screen, so anything "outside" it is drawn on top of it — a
                    // toast with a button of its own. Pressing that button must not close the viewer
                    // on the way, or the press never reaches it.
                    onInteractOutside={event => event.preventDefault()}
                    onPointerDown={event => isOwnEvent(event) && onPointerDown(event)}
                    onPointerMove={event => isOwnEvent(event) && onPointerMove(event)}
                    onPointerUp={event => isOwnEvent(event) && onPointerUp(event)}
                    onPointerCancel={event => isOwnEvent(event) && onPointerCancel(event)}
                    onKeyDown={event => {
                        if (!isOwnEvent(event)) return;
                        if (event.key === 'ArrowLeft') go(-1);
                        if (event.key === 'ArrowRight') go(1);
                    }}
                    onClick={event => {
                        if (!isOwnEvent(event)) return;
                        if (swipedRef.current) {
                            swipedRef.current = false;
                            return;
                        }
                        // A zoomed photo may fill the page; a tap beside it is too easy to make by accident.
                        if (isZoomed(zoomRef.current)) return;
                        const target = event.target as HTMLElement;
                        if (target === event.currentTarget || target.dataset.backdrop !== undefined) onClose();
                    }}
                    // The drag is all ours: no browser pan or pinch fights the strip.
                    className="fixed inset-0 z-50 touch-none overflow-hidden outline-none"
                >
                    <Dialog.Title className="sr-only">{title}</Dialog.Title>
                    <div
                        ref={stripRef}
                        data-backdrop=""
                        className={cn(
                            'flex h-full w-full',
                            !dragging && 'transition-transform duration-300 ease-out motion-reduce:transition-none'
                        )}
                        style={{ transform: `translate3d(calc(${-current * 100}% + ${dragX}px), 0, 0)` }}
                    >
                        {images.map((src, i) => {
                            const drawn = open && Math.abs(i - current) <= 1;
                            const placeholder = placeholders?.[i];
                            const showing = i === current;
                            return (
                                <div
                                    key={i}
                                    data-backdrop=""
                                    data-page=""
                                    aria-hidden={!showing || undefined}
                                    className="relative h-full w-full shrink-0"
                                >
                                    {/* What zooms: the photo and its placeholder together, around the
                                        centre of the page. */}
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
                                        {/* Stretched to the page and letterboxed, where the original will
                                            land. It lets taps through, so a tap beside the photo still
                                            closes. */}
                                        {drawn && placeholder && !(src && loaded.has(src)) && (
                                            <img
                                                src={placeholder}
                                                alt=""
                                                aria-hidden
                                                data-placeholder=""
                                                className="pointer-events-none absolute inset-0 size-full select-none object-contain"
                                                draggable={false}
                                            />
                                        )}
                                        {drawn && src && (
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
                                </div>
                            );
                        })}
                    </div>
                    {many && (
                        <span
                            aria-live="polite"
                            className="absolute left-1/2 top-[calc(var(--safe-top,0px)+20px)] -translate-x-1/2 text-[15px] font-medium text-white"
                        >
                            {current + 1} / {images.length}
                        </span>
                    )}
                    {hasPrevious && (
                        <button
                            type="button"
                            aria-label={previousLabel}
                            onClick={() => go(-1)}
                            className={cn(arrow, 'left-3')}
                        >
                            <IconBack className="size-6 text-white" />
                        </button>
                    )}
                    {hasNext && (
                        <button
                            type="button"
                            aria-label={nextLabel}
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
                        aria-label={closeLabel}
                        className="absolute right-4 top-[calc(var(--safe-top,0px)+12px)] flex size-9 items-center justify-center rounded-full bg-white/20"
                    >
                        <IconClose className="size-5 text-white" />
                    </Dialog.Close>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};
