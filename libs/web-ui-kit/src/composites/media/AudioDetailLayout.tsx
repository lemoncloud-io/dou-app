import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { AudioSeekBar, formatAudioClock, PlaybackRateChip } from '../../foundations/audio';
import {
    IconBack,
    IconChevronRight,
    IconCollection,
    IconPauseSolid,
    IconPlaySolid,
    IconSkip15,
    IconSpinner,
} from '../../resources/icons';

/** One cell of the bottom action row (Figma "음성 상세 · 하단 동작", 6072:22817). */
export interface AudioDetailAction {
    key: string;
    /** 24px glyph, coloured by the cell. */
    icon: React.ReactNode;
    label: string;
    onPress: () => void;
    disabled?: boolean;
    /** Work in progress (a save, a share sheet opening): a spinner replaces the glyph and the cell is inert. */
    busy?: boolean;
}

export interface AudioDetailLayoutLabels {
    back: string;
    collection: string;
    play: string;
    pause: string;
    loading: string;
    skipBack: string;
    skipForward: string;
    seek: string;
    rate: string;
}

export interface AudioDetailLayoutProps {
    /** Header title: who sent the file (Figma 6072:22281). */
    senderName: string;
    /** When it was sent, already formatted by the host. */
    sentAt: string;
    /** Makes the sent time a link with a trailing chevron — to the message in its chat. Omit for plain text. */
    onSentAtPress?: () => void;
    /** The right header button, to the room's file collection. Omit to hide it. */
    onCollection?: () => void;
    onBack: () => void;
    /** The big waveform — the host passes a `<Waveform/>` it has measured or seeded. */
    waveform?: React.ReactNode;
    /** The file's name. */
    name: string;
    /** The line under the name — `35:47 · 17.0MB` (`formatAudioMeta`). */
    meta?: string;
    playing: boolean;
    /** The audio is being fetched or buffered: the play button shows a spinner and cannot be pressed. */
    loading?: boolean;
    /** Seconds played. */
    position: number;
    /** Seconds long; unknown until the file's header has been read. */
    duration?: number;
    /** The speed playing now, e.g. `1.5`. */
    rate: number;
    onToggle: () => void;
    /** A position chosen on the bar, in seconds. */
    onSeek: (seconds: number) => void;
    /** Skip by this many seconds: `-15` back, `15` forward. */
    onSkip: (deltaSeconds: number) => void;
    /** The speed chip was pressed; which speed comes next is the host's rule. */
    onRateChange: () => void;
    /**
     * The bottom row's cells, spread evenly. The design draws four (Save, Share, Forward to DoU,
     * More); which ones exist is the host's call.
     */
    actions: readonly AudioDetailAction[];
    labels?: Partial<AudioDetailLayoutLabels>;
    className?: string;
}

const DEFAULT_LABELS: AudioDetailLayoutLabels = {
    back: 'Back',
    collection: 'Files',
    play: 'Play',
    pause: 'Pause',
    loading: 'Loading',
    skipBack: 'Back 15 seconds',
    skipForward: 'Forward 15 seconds',
    seek: 'Seek',
    rate: 'Playback speed',
};

/** How far the skip buttons move, in seconds. The glyph prints the number, so the two go together. */
const SKIP_SECONDS = 15;

const ROUND_BUTTON =
    'flex shrink-0 items-center justify-center rounded-full transition-opacity active:opacity-70 disabled:opacity-40';

/**
 * The audio detail screen's body (Figma 6066:21958 before play, 6066:22076 playing): a header with the
 * sender and the sent time, the waveform with the file's name and length in the middle, the player —
 * seek bar, speed, skip 15, play/pause — and the action row pinned to the bottom.
 *
 * It fills the height it is given and pads itself for the status bar and the home indicator, as the
 * kit's other full-screen pieces do. Playback state comes in as props; the only state held is the
 * seek bar's drag, so the clock under it can show the time a drag would jump to before it jumps.
 */
