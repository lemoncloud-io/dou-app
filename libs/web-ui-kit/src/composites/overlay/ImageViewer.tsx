import * as Dialog from '@radix-ui/react-dialog';
import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconBack, IconChevronRight, IconClose } from '../../resources/icons';

export interface ImageViewerProps {
    /** The images that can be shown, in order — a message's images. */
    images: string[];
    /** Which one is showing. `null` closes the viewer. */
    index: number | null;
    /** Asks to show another image. The host owns the index. */
    onIndexChange: (index: number) => void;
    onClose: () => void;
    /** Accessible name of the viewer. Not drawn. */
    title?: string;
    closeLabel?: string;
    previousLabel?: string;
    nextLabel?: string;
    /** Fired with the index of an image that fails to load — a signed address may have expired. */
    onError?: (index: number) => void;
}

/** How far a drag has to travel before it is read as a swipe or a scroll rather than a tap. */
const DRAG_SLOP_PX = 8;
/** A release past this — or past a fifth of the width, whichever is more — turns the page. */
const SWIPE_MIN_PX = 48;
/** A quick flick turns the page with less travel. */
const FLICK_MAX_MS = 300;
const FLICK_MIN_PX = 24;
/** Past the first or last image the strip gives only a little, to show there is nothing more. */
const EDGE_RESISTANCE = 0.3;

interface Press {
    x: number;
    y: number;
    at: number;
    /** Which way the drag went once it passed the slop — only a horizontal one moves the strip. */
    axis: 'x' | 'y' | null;
}

/**
 * A chat message's images, full screen: the original on black, a close button, and a tap anywhere
 * outside the image to leave. When the message carries more than one image they sit side by side on
 * a strip: a horizontal drag moves the strip under the finger, and on release it slides on to the
 * next image or back to the same one. The arrow buttons at the sides and the arrow keys slide it the
 * same way, and a count says where it is ("2 / 3"). It stops at the ends rather than wrapping: a count
 * that jumps from the last back to "1" reads as a different message. Zoom, save and share are not
 * here yet.
 *
 * Only the showing image and its neighbours are drawn, so ten originals are not loaded at once and a
 * neighbour is ready by the time it slides in.
 *
 * Stateless: the index belongs to the host, which is also what lets a refreshed address reach an
 * image that is already open. The drag offset is the only thing held here.
 *
 * On `@radix-ui/react-dialog` directly rather than `ui-kit`'s styled `dialog`: that wrapper centres a
 * card with padding and its own close mark, and a full-bleed viewer would spend its whole className
 * undoing it. Focus, escape and the portal are what is wanted from the primitive.
 */
