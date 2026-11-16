import { cn } from '@chatic/ui-kit';

import { formatAudioClock, PlaybackRateChip } from '../../foundations/audio';
import { IconClose, IconPauseSolid, IconPlaySolid } from '../../resources/icons';

export interface MiniAudioPlayerProps {
    /** The file's name (Figma 6072:23026). */
    name: string;
    /** Draws the pause mark while true, the play mark otherwise. */
    playing: boolean;
    /**
     * The line under the name, as the host wants it. When given it replaces the line built from
     * `sender`, `position` and `duration`.
     */
    subtitle?: string;
    /** Who sent the file — the first part of the built line, `Alex · 12:03 / 35:47`. */
    sender?: string;
    /** Seconds played. */
    position?: number;
    /** Seconds long. Without it the line carries no clock. */
    duration?: number;
    /** The speed playing now. */
    rate?: number;
    /** The speed chip was pressed; which speed comes next is the host's rule. */
    onRateChange?: () => void;
    /** The round button — play or pause. */
    onToggle: () => void;
    /** The × — stop and dismiss the player. */
    onClose: () => void;
    /** A press on the name and line — the host goes back to the message or its detail screen. */
    onPress?: () => void;
    playLabel?: string;
    pauseLabel?: string;
    closeLabel?: string;
    rateLabel?: string;
    className?: string;
}

/**
 * The bar that keeps an audio file playing while the room scrolls on or the user leaves it (Figma
 * "음성 파일 · 미니 플레이어", 6072:23032; in place on screen 6044:22339): a 48px navy bar with the
 * play button, the name over a `sender · clock` line, the speed chip and a close mark.
 *
 * No seek bar: at this size a bar would be too short to aim at, and the time is a line of text. The
 * detail screen, which `onPress` leads to, is where seeking happens.
 */
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
            {/* 20px drawn, 32px to press: the bar is only 48 tall, and the mark sits at its edge. */}
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
