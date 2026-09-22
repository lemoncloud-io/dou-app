import * as React from 'react';

import { Sheet as Root, SheetContent, SheetDescription, SheetTitle } from '@chatic/ui-kit/components/ui/sheet';

import { cn } from '@chatic/lib/utils';

import { IconClose } from '../../resources/icons';
import { canStartDrag, clampDragOffset, shouldDismissOnRelease } from './sheetDrag';

/** How long the panel takes to slide the rest of the way out after a dismissing release. */
const DISMISS_MS = 220;

/** How long the panel takes to spring back when the release cleared neither threshold. */
const SETTLE_MS = 180;

/**
 * Who owns the panel's vertical position.
 *
 * `idle` hands it back to Radix, whose enter / exit keyframes write `transform` themselves. The
 * other three are ours, and they are separate states rather than one boolean because each eases
 * differently: a panel under the finger must not ease at all, a released one springs back, and a
 * dismissed one leaves. Collapsing `settling` into `idle` was the first thing tried and it makes
 * the spring-back instant — the transition is removed in the same commit that sets the target.
 */
type DragPhase = 'idle' | 'dragging' | 'settling' | 'dismissing';

export interface BottomSheetProps {
    /** Controls visibility. */
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Title shown in the header bar. Always rendered (visually hidden if empty) for a11y. */
    title?: string;
    /** Shows the close (X) button in the header. */
    onClose?: () => void;
    /**
     * Screen-reader description of the sheet's purpose. Radix warns when a dialog has neither a
     * description nor an explicit opt-out, so omitting this opts out deliberately rather than by
     * accident. Host supplies a localized string.
     */
    description?: string;
    /** Shows the top drag handle. */
    showHandle?: boolean;
    /**
     * Turns off swipe-down-to-dismiss.
     *
     * For a sheet that has to be answered rather than waved away — one whose dismissal must run
     * through its own buttons. The gesture is on by default because the panel already looks
     * draggable: it is bottom-anchored with a rounded top, and with `showHandle` it draws a
     * grabber, which is a promise the component ought to keep.
     */
    disableDragToDismiss?: boolean;
    /**
     * Drops the title / close header entirely, leaving the drag handle as the only chrome
     * (Figma "_Activity View", 4712:16421). For sheets whose content names itself — a row of
     * emoji, a list of faces — where a title bar spends 50px restating it and the close button
     * duplicates the swipe-down and the backdrop tap.
     *
     * `title` and `description` are still required for a11y and are moved into the panel's
     * accessible name instead of being drawn.
     */
    hideHeader?: boolean;
    /** Scrollable body content. */
    children?: React.ReactNode;
    /** Pinned footer (e.g. a FloatingButton) below the scroll area. */
    footer?: React.ReactNode;
    closeLabel?: string;
    /** className applied to the sheet panel. */
    className?: string;
}

