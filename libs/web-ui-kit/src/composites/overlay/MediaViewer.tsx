import * as Dialog from '@radix-ui/react-dialog';
import * as React from 'react';

import { cn } from '@chatic/lib/utils';
import { useToastLift } from '@chatic/ui-kit/components/ui/toaster';

import { IconBack, IconChevronRight, IconClose, IconImage, IconPlaySolid, IconSpinner } from '../../resources/icons';
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

/**
 * One page of the viewer.
 *
 * - `ready` — a photo draws `src` (the original) over `preview` (the small copy) until the original
 *   has loaded; a video plays `src` with `preview` as its poster. Without a `src` yet — the host is
 *   still resolving it — the page draws only the `preview`.
 * - `sending` — a message still on its way. A photo is drawn as `ready` is (its `src` is the picked
 *   file); a video has nothing the page can play yet, so only its `preview` is drawn.
 * - `broken` — nothing can be shown. Drawn as a placeholder rather than left out, so the count still
 *   matches what was sent.
 */
export interface MediaViewerItem {
    key: string;
    kind: 'image' | 'video';
    src?: string;
    preview?: string;
    state: 'ready' | 'sending' | 'broken';
}

export interface MediaViewerLabels {
    /** Accessible name of the viewer. Not drawn. */
    title: string;
    close: string;
    previous: string;
    next: string;
    /** The big play button drawn when the browser would not start a video on its own. */
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
    /** The photos and videos that can be shown, in order — a message's media. */
    items: readonly MediaViewerItem[];
    /** Which one is showing. `null` closes the viewer. */
    index: number | null;
    /** Asks to show another item. The host owns the index. */
    onIndexChange: (index: number) => void;
    /**
     * Asks to close; the host closes by setting `index` to `null`. A pull-down close leaves the viewer
     * where the finger let go and slides on from there once `index` turns `null`, so a host that does
     * not close leaves it pulled down.
     */
    onClose: () => void;
    /**
     * Fired with the index of a photo or video that fails to load — a signed address may have
     * expired.
     */
    onError?: (index: number) => void;
    /**
     * Try to play the video at `index` as the viewer opens — set when a tile tap opened it, so the
     * browser still counts the start as the user's. Only the item it opened on; one paged to later
     * waits for its own play control.
     */
    autoPlay?: boolean;
    /**
     * Buttons for the showing item, drawn in a bar along the bottom edge — the host decides what
     * they do (the viewer knows nothing of chats). Called with the showing index; the bar spreads
     * what it returns from edge to edge, so two buttons sit at the two ends. Without it there is no
     * bar. Use `MediaViewerActionButton` so they match the close button.
     *
     * The snackbar also rests at the bottom, so while the bar shows the viewer lifts it clear of the
     * buttons (`MEDIA_VIEWER_FOOTER_TOAST_LIFT`): the result toast a press raises must not land on
     * the buttons the user is about to press again.
     */
    renderFooter?: (index: number) => React.ReactNode;
    labels?: Partial<MediaViewerLabels>;
}

