import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { AudioSeekBar, formatAudioClock, PlaybackRateChip } from '../../foundations/audio';
import {
    IconAudioWave,
    IconClose,
    IconDownload,
    IconPauseSolid,
    IconPlaySolid,
    IconSpinner,
} from '../../resources/icons';
import { splitFileName } from './messageFile';
import { ProgressRing } from './ProgressRing';

export type AudioMessageBubbleState =
    | 'idle'
    | 'loading'
    | 'playing'
    | 'paused'
    | 'sending'
    | 'failed'
    | 'broken'
    | 'unsupported';

export interface AudioMessageBubbleProps {
    side: 'mine' | 'other';
    state: AudioMessageBubbleState;
    name: string;
    meta?: string;
    position?: number;
    duration?: number;
    rate?: number;
    onRateChange?: () => void;
    onToggle?: () => void;
    onSeek?: (seconds: number) => void;
    onOpen?: () => void;
    sendProgress?: number;
    sendingText?: string;
    onCancelSend?: () => void;
    onDownload?: () => void;
    failedText?: string;
    brokenText?: string;
    unsupportedText?: string;
    playLabel?: string;
    pauseLabel?: string;
    cancelSendLabel?: string;
    downloadLabel?: string;
    seekLabel?: string;
    rateLabel?: string;
    openLabel?: string;
    className?: string;
}

const clampRatio = (value: number | undefined): number | undefined =>
    value === undefined || !Number.isFinite(value) ? undefined : Math.min(Math.max(value, 0), 1);

