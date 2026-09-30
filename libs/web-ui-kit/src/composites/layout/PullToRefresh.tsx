import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconSpinner } from '../../resources/icons';

/** Pull distance, after resistance, at which a release starts a refresh. */
export const PULL_TO_REFRESH_THRESHOLD = 64;
/** How far the content can be dragged at most, so a long pull does not drag the list off screen. */
const MAX_PULL = 120;
/** Finger travel is halved on the way down, which is what makes the pull read as elastic. */
const RESISTANCE = 0.5;
/** Where the content rests while a refresh is running: the spinner's own slot. */
const REFRESHING_OFFSET = 56;
/**
 * Finger travel before a touch is judged a pull or a scroll. iOS reports moves of a pixel, so the
 * first one alone is jitter — often `dy === 0` or a sideways twitch on what is plainly a pull.
 */
const DIRECTION_SLOP = 6;
/** Default for `maxRefreshMs`. */
const DEFAULT_MAX_REFRESH_MS = 10_000;

/**
 * Finger travel → how far the content moves. Upward travel is no pull at all, and the result is
 * capped so the drag stays bounded however far the finger goes.
 */
export const resolvePullDistance = (deltaY: number): number =>
    deltaY <= 0 ? 0 : Math.min(deltaY * RESISTANCE, MAX_PULL);

export interface PullToRefreshProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
    /**
     * Runs when a pull is released past the threshold. The spinner stays up until the returned
     * promise settles or `maxRefreshMs` passes, and a pull made while it is still up is ignored.
     */
    onRefresh: () => Promise<unknown>;
    /**
     * The longest the spinner waits on `onRefresh`. The work itself is not cancelled — only the
     * spinner stops waiting — so a request stuck on a socket nobody has noticed is dead yet cannot
     * hold the list down, and the gesture, for as long as that request's own timeout.
     */
    maxRefreshMs?: number;
    /** Turns the gesture off; the container still scrolls. */
    disabled?: boolean;
    /** Accessible name of the running-refresh status. */
    refreshingLabel?: string;
    /**
     * Classes for the element that wraps `children` and moves with the pull. A host whose
     * container was a flex column puts that layout here, since its children now sit one level down.
     */
    contentClassName?: string;
    children: React.ReactNode;
}

type Gesture = { id: number; target: EventTarget; startX: number; startY: number; pulling: boolean };

/**
 * Scroll container with pull-to-refresh: at the top of the list, dragging down reveals a spinner,
 * and releasing past {@link PULL_TO_REFRESH_THRESHOLD} calls `onRefresh`.
 *
 * It is the scroll container itself rather than a wrapper around one, because the gesture has to
 * know `scrollTop` at the moment the finger lands — a pull only starts from the very top, so a
 * flick back up through a long list never turns into a refresh. The ref and every div attribute
 * (`onScroll` included) land on that container, so a host's scroll restoration keeps working.
 *
 * Touch listeners are attached natively. React registers touch handlers as passive, and a passive
 * `touchmove` cannot `preventDefault` — the WebView would then rubber-band the list underneath the
 * spinner instead of letting the pull move it. Only a move that is, or may still become, a pull is
 * cancelled; every other move scrolls as it always did.
 *
 * Only `touchstart` sits on the container. The rest of a touch is followed on the element the
 * finger landed on, for the lifetime of that one touch: touch events keep targeting that element
 * even after it leaves the document, and a detached node bubbles to nobody. So when the host swaps
 * it out mid-drag — a skeleton row replaced by the real list — a listener on the container (or on
 * `document`) never hears the release that would put the list back; one on the node itself does.
 *
 * The only state held here is the gesture's own (distance and in-flight refresh), which lives for a
 * single pull. What a refresh does is the host's.
 */
