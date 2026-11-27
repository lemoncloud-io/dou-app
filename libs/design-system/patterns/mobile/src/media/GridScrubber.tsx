import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { scrollTopForScrubber, scrubberOffset, showsScrubber } from './photoGridLayout';

const HANDLE_HEIGHT = 48;
const TRACK_INSET = 8;
const HIDE_AFTER_MS = 1500;

const trackLength = (viewportHeight: number, insetBottom: number) =>
    Math.max(0, viewportHeight - insetBottom - TRACK_INSET * 2);

export interface GridScrubberProps {
    scroller: HTMLElement | null;
    contentHeight: number;
    insetBottom?: number;
    className?: string;
}

export const GridScrubber = ({ scroller, contentHeight, insetBottom = 0, className }: GridScrubberProps) => {
    const [eligible, setEligible] = React.useState(false);
    const [offset, setOffset] = React.useState(0);
    const [visible, setVisible] = React.useState(false);
    const [dragging, setDragging] = React.useState(false);
    const drag = React.useRef<{ pointerId: number; startY: number; startOffset: number } | null>(null);
    const hideTimer = React.useRef<number | null>(null);

    const measure = React.useCallback(() => {
        if (!scroller) return;
        const viewportHeight = scroller.clientHeight;
        setEligible(showsScrubber(scroller.scrollHeight, viewportHeight));
        setOffset(
            scrubberOffset({
                scrollTop: scroller.scrollTop,
                scrollHeight: scroller.scrollHeight,
                viewportHeight,
                track: trackLength(viewportHeight, insetBottom),
                handle: HANDLE_HEIGHT,
            })
        );
    }, [scroller, insetBottom]);

    const clearHide = () => {
        if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
    };

    const scheduleHide = React.useCallback(() => {
        clearHide();
        hideTimer.current = window.setTimeout(() => {
            hideTimer.current = null;
            if (!drag.current) setVisible(false);
        }, HIDE_AFTER_MS);
    }, []);

    React.useEffect(() => clearHide, []);

    React.useEffect(() => {
        if (!scroller) return;
        const onScroll = () => {
            measure();
            setVisible(true);
            if (!drag.current) scheduleHide();
        };
        scroller.addEventListener('scroll', onScroll, { passive: true });
        return () => scroller.removeEventListener('scroll', onScroll);
    }, [scroller, measure, scheduleHide]);

    React.useEffect(measure, [measure, contentHeight]);

    React.useEffect(() => {
        if (eligible) return;
        drag.current = null;
        setDragging(false);
    }, [eligible]);

    if (!eligible || !scroller) return null;

    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        event.stopPropagation();
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        drag.current = { pointerId: event.pointerId, startY: event.clientY, startOffset: offset };
        clearHide();
        setDragging(true);
        setVisible(true);
    };

    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        event.stopPropagation();
        const active = drag.current;
        if (!active || active.pointerId !== event.pointerId) return;
        const viewportHeight = scroller.clientHeight;
        scroller.scrollTop = scrollTopForScrubber({
            offset: active.startOffset + (event.clientY - active.startY),
            scrollHeight: scroller.scrollHeight,
            viewportHeight,
            track: trackLength(viewportHeight, insetBottom),
            handle: HANDLE_HEIGHT,
        });
    };

    const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
        event.stopPropagation();
        if (drag.current?.pointerId !== event.pointerId) return;
        drag.current = null;
        setDragging(false);
        scheduleHide();
    };

    const shown = visible || dragging;
    return (
        <div
            aria-hidden
            data-testid="photo-grid-scrubber"
            style={{ bottom: TRACK_INSET + insetBottom }}
            className={cn('pointer-events-none absolute right-0 top-2 w-8', className)}
        >
            <div
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
                style={{ height: HANDLE_HEIGHT, transform: `translateY(${offset}px)` }}
                className={cn(
                    'absolute right-0 top-0 flex w-8 touch-none items-center justify-end pr-1 transition-opacity duration-200',
                    shown ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                )}
            >
                <span
                    className={cn(
                        'h-10 rounded-full bg-black/45 shadow-[0_0_0_1px_rgba(255,255,255,0.6)] dark:bg-white/60',
                        dragging ? 'w-2' : 'w-1.5'
                    )}
                />
            </div>
        </div>
    );
};
