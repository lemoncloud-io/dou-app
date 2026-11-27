import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { AudioSeekBar, formatAudioClock, PlaybackRateChip } from '@chatic/design-system-components-mobile';
import {
    IconBack,
    IconChevronRight,
    IconCollection,
    IconPauseSolid,
    IconPlaySolid,
    IconSkip15,
    IconSpinner,
} from '@chatic/design-system-assets/icons';

export interface AudioDetailAction {
    key: string;
    icon: React.ReactNode;
    label: string;
    onPress: () => void;
    disabled?: boolean;
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
    senderName: string;
    sentAt: string;
    onSentAtPress?: () => void;
    onCollection?: () => void;
    onBack: () => void;
    waveform?: React.ReactNode;
    name: string;
    meta?: string;
    playing: boolean;
    loading?: boolean;
    position: number;
    duration?: number;
    rate: number;
    onToggle: () => void;
    onSeek: (seconds: number) => void;
    onSkip: (deltaSeconds: number) => void;
    onRateChange: () => void;
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

const SKIP_SECONDS = 15;

const ROUND_BUTTON =
    'flex shrink-0 items-center justify-center rounded-full transition-opacity active:opacity-70 disabled:opacity-40';

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
    const fresh = !playing && scrub === null && position <= 0;
    const rightClock =
        length === undefined
            ? ''
            : fresh
              ? formatAudioClock(length)
              : `-${formatAudioClock(Math.max(length - elapsed, 0))}`;

    return (
        <div className={cn('flex h-full min-h-0 w-full flex-col bg-surface', className)}>
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

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden px-6">
                {waveform}
                {waveform && <div aria-hidden className="h-5 shrink-0" />}
                <p className="max-w-full truncate text-center text-[20px] font-semibold leading-[1.2] text-foreground">
                    {name}
                </p>
                {meta && <p className="text-center text-[14px] leading-[1.2] text-description">{meta}</p>}
            </div>

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
                    <div aria-hidden className="h-8 w-12 shrink-0" />
                </div>
            </div>

            {actions.length > 0 && (
                <div className="flex shrink-0 items-start border-t border-input-border bg-surface px-3 pb-[max(24px,var(--safe-bottom,0px))] pt-4">
                    {actions.map(action => (
                        <button
                            key={action.key}
                            type="button"
                            onClick={action.onPress}
                            disabled={action.disabled || action.busy}
                            aria-busy={action.busy || undefined}
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
