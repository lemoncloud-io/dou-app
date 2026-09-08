import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

import { cn } from '@chatic/lib/utils';

interface PaneDividerProps {
    /** The pane this divider sizes, in px. */
    value: number;
    onValue: (value: number) => void;
    /** How far that pane may be dragged, in px. */
    min: number;
    max: number;
    /** +1 when dragging right grows the pane, -1 when dragging right shrinks it. */
    direction: 1 | -1;
    /** What the divider is sizing, for the screen reader and the reset hint. */
    label: string;
    /** Width to snap back to on a double-click. */
    initial: number;
}

const KEY_STEP = 16;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * The seam between two panes, and the handle that moves it.
 *
 * Which pane deserves the room is a question about the payload in front of you,
 * not one this layout can answer once for everyone: a message being composed
 * from the rail wants the rail, and a 200-line payload someone pasted to check
 * wants the editor. Both are the tool working normally.
 *
 * A hairline to look at, eleven pixels to hit. The seam that reads right in a
 * three-column layout is thinner than anything a pointer can reliably catch, so
 * the visible line and the target are deliberately different sizes.
 *
 * Arrow keys move it too. A drag is a pointer gesture, and a layout that can
 * only be adjusted with a mouse is a layout half the keyboard cannot use.
 * Double-click restores the width it opened at — cheaper than dragging back to
 * a number you were not measuring in the first place.
 */
export const PaneDivider = ({ value, onValue, min, max, direction, label, initial }: PaneDividerProps) => {
    const origin = useRef<{ x: number; value: number } | null>(null);

    const start = (event: ReactPointerEvent<HTMLDivElement>) => {
        // Capture, so a fast drag that outruns the pointer keeps resizing instead
        // of dropping the seam wherever the cursor left the 11px strip.
        event.currentTarget.setPointerCapture(event.pointerId);
        origin.current = { x: event.clientX, value };
    };

    const move = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!origin.current) return;
        onValue(clamp(origin.current.value + (event.clientX - origin.current.x) * direction, min, max));
    };

    const end = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        origin.current = null;
    };

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={`Resize ${label}`}
            aria-valuenow={Math.round(value)}
            aria-valuemin={min}
            aria-valuemax={max}
            tabIndex={0}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onDoubleClick={() => onValue(initial)}
            onKeyDown={event => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                onValue(clamp(value + (event.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP) * direction, min, max));
            }}
            className={cn(
                'group relative z-20 hidden w-[11px] shrink-0 cursor-col-resize touch-none lg:block',
                // The strip itself draws nothing. The hairline inside it is the seam
                // the eye follows, and it thickens to the brand colour only while the
                // divider is being used — a permanently coloured seam would compete
                // with the message it sits beside.
                'focus-ring -mx-[5px]'
            )}
        >
            <span
                aria-hidden
                className={cn(
                    'pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-hairline',
                    'transition-[background-color,width] duration-150 ease-tactile',
                    'group-hover:w-0.5 group-hover:bg-primary/60 group-focus-visible:w-0.5 group-focus-visible:bg-primary/60'
                )}
            />
        </div>
    );
};