export interface MediaViewerActionButtonProps {
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
 * A round icon button for the viewer's bars, the same size and tint as its close button.
 *
 * While busy it stays focusable and only ignores presses (`aria-disabled`): disabling the button
 * the user just pressed would drop keyboard and screen-reader focus out of it.
 */
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

/**
 * Two taps closer together than this, in time and in place, are a double tap. On the generous side:
 * a single tap on the photo does nothing, so a longer window delays nothing.
 */
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_SLOP_PX = 30;
/**
 * The band along the bottom of a video where the browser draws its own controls — the seek bar above
 * all. A drag that starts there is scrubbing, not paging, so the strip leaves it alone.
 */
const VIDEO_CONTROLS_PX = 72;
/**
 * A downward drag released past this — or past a sixth of the height, whichever is more — closes the
 * viewer. Further than a page turn needs: closing loses the place in the message, turning does not.
 */
const DISMISS_MIN_PX = 96;
/** A quick downward flick closes with less travel, inside the same `FLICK_MAX_MS` as a page turn. */
const DISMISS_FLICK_MIN_PX = 48;
/** How far down the backdrop has faded out completely — the photo pulled clear shows what is behind. */
const DISMISS_FADE_PX = 480;

/** The backdrop's opacity while the viewer is pulled `offset` px down. */
const dismissBackdropOpacity = (offset: number): number => Math.max(0, 1 - offset / DISMISS_FADE_PX);

/**
 * Whether a downward drag that ends `offset` px down, `elapsedMs` after it started, on a viewer
 * `height` px tall, closes it rather than settling back.
 */
const shouldDismiss = (offset: number, elapsedMs: number, height: number): boolean =>
    offset >= Math.max(DISMISS_MIN_PX, height / 6) || (elapsedMs <= FLICK_MAX_MS && offset >= DISMISS_FLICK_MIN_PX);

interface Press {
    x: number;
    y: number;
    at: number;
    /**
     * Which way the drag went once it passed the slop: sideways moves the strip, downward pulls the
     * viewer away to close it.
     */
    axis: 'x' | 'y' | null;
}

/**
 * Stops a video for good: no sound left playing on a page that slid away, the next visit starts from
 * the beginning, and without an address the browser drops the download it had going. A paused video
 * keeps buffering, and one pulled out of the page keeps it all until it is collected.
 */
const releaseVideo = (video: HTMLVideoElement) => {
    video.pause();
    video.currentTime = 0;
    video.removeAttribute('src');
    video.load();
};

interface ViewerVideoProps {
    src: string;
    poster?: string;
    /** Start playing as soon as it is mounted — the tap that opened the viewer is still current. */
    playOnMount: boolean;
    playLabel: string;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    onError: () => void;
}

/**
 * The showing video. Mounted only while its page is the one showing, so a neighbour never starts a
 * download, and released when it unmounts — paged away from, or the viewer closed.
 *
 * The address is set here rather than as a prop so that releasing it and setting it again stay in one
 * place: when the address changes (a refreshed signed address), and when React mounts an effect twice
 * in development, the cleanup takes the old one away and the setup puts the new one back.
 */
const ViewerVideo = ({ src, poster, playOnMount, playLabel, videoRef, onError }: ViewerVideoProps) => {
    // The browser would not start it without a tap of its own: the big play button asks for one.
    const [blocked, setBlocked] = React.useState(false);

    const play = (video: HTMLVideoElement, isLive: () => boolean) => {
        // Called before anything is awaited, so the browser still sees the tap that asked for it.
        const started = video.play() as Promise<void> | undefined;
        started?.catch?.((error: unknown) => {
            // An AbortError is a play the release interrupted, not a refusal.
            if (isLive() && (error as { name?: string } | null)?.name === 'NotAllowedError') setBlocked(true);
        });
    };

    // A layout effect, so a tap's open reaches `play()` in the same task as the tap.
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
        // Only a new address starts over: `playOnMount` is read as an address arrives, not watched,
        // and `play` reads only the element it is given and a stable setter.
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

/**
 * The action bar's height above the bottom inset — 24px of gradient lead-in (`pt-6`), a 36px button
 * (`size-9`), 16px under it — published through `useToastLift` while the bar is on screen. The app's
 * snackbar is mounted above every screen and reads the variable to rest above whatever bar a screen
 * pins to the bottom; this one would otherwise sit right on the share and save buttons.
 */
export const MEDIA_VIEWER_FOOTER_TOAST_LIFT = 76;

/**
 * A chat message's photos and videos, full screen: the original on black, a close button, and a tap
 * anywhere outside it to leave. When the message carries more than one they sit side by side on a
 * strip: a horizontal drag moves the strip under the finger, and on release it slides on to the next
 * item or back to the same one. The arrow buttons at the sides and the arrow keys slide it the same
 * way, and a count says where it is ("2 / 3"). It stops at the ends rather than wrapping: a count that
 * jumps from the last back to "1" reads as a different message.
 *
 * The viewer slides up from the bottom edge as it opens and back down as it closes, and a downward
 * drag pulls it after the finger, fading the black behind it: let go far enough down (or flick) and
 * it carries on down and closes, otherwise it settles back. The close slides on from wherever the
 * finger let go, not from the top, so the photo never jumps back before it leaves. A zoomed photo
 * pans instead, and a drag on a video's controls is left to them. The host may put buttons for the
 * showing item in a bar along the bottom (`renderFooter`) — the chat puts share and save there. A
 * `broken` item is a placeholder page, counted like the rest.
 *
 * The showing photo zooms: a pinch scales it around the point between the fingers (up to four times),
 * and a double tap on it zooms in on that point or back out. While it is zoomed a one-finger drag
 * pans it — kept from pulling its edge off the page — instead of turning the page, and a tap beside
 * it does not close the viewer. Turning the page or closing resets the zoom. The browser's own pinch
 * cannot do this: the app fixes the page scale, and it would zoom the whole screen, not the photo.
 *
 * Only the showing photo and its neighbours are drawn, so ten originals are not loaded at once and a
 * neighbour is ready by the time it slides in. An original can be several megabytes, so while one is
 * on its way its `preview` — the small copy the tile drew — stands in for it instead of black.
 *
 * A video plays with the browser's own controls, fitted between the top and bottom bars so its seek
 * bar is never under the host's buttons. It does not zoom — a pinch or a double tap on it does
 * nothing — and a drag that starts on its controls (the bottom 72px) is left to them; elsewhere a
 * drag pages as it does on a photo. Only the showing video is a `<video>`: a neighbour draws its
 * poster and nothing else, since prefetching a video is a download the user may never watch. With
 * `autoPlay` the video the viewer opened on starts at once; when the browser refuses (no user gesture
 * it will honour), a big play button stands in for the tap it wants. Leaving a video — paging away
 * or closing — pauses it, rewinds it and takes its address away so its download stops.
 *
 * Stateless: the index belongs to the host, which is also what lets a refreshed address reach an
 * item that is already open. The drag offset, the zoom and whether a video was refused are the only
 * things held here.
 *
 * On `@radix-ui/react-dialog` directly rather than `ui-kit`'s styled `dialog`: that wrapper centres a
 * card with padding and its own close mark, and a full-bleed viewer would spend its whole className
 * undoing it. Focus, escape and the portal are what is wanted from the primitive.
 */
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
    // The item last shown, kept through the close: the viewer is still on screen while it slides
    // away, and falling back to the first item there would swap the photo under the user.
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
        // Sliding away: a page turn now would hand the host an index and open the viewer again.
        if (!open) return;
        const target = current + step;
        if (target >= 0 && target < items.length) onIndexChange(target);
    };

