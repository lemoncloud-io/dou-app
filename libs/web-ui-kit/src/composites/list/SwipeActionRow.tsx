import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { TOUCH_DIRECTION_SLOP } from '../layout/PullToRefresh';

export type SwipeSide = 'leading' | 'trailing';

export interface SwipeAction {
    /** Unique within its side. */
    key: string;
    /** Visible under the icon, and the button's accessible name. */
    label: string;
    icon?: React.ReactNode;
    /**
     * `accent` for a change to the row's own standing (pin), `neutral` for a reversible setting
     * (notifications), `destructive` for a way out of the row (leave, delete).
     */
    tone?: 'neutral' | 'accent' | 'destructive';
    /** Runs after the row has asked to close, so an action that opens a dialog opens it over a closed row. */
    onSelect: () => void;
}

export interface SwipeActionRowProps {
    /** Revealed by dragging the row to the right, in order from the left edge. */
    leadingActions?: SwipeAction[];
    /**
     * Revealed by dragging the row to the left, in order from the content's edge — so the last one
     * sits at the screen edge, where a destructive action belongs.
     */
    trailingActions?: SwipeAction[];
    /** Which side is open. Controlled — the host decides, so it can keep one row open at a time. */
    open?: SwipeSide | null;
    /** A release, a tap on an action, a tap on the content or a touch elsewhere asks for this. */
    onOpenChange?: (side: SwipeSide | null) => void;
    /**
     * Fires when a drag crosses the point where letting go would open a side — once per crossing,
     * never on the way back. The host's hook for feedback, such as a haptic tick.
     */
    onReveal?: (side: SwipeSide) => void;
    /** Turns the gesture off; the content still takes taps. */
    disabled?: boolean;
    className?: string;
    children: React.ReactNode;
}

/** Width of one action button. */
export const SWIPE_ACTION_WIDTH = 72;
/**
 * Finger travel before a touch is judged a swipe or a scroll — the pull's own distance, so a row
 * inside a `PullToRefresh` and the pull around it decide on the same move (see there).
 */
const DIRECTION_SLOP = TOUCH_DIRECTION_SLOP;
/** Past its full width a side keeps following the finger at this fraction, so it reads as elastic. */
const OVERSHOOT_RESISTANCE = 0.3;
/** A release past this fraction of a side's width opens it. */
const OPEN_RATIO = 0.5;
/** How long after a swipe, or a dismissing touch, the click it turns into is swallowed. */
const CLICK_SWALLOW_MS = 500;

/**
 * Where the content sits for a raw drag position: 1:1 up to a side's width, elastic past it, and
 * pinned at 0 toward a side that has no actions.
 */
export const resolveSwipeOffset = (raw: number, leadingWidth: number, trailingWidth: number): number => {
    const width = raw > 0 ? leadingWidth : trailingWidth;
    if (width === 0) return 0;
    const distance = Math.abs(raw);
    const resolved = distance <= width ? distance : width + (distance - width) * OVERSHOOT_RESISTANCE;
    return raw > 0 ? resolved : -resolved;
};

/** The side a release at `offset` opens, or null when it falls short and the row closes. */
export const resolveSwipeRelease = (offset: number, leadingWidth: number, trailingWidth: number): SwipeSide | null => {
    if (offset > 0 && leadingWidth > 0 && offset >= leadingWidth * OPEN_RATIO) return 'leading';
    if (offset < 0 && trailingWidth > 0 && -offset >= trailingWidth * OPEN_RATIO) return 'trailing';
    return null;
};

const TONE_CLASS: Record<NonNullable<SwipeAction['tone']>, string> = {
    neutral: 'bg-description text-background',
    accent: 'bg-point-blue text-white',
    destructive: 'bg-destructive text-destructive-foreground',
};

type Gesture = {
    id: number;
    target: EventTarget;
    startX: number;
    startY: number;
    /** The offset the row rested at when the finger landed. */
    base: number;
    swiping: boolean;
    offset: number;
    /** The side a release would open right now — what `onReveal` compares against. */
    armed: SwipeSide | null;
};

