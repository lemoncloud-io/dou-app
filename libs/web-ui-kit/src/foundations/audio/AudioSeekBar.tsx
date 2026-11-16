import { useRef, useState } from 'react';

import { cn } from '@chatic/lib/utils';

export interface AudioSeekBarProps {
    /** Seconds played. */
    value: number;
    /** Seconds long. Unknown (or zero) draws a bar at rest that cannot be dragged. */
    max: number | undefined;
    /** A position chosen — a tap, a key, or the end of a drag. */
    onSeek: (seconds: number) => void;
    /**
     * Called with the position under the finger while a drag is in progress, and with `null` when it
     * ends, so the host can show the time it would jump to before the jump happens.
     */
    onScrub?: (seconds: number | null) => void;
    /** `onDark` on my navy bubble and the mini player, `onLight` everywhere else. */
    tone?: 'onDark' | 'onLight';
    disabled?: boolean;
    /** The slider's accessible name. */
    label?: string;
    /** Spoken value, e.g. "12:03 / 35:47". */
    valueText?: string;
    className?: string;
}

/**
 * An audio position bar — a 3px track, the played part filled, a 12px handle (Figma "재생 바",
 * 6040:20724). One bar for the bubble, the mini player's host, the detail screen and a file list row.
 *
 * A native range input lies over the drawing and takes every gesture, so dragging, tapping and the
 * arrow keys behave as the platform's own slider does. The only state held is the drag in progress:
 * a drag reports where it is (`onScrub`) and seeks once, when it ends, so the audio is not asked to
 * jump on every pixel of a drag.
 */
export const AudioSeekBar = ({
    value,
    max,
    onSeek,
    onScrub,
    tone = 'onLight',
    disabled,
    label = 'Seek',
    valueText,
    className,
}: AudioSeekBarProps) => {
    const dragging = useRef(false);
    const [scrub, setScrub] = useState<number | null>(null);
    const length = max && max > 0 ? max : 0;
    const shown = scrub ?? value;
    const ratio = length ? Math.min(Math.max(shown / length, 0), 1) : 0;
    const dark = tone === 'onDark';

    const endDrag = () => {
        dragging.current = false;
        if (scrub === null) return;
        onSeek(scrub);
        setScrub(null);
        onScrub?.(null);
    };

    return (
        <div className={cn('relative h-3 w-full min-w-0', className)}>
            <div
                className={cn(
                    'absolute inset-x-0 top-[4.5px] h-[3px] rounded-[2px]',
                    dark ? 'bg-bubble-mine-foreground/30' : 'bg-control-idle'
                )}
            />
            <div
                data-testid="seek-fill"
                className={cn(
                    'absolute left-0 top-[4.5px] h-[3px] rounded-[2px]',
                    dark ? 'bg-bubble-mine-foreground' : 'bg-brand-ink'
                )}
                style={{ width: `${ratio * 100}%` }}
            />
            {length > 0 && (
                <div
                    className={cn(
                        'pointer-events-none absolute top-0 size-3 -translate-x-1/2 rounded-full',
                        dark ? 'bg-bubble-mine-foreground' : 'bg-brand-ink'
                    )}
                    style={{ left: `${ratio * 100}%` }}
                />
            )}
            <input
                type="range"
                min={0}
                max={length || 1}
                step="any"
                value={length ? Math.min(shown, length) : 0}
                disabled={disabled || !length}
                aria-label={label}
                aria-valuetext={valueText}
                onPointerDown={() => {
                    dragging.current = true;
                }}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onBlur={endDrag}
                onChange={event => {
                    const seconds = event.currentTarget.valueAsNumber;
                    if (dragging.current) {
                        setScrub(seconds);
                        onScrub?.(seconds);
                        return;
                    }
                    onSeek(seconds);
                }}
                // Taller than the drawing so a thumb finds it; invisible, the drawing is the look.
                className="absolute inset-x-0 top-1/2 h-6 w-full -translate-y-1/2 cursor-pointer appearance-none opacity-0 disabled:cursor-default"
            />
        </div>
    );
};
