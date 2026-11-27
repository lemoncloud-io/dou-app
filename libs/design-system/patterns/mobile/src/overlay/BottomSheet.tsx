import * as React from 'react';

import { Sheet as Root, SheetContent, SheetDescription, SheetTitle } from '@chatic/ui-kit/components/ui/sheet';

import { cn } from '@chatic/ui-kit';

import { IconClose } from '@chatic/design-system-assets/icons';
import { canStartDrag, clampDragOffset, isPastDragSlop, shouldDismissOnRelease } from './sheetDrag';

const DISMISS_MS = 220;

const SETTLE_MS = 180;

type DragPhase = 'idle' | 'dragging' | 'settling' | 'resting' | 'dismissing';

export interface BottomSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title?: string;
    onClose?: () => void;
    description?: string;
    showHandle?: boolean;
    disableDragToDismiss?: boolean;
    hideHeader?: boolean;
    children?: React.ReactNode;
    scrollRef?: React.RefObject<HTMLElement | null>;
    footer?: React.ReactNode;
    closeLabel?: string;
    className?: string;
}

export const BottomSheet = ({
    open,
    onOpenChange,
    title,
    description,
    onClose,
    showHandle = false,
    disableDragToDismiss = false,
    hideHeader = false,
    children,
    scrollRef,
    footer,
    closeLabel = 'Close',
    className,
}: BottomSheetProps) => {
    const panelRef = React.useRef<HTMLDivElement | null>(null);
    const bodyRef = React.useRef<HTMLDivElement | null>(null);

    const [phase, setPhase] = React.useState<DragPhase>('idle');
    const [offset, setOffset] = React.useState(0);

    const gesture = React.useRef<{
        pointerId: number;
        startY: number;
        lastY: number;
        lastAt: number;
        travelPx: number;
        elapsedMs: number;
        dragging: boolean;
    } | null>(null);

    const phaseTimer = React.useRef<number | null>(null);

    const scrolledBy = () => (scrollRef?.current ?? bodyRef.current)?.scrollTop ?? 0;

    const clearPhaseTimer = () => {
        if (phaseTimer.current !== null) window.clearTimeout(phaseTimer.current);
        phaseTimer.current = null;
    };

    React.useEffect(() => clearPhaseTimer, []);

    React.useEffect(() => {
        if (open) return;
        clearPhaseTimer();
        gesture.current = null;
        setPhase('idle');
        setOffset(0);
    }, [open]);

    const handleClose = () => {
        onClose?.();
        onOpenChange(false);
    };

    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (disableDragToDismiss || phase === 'dismissing') return;
        if (event.button !== 0) return;
        if (!canStartDrag(scrolledBy())) return;
        if (gesture.current?.dragging) return;

        gesture.current = {
            pointerId: event.pointerId,
            startY: event.clientY,
            lastY: event.clientY,
            lastAt: event.timeStamp,
            travelPx: 0,
            elapsedMs: 0,
            dragging: false,
        };
    };

    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const active = gesture.current;
        if (!active || active.pointerId !== event.pointerId) return;

        if (!canStartDrag(scrolledBy())) {
            gesture.current = null;
            if (active.dragging) {
                setPhase('resting');
                setOffset(0);
            }
            return;
        }

        active.travelPx = event.clientY - active.lastY;
        active.elapsedMs = event.timeStamp - active.lastAt;
        active.lastY = event.clientY;
        active.lastAt = event.timeStamp;

        const dy = event.clientY - active.startY;
        if (!active.dragging && !isPastDragSlop(dy)) return;
        active.dragging = true;

        if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.setPointerCapture(event.pointerId);
        }
        clearPhaseTimer();
        setPhase('dragging');
        setOffset(clampDragOffset(dy));
    };

    const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
        const active = gesture.current;
        if (!active || active.pointerId !== event.pointerId) return;
        gesture.current = null;

        if (!active.dragging) return;

        const released = clampDragOffset(event.clientY - active.startY);
        const panelHeight = panelRef.current?.offsetHeight ?? 0;
        const dismiss = shouldDismissOnRelease({
            offset: released,
            elapsedMs: active.elapsedMs,
            travelPx: active.travelPx,
            panelHeight,
        });

        clearPhaseTimer();

        if (dismiss) {
            setPhase('dismissing');
            setOffset(panelHeight);
            phaseTimer.current = window.setTimeout(() => onOpenChange(false), DISMISS_MS);
            return;
        }

        setPhase('settling');
        setOffset(0);
        phaseTimer.current = window.setTimeout(() => setPhase('resting'), SETTLE_MS);
    };

    const driven = phase === 'dragging' || phase === 'settling' || phase === 'dismissing';
    const keyframesOff = phase === 'dismissing' || (phase !== 'idle' && open);
    const transitionDuration = phase === 'dismissing' ? DISMISS_MS : phase === 'settling' ? SETTLE_MS : 0;

    return (
        <Root open={open} onOpenChange={onOpenChange}>
            <SheetContent
                ref={panelRef}
                side="bottom"
                hideClose
                data-drag-phase={phase === 'idle' ? undefined : phase}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
                style={
                    {
                        '--sheet-drag-y': `${offset}px`,
                        transitionDuration: `${transitionDuration}ms`,
                    } as React.CSSProperties
                }
                {...(description ? {} : { 'aria-describedby': undefined })}
                className={cn(
                    'flex flex-col gap-0 overflow-hidden rounded-t-[16px] border-0 bg-surface p-0',
                    'max-h-[calc(90vh-var(--keyboard-height,0px))]',
                    '[transform:translateY(calc(var(--sheet-drag-y,0px)-var(--keyboard-height,0px)))]',
                    'pb-[max(0px,calc(var(--safe-bottom,0px)-var(--keyboard-height,0px)))]',
                    keyframesOff && '!animate-none',
                    driven && 'transition-transform ease-out',
                    className
                )}
            >
                {showHandle && (
                    <span
                        aria-hidden
                        className="absolute left-1/2 top-[5px] z-10 h-[5px] w-9 -translate-x-1/2 rounded-[2.5px] bg-[rgba(60,60,67,0.3)] dark:bg-white/30"
                    />
                )}

                {hideHeader ? (
                    <>
                        <SheetTitle className="sr-only">{title}</SheetTitle>
                        {description && <SheetDescription className="sr-only">{description}</SheetDescription>}
                    </>
                ) : (
                    <div className="flex shrink-0 items-center justify-between bg-white/[0.32] px-4 py-3.5 backdrop-blur-xl dark:bg-black/[0.32]">
                        <SheetTitle
                            className={cn(
                                'truncate text-[17px] font-semibold leading-6 text-foreground',
                                !title && 'sr-only'
                            )}
                        >
                            {title}
                        </SheetTitle>
                        {description && <SheetDescription className="sr-only">{description}</SheetDescription>}
                        {onClose && (
                            <button
                                type="button"
                                onClick={handleClose}
                                aria-label={closeLabel}
                                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted p-1"
                            >
                                <IconClose className="size-[18px] text-foreground" />
                            </button>
                        )}
                    </div>
                )}

                <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {children}
                </div>

                {footer && <div className="shrink-0">{footer}</div>}
            </SheetContent>
        </Root>
    );
};
