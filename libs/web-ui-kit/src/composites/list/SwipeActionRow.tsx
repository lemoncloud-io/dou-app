import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { TOUCH_DIRECTION_SLOP } from '../layout/PullToRefresh';

export type SwipeSide = 'leading' | 'trailing';

export interface SwipeAction {
    key: string;
    label: string;
    icon?: React.ReactNode;
    tone?: 'neutral' | 'accent' | 'destructive';
    onSelect: () => void;
}

export interface SwipeActionRowProps {
    leadingActions?: SwipeAction[];
    trailingActions?: SwipeAction[];
    open?: SwipeSide | null;
    onOpenChange?: (side: SwipeSide | null) => void;
    onReveal?: (side: SwipeSide) => void;
    disabled?: boolean;
    className?: string;
    children: React.ReactNode;
}

export const SWIPE_ACTION_WIDTH = 72;
const DIRECTION_SLOP = TOUCH_DIRECTION_SLOP;
const OVERSHOOT_RESISTANCE = 0.3;
const OPEN_RATIO = 0.5;
const CLICK_SWALLOW_MS = 500;

export const resolveSwipeOffset = (raw: number, leadingWidth: number, trailingWidth: number): number => {
    const width = raw > 0 ? leadingWidth : trailingWidth;
    if (width === 0) return 0;
    const distance = Math.abs(raw);
    const resolved = distance <= width ? distance : width + (distance - width) * OVERSHOOT_RESISTANCE;
    return raw > 0 ? resolved : -resolved;
};

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
    base: number;
    swiping: boolean;
    offset: number;
    armed: SwipeSide | null;
};

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
    const [dragOffset, setDragOffset] = React.useState<number | null>(null);
    const swallowClicksUntil = React.useRef(0);
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

        const abandon = () => {
            const wasSwiping = gesture?.swiping === true;
            stopFollowing(gesture?.target);
            gesture = null;
            if (wasSwiping) setDragOffset(null);
        };

        const handleStart = (event: TouchEvent) => {
            if (gesture || event.touches.length !== 1) return;
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
                    if (Math.abs(deltaX) > Math.abs(deltaY) && event.cancelable) event.preventDefault();
                    return;
                }
                if (Math.abs(deltaX) <= Math.abs(deltaY)) {
                    abandon();
                    if (latest.current.open) latest.current.onOpenChange?.(null);
                    return;
                }
                gesture.swiping = true;
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

        const handleCancel = () => abandon();

        node.addEventListener('touchstart', handleStart, { passive: true });
        return () => {
            node.removeEventListener('touchstart', handleStart);
            abandon();
        };
    }, [disabled, hasActions]);

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
