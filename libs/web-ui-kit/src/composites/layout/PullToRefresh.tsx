import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { douLogo } from '../../resources/assets';

/** Pull distance, after resistance, at which the gauge is full and the refresh starts. */
export const PULL_TO_REFRESH_THRESHOLD = 64;
/**
 * Steps the gauge fills in. Each one crossed on the way down is a tick, and the last one is the fill
 * itself — so a full pull is felt as a run of ticks that ends in the stronger tap of the refresh.
 */
export const PULL_TO_REFRESH_STEPS = 8;
/** How far the content can be dragged at most, so a long pull does not drag the list off screen. */
const MAX_PULL = 120;
/** Finger travel is halved on the way down, which is what makes the pull read as elastic. */
const RESISTANCE = 0.5;
/** Where the content rests while a refresh is running: the indicator's own slot (40px disc, 12px each side). */
const REFRESHING_OFFSET = 64;
/**
 * Finger travel before a touch is judged a pull or a scroll. iOS reports moves of a pixel, so the
 * first one alone is jitter — often `dy === 0` or a sideways twitch on what is plainly a pull.
 *
 * Exported because `SwipeActionRow` must decide on the very same move. The pull claims a touch
 * leaning down (`dy > |dx|`) and the swipe one leaning sideways (`|dx| > |dy|`); judged at the same
 * distance those can never both pass, where two different distances let one claim the touch first
 * and the other claim it again a move later.
 */
export const TOUCH_DIRECTION_SLOP = 6;
const DIRECTION_SLOP = TOUCH_DIRECTION_SLOP;
/** Default for `maxRefreshMs`. */
const DEFAULT_MAX_REFRESH_MS = 10_000;
/**
 * How far, in pull pixels, the pull has to fall back below a step it ticked before that step can tick
 * again. A step is 8px of pull and the pull moves in half pixels, so without this a finger resting on
 * a boundary would buzz with every tremble.
 */
const TICK_HYSTERESIS = 3;
/** Length of the pop the character gives when the gauge fills; its wobble starts once it is done. */
const FILL_POP_MS = 320;

/**
 * Finger travel → how far the content moves. Upward travel is no pull at all, and the result is
 * capped so the drag stays bounded however far the finger goes.
 */
export const resolvePullDistance = (deltaY: number): number =>
    deltaY <= 0 ? 0 : Math.min(deltaY * RESISTANCE, MAX_PULL);

/**
 * Pull distance → how many of the gauge's {@link PULL_TO_REFRESH_STEPS} steps are filled. Reaching
 * the last step is reaching the threshold.
 */
export const resolvePullStep = (pull: number): number =>
    Math.min(Math.floor((pull / PULL_TO_REFRESH_THRESHOLD) * PULL_TO_REFRESH_STEPS), PULL_TO_REFRESH_STEPS);

export interface PullToRefreshProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
    /**
     * Runs the moment a pull fills the gauge — the finger does not have to let go. The indicator
     * stays up until the returned promise settles or `maxRefreshMs` passes, and a pull made while it
     * is still up is ignored.
     */
    onRefresh: () => Promise<unknown>;
    /**
     * The longest the indicator waits on `onRefresh`. The work itself is not cancelled — only the
     * indicator stops waiting — so a request stuck on a socket nobody has noticed is dead yet cannot
     * hold the list down, and the gesture, for as long as that request's own timeout.
     */
    maxRefreshMs?: number;
    /** Turns the gesture off; the container still scrolls. */
    disabled?: boolean;
    /**
     * Fires each time a pull fills one more step of the gauge on the way down, short of the last.
     * Pulling back and down again ticks again, like a ratchet. A move that skips several steps at
     * once ticks once: a burst in a single frame would be felt as one buzz anyway. The host's hook
     * for feedback, such as a light haptic; the kit has no way to make one itself.
     */
    onTick?: () => void;
    /**
     * Fires when the gauge fills, right before `onRefresh` — once per touch. The host's hook for the
     * stronger feedback that says the refresh has started.
     */
    onFill?: () => void;
    /** Accessible name of the running-refresh status. */
    refreshingLabel?: string;
    /**
     * Classes for the element that wraps `children` and moves with the pull. A host whose
     * container was a flex column puts that layout here, since its children now sit one level down.
     */
    contentClassName?: string;
    children: React.ReactNode;
}

