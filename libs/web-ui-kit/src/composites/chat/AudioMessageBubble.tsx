import * as React from 'react';

import { cn } from '@chatic/lib/utils';

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

/**
 * Where the audio message stands.
 *
 * - `idle` — sent and not playing; the second line is the host's meta (`35:47 · 17.0MB`).
 * - `loading` — play was pressed and the audio is not ready yet; a spinner turns in the button.
 * - `playing` / `paused` — the seek bar, the clock and the speed chip replace the meta line.
 * - `sending` — still going up: a ring with a cancel mark in the button's place.
 * - `failed` — the send failed; a red mark, and the retry/delete chips under the bubble are the
 *   host's (`FailedSendActions`).
 * - `broken` — stored but unplayable; a waveform mark in place of the button.
 * - `unsupported` — a format this device cannot play; the same mark plus a download button, so the
 *   file can still be taken to an app that can.
 */
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
    /** `mine` draws on my navy bubble ground, `other` on the received-message ground. */
    side: 'mine' | 'other';
    state: AudioMessageBubbleState;
    /** The file's name, extension included (Figma 6040:20715). */
    name: string;
    /** The idle line under the name, already formatted by the host — `35:47 · 17.0MB`. */
    meta?: string;
    /** Seconds played, for `playing` / `paused`. */
    position?: number;
    /** Seconds long, for `playing` / `paused`. Unknown leaves the seek bar at rest. */
    duration?: number;
    /** The speed playing now (Figma "배속", 6040:20730). */
    rate?: number;
    /** The speed chip was pressed; which speed comes next is the host's rule. */
    onRateChange?: () => void;
    /** The round button was pressed — play, pause, or stop a load in progress. */
    onToggle?: () => void;
    /** A position chosen on the seek bar. */
    onSeek?: (seconds: number) => void;
    /**
     * A press on the bubble outside its controls. The host opens the audio's detail screen. Omit to
     * leave the body inert. Never offered while the message is `sending` or `failed`, since there is
     * nothing stored to open yet.
     */
    onOpen?: () => void;
    /** 0..1 of the upload while `sending`. Omit while unknown, and the ring turns instead of filling. */
    sendProgress?: number;
    /** The line under the name while `sending`, formatted by the host — `12 MB / 48 MB`. */
    sendingText?: string;
    /** The × inside the upload ring. */
    onCancelSend?: () => void;
    /** The download button of an `unsupported` bubble. */
    onDownload?: () => void;
    failedText?: string;
    brokenText?: string;
    /** The `unsupported` line, formatted by the host — `Unsupported format · 17.0MB`. */
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

/**
 * An audio file in a chat message (Figma "음성 파일 · 앱 말풍선", 6040:20822): a 248px bubble with a
 * 36px round control on the left, the name on one line and a second line that changes with the
 * state — the meta, the upload, the failure, or, while it plays, a seek bar over a clock and the
 * speed chip.
 *
 * The bubble's body opens the detail screen (`onOpen`) through a transparent button laid under the
 * whole bubble, rather than by wrapping the bubble in one: the controls are buttons and a slider of
 * their own, and a button cannot hold another. The text above that layer lets presses through, and
 * only the controls take them. A long press is the message row's, so nothing here stops a pointer
 * event from reaching it.
 *
 * The only state held is the drag on the seek bar, so the clock can show where a drag would land
 * before the host jumps there.
 */
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

    // A drag in progress ends with the state that started it; a stale preview must not outlive it.
    React.useEffect(() => {
        if (!player) setScrub(null);
    }, [player]);

    const clock = `${formatAudioClock(scrub ?? position)} / ${formatAudioClock(duration)}`;
    const muted = mine ? 'text-bubble-mine-foreground/75' : 'text-description';

    const control = (() => {
        if (state === 'sending') {
            const ratio = clampRatio(sendProgress);
            // The ring and the × are siblings, not parent and child: a progressbar's children are
            // presentational, which would hide the cancel button from assistive tech.
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
            // A drawn "!" rather than the outlined alert glyph: the design fills the whole disc red.
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
                    // My bubble is already navy, so its button inverts: a white disc with a navy glyph.
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
            {/* The layout lets presses fall through to the open layer; each control takes its own back. */}
            <div className="pointer-events-none relative flex items-center gap-2.5">
                {control}
                <div className={cn('flex min-w-0 flex-1 flex-col items-start', player ? 'gap-1.5' : 'gap-[3px]')}>
                    <span id={nameId} className="sr-only">
                        {name}
                    </span>
                    {/* Cut in the middle, never at the end: the extension stays, so two recordings
                        that differ only in format do not both read "Recording…". */}
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
