import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { scrollTopForScrubber, scrubberOffset, showsScrubber } from './photoGridLayout';

/** The handle's touch target, in CSS pixels. The drawn pill inside it is narrower. */
const HANDLE_HEIGHT = 48;
/** Space kept clear at the track's top and bottom, so the handle never sits under the sheet's edge. */
const TRACK_INSET = 8;
/** How long the handle stays after the last scroll or drag. */
const HIDE_AFTER_MS = 1500;

export interface GridScrubberProps {
    /** The element the handle scrolls. Its parent must be positioned: the handle lays over its right edge. */
    scroller: HTMLElement | null;
    /** The scrolled content's height — the handle re-measures when it changes, without showing itself. */
    contentHeight: number;
    className?: string;
}

/**
 * A fast-scroll handle for a long grid, as the system photo apps have: it appears on the right edge
 * while the grid scrolls, fades a moment after, and dragging it moves through the whole list at once —
 * the handle's place along the track is the scroll position's place along the content.
 *
 * Shown only for content longer than three screens. It is pointer-only and hidden from assistive
 * tech: the scroller itself scrolls by every other means, and a second scroll control would only be
 * read out as noise.
 *
 * Its presses never reach the sheet around it — a drag down the handle is a scroll, not a dismissal.
 */
export const GridScrubber = ({ scroller, contentHeight, className }: GridScrubberProps) => {
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
                track: viewportHeight - TRACK_INSET * 2,
                handle: HANDLE_HEIGHT,
            })
        );
    }, [scroller]);

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

    // The handle unmounts when the content shrinks below the threshold, mid-drag included, and its
    // release never comes. Without this it would come back still "dragging" and never fade.
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
            track: viewportHeight - TRACK_INSET * 2,
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
            className={cn('pointer-events-none absolute bottom-2 right-0 top-2 w-8', className)}
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