type Gesture = {
    id: number;
    target: EventTarget;
    startX: number;
    startY: number;
    pulling: boolean;
    /** The highest step this touch has ticked and not since fallen clear of. */
    tickedStep: number;
    /** This touch filled the gauge: it has started its refresh and makes no more ticks. */
    filled: boolean;
};

/**
 * Scroll container with pull-to-refresh: at the top of the list, dragging down reveals the DoU
 * character in a disc that fills like a gauge, and filling it — reaching
 * {@link PULL_TO_REFRESH_THRESHOLD} — calls `onRefresh` there and then, finger still down. Waiting
 * for the release would make the full gauge a promise rather than the event; starting on the fill
 * lets the strongest feedback land at the moment the refresh actually begins.
 *
 * It is the scroll container itself rather than a wrapper around one, because the gesture has to
 * know `scrollTop` at the moment the finger lands — a pull only starts from the very top, so a
 * flick back up through a long list never turns into a refresh. The ref and every div attribute
 * (`onScroll` included) land on that container, so a host's scroll restoration keeps working.
 *
 * Touch listeners are attached natively. React registers touch handlers as passive, and a passive
 * `touchmove` cannot `preventDefault` — the WebView would then rubber-band the list underneath the
 * indicator instead of letting the pull move it. Only a move that is, or may still become, a pull is
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
            onTick,
            onFill,
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
        // How full the gauge reads, 0–1. Set only by the finger and the fill, never by the list settling
        // back, so the indicator keeps the reading it had while it rides up with the collapsing slot
        // instead of emptying on the first frame.
        const [gauge, setGauge] = React.useState(0);
        // Mirrors of the state above, for the native listeners: they are attached once, so reading
        // state through the closure would see the values from the render that attached them.
        const pullRef = React.useRef(0);
        const refreshingRef = React.useRef(false);
        const onRefreshRef = React.useRef(onRefresh);
        onRefreshRef.current = onRefresh;
        const maxRefreshMsRef = React.useRef(maxRefreshMs);
        maxRefreshMsRef.current = maxRefreshMs;
        const onTickRef = React.useRef(onTick);
        onTickRef.current = onTick;
        const onFillRef = React.useRef(onFill);
        onFillRef.current = onFill;

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

            // Where the content goes once no finger holds it: the indicator's slot while a refresh
            // runs, otherwise back to the top.
            const restingPull = () => (refreshingRef.current ? REFRESHING_OFFSET : 0);

            const startRefresh = () => {
                refreshingRef.current = true;
                setIsRefreshing(true);
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
                    // Settled with the finger still down: the content stays under it, and the
                    // release puts it back.
                    if (!gesture?.pulling) updatePull(0);
                });
            };

            // Only a finger's pull ticks and fills; the list settling into its slot or back to 0 does not.
            const followFinger = (active: Gesture, value: number) => {
                updatePull(value);
                if (active.filled) return;
                const step = resolvePullStep(value);
                if (step >= PULL_TO_REFRESH_STEPS) {
                    active.filled = true;
                    setGauge(1);
                    onFillRef.current?.();
                    startRefresh();
                    return;
                }
                setGauge(value / PULL_TO_REFRESH_THRESHOLD);
                if (step > active.tickedStep) {
                    active.tickedStep = step;
                    onTickRef.current?.();
                    return;
                }
                // Pulling back re-arms a step only once the pull is clear of its boundary.
                active.tickedStep = Math.min(active.tickedStep, resolvePullStep(value + TICK_HYSTERESIS));
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

            // Lets go of the touch without a release. Short of the fill nothing refreshes and the list
            // goes back; past it the refresh already started, and the list settles into its slot.
            const abandon = () => {
                const wasPulling = gesture?.pulling === true;
                stopFollowing(gesture?.target);
                gesture = null;
                if (!wasPulling) return;
                setIsDragging(false);
                updatePull(restingPull());
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
                    tickedStep: 0,
                    filled: false,
                };
                // A second finger can land anywhere, so that one is heard on the document.
                document.addEventListener('touchstart', handleExtraTouch, { passive: true });
                target.addEventListener('touchmove', handleMove as EventListener, { passive: false });
                target.addEventListener('touchend', handleEnd as EventListener);
                target.addEventListener('touchcancel', handleCancel);
            };

            // A second finger makes it a pinch or a stray touch, not a pull: the gauge stops where it is
            // and, short of full, refreshes nothing.
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
                followFinger(gesture, resolvePullDistance(deltaY));
            };

            const handleEnd = (event: TouchEvent) => {
                if (!gesture || findTouch(event.touches, gesture.id)) return;
                const wasPulling = gesture.pulling;
                stopFollowing(gesture.target);
                gesture = null;
                if (!wasPulling) return;
                setIsDragging(false);
                updatePull(restingPull());
            };

            // The system took the touch (a call, an OS gesture). It is not a release, but the refresh
            // starts on the fill, not on the release, so all that is left to decide is where the list rests.
            const handleCancel = () => abandon();

            node.addEventListener('touchstart', handleStart, { passive: true });
            return () => {
                node.removeEventListener('touchstart', handleStart);
                // Disabled or unmounted mid-drag: no release will ever reach us, so put the content
                // where it rests now. A refresh already running settles on its own.
                abandon();
            };
        }, [disabled]);

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
                    <RefreshIndicator gauge={gauge} refreshing={isRefreshing} />
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

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * A small raised disc holding the DoU character, filled from the bottom in the accent colour as the
 * pull goes on — the gauge. The character grows, straightens and takes on its colour with the fill.
 * When the gauge fills it pops, and while the refresh runs it wobbles. On the way out the disc rides
 * up with the collapsing slot, so the end needs no separate animation.
 *
 * The pop and the wobble are Web Animations, not Tailwind classes: the kit only uses the animations
 * every host already has, and these keyframes would otherwise have to be added to each host's
 * config. A WebView without the API, or a reader who asked for reduced motion, simply gets a still
 * character in a full disc.
 */