/**
 * Bottom sheet — the Figma "Bottom sheet" design system: a bottom-anchored panel
 * with a rounded top, an optional drag handle and title/close header, a
 * scrollable body, and a pinned footer. Built on the shared Radix Sheet
 * (side="bottom"); honors the bottom safe-area inset.
 *
 * Keyboard-aware: focusing a field inside the body lifts the whole panel above the soft keyboard and
 * shrinks its max height by the same amount, so the focused field and the footer CTA both stay
 * reachable instead of sitting behind the keyboard. See the `--keyboard-height` classes below.
 *
 * Swipe-aware: a downward drag that starts with the body at its top carries the panel with it and
 * dismisses it on release (`sheetDrag` holds the thresholds and the reasoning for them). The
 * gesture arms only at `scrollTop === 0`, so it can never eat a scroll, and it finishes by calling
 * the caller's `onOpenChange` rather than closing anything itself — the sheet stays exactly as
 * controlled as it was.
 */
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
    footer,
    closeLabel = 'Close',
    className,
}: BottomSheetProps) => {
    const panelRef = React.useRef<HTMLDivElement | null>(null);
    const bodyRef = React.useRef<HTMLDivElement | null>(null);

    const [phase, setPhase] = React.useState<DragPhase>('idle');
    const [offset, setOffset] = React.useState(0);

    /**
     * Everything the move and release handlers need that must not cause a render when it changes.
     *
     * Velocity is measured from the LAST sample rather than the whole gesture, so a long slow drag
     * that ends in a flick still reads as a flick — averaging over the whole thing would bury it.
     */
    const gesture = React.useRef<{
        pointerId: number;
        startY: number;
        lastY: number;
        lastAt: number;
        travelPx: number;
        elapsedMs: number;
    } | null>(null);

    const phaseTimer = React.useRef<number | null>(null);

    const clearPhaseTimer = () => {
        if (phaseTimer.current !== null) window.clearTimeout(phaseTimer.current);
        phaseTimer.current = null;
    };

    React.useEffect(() => clearPhaseTimer, []);

    // A reopened sheet must not inherit the offset the last one was dragged to, and a sheet the
    // host closes some other way (its own button, the backdrop, Escape) must hand the panel back
    // to Radix so the exit keyframe is the thing that plays.
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
        // Primary button only. A secondary-button drag is not a gesture anyone means, and a wheel
        // or trackpad reaches the body as scroll rather than as pointer movement.
        if (event.button !== 0) return;
        if (!canStartDrag(bodyRef.current?.scrollTop ?? 0)) return;

        clearPhaseTimer();
        gesture.current = {
            pointerId: event.pointerId,
            startY: event.clientY,
            lastY: event.clientY,
            lastAt: event.timeStamp,
            travelPx: 0,
            elapsedMs: 0,
        };
    };

    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const active = gesture.current;
        if (!active || active.pointerId !== event.pointerId) return;

        // The body can still get scrolled mid-gesture — a wheel, a second finger. Give the drag up
        // rather than fight whatever is scrolling.
        if (!canStartDrag(bodyRef.current?.scrollTop ?? 0)) {
            gesture.current = null;
            setPhase('idle');
            setOffset(0);
            return;
        }

        active.travelPx = event.clientY - active.lastY;
        active.elapsedMs = event.timeStamp - active.lastAt;
        active.lastY = event.clientY;
        active.lastAt = event.timeStamp;

        const next = clampDragOffset(event.clientY - active.startY);
        if (next <= 0 && phase === 'idle') return;

        // Capture only once the gesture has actually become a drag. Capturing on the first move
        // would swallow taps on the buttons inside the panel.
        if (next > 0 && !event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.setPointerCapture(event.pointerId);
        }
        setPhase('dragging');
        setOffset(next);
    };

    const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
        const active = gesture.current;
        if (!active || active.pointerId !== event.pointerId) return;
        gesture.current = null;

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
            // Carry the panel the rest of the way out ourselves, and only then tell the caller.
            // Handing over at the release point instead would let Radix's exit keyframe start from
            // the panel's RESTING place — it animates a transform from 0 to 100%, not from wherever
            // the finger left it — so the panel would snap back up before sliding down again. The
            // `!animate-none` below is what keeps that keyframe out of the way; with no animation
            // to wait for, Radix unmounts the moment the panel is already gone.
            setPhase('dismissing');
            setOffset(panelHeight);
            phaseTimer.current = window.setTimeout(() => onOpenChange(false), DISMISS_MS);
            return;
        }

        setPhase('settling');
        setOffset(0);
        phaseTimer.current = window.setTimeout(() => setPhase('idle'), SETTLE_MS);
    };

    const driven = phase !== 'idle';
    const transitionDuration = phase === 'dismissing' ? DISMISS_MS : phase === 'settling' ? SETTLE_MS : 0;

    return (
        <Root open={open} onOpenChange={onOpenChange}>
            <SheetContent
                ref={panelRef}
                side="bottom"
                hideClose
                data-drag-phase={driven ? phase : undefined}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
                // The offset is a live pixel value, so it travels as a custom property rather than
                // as a class. The duration rides along with it because the two are one decision:
                // a panel under the finger follows it exactly, and a released one eases by an
                // amount that depends on which way the release went.
                style={
                    {
                        '--sheet-drag-y': `${offset}px`,
                        transitionDuration: `${transitionDuration}ms`,
                    } as React.CSSProperties
                }
                // Radix links its own Description automatically, but warns when a dialog has neither
                // one nor an explicit opt-out — so pass the key (with no value) only when there is
                // nothing to link. Spreading it unconditionally would suppress the auto-link too.
                {...(description ? {} : { 'aria-describedby': undefined })}
                className={cn(
                    // overflow-hidden is what makes rounded-t actually visible: the glass header below
                    // paints its own square backdrop-filter box and would otherwise cover the corners.
                    'flex flex-col gap-0 overflow-hidden rounded-t-[16px] border-0 bg-surface p-0',
                    // Keyboard: ride above the soft keyboard rather than being buried under it, and
                    // give back exactly the height gained so the lifted panel cannot run off the top
                    // of the screen — the body scroll area absorbs the difference. `--keyboard-height`
                    // is injected by the native WebView (absent in a browser, where the keyboard never
                    // rises and both terms collapse to `bottom-0` / `90vh`).
                    'max-h-[calc(90vh-var(--keyboard-height,0px))]',
                    // The drag offset and the keyboard lift share ONE transform. Two `transform`
                    // declarations do not compose — the later simply wins — and a panel can be
                    // dragged while the keyboard is up.
                    '[transform:translateY(calc(var(--sheet-drag-y,0px)-var(--keyboard-height,0px)))]',
                    // Home-indicator inset, dropped while the keyboard is up: the keyboard already
                    // covers it and the panel has been lifted clear of both, so keeping it would just
                    // float the footer CTA above the keyboard by a stray 34px.
                    'pb-[max(0px,calc(var(--safe-bottom,0px)-var(--keyboard-height,0px)))]',
                    // `!animate-none` and not `animate-none`: the keyframes being switched off are
                    // applied through `data-[state=…]:` variants, which Tailwind emits after every
                    // unprefixed utility, so the plain form loses the cascade and the keyframe keeps
                    // writing `transform` over the drag.
                    driven && '!animate-none transition-transform ease-out',
                    className
                )}
            >
                {/* Grabber (Figma 4712:16481): 36×5 at 5px from the top, over the content rather
                    than above it — which is why it is absolute and the body carries no offset for
                    it. `Labels/Tertiary` is an iOS system color with no token of its own. */}
                {showHandle && (
                    <span
                        aria-hidden
                        className="absolute left-1/2 top-[5px] z-10 h-[5px] w-9 -translate-x-1/2 rounded-[2.5px] bg-[rgba(60,60,67,0.3)] dark:bg-white/30"
                    />
                )}

                {hideHeader ? (
                    // Still named for assistive tech — just not drawn.
                    <>
                        <SheetTitle className="sr-only">{title}</SheetTitle>
                        {description && <SheetDescription className="sr-only">{description}</SheetDescription>}
                    </>
                ) : (
                    /* Glass overlay header (Figma 3421-59848), same translucent treatment as ModalTopBar. */
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

                <div
                    ref={bodyRef}
                    // A drag that runs past the end of this body must not scroll the page behind the
                    // sheet; `overscroll-contain` is what keeps the chain from leaving the panel.
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                >
                    {children}
                </div>

                {footer && <div className="shrink-0">{footer}</div>}
            </SheetContent>
        </Root>
    );
};
