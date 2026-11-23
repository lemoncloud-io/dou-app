import { useRef, useState } from 'react';

import { cn } from '@chatic/ui-kit';

export interface AudioSeekBarProps {
    value: number;
    max: number | undefined;
    onSeek: (seconds: number) => void;
    onScrub?: (seconds: number | null) => void;
    tone?: 'onDark' | 'onLight';
    disabled?: boolean;
    label?: string;
    valueText?: string;
    className?: string;
}

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
                className="absolute inset-x-0 top-1/2 h-6 w-full -translate-y-1/2 cursor-pointer appearance-none opacity-0 disabled:cursor-default"
            />
        </div>
    );
};
