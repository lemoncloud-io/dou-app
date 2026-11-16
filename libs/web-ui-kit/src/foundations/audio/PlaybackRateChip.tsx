import { cn } from '@chatic/lib/utils';

export interface PlaybackRateChipProps {
    /** The speed playing now, e.g. `1.5`. */
    rate: number;
    /** Pressed. Which speed comes next is the host's rule. */
    onPress: () => void;
    /** `onDark` on my navy bubble and the mini player, `onLight` on a light bubble, `outline` on a page. */
    tone?: 'onDark' | 'onLight' | 'outline';
    /** Accessible name; the visible text is the speed itself. */
    label?: string;
    className?: string;
}

/** `1` → `1x`, `1.5` → `1.5x`. */
export const formatPlaybackRate = (rate: number): string => `${rate}x`;

/**
 * The playback speed chip — `1x`, `1.5x`, `2x` in a small rounded pill (Figma "배속", 6040:20730).
 * It only shows a speed and reports a press: the cycle and where the speed is kept belong to the host.
 */
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
