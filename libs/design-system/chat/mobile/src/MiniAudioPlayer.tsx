import { cn } from '@chatic/ui-kit';

import { formatAudioClock, PlaybackRateChip } from '@chatic/design-system-components-mobile';
import { IconClose, IconPauseSolid, IconPlaySolid } from '@chatic/design-system-assets/icons';

export interface MiniAudioPlayerProps {
    name: string;
    playing: boolean;
    subtitle?: string;
    sender?: string;
    position?: number;
    duration?: number;
    rate?: number;
    onRateChange?: () => void;
    onToggle: () => void;
    onClose: () => void;
    onPress?: () => void;
    playLabel?: string;
    pauseLabel?: string;
    closeLabel?: string;
    rateLabel?: string;
    className?: string;
}

export const MiniAudioPlayer = ({
    name,
    playing,
    subtitle,
    sender,
    position = 0,
    duration,
    rate = 1,
    onRateChange,
    onToggle,
    onClose,
    onPress,
    playLabel = 'Play',
    pauseLabel = 'Pause',
    closeLabel = 'Close player',
    rateLabel = 'Playback speed',
    className,
}: MiniAudioPlayerProps) => {
    const line =
        subtitle ??
        [sender, duration !== undefined ? `${formatAudioClock(position)} / ${formatAudioClock(duration)}` : undefined]
            .filter(Boolean)
            .join(' · ');

    const body = (
        <>
            <span className="w-full truncate text-[13px] font-semibold leading-[normal]">{name}</span>
            {line && (
                <span className="w-full truncate text-[11px] leading-[normal] text-bubble-mine-foreground/75 tabular-nums">
                    {line}
                </span>
            )}
        </>
    );
    const bodyClass = 'flex min-w-0 flex-1 flex-col items-start gap-px text-left';

    return (
        <div
            className={cn(
                'flex h-12 w-[343px] max-w-full items-center gap-2.5 overflow-hidden rounded-[12px] bg-brand-ink px-3 py-2 text-bubble-mine-foreground',
                className
            )}
        >
            <button
                type="button"
                onClick={onToggle}
                aria-label={playing ? pauseLabel : playLabel}
                className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-bubble-mine-foreground text-brand-ink transition-opacity active:opacity-70"
            >
                {playing ? <IconPauseSolid size={16} /> : <IconPlaySolid size={16} />}
            </button>
            {onPress ? (
                <button
                    type="button"
                    onClick={onPress}
                    className={cn(bodyClass, 'transition-opacity active:opacity-70')}
                >
                    {body}
                </button>
            ) : (
                <span className={bodyClass}>{body}</span>
            )}
            <PlaybackRateChip rate={rate} onPress={() => onRateChange?.()} tone="onDark" label={rateLabel} />
            <button
                type="button"
                onClick={onClose}
                aria-label={closeLabel}
                className="-mr-1.5 flex size-8 shrink-0 items-center justify-center transition-opacity active:opacity-70"
            >
                <IconClose className="size-5" strokeWidth={2} />
            </button>
        </div>
    );
};