export const PullToRefresh = React.forwardRef<HTMLDivElement, PullToRefreshProps>(
    (
        {
            onRefresh,
            maxRefreshMs = DEFAULT_MAX_REFRESH_MS,
            disabled = false,
            refreshingLabel = 'Refreshing',
            className,
            contentClassName,
            children,
            ...rest
        },
        forwardedRef
    ) => {
        const containerRef = React.useRef<HTMLDivElement | null>(null);
        const [pull, setPull] = React.useState(0);
        const [isRefreshing, setIsRefreshing] = React.useState(false);
        // The finger is on the content: it follows the pull 1:1, with no easing to lag behind.
        const [isDragging, setIsDragging] = React.useState(false);
        // Mirrors of the state above, for the native listeners: they are attached once, so reading
        // state through the closure would see the values from the render that attached them.
        const pullRef = React.useRef(0);
        const refreshingRef = React.useRef(false);
        const onRefreshRef = React.useRef(onRefresh);
        onRefreshRef.current = onRefresh;
        const maxRefreshMsRef = React.useRef(maxRefreshMs);
        maxRefreshMsRef.current = maxRefreshMs;

        const setRefs = React.useCallback(
            (node: HTMLDivElement | null) => {
                containerRef.current = node;
                if (typeof forwardedRef === 'function') forwardedRef(node);
                else if (forwardedRef) forwardedRef.current = node;
            },
            [forwardedRef]
        );

        React.useEffect(() => {
            const node = containerRef.current;
            if (!node || disabled) return;

            let gesture: Gesture | null = null;
            // iOS reports a negative offset while the list bounces at the top; that is still the top.
            const isAtTop = () => node.scrollTop <= 0;

            const updatePull = (value: number) => {
                pullRef.current = value;
                setPull(value);
            };

            const findTouch = (list: TouchList, id: number): Touch | null => {
                for (let index = 0; index < list.length; index += 1) {
                    if (list[index].identifier === id) return list[index];
                }
                return null;
            };

            const stopFollowing = (target: EventTarget | undefined) => {
                document.removeEventListener('touchstart', handleExtraTouch);
                if (!target) return;
                target.removeEventListener('touchmove', handleMove as EventListener);
                target.removeEventListener('touchend', handleEnd as EventListener);
                target.removeEventListener('touchcancel', handleCancel);
            };

            // Drops the touch without committing it: the list goes back and nothing refreshes.
            const abandon = () => {
                const wasPulling = gesture?.pulling === true;
                stopFollowing(gesture?.target);
                gesture = null;
                if (!wasPulling) return;
                setIsDragging(false);
                updatePull(0);
            };

            const handleStart = (event: TouchEvent) => {
                // A pull only begins at the very top and never on top of a refresh already running.
                if (gesture || refreshingRef.current || !isAtTop() || event.touches.length !== 1) return;
                const touch = event.touches[0];
                const target = event.target ?? node;
                gesture = {
                    id: touch.identifier,
                    target,
                    startX: touch.clientX,
                    startY: touch.clientY,
                    pulling: false,
                };
                // A second finger can land anywhere, so that one is heard on the document.
                document.addEventListener('touchstart', handleExtraTouch, { passive: true });
                target.addEventListener('touchmove', handleMove as EventListener, { passive: false });
                target.addEventListener('touchend', handleEnd as EventListener);
                target.addEventListener('touchcancel', handleCancel);
            };

            // A second finger makes it a pinch or a stray touch, not a pull — and there is no single
            // finger left whose release would mean "refresh".
            const handleExtraTouch = (event: TouchEvent) => {
                if (event.touches.length > 1) abandon();
            };

            const handleMove = (event: TouchEvent) => {
                if (!gesture) return;
                if (event.touches.length > 1) {
                    abandon();
                    return;
                }
                const touch = findTouch(event.touches, gesture.id);
                if (!touch) return;
                const deltaX = touch.clientX - gesture.startX;
                const deltaY = touch.clientY - gesture.startY;
                if (!gesture.pulling) {
                    // Still inside the slop and not yet told apart. A move that leans down is held
                    // back anyway, because the first move WebKit lets through starts its own bounce,
                    // and every move after it is then uncancellable — the pull would lose the touch.
                    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < DIRECTION_SLOP) {
                        if (deltaY > 0 && deltaY >= Math.abs(deltaX) && event.cancelable) event.preventDefault();
                        return;
                    }
                    // Past the slop, upward or sideways, or the list has left the top: a scroll or a
                    // swipe, and it stays one for the rest of this touch.
                    if (deltaY <= Math.abs(deltaX) || !isAtTop()) {
                        abandon();
                        return;
                    }
                    gesture.pulling = true;
                    setIsDragging(true);
                }
                if (event.cancelable) event.preventDefault();
                updatePull(resolvePullDistance(deltaY));
            };

            const handleEnd = (event: TouchEvent) => {
                if (!gesture || findTouch(event.touches, gesture.id)) return;
                const wasPulling = gesture.pulling;
                stopFollowing(gesture.target);
                gesture = null;
                if (!wasPulling) return;
                setIsDragging(false);
                if (pullRef.current < PULL_TO_REFRESH_THRESHOLD) {
                    updatePull(0);
                    return;
                }
                refreshingRef.current = true;
                setIsRefreshing(true);
                updatePull(REFRESHING_OFFSET);
                // A rejected refresh must still put the list back, and so must one that never
                // answers — the race below stops the waiting, not the work.
                let timer: ReturnType<typeof setTimeout> | undefined;
                const cap = new Promise<void>(resolve => {
                    timer = setTimeout(resolve, maxRefreshMsRef.current);
                });
                const work = Promise.resolve()
                    .then(() => onRefreshRef.current())
                    .catch(() => undefined);
                void Promise.race([work, cap]).finally(() => {
                    clearTimeout(timer);
                    refreshingRef.current = false;
                    setIsRefreshing(false);
                    updatePull(0);
                });
            };

            // The system took the touch (a call, an OS gesture): that is not a release, so the pull
            // is dropped rather than committed.
            const handleCancel = () => abandon();

            node.addEventListener('touchstart', handleStart, { passive: true });
            return () => {
                node.removeEventListener('touchstart', handleStart);
                // Disabled or unmounted mid-drag: no release will ever reach us, so put the content
                // back now. A refresh already running settles on its own.
                if (refreshingRef.current) {
                    stopFollowing(gesture?.target);
                    gesture = null;
                } else {
                    abandon();
                }
            };
        }, [disabled]);

        const progress = Math.min(pull / PULL_TO_REFRESH_THRESHOLD, 1);

        return (
            <div ref={setRefs} className={cn('relative overscroll-y-contain', className)} {...rest}>
                <div
                    aria-hidden={!isRefreshing}
                    role={isRefreshing ? 'status' : undefined}
                    aria-label={isRefreshing ? refreshingLabel : undefined}
                    className={cn(
                        'pointer-events-none absolute inset-x-0 top-0 flex items-end justify-center overflow-hidden',
                        // Eased with the content below, so the two settle back together.
                        !isDragging && 'transition-[height] duration-200 ease-out'
                    )}
                    style={{ height: pull }}
                >
                    <IconSpinner
                        aria-hidden
                        className={cn('mb-4 size-6 text-description', isRefreshing && 'animate-spin')}
                        // While dragging the glyph turns with the pull and fades in toward the
                        // threshold, so the user can see how far a release still has to go.
                        style={
                            isRefreshing ? undefined : { opacity: progress, transform: `rotate(${progress * 270}deg)` }
                        }
                    />
                </div>
                <div
                    className={cn(!isDragging && 'transition-transform duration-200 ease-out', contentClassName)}
                    style={pull > 0 ? { transform: `translateY(${pull}px)` } : undefined}
                >
                    {children}
                </div>
            </div>
        );
    }
);
PullToRefresh.displayName = 'PullToRefresh';
