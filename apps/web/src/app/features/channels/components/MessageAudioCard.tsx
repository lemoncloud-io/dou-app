import { useId, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play } from 'lucide-react';

import { cn } from '@chatic/ui-kit';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { formatVideoDuration, IconMore, IconSpinner, type MessageFileDownloadState } from '@chatic/web-ui-kit';

import { useInlineAudio } from '../hooks/useInlineAudio';

/** The name a recording made in the app carries: `voice-<yyyyMMdd-HHmmss>.m4a`. */
const VOICE_NAME = /^voice-\d{8}-\d{6}\.m4a$/i;

/** Whether an upload looks like a voice message recorded in the app. Nothing else marks one. */
export const isVoiceMessageName = (name: string | undefined): boolean => !!name && VOICE_NAME.test(name);

interface MessageAudioCardProps {
    /** The signed address to play from. */
    src: string;
    name?: string;
    /** The save's state, as the document cards' download button has it. */
    download: MessageFileDownloadState;
    onSave: () => void;
    /** Cancels a save still downloading. */
    onCancel: () => void;
    /** Omitted where the shell cannot share a file: the menu then offers saving only. */
    onShare?: () => void;
    /**
     * The file could not be played. A signed address past its expiry fails the same way as a format
     * the system cannot decode, so the host asks for a fresh one; a new `src` starts the card over.
     */
    onError?: () => void;
    className?: string;
}

/**
 * A sent audio upload — a voice message or an audio file — played where it is: a play button, a seek
 * bar with the clock, the name, and a menu that saves or shares it the way a document card does.
 *
 * It plays from the signed address in the page's own `<audio>`, which an app built before audio plays
 * as well as a new one. The length comes from the file's header (`preload="metadata"`): the upload
 * carries none, and where the header has not been read yet — the iOS WebView loads no media before a
 * tap — the clock shows the time played alone. One card plays at a time (`useInlineAudio`).
 *
 * A file this system cannot decode — iOS has no Vorbis, so an Ogg Vorbis file fails there while an
 * Ogg Opus one plays — says it cannot be played, and keeps its menu: it can still be saved or shared to
 * an app that plays it. A recording made in the app is named "Voice message"; nothing in the upload says
 * so except its name, which the shell gives every recording.
 */
export const MessageAudioCard = ({
    src,
    name,
    download,
    onSave,
    onCancel,
    onShare,
    onError,
    className,
}: MessageAudioCardProps) => {
    const { t } = useTranslation();
    const nameId = useId();
    const { audioProps, playing, time, duration, failed, toggle, seek } = useInlineAudio(src, onError);
    const shown = isVoiceMessageName(name)
        ? t('chat.attach.audio.voiceMessage')
        : name?.trim() || t('chat.attach.fileCard.fallbackName');
    // A length still unknown (or zero) is a bar at rest: nothing to seek through yet.
    const max = duration || 1;
    const position = duration ? Math.min(time, duration) : 0;
    // A file whose header names no length reads only the time played, not "0:12 / 0:00".
    const clock =
        duration === undefined
            ? formatVideoDuration(time * 1000)
            : `${formatVideoDuration(time * 1000)} / ${formatVideoDuration(duration * 1000)}`;
    const saving = download === 'downloading';
    const canSave = download !== 'unavailable';

    return (
        <div
            className={cn(
                'flex w-[240px] max-w-full items-center gap-2.5 overflow-hidden rounded-[14px] border border-border bg-card py-2 pl-2.5 pr-1',
                className
            )}
        >
            <audio {...audioProps} />
            <button
                type="button"
                onClick={toggle}
                disabled={failed}
                aria-label={t(playing ? 'chat.attach.audio.pause' : 'chat.attach.audio.play', { name: shown })}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-ink text-white transition-opacity active:opacity-70 disabled:opacity-40"
            >
                {playing ? (
                    <Pause size={16} aria-hidden fill="currentColor" />
                ) : (
                    // The triangle's weight sits left of its box; a pixel right centres it by eye.
                    <Play size={16} aria-hidden fill="currentColor" className="translate-x-px" />
                )}
            </button>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span
                    id={nameId}
                    className="truncate text-[14px] font-semibold leading-[1.35] tracking-[-0.28px] text-foreground"
                >
                    {shown}
                </span>
                {failed ? (
                    <span className="text-[12px] leading-[1.4] tracking-[-0.12px] text-description">
                        {t('chat.attach.audio.playFailed')}
                    </span>
                ) : (
                    <span className="flex min-w-0 items-center gap-2">
                        <input
                            type="range"
                            min={0}
                            max={max}
                            step="any"
                            value={position}
                            disabled={!duration}
                            onChange={event => seek(event.currentTarget.valueAsNumber)}
                            aria-label={t('chat.attach.audio.seek', { name: shown })}
                            aria-valuetext={clock}
                            style={{ '--seek-progress': `${(position / max) * 100}%` } as CSSProperties}
                            // The track fills up to the playhead in the brand ink; the rest is the idle tint.
                            className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[linear-gradient(to_right,hsl(var(--brand-ink))_var(--seek-progress),hsl(var(--control-idle))_var(--seek-progress))] accent-brand-ink disabled:cursor-default [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-ink"
                        />
                        <span className="shrink-0 text-[12px] leading-[1.4] tabular-nums text-description">
                            {clock}
                        </span>
                    </span>
                )}
            </span>
            {saving ? (
                <button
                    type="button"
                    onClick={onCancel}
                    aria-label={t('chat.attach.fileCard.cancel', { name: shown })}
                    aria-describedby={nameId}
                    className="flex size-11 shrink-0 items-center justify-center"
                >
                    <IconSpinner className="size-5 animate-spin text-foreground" />
                </button>
            ) : (
                (canSave || onShare) && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                aria-label={t('chat.attach.audio.menu', { name: shown })}
                                className="flex size-11 shrink-0 items-center justify-center text-description"
                            >
                                <IconMore className="size-5" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            sideOffset={4}
                            className="min-w-0 rounded-2xl border-[0.5px] border-input-border/70 bg-popover/90 p-1.5 shadow-[0_3px_32px_0_rgba(0,0,0,0.08)] backdrop-blur-[4px]"
                        >
                            {canSave && (
                                <DropdownMenuItem
                                    onClick={onSave}
                                    className="cursor-pointer whitespace-nowrap rounded-[10px] px-3 py-2.5 text-[14px] font-medium leading-4"
                                >
                                    {t('chat.attach.audio.save')}
                                </DropdownMenuItem>
                            )}
                            {onShare && (
                                <DropdownMenuItem
                                    onClick={onShare}
                                    className="cursor-pointer whitespace-nowrap rounded-[10px] px-3 py-2.5 text-[14px] font-medium leading-4"
                                >
                                    {t('chat.attach.fileCard.share')}
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )
            )}
        </div>
    );
};
