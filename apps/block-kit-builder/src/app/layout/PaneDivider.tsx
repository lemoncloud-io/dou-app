import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

import { cn } from '@chatic/ui-kit';

interface PaneDividerProps {
    value: number;
    onValue: (value: number) => void;
    min: number;
    max: number;
    direction: 1 | -1;
    label: string;
    initial: number;
}

const KEY_STEP = 16;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const PaneDivider = ({ value, onValue, min, max, direction, label, initial }: PaneDividerProps) => {
    const origin = useRef<{ x: number; value: number } | null>(null);

    const start = (event: ReactPointerEvent<HTMLDivElement>) => {
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