/**
 * A row with actions behind it: drag it sideways to reveal them, tap one to run it.
 *
 * The same touch model as `PullToRefresh`, for the same reasons. Listeners are native because a
 * React touch handler is passive and cannot stop the list from scrolling under a sideways drag. The
 * rest of a touch is followed on the element it landed on, which keeps hearing it even if the host
 * swaps that element out. The first few pixels decide, at the same distance the pull uses: a
 * mostly vertical touch is a scroll (or a pull) and is left alone for the rest of its life, and a
 * pull-to-refresh above this row abandons a sideways one — so the two never both claim a touch.
 *
 * Three touches close an open row without running anything: a tap on its content (which is not
 * passed on — the row does not open its target on the way to closing), a scroll that starts on it,
 * and a touch anywhere else. The click that last touch would become is swallowed too, as a
 * swipe-list does natively: a tap meant to put the row away should not also press whatever it
 * landed on.
 *
 * Only the gesture's own position is held here. Which side is open is the host's.
 */
export const SwipeActionRow = ({
    leadingActions = [],
    trailingActions = [],
    open = null,
    onOpenChange,
    onReveal,
    disabled = false,
    className,
    children,
}: SwipeActionRowProps) => {
    const leadingWidth = leadingActions.length * SWIPE_ACTION_WIDTH;
    const trailingWidth = trailingActions.length * SWIPE_ACTION_WIDTH;
    const restOffset = open === 'leading' ? leadingWidth : open === 'trailing' ? -trailingWidth : 0;

    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const contentRef = React.useRef<HTMLDivElement | null>(null);
    // Non-null only while a finger is dragging the row; the row otherwise rests where `open` puts it.
    const [dragOffset, setDragOffset] = React.useState<number | null>(null);
    const swallowClicksUntil = React.useRef(0);
    // The native listeners are attached once per enablement, so they read the latest props here
    // rather than through the closure of the render that attached them.
    const latest = React.useRef({ restOffset, leadingWidth, trailingWidth, open, onOpenChange, onReveal });
    latest.current = { restOffset, leadingWidth, trailingWidth, open, onOpenChange, onReveal };

    const hasActions = leadingWidth > 0 || trailingWidth > 0;

    React.useEffect(() => {
        const node = contentRef.current;
        if (!node || disabled || !hasActions) return;

        let gesture: Gesture | null = null;

        const findTouch = (list: TouchList, id: number): Touch | null => {
            for (let index = 0; index < list.length; index += 1) {
                if (list[index].identifier === id) return list[index];
            }
            return null;
        };

        const stopFollowing = (target: EventTarget | undefined) => {
            if (!target) return;
            target.removeEventListener('touchmove', handleMove as EventListener);
            target.removeEventListener('touchend', handleEnd as EventListener);
            target.removeEventListener('touchcancel', handleCancel);
        };

        // Drops the touch without committing it: the row goes back to where it rested.
        const abandon = () => {
            const wasSwiping = gesture?.swiping === true;
            stopFollowing(gesture?.target);
            gesture = null;
            if (wasSwiping) setDragOffset(null);
        };

        const handleStart = (event: TouchEvent) => {
            if (gesture || event.touches.length !== 1) return;
            // A new touch owns whatever click follows it; only the previous swipe's own late click
            // was meant to be swallowed, not a tap that comes right after it.
            swallowClicksUntil.current = 0;
            const touch = event.touches[0];
            const target = event.target ?? node;
            const base = latest.current.restOffset;
            gesture = {
                id: touch.identifier,
                target,
                startX: touch.clientX,
                startY: touch.clientY,
                base,
                swiping: false,
                offset: base,
                armed: latest.current.open,
            };
            target.addEventListener('touchmove', handleMove as EventListener, { passive: false });
            target.addEventListener('touchend', handleEnd as EventListener);
            target.addEventListener('touchcancel', handleCancel);
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
            if (!gesture.swiping) {
                if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < DIRECTION_SLOP) {
                    // Still undecided. A move that leans sideways is held back anyway: the first
                    // move WebKit lets through can start its own pan, and every move after that is
                    // uncancellable — the row would slide while the list scrolled under it.
                    if (Math.abs(deltaX) > Math.abs(deltaY) && event.cancelable) event.preventDefault();
                    return;
                }
                if (Math.abs(deltaX) <= Math.abs(deltaY)) {
                    // A scroll. It stays one, and scrolling away from an open row puts it back.
                    abandon();
                    if (latest.current.open) latest.current.onOpenChange?.(null);
                    return;
                }
                gesture.swiping = true;
                // Measured from here, so the row does not jump by the slop it just waited out.
                gesture.startX = touch.clientX;
            }
            if (event.cancelable) event.preventDefault();
            const { leadingWidth: leading, trailingWidth: trailing } = latest.current;
            const offset = resolveSwipeOffset(gesture.base + touch.clientX - gesture.startX, leading, trailing);
            gesture.offset = offset;
            setDragOffset(offset);
            const armed = resolveSwipeRelease(offset, leading, trailing);
            if (armed !== gesture.armed) {
                gesture.armed = armed;
                if (armed) latest.current.onReveal?.(armed);
            }
        };

        const handleEnd = (event: TouchEvent) => {
            if (!gesture || findTouch(event.touches, gesture.id)) return;
            const ended = gesture;
            stopFollowing(ended.target);
            gesture = null;
            if (!ended.swiping) return;
            swallowClicksUntil.current = performance.now() + CLICK_SWALLOW_MS;
            const { leadingWidth: leading, trailingWidth: trailing, open: current } = latest.current;
            const side = resolveSwipeRelease(ended.offset, leading, trailing);
            setDragOffset(null);
            if (side !== current) latest.current.onOpenChange?.(side);
        };

        // The system took the touch: that is not a release, so nothing opens or closes.
        const handleCancel = () => abandon();

        node.addEventListener('touchstart', handleStart, { passive: true });
        return () => {
            node.removeEventListener('touchstart', handleStart);
            abandon();
        };
    }, [disabled, hasActions]);

    // A touch anywhere outside an open row puts it away — and does nothing else.
    React.useEffect(() => {
        if (!open) return;
        const handleOutside = (event: TouchEvent) => {
            if (rootRef.current?.contains(event.target as Node)) return;
            const swallowUntil = performance.now() + CLICK_SWALLOW_MS;
            const swallow = (click: MouseEvent) => {
                document.removeEventListener('click', swallow, true);
                if (performance.now() > swallowUntil) return;
                click.preventDefault();
                click.stopPropagation();
            };
            document.addEventListener('click', swallow, true);
            // A touch that turns into a scroll never clicks; do not leave the swallow armed for later.
            setTimeout(() => document.removeEventListener('click', swallow, true), CLICK_SWALLOW_MS);
            latest.current.onOpenChange?.(null);
        };
        document.addEventListener('touchstart', handleOutside, { capture: true, passive: true });
        return () => document.removeEventListener('touchstart', handleOutside, { capture: true });
    }, [open]);

    const handleContentClick = (event: React.MouseEvent) => {
        const justSwiped = performance.now() < swallowClicksUntil.current;
        if (!justSwiped && !open) return;
        event.preventDefault();
        event.stopPropagation();
        if (!justSwiped) onOpenChange?.(null);
    };

    const isDragging = dragOffset !== null;
    const offset = dragOffset ?? restOffset;

    const renderTray = (side: SwipeSide, actions: SwipeAction[], width: number) => {
        if (actions.length === 0) return null;
        const exposed = side === 'leading' ? Math.max(offset, 0) : Math.max(-offset, 0);
        const isOpen = open === side;
        return (
            <div
                aria-hidden={!isOpen}
                className={cn(
                    'absolute inset-y-0 flex',
                    side === 'leading' ? 'left-0' : 'right-0',
                    // Past its full width the tray stretches with the pull, and eases back with the content.
                    !isDragging && 'transition-[width] duration-200 ease-out'
                )}
                style={{ width: Math.max(width, exposed) }}
            >
                {actions.map(action => (
                    <button
                        key={action.key}
                        type="button"
                        tabIndex={isOpen ? 0 : -1}
                        onClick={() => {
                            onOpenChange?.(null);
                            action.onSelect();
                        }}
                        className={cn(
                            'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 overflow-hidden px-1 text-[12px] font-medium leading-4',
                            TONE_CLASS[action.tone ?? 'neutral']
                        )}
                    >
                        {action.icon && (
                            <span aria-hidden className="flex size-5 shrink-0 items-center justify-center">
                                {action.icon}
                            </span>
                        )}
                        <span className="max-w-full truncate">{action.label}</span>
                    </button>
                ))}
            </div>
        );
    };

    return (
        <div ref={rootRef} className={cn('relative overflow-hidden', className)}>
            {renderTray('leading', leadingActions, leadingWidth)}
            {renderTray('trailing', trailingActions, trailingWidth)}
            <div
                ref={contentRef}
                onClickCapture={handleContentClick}
                className={cn(
                    'relative touch-pan-y bg-background',
                    !isDragging && 'transition-transform duration-200 ease-out'
                )}
                style={offset !== 0 ? { transform: `translateX(${offset}px)` } : undefined}
            >
                {children}
            </div>
        </div>
    );
};
