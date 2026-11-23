import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { douLogo } from '../../resources/assets';

export const PULL_TO_REFRESH_THRESHOLD = 64;
export const PULL_TO_REFRESH_STEPS = 8;
const MAX_PULL = 120;
const RESISTANCE = 0.5;
const REFRESHING_OFFSET = 64;
export const TOUCH_DIRECTION_SLOP = 6;
const DIRECTION_SLOP = TOUCH_DIRECTION_SLOP;
const DEFAULT_MAX_REFRESH_MS = 10_000;
const TICK_HYSTERESIS = 3;
const FILL_POP_MS = 320;

export const resolvePullDistance = (deltaY: number): number =>
    deltaY <= 0 ? 0 : Math.min(deltaY * RESISTANCE, MAX_PULL);

export const resolvePullStep = (pull: number): number =>
    Math.min(Math.floor((pull / PULL_TO_REFRESH_THRESHOLD) * PULL_TO_REFRESH_STEPS), PULL_TO_REFRESH_STEPS);

export interface PullToRefreshProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
    onRefresh: () => Promise<unknown>;
    maxRefreshMs?: number;
    disabled?: boolean;
    onTick?: () => void;
    onFill?: () => void;
    refreshingLabel?: string;
    contentClassName?: string;
    children: React.ReactNode;
}

type Gesture = {
    id: number;
    target: EventTarget;
    startX: number;
    startY: number;
    pulling: boolean;
    tickedStep: number;
    filled: boolean;
};

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
        const [isDragging, setIsDragging] = React.useState(false);
        const [gauge, setGauge] = React.useState(0);
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
            const isAtTop = () => node.scrollTop <= 0;

            const updatePull = (value: number) => {
                pullRef.current = value;
                setPull(value);
            };

            const restingPull = () => (refreshingRef.current ? REFRESHING_OFFSET : 0);

            const startRefresh = () => {
                refreshingRef.current = true;
                setIsRefreshing(true);
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
                    if (!gesture?.pulling) updatePull(0);
                });
            };

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

            const abandon = () => {
                const wasPulling = gesture?.pulling === true;
                stopFollowing(gesture?.target);
                gesture = null;
                if (!wasPulling) return;
                setIsDragging(false);
                updatePull(restingPull());
            };

            const handleStart = (event: TouchEvent) => {
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
                document.addEventListener('touchstart', handleExtraTouch, { passive: true });
                target.addEventListener('touchmove', handleMove as EventListener, { passive: false });
                target.addEventListener('touchend', handleEnd as EventListener);
                target.addEventListener('touchcancel', handleCancel);
            };

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
                    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < DIRECTION_SLOP) {
                        if (deltaY > 0 && deltaY >= Math.abs(deltaX) && event.cancelable) event.preventDefault();
                        return;
                    }
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

            const handleCancel = () => abandon();

            node.addEventListener('touchstart', handleStart, { passive: true });
            return () => {
                node.removeEventListener('touchstart', handleStart);
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