const RefreshIndicator = ({ gauge, refreshing }: { gauge: number; refreshing: boolean }) => {
    const characterRef = React.useRef<HTMLImageElement | null>(null);
    const level = refreshing ? 1 : gauge;

    React.useEffect(() => {
        const character = characterRef.current;
        if (!refreshing || !character || typeof character.animate !== 'function' || prefersReducedMotion()) return;
        const pop = character.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }],
            { duration: FILL_POP_MS, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
        );
        const wobble = character.animate(
            [
                { transform: 'translateY(0) rotate(0deg)' },
                { transform: 'translateY(-2px) rotate(-10deg)' },
                { transform: 'translateY(0) rotate(0deg)' },
                { transform: 'translateY(-2px) rotate(10deg)' },
                { transform: 'translateY(0) rotate(0deg)' },
            ],
            { duration: 1100, delay: FILL_POP_MS, iterations: Infinity, easing: 'ease-in-out' }
        );
        return () => {
            pop.cancel();
            wobble.cancel();
        };
    }, [refreshing]);

    return (
        <span
            data-filled={refreshing || undefined}
            className="relative mb-3 flex size-10 items-center justify-center overflow-hidden rounded-full border-[0.5px] border-input-border/70 bg-surface shadow-[0_2px_12px_0_rgba(0,0,0,0.08)]"
            style={{ opacity: level, transform: `scale(${0.6 + 0.4 * level})` }}
        >
            {/* The fill. Its top edge is the gauge's reading, so it tracks the pull with no easing. */}
            <span
                aria-hidden
                className="absolute inset-0 bg-main-accent"
                style={{ transform: `translateY(${(1 - level) * 100}%)` }}
            />
            <img
                ref={characterRef}
                src={douLogo}
                alt=""
                aria-hidden
                draggable={false}
                className="relative w-7"
                style={{
                    filter: `grayscale(${1 - level})`,
                    transform: `scale(${0.75 + 0.25 * level}) rotate(${-18 * (1 - level)}deg)`,
                }}
            />
        </span>
    );
};
