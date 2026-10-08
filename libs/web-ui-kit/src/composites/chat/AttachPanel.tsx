import * as React from 'react';

import { cn } from '@chatic/lib/utils';
import { useToastLift } from '@chatic/ui-kit/components/ui/toaster';

import { IconCameraSolid, IconFileSolid, IconGalleryWideSolid } from '../../resources/icons';
import { SLIDE_MOTION, useSlidePresence } from '../overlay/slidePresence';
import { AttachActionTile } from './AttachActionTile';

export interface AttachPanelLabels {
    photo: string;
    camera: string;
    file: string;
    /** Accessible name of the panel. Not drawn — the design has no title bar here. */
    title: string;
}

export interface AttachPanelProps {
    open: boolean;
    /** Panel body height in px, without the bottom safe area (the panel adds var(--safe-bottom)). */
    height: number;
    /**
     * The recent row (a `RecentPhotoStrip`); omitted where the shell cannot read the library — a
     * browser, or an app built before it could — so an empty row is never drawn. Where that is not known
     * yet, pass the row `loading`, so the tiles under it are where they will stay from the first frame;
     * should the shell turn out not to read the library, keep the row and let it go empty, and it folds
     * away with the tiles rising after it, where dropping it would make them jump.
     */
    recent?: React.ReactNode;
    onPhoto: () => void;
    onCamera: () => void;
    /** Omit to hide the files entry. */
    onFile?: () => void;
    /** Escape (and Android back, which arrives as Escape) while open. */
    onClose: () => void;
    /**
     * How the panel arrives when `open` turns true. `instant`: already in place, with no slide at all —
     * the keyboard is over it and about to slide away, so the panel is uncovered rather than raised.
     * Default `slide`.
     */
    enter?: 'slide' | 'instant';
    /**
     * How it leaves when `open` turns false. `instant`: removed where it stands — the keyboard has
     * slid up over it, so there is nothing left to see go. Default `slide`.
     */
    exit?: 'slide' | 'instant';
    /**
     * Called once an open or close has settled — when its slide has ended, at once for an `instant`
     * one — so the host can let go of a composer offset it was holding through the move. Once per
     * change: a change overtaken by the next one does not report, and the state the panel first renders
     * in is not a change. With `motion="external"` a slide has ended when the host says so
     * (`AttachPanelHandle.settle`).
     */
    onTransitionEnd?: (state: 'open' | 'closed') => void;
    /**
     * What moves the panel through a slide. `self` (default): its own CSS transition on `transform`.
     * `external`: the host, on every frame of a loop of its own, so that it can move its composer by the
     * same amount in the same frame — two transitions on two properties do not start on the same frame
     * in every engine. The panel then draws no transition at all and the host writes the surface's
     * `transform` (`AttachPanelHandle`), from `translateY(100%)` (below) to `translateY(0)` (in place),
     * and calls `settle()` once its slide is over.
     *
     * Until then the panel rests where the slide started: it mounts below its place in the commit that
     * opens it, and stays where it was in the commit that closes it, so a frame the host has not drawn
     * yet shows the slide's first frame. On `settle()` a closed panel leaves the page, an open one takes
     * its resting place, and `onTransitionEnd` reports the change. A slide the host never reports is
     * taken as over after the slide's length plus 100ms, as a transition whose end never comes is; the
     * host's own slide should take `SLIDE_MS` on `slideEase`.
     *
     * Instant changes, and every change under reduced motion, are the panel's own as they are in `self`
     * mode: in place or gone in the commit that asks, reported at once, and whatever transform the host
     * last wrote is cleared. A host should not run a slide of its own for them.
     */
    motion?: 'self' | 'external';
    labels?: Partial<AttachPanelLabels>;
    className?: string;
}

/** What a host that moves the panel itself (`motion="external"`) holds, through the panel's `ref`. */
export interface AttachPanelHandle {
    /** The element that slides, while the panel is in the page (`null` otherwise): the host writes its `transform`. */
    readonly surface: HTMLDivElement | null;
    /**
     * The host's slide toward the current `open` is over. The panel takes its resting place — or, closed,
     * leaves the page — and `onTransitionEnd` reports the change. Does nothing when no slide is waiting:
     * an instant change, a change already reported, and `motion="self"`, whose transition says it.
     */
    settle: () => void;
}

const DEFAULT_LABELS: AttachPanelLabels = { photo: 'Photos', camera: 'Camera', file: 'Files', title: 'Attach' };

/**
 * What counts as an open overlay, and the last match in document order as the one on top: the rule the
 * app's back handler walks to decide which overlay a back press closes. A copy, since this lib cannot
 * import the app — if the two disagreed, back would close one overlay and Escape another.
 */
const OPEN_OVERLAY =
    '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-state="open"][role="menu"], [data-state="open"][role="listbox"]';

const isTopmostOverlay = (element: Element) => {
    const open = element.ownerDocument.querySelectorAll(OPEN_OVERLAY);
    return open[open.length - 1] === element;
};