export const ImageViewer = ({
    images,
    index,
    onIndexChange,
    onClose,
    title = 'Photo',
    closeLabel = 'Close',
    previousLabel = 'Previous photo',
    nextLabel = 'Next photo',
    onError,
}: ImageViewerProps) => {
    const open = index !== null && index >= 0 && index < images.length;
    const current = open ? index : 0;
    const many = images.length > 1;
    const hasPrevious = many && current > 0;
    const hasNext = many && current < images.length - 1;

    const go = (step: -1 | 1) => {
        const target = current + step;
        if (target >= 0 && target < images.length) onIndexChange(target);
    };

    // How far the strip is pulled off its resting place, while a finger holds it.
    const [dragX, setDragX] = React.useState(0);
    const [dragging, setDragging] = React.useState(false);
    const pressRef = React.useRef<Press | null>(null);
    // Whether the last press turned into a swipe. A swipe that ends on the backdrop is followed by a
    // click there, which must not read as "tap outside to close".
    const swipedRef = React.useRef(false);
    const stripRef = React.useRef<HTMLDivElement>(null);

    const endDrag = () => {
        pressRef.current = null;
        setDragging(false);
        setDragX(0);
    };

    const onPointerDown = (event: React.PointerEvent) => {
        swipedRef.current = false;
        pressRef.current = many ? { x: event.clientX, y: event.clientY, at: Date.now(), axis: null } : null;
    };

    const onPointerMove = (event: React.PointerEvent) => {
        const press = pressRef.current;
        if (!press) return;
        const dx = event.clientX - press.x;
        const dy = event.clientY - press.y;
        if (!press.axis) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_SLOP_PX) return;
            press.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            if (press.axis === 'x') {
                setDragging(true);
                // Keep the moves coming when the finger leaves the image or the screen edge.
                try {
                    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
                } catch {
                    // A synthetic or already-released pointer — the moves still arrive while inside.
                }
            }
        }
        if (press.axis !== 'x') return;
        const pastEdge = (dx > 0 && !hasPrevious) || (dx < 0 && !hasNext);
        setDragX(pastEdge ? dx * EDGE_RESISTANCE : dx);
    };

    const onPointerUp = (event: React.PointerEvent) => {
        const press = pressRef.current;
        if (!press || press.axis !== 'x') {
            pressRef.current = null;
            return;
        }
        swipedRef.current = true;
        const dx = event.clientX - press.x;
        const width = stripRef.current?.clientWidth ?? 0;
        const far = Math.abs(dx) >= Math.max(SWIPE_MIN_PX, width * 0.2);
        const flick = Date.now() - press.at <= FLICK_MAX_MS && Math.abs(dx) >= FLICK_MIN_PX;
        // Dropping the offset and moving the index in the same render lets the strip slide on from
        // wherever the finger left it.
        if (far || flick) go(dx < 0 ? 1 : -1);
        endDrag();
    };

    const arrow = 'absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/20';

    return (
        <Dialog.Root
            open={open}
            onOpenChange={value => {
                if (value) return;
                endDrag();
                onClose();
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black" />
                <Dialog.Content
                    aria-describedby={undefined}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={endDrag}
                    onKeyDown={event => {
                        if (event.key === 'ArrowLeft') go(-1);
                        if (event.key === 'ArrowRight') go(1);
                    }}
                    onClick={event => {
                        if (swipedRef.current) {
                            swipedRef.current = false;
                            return;
                        }
                        const target = event.target as HTMLElement;
                        if (target === event.currentTarget || target.dataset.backdrop !== undefined) onClose();
                    }}
                    // The drag is all ours: no browser pan or pinch fights the strip.
                    className="fixed inset-0 z-50 touch-none overflow-hidden outline-none"
                >
                    <Dialog.Title className="sr-only">{title}</Dialog.Title>
                    <div
                        ref={stripRef}
                        data-backdrop=""
                        className={cn(
                            'flex h-full w-full',
                            !dragging && 'transition-transform duration-300 ease-out motion-reduce:transition-none'
                        )}
                        style={{ transform: `translate3d(calc(${-current * 100}% + ${dragX}px), 0, 0)` }}
                    >
                        {images.map((src, i) => (
                            <div
                                key={i}
                                data-backdrop=""
                                aria-hidden={i !== current || undefined}
                                className="flex h-full w-full shrink-0 items-center justify-center"
                            >
                                {open && Math.abs(i - current) <= 1 && (
                                    <img
                                        src={src}
                                        alt=""
                                        data-current={i === current || undefined}
                                        className="max-h-full max-w-full select-none object-contain"
                                        draggable={false}
                                        onError={() => onError?.(i)}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                    {many && (
                        <span
                            aria-live="polite"
                            className="absolute left-1/2 top-[calc(var(--safe-top,0px)+20px)] -translate-x-1/2 text-[15px] font-medium text-white"
                        >
                            {current + 1} / {images.length}
                        </span>
                    )}
                    {hasPrevious && (
                        <button
                            type="button"
                            aria-label={previousLabel}
                            onClick={() => go(-1)}
                            className={cn(arrow, 'left-3')}
                        >
                            <IconBack className="size-6 text-white" />
                        </button>
                    )}
                    {hasNext && (
                        <button
                            type="button"
                            aria-label={nextLabel}
                            onClick={() => go(1)}
                            className={cn(arrow, 'right-3')}
                        >
                            <IconChevronRight className="size-6 text-white" />
                        </button>
                    )}
                    <Dialog.Close
                        aria-label={closeLabel}
                        className="absolute right-4 top-[calc(var(--safe-top,0px)+12px)] flex size-9 items-center justify-center rounded-full bg-white/20"
                    >
                        <IconClose className="size-5 text-white" />
                    </Dialog.Close>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};