export const AudioMessageBubble = ({
    side,
    state,
    name,
    meta,
    position = 0,
    duration,
    rate = 1,
    onRateChange,
    onToggle,
    onSeek,
    onOpen,
    sendProgress,
    sendingText,
    onCancelSend,
    onDownload,
    failedText = 'Failed to send',
    brokenText = 'This file cannot be played',
    unsupportedText,
    playLabel = 'Play',
    pauseLabel = 'Pause',
    cancelSendLabel = 'Cancel upload',
    downloadLabel = 'Download',
    seekLabel = 'Seek',
    rateLabel = 'Playback speed',
    openLabel = 'Open',
    className,
}: AudioMessageBubbleProps) => {
    const nameId = React.useId();
    const [scrub, setScrub] = React.useState<number | null>(null);
    const mine = side === 'mine';
    const player = state === 'playing' || state === 'paused';
    const openable = onOpen && state !== 'sending' && state !== 'failed';
    const { base, extension } = splitFileName(name);

    React.useEffect(() => {
        if (!player) setScrub(null);
    }, [player]);

    const clock = `${formatAudioClock(scrub ?? position)} / ${formatAudioClock(duration)}`;
    const muted = mine ? 'text-bubble-mine-foreground/75' : 'text-description';

    const control = (() => {
        if (state === 'sending') {
            const ratio = clampRatio(sendProgress);
            return (
                <span className="relative size-9 shrink-0">
                    <span
                        role="progressbar"
                        aria-labelledby={nameId}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={ratio === undefined ? undefined : Math.round(ratio * 100)}
                        aria-valuetext={sendingText}
                        className={cn(
                            'absolute inset-0',
                            ratio === undefined && 'animate-spin motion-reduce:animate-none'
                        )}
                    >
                        <ProgressRing
                            ratio={ratio ?? 0.25}
                            size={36}
                            trackClassName={mine ? 'stroke-bubble-mine-foreground/30' : 'stroke-control-idle'}
                            fillClassName={mine ? 'stroke-bubble-mine-foreground' : 'stroke-brand-ink'}
                        />
                    </span>
                    <button
                        type="button"
                        onClick={onCancelSend}
                        aria-label={cancelSendLabel}
                        aria-describedby={nameId}
                        className="pointer-events-auto absolute inset-0 flex items-center justify-center rounded-full transition-opacity active:opacity-70"
                    >
                        <IconClose
                            className={cn('size-4', mine ? 'text-bubble-mine-foreground' : 'text-foreground')}
                            strokeWidth={2.5}
                        />
                    </button>
                </span>
            );
        }
        if (state === 'failed') {
            return (
                <span
                    aria-hidden="true"
                    data-testid="audio-failed-mark"
                    className="flex size-9 shrink-0 flex-col items-center justify-center gap-[2.5px] rounded-full bg-alert-red"
                >
                    <span className="h-[9px] w-[2.5px] rounded-full bg-bubble-mine-foreground" />
                    <span className="size-[2.5px] rounded-full bg-bubble-mine-foreground" />
                </span>
            );
        }
        if (state === 'broken' || state === 'unsupported') {
            return (
                <span
                    aria-hidden="true"
                    data-testid="audio-wave-mark"
                    className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-full',
                        mine
                            ? 'bg-bubble-mine-foreground/15 text-bubble-mine-foreground'
                            : 'bg-control-idle text-tab-idle'
                    )}
                >
                    <IconAudioWave size={20} />
                </span>
            );
        }
        const pausing = state === 'playing' || state === 'loading';
        return (
            <button
                type="button"
                onClick={onToggle}
                aria-label={pausing ? pauseLabel : playLabel}
                aria-describedby={nameId}
                aria-busy={state === 'loading' || undefined}
                className={cn(
                    'pointer-events-auto flex size-9 shrink-0 items-center justify-center rounded-full transition-opacity active:opacity-70',
                    mine ? 'bg-bubble-mine-foreground text-bubble-mine' : 'bg-brand-ink text-bubble-mine-foreground'
                )}
            >
                {state === 'loading' ? (
                    <IconSpinner className="size-5 animate-spin" />
                ) : state === 'playing' ? (
                    <IconPauseSolid size={20} />
                ) : (
                    <IconPlaySolid size={20} />
                )}
            </button>
        );
    })();

    const line = (() => {
        if (player) {
            return (
                <>
                    <AudioSeekBar
                        value={position}
                        max={duration}
                        onSeek={seconds => onSeek?.(seconds)}
                        onScrub={setScrub}
                        tone={mine ? 'onDark' : 'onLight'}
                        label={seekLabel}
                        valueText={clock}
                        className="pointer-events-auto"
                    />
                    <span className="flex w-full items-center justify-between gap-2">
                        <span className={cn('text-[12px] font-medium leading-[normal] tabular-nums', muted)}>
                            {clock}
                        </span>
                        <PlaybackRateChip
                            rate={rate}
                            onPress={() => onRateChange?.()}
                            tone={mine ? 'onDark' : 'onLight'}
                            label={rateLabel}
                            className="pointer-events-auto"
                        />
                    </span>
                </>
            );
        }
        const text =
            state === 'sending'
                ? sendingText
                : state === 'failed'
                  ? failedText
                  : state === 'broken'
                    ? brokenText
                    : state === 'unsupported'
                      ? unsupportedText
                      : meta;
        if (!text) return null;
        return (
            <span
                className={cn(
                    'w-full truncate text-[12px] leading-[normal] tabular-nums',
                    state === 'failed' ? 'text-alert-red' : muted
                )}
            >
                {text}
            </span>
        );
    })();

    return (
        <div
            data-side={side}
            data-state={state}
            className={cn(
                'relative w-[248px] max-w-full rounded-[18px] py-4 pl-2.5 pr-3.5',
                mine ? 'bg-bubble-mine text-bubble-mine-foreground' : 'bg-bubble-other text-bubble-other-foreground',
                className
            )}
        >
            {openable && (
                <button
                    type="button"
                    onClick={onOpen}
                    aria-label={openLabel}
                    aria-describedby={nameId}
                    className="absolute inset-0 rounded-[18px]"
                />
            )}
            <div className="pointer-events-none relative flex items-center gap-2.5">
                {control}
                <div className={cn('flex min-w-0 flex-1 flex-col items-start', player ? 'gap-1.5' : 'gap-[3px]')}>
                    <span id={nameId} className="sr-only">
                        {name}
                    </span>
                    <span aria-hidden="true" className="flex w-full min-w-0 text-[14px] font-semibold leading-[normal]">
                        <span className="min-w-0 truncate">{base}</span>
                        {extension && <span className="shrink-0">{extension}</span>}
                    </span>
                    {line}
                </div>
                {state === 'unsupported' && onDownload && (
                    <button
                        type="button"
                        onClick={onDownload}
                        aria-label={downloadLabel}
                        aria-describedby={nameId}
                        className={cn(
                            'pointer-events-auto flex size-7 shrink-0 items-center justify-center rounded-full transition-opacity active:opacity-70',
                            mine
                                ? 'bg-bubble-mine-foreground/15 text-bubble-mine-foreground'
                                : 'bg-surface text-foreground'
                        )}
                    >
                        <IconDownload className="size-4" strokeWidth={2.25} />
                    </button>
                )}
            </div>
        </div>
    );
};