/**
 * The chat attach panel (Figma `3749:28501`): an optional recent-photos row over three entry points —
 * photos, camera, files — in the place the soft keyboard takes, directly under the composer.
 *
 * Not a sheet. Nothing is dimmed and nothing is trapped: the composer above stays live, and focusing
 * it is how the keyboard takes the place back (the host closes the panel then). The panel positions
 * itself at the bottom of its containing block — the host renders it inside the page's positioned
 * container, and keeps its composer and list clear of `height` plus the safe area — and slides up from
 * below that edge and back down, staying mounted until the exit has played. Where the keyboard is
 * handing over to it, or taking the place back, the host asks for an `instant` enter or exit instead:
 * the keyboard is the thing that moves, and the panel only has to be there, or not, under it.
 *
 * It still answers to back. While open it is a non-modal dialog marked `data-state="open"`, the shape
 * the app's back handler looks for, so a back press reaches it as Escape; it listens for Escape itself
 * and closes only when it is the topmost open overlay — a photo grid or an editor opened above it gets
 * the press first.
 *
 * Photos, camera and files are fixed by the design, so they are named props rather than a list the
 * caller assembles; the glyphs and their colours come with them. Stateless: open state and what each
 * entry opens are the host's.
 *
 * A host whose composer has to stay glued to the panel's top edge through a slide moves the panel
 * itself (`motion="external"`, through the `ref`): the panel's own transition starts a frame before a
 * composer's padding does on iOS WebKit, and the two visibly part.
 */
export const AttachPanel = React.forwardRef<AttachPanelHandle, AttachPanelProps>(
    (
        {
            open,
            height,
            recent,
            onPhoto,
            onCamera,
            onFile,
            onClose,
            enter = 'slide',
            exit = 'slide',
            onTransitionEnd: onSettled,
            motion = 'self',
            labels,
            className,
        },
        handleRef
    ) => {
        const text = { ...DEFAULT_LABELS, ...labels };
        const { mounted, shown, instant, ref, onTransitionEnd, finish } = useSlidePresence<HTMLDivElement>(open, {
            enter,
            exit,
            motion,
            onSettled,
        });
        React.useImperativeHandle(
            handleRef,
            () => ({
                get surface() {
                    return ref.current;
                },
                settle: finish,
            }),
            [ref, finish]
        );
        // The body height, not the drawn one: the snackbar's offset already clears the safe area.
        useToastLift(open ? height : null);

        const closeRef = React.useRef(onClose);
        closeRef.current = onClose;
        React.useEffect(() => {
            if (!open) return undefined;
            const onKeyDown = (event: KeyboardEvent) => {
                // A Radix overlay above the panel dismisses itself on the same press, in the capture
                // phase, and marks the event as handled.
                if (event.key !== 'Escape' || event.defaultPrevented) return;
                const panel = ref.current;
                if (!panel || !isTopmostOverlay(panel)) return;
                event.preventDefault();
                closeRef.current();
            };
            document.addEventListener('keydown', onKeyDown);
            return () => document.removeEventListener('keydown', onKeyDown);
        }, [open, ref]);

        if (!mounted) return null;
        return (
            <div
                ref={ref}
                role="dialog"
                aria-modal="false"
                aria-label={text.title}
                data-state={open ? 'open' : 'closed'}
                // On its way out it takes no tap and no focus: what it would open is already being closed.
                inert={!open}
                onTransitionEnd={onTransitionEnd}
                style={{ height: `calc(${height}px + var(--safe-bottom, 0px))` }}
                className={cn(
                    // Above the composer's own bar, whose bottom padding reaches down over the panel. The
                    // upward shadow is the design's: on a white page the panel has no other edge.
                    'absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[20px] bg-surface pb-[var(--safe-bottom,0px)] shadow-[0_-2px_6px_rgba(0,0,0,0.12)]',
                    // Swapped rather than overridden: `transition-none` is emitted before
                    // `transition-transform`, so with both present the slide would win. Moved by the host,
                    // it has no transition at all: the host's frames are the slide.
                    instant || motion === 'external' ? 'transition-none' : SLIDE_MOTION,
                    shown ? 'translate-y-0' : 'translate-y-full',
                    className
                )}
            >
                {/* Scrolls only where the keyboard it stands in for was shorter than the content. */}
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-8">
                    {recent}
                    <div className="flex w-full shrink-0 justify-center gap-6 pt-6">
                        <AttachActionTile
                            icon={<IconGalleryWideSolid className="text-glyph-green" />}
                            label={text.photo}
                            onClick={onPhoto}
                        />
                        <AttachActionTile
                            icon={<IconCameraSolid className="text-glyph-indigo" />}
                            label={text.camera}
                            onClick={onCamera}
                        />
                        {onFile && (
                            <AttachActionTile
                                icon={<IconFileSolid className="text-glyph-cyan" />}
                                label={text.file}
                                onClick={onFile}
                            />
                        )}
                    </div>
                </div>
            </div>
        );
    }
);
AttachPanel.displayName = 'AttachPanel';