export const AudioDetailLayout = ({
    senderName,
    sentAt,
    onSentAtPress,
    onCollection,
    onBack,
    waveform,
    name,
    meta,
    playing,
    loading = false,
    position,
    duration,
    rate,
    onToggle,
    onSeek,
    onSkip,
    onRateChange,
    actions,
    labels,
    className,
}: AudioDetailLayoutProps) => {
    const text = { ...DEFAULT_LABELS, ...labels };
    const [scrub, setScrub] = React.useState<number | null>(null);

    const length = duration !== undefined && duration > 0 ? duration : undefined;
    const elapsed = scrub ?? position;
    // Before anything has played the right clock reads the whole length (6066:21958); from then on it
    // counts down what is left (6066:22076), as a player's remaining time does.
    const fresh = !playing && scrub === null && position <= 0;
    const rightClock =
        length === undefined
            ? ''
            : fresh
              ? formatAudioClock(length)
              : `-${formatAudioClock(Math.max(length - elapsed, 0))}`;

    return (
        <div className={cn('flex h-full min-h-0 w-full flex-col bg-surface', className)}>
            {/* Header (6072:22281): 60px under the status bar. */}
            <header className="shrink-0 pt-[var(--safe-top,0px)]">
                <div className="flex h-[60px] items-center gap-2 pl-2 pr-3">
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label={text.back}
                        className={cn(ROUND_BUTTON, 'size-10')}
                    >
                        <IconBack className="size-6 text-foreground" />
                    </button>
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                        <p className="w-full truncate text-[16px] font-semibold leading-[1.2] text-foreground">
                            {senderName}
                        </p>
                        {onSentAtPress ? (
                            <button
                                type="button"
                                onClick={onSentAtPress}
                                className="flex max-w-full items-center gap-0.5 text-left transition-opacity active:opacity-70"
                            >
                                <span className="truncate text-[13px] leading-[1.2] text-description">{sentAt}</span>
                                <IconChevronRight aria-hidden className="size-3 shrink-0 text-description" />
                            </button>
                        ) : (
                            <p className="max-w-full truncate text-[13px] leading-[1.2] text-description">{sentAt}</p>
                        )}
                    </div>
                    {onCollection && (
                        <button
                            type="button"
                            onClick={onCollection}
                            aria-label={text.collection}
                            className={cn(ROUND_BUTTON, 'size-10 bg-action-soft')}
                        >
                            <IconCollection className="size-[22px] text-foreground" strokeWidth={1.8} />
                        </button>
                    )}
                </div>
            </header>

            {/* File info (6072:22440): centred in whatever height the screen leaves between header and
                player, so a short phone and a tall one both keep it in the middle. */}
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden px-6">
                {waveform}
                {/* The design's 20px spacer, on top of the column's two 12px gaps. */}
                {waveform && <div aria-hidden className="h-5 shrink-0" />}
                <p className="max-w-full truncate text-center text-[20px] font-semibold leading-[1.2] text-foreground">
                    {name}
                </p>
                {meta && <p className="text-center text-[14px] leading-[1.2] text-description">{meta}</p>}
            </div>

            {/* Player (6072:22679). */}
            <div className="flex shrink-0 flex-col gap-2 px-6 pb-11 pt-6">
                <AudioSeekBar
                    value={position}
                    max={length}
                    onSeek={onSeek}
                    onScrub={setScrub}
                    tone="onLight"
                    label={text.seek}
                    valueText={
                        length === undefined ? undefined : `${formatAudioClock(elapsed)} / ${formatAudioClock(length)}`
                    }
                />
                <div className="flex items-start justify-between text-[12px] font-medium leading-[1.2] tabular-nums text-description">
                    <span data-testid="audio-elapsed">{formatAudioClock(elapsed)}</span>
                    <span data-testid="audio-remaining">{rightClock}</span>
                </div>
                <div className="flex items-center justify-between pt-3">
                    {/* The page's speed chip is larger than the bubble's: 48×32 on the soft fill. */}
                    <PlaybackRateChip
                        rate={rate}
                        onPress={onRateChange}
                        tone="onLight"
                        label={text.rate}
                        className="h-8 w-12 justify-center rounded-[10px] bg-action-soft px-0 text-[13px]"
                    />
                    <button
                        type="button"
                        onClick={() => onSkip(-SKIP_SECONDS)}
                        disabled={length === undefined}
                        aria-label={text.skipBack}
                        className={cn(ROUND_BUTTON, 'size-12 text-foreground')}
                    >
                        <IconSkip15 direction="back" size={28} />
                    </button>
                    <button
                        type="button"
                        onClick={onToggle}
                        disabled={loading}
                        aria-busy={loading || undefined}
                        aria-label={loading ? text.loading : playing ? text.pause : text.play}
                        // A spinner over the navy disc reads as waiting, not as disabled, so the
                        // disabled fade is cancelled for the loading state.
                        className={cn(
                            ROUND_BUTTON,
                            'size-[68px] bg-brand-ink text-bubble-mine-foreground disabled:opacity-100'
                        )}
                    >
                        {loading ? (
                            <IconSpinner className="size-7 animate-spin" />
                        ) : playing ? (
                            <IconPauseSolid size={28} />
                        ) : (
                            <IconPlaySolid size={28} />
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => onSkip(SKIP_SECONDS)}
                        disabled={length === undefined}
                        aria-label={text.skipForward}
                        className={cn(ROUND_BUTTON, 'size-12 text-foreground')}
                    >
                        <IconSkip15 direction="forward" size={28} />
                    </button>
                    {/* Balances the speed chip so the play button sits on the centre line. */}
                    <div aria-hidden className="h-8 w-12 shrink-0" />
                </div>
            </div>

            {/* Bottom actions (6072:22817). The home-indicator inset replaces the design's 24px floor
                when it is larger, rather than stacking on top of it. */}
            {actions.length > 0 && (
                <div className="flex shrink-0 items-start border-t border-input-border bg-surface px-3 pb-[max(24px,var(--safe-bottom,0px))] pt-4">
                    {actions.map(action => (
                        <button
                            key={action.key}
                            type="button"
                            onClick={action.onPress}
                            disabled={action.disabled || action.busy}
                            aria-busy={action.busy || undefined}
                            // A busy cell is inert but not faded: the spinner already says why.
                            className={cn(
                                'flex min-w-0 flex-1 flex-col items-center gap-1 text-label transition-opacity active:opacity-70',
                                !action.busy && 'disabled:opacity-40'
                            )}
                        >
                            <span aria-hidden className="flex size-6 items-center justify-center [&>svg]:size-6">
                                {action.busy ? <IconSpinner className="animate-spin" /> : action.icon}
                            </span>
                            <span className="max-w-full truncate text-[12px] font-medium leading-[1.2]">
                                {action.label}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
