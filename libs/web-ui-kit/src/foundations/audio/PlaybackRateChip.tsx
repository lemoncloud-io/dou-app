import { cn } from '@chatic/ui-kit';

export interface PlaybackRateChipProps {
    rate: number;
    onPress: () => void;
    tone?: 'onDark' | 'onLight' | 'outline';
    label?: string;
    className?: string;
}

export const formatPlaybackRate = (rate: number): string => `${rate}x`;

export const PlaybackRateChip = ({
    rate,
    onPress,
    tone = 'onLight',
    label = 'Playback speed',
    className,
}: PlaybackRateChipProps) => (
    <button
        type="button"
        onClick={onPress}
        aria-label={`${label} ${formatPlaybackRate(rate)}`}
        className={cn(
            'inline-flex h-[19px] shrink-0 items-center rounded-[6px] px-1.5 text-[11px] font-semibold leading-none tabular-nums transition-opacity active:opacity-70',
            tone === 'onDark' && 'bg-bubble-mine-foreground/[0.18] text-bubble-mine-foreground',
            tone === 'onLight' && 'bg-surface text-foreground',
            tone === 'outline' &&
                'h-7 rounded-[8px] border border-input-border bg-surface px-2 text-[12px] text-foreground',
            className
        )}
    >
        {formatPlaybackRate(rate)}
    </button>
);