    // The item the viewer opened on, while it is still the one showing — the only one `autoPlay`
    // starts. Paging away gives it up, so coming back to it does not start it again.
    const [session, setSession] = React.useState<{ open: boolean; at: number | null }>({ open: false, at: null });
    // How far the viewer is pulled down. Not reset when a pull closes it — the slide out has to start
    // where the finger left it — so it is reset as the viewer opens again instead.
    const [dismissY, setDismissY] = React.useState(0);
    const [dismissHeld, setDismissHeld] = React.useState(false);
    if (session.open !== open) {
        setSession({ open, at: open ? current : null });
        if (open) setDismissY(0);
    } else if (session.at !== null && session.at !== current) setSession({ open, at: null });

    // The addresses that have finished loading, so their preview can go. Kept by address rather
    // than by position: a refreshed address has to load again before it covers the preview.
    const [loaded, setLoaded] = React.useState<ReadonlySet<string>>(() => new Set());
    // Only addresses still in `items` are kept, so a viewer handed a new address per refresh does not
    // collect every one it was ever given.
    const markLoaded = (src: string) =>
        setLoaded(previous =>
            previous.has(src)
                ? previous
                : new Set([...previous].filter(known => items.some(item => item.src === known))).add(src)
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
    const videoRef = React.useRef<HTMLVideoElement | null>(null);

    // The showing photo's zoom. Mirrored in a ref so a pointer event reads the value the last event
    // set, not the one from the last render.
    const [zoom, setZoomState] = React.useState<Zoom>(IDENTITY_ZOOM);
    const zoomRef = React.useRef<Zoom>(IDENTITY_ZOOM);
    const setZoom = (next: Zoom) => {
        zoomRef.current = next;
        setZoomState(next);
    };
    // While fingers move the photo it follows them exactly; otherwise a change eases in.
    const [gesturing, setGesturing] = React.useState(false);
    // Every finger down, measured from the centre of the page.
    const pointersRef = React.useRef(new Map<number, Point>());
    const pinchRef = React.useRef<Pinch | null>(null);
    const panRef = React.useRef<{ from: Zoom; start: Point } | null>(null);
    // Where the single finger went down, to tell a tap from a drag whether or not the strip moves.
    const tapStartRef = React.useRef<Point | null>(null);
    const lastTapRef = React.useRef<{ at: number; point: Point } | null>(null);

    // Another page, or the viewer opening again, starts from the photo fitting the page. Not the close:
    // a zoomed photo slides away as it was rather than springing back to fit on the way out.
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
    // The photo as laid out at scale 1. Before the original has loaded there is nothing to measure,
    // and the preview fills the page.
    const contentSize = (): Size => {
        const image = imageRef.current;
        return image && image.offsetWidth > 0 ? { width: image.offsetWidth, height: image.offsetHeight } : pageSize();
    };
    // Whether a press landed on the showing video's own controls.
    const onVideoControls = (event: React.PointerEvent) => {
        const video = showingVideo ? videoRef.current : null;
        if (!video) return false;
        const rect = video.getBoundingClientRect();
        return event.clientY <= rect.bottom && event.clientY >= rect.bottom - VIDEO_CONTROLS_PX;
    };

    const capture = (event: React.PointerEvent) => {
        // Keep the moves coming when the finger leaves the photo or the screen edge.
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
            // A second finger turns whatever the first was doing into a pinch — on a photo. A video
            // does not zoom, so the second finger only stops the first from paging.
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
            // Not clamped while the fingers are down, so the photo stays under them; the release does.
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
            // Only a sideways drag with somewhere to go, or a downward one, is ours; the rest of the
            // gesture is let be.
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

    /** A tap that did not move: the second of two close together zooms a photo. */
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
        if (press?.axis === 'y') {
            swipedRef.current = true;
            const offset = Math.max(0, event.clientY - press.y);
            if (shouldDismiss(offset, Date.now() - press.at, contentRef.current?.clientHeight ?? 0)) {
                // Left where it is: the close slides on from here.
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
        // Dropping the offset and moving the index in the same render lets the strip slide on from
        // wherever the finger left it.
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
    // Where a video sits: below the close button and the count, and above the host's bar when there
    // is one, so neither covers the browser's controls along the video's bottom edge. The bar is its
    // 24px of top padding, a 36px button and 16px below it.
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
                        // A focused video takes the arrow keys to seek.
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
                        // A zoomed photo may fill the page; a tap beside it is too easy to make by accident.
                        if (isZoomed(zoomRef.current)) return;
                        const target = event.target as HTMLElement;
                        if (target === event.currentTarget || target.dataset.backdrop !== undefined) onClose();
                    }}
                    // The drag is all ours: no browser pan or pinch fights the strip.
                    className={cn(
                        'fixed inset-0 z-50 touch-none overflow-hidden outline-none',
                        // Nothing on it is pressable while it slides away — a swipe, an arrow or a
                        // host button there would act on a viewer the user has already left.
                        // Important, because Radix's modal layer sets `pointer-events: auto` inline.
                        'data-[state=closed]:!pointer-events-none',
                        'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-full data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-full',
                        VIEWER_MOTION,
                        // Settles back with the same ease once a pull is let go short of closing.
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
                                                // Not while it slides away: closing stops the sound at once.
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
                                        // What zooms: the photo and its preview together, around the
                                        // centre of the page.
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
                                            {/* Stretched to the page and letterboxed, where the original will
                                                land. It lets taps through, so a tap beside the photo still
                                                closes. */}
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
