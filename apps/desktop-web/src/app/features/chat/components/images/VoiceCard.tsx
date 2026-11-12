import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import {
    AlertCircle,
    AudioLines,
    Download,
    LoaderCircle,
    MessageSquareReply,
    MoreVertical,
    Pause,
    Play,
    Trash2,
} from 'lucide-react';

import { runtime } from '@chatic/app-runtime';
import { cn } from '@chatic/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import { formatFileSize, formatPlaybackTime, splitFileName, type ChatFile } from '../../utils';
import { useVoicePlayback } from './voicePlayback';
import { Hint } from '../../../../shared';

interface VoiceCardProps {
    file: ChatFile;
    /** The name shown and saved under. */
    name: string;
    /** The message the file belongs to — where a send in flight keeps its progress. */
    messageId?: string;
    onSave: () => void;
    /** Opens the message's thread. Absent inside the thread panel. */
    onReply?: () => void;
    /** Asks to delete the message the file came with. Absent where the reader cannot delete it. */
    onDelete?: () => void;
}

const CARD = 'flex items-center gap-3 rounded-xl border border-hairline bg-background px-3 py-2.5';
const ROUND = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full';
const ICON_BUTTON =
    'focus-ring tactile hit-target flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-foreground/[0.08] hover:text-foreground data-[state=open]:bg-foreground/[0.08]';

/**
 * A voice file in the feed (Figma "음성 파일 · 데스크탑 ③④"): a round play button, the name, and under
 * it the length and size until it is played, then a seek bar with the clock. Once played it offers the
 * speed (1x → 1.5x → 2x); download and a "More" menu sit at the end.
 *
 * A file on its way shows how much of it has gone; one that was not sent says so, and the message's own
 * failed line carries Retry and Delete. A file the browser cannot decode becomes a plain card that still
 * saves, and if it breaks off while playing the player raises a toast — the card alone may be out of sight.
 */
export const VoiceCard = ({ file, name, messageId, onSave, onReply, onDelete }: VoiceCardProps) => {
    const { t } = useTranslation();
    const size = file.size !== undefined ? formatFileSize(file.size) : undefined;

    if (file.isUploading) return <UploadingVoice name={name} size={size} messageId={messageId} slot={file.slot} />;

    if (file.isFailed || !file.url) {
        return (
            <div className={cn(CARD, 'border-destructive/30 bg-destructive/5')}>
                <span className={cn(ROUND, 'bg-destructive/10 text-destructive')}>
                    <AlertCircle size={18} aria-hidden />
                </span>
                <Body name={name} meta={[t('chat.file.failed')]} tone="destructive" />
            </div>
        );
    }

    return <VoicePlayer src={file.url} name={name} size={size} onSave={onSave} onReply={onReply} onDelete={onDelete} />;
};

/**
 * A voice file on its way. Its own component so that only a file being sent subscribes to the send's
 * progress, which is kept by message and slot.
 */
const UploadingVoice = ({
    name,
    size,
    messageId,
    slot,
}: {
    name: string;
    size: string | undefined;
    messageId: string | undefined;
    slot: number | undefined;
}) => {
    const { t } = useTranslation();
    const ratios = runtime.data.useImageSendProgress(messageId);
    const progress = slot === undefined ? undefined : ratios?.[slot];
    const percent = progress === undefined ? undefined : Math.round(progress * 100);
    const status = percent === undefined ? t('chat.voice.uploading') : t('chat.voice.uploadingPercent', { percent });
    return (
        <div className={CARD}>
            <span role="status" aria-label={t('chat.file.uploading', { name })} className={cn(ROUND, 'bg-muted')}>
                <ProgressRing ratio={progress} />
            </span>
            <Body name={name} meta={[status, size]} />
        </div>
    );
};

const VoicePlayer = ({
    src,
    name,
    size,
    onSave,
    onReply,
    onDelete,
}: {
    src: string;
    name: string;
    size: string | undefined;
    onSave: () => void;
    onReply?: () => void;
    onDelete?: () => void;
}) => {
    const { t } = useTranslation();
    const voice = useVoicePlayback(src);
    const { playing, loading, time, duration, failed, rate } = voice;
    const started = playing || time > 0;

    const actions = <VoiceActions name={name} onSave={onSave} onReply={onReply} onDelete={onDelete} />;

    if (failed) {
        return (
            <div className={CARD}>
                <span className={cn(ROUND, 'bg-muted text-muted-foreground')}>
                    <AudioLines size={18} aria-hidden />
                </span>
                <Body name={name} meta={[t('chat.file.playFailed'), size]} />
                {actions}
            </div>
        );
    }

    const PlayIcon = playing ? Pause : Play;
    return (
        <div className={CARD}>
            <button
                type="button"
                onClick={voice.toggle}
                aria-label={t(playing ? 'chat.file.pause' : 'chat.file.play', { name })}
                aria-busy={loading || undefined}
                className={cn(
                    ROUND,
                    'focus-ring tactile bg-muted text-foreground transition-colors ease-tactile hover:bg-accent'
                )}
            >
                {loading ? (
                    <LoaderCircle size={16} aria-hidden className="animate-spin" />
                ) : (
                    // The triangle's weight sits left of its box; a pixel right centres it by eye.
                    <PlayIcon size={14} aria-hidden fill="currentColor" className={cn(!playing && 'translate-x-px')} />
                )}
            </button>
            <div className="min-w-0 flex-1">
                <FileName name={name} />
                {started ? (
                    <SeekBar name={name} time={time} duration={duration} onSeek={voice.seek} />
                ) : (
                    <Meta parts={[duration === undefined ? undefined : formatPlaybackTime(duration), size]} />
                )}
            </div>
            {started && (
                <button
                    type="button"
                    onClick={voice.cycleRate}
                    aria-label={t('chat.voice.rate', { rate })}
                    className="focus-ring tactile shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-caption font-semibold tabular-nums text-foreground transition-colors ease-tactile hover:bg-accent"
                >
                    {rate}x
                </button>
            )}
            {actions}
        </div>
    );
};

const SeekBar = ({
    name,
    time,
    duration,
    onSeek,
}: {
    name: string;
    time: number;
    duration: number | undefined;
    onSeek: (seconds: number) => void;
}) => {
    const { t } = useTranslation();
    // A length still unknown (or zero) is a bar at rest: nothing to seek through yet.
    const max = duration || 1;
    const position = duration ? Math.min(time, duration) : 0;
    // A file whose header names no length reads only the time played, not "0:12 / 0:00".
    const clock =
        duration === undefined
            ? formatPlaybackTime(time)
            : `${formatPlaybackTime(time)} / ${formatPlaybackTime(duration)}`;
    return (
        <div className="flex items-center gap-2">
            <input
                type="range"
                min={0}
                max={max}
                step="any"
                value={position}
                disabled={!duration}
                onChange={event => onSeek(event.currentTarget.valueAsNumber)}
                aria-label={t('chat.file.seek', { name })}
                aria-valuetext={clock}
                style={{ '--seek-progress': `${(position / max) * 100}%` } as CSSProperties}
                className="seek-slider focus-ring min-w-0 flex-1 cursor-pointer disabled:cursor-default"
            />
            <span className="shrink-0 text-caption tabular-nums text-muted-foreground">{clock}</span>
        </div>
    );
};

const VoiceActions = ({
    name,
    onSave,
    onReply,
    onDelete,
}: {
    name: string;
    onSave: () => void;
    onReply?: () => void;
    onDelete?: () => void;
}) => {
    const { t } = useTranslation();
    return (
        <>
            <Hint label={t('chat.file.download')}>
                <button
                    type="button"
                    onClick={onSave}
                    aria-label={t('chat.file.save', { name })}
                    className={ICON_BUTTON}
                >
                    <Download size={16} aria-hidden />
                </button>
            </Hint>
            <DropdownMenu modal={false}>
                <Hint label={t('chat.file.moreHint')}>
                    <DropdownMenuTrigger asChild>
                        <button type="button" aria-label={t('chat.file.more', { name })} className={ICON_BUTTON}>
                            <MoreVertical size={16} aria-hidden />
                        </button>
                    </DropdownMenuTrigger>
                </Hint>
                <DropdownMenuContent align="end" className="w-44 shadow-overlay">
                    <DropdownMenuItem onClick={onSave} className="cursor-pointer py-2">
                        <Download size={16} aria-hidden />
                        {t('chat.file.download')}
                    </DropdownMenuItem>
                    {onReply && (
                        <DropdownMenuItem onClick={onReply} className="cursor-pointer py-2">
                            <MessageSquareReply size={16} aria-hidden />
                            {t('chat.file.replyInThread')}
                        </DropdownMenuItem>
                    )}
                    {onDelete && (
                        <DropdownMenuItem
                            onClick={onDelete}
                            className="cursor-pointer py-2 text-destructive focus:text-destructive"
                        >
                            <Trash2 size={16} aria-hidden />
                            {t('chat.image.delete')}
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );
};

const Body = ({ name, meta, tone }: { name: string; meta: readonly (string | undefined)[]; tone?: 'destructive' }) => (
    <div className="min-w-0 flex-1">
        <FileName name={name} />
        <Meta parts={meta} tone={tone} />
    </div>
);

/** "2:05 · 17 MB": the parts that are known, in order. */
const Meta = ({ parts, tone }: { parts: readonly (string | undefined)[]; tone?: 'destructive' }) => {
    const text = parts.filter(Boolean).join(' · ');
    if (!text) return null;
    return (
        <p className={cn('truncate text-caption tabular-nums', tone ? 'text-destructive' : 'text-muted-foreground')}>
            {text}
        </p>
    );
};

/**
 * A file name on one line that, when it does not fit, gives way in the stem and keeps its extension —
 * "팀 회의 1107_최종본_전체녹….m4a" still says it is a voice file. The whole name is in the hint.
 */
export const FileName = ({ name, className }: { name: string; className?: string }) => {
    const { stem, extension } = splitFileName(name);
    return (
        <Hint label={name} delayDuration={500}>
            <p className={cn('flex min-w-0 text-callout font-medium text-foreground', className)}>
                <span className="truncate">{stem}</span>
                {extension && <span className="shrink-0">{extension}</span>}
            </p>
        </Hint>
    );
};

/** A ring that fills as a file is sent; a spinner while its bytes are not counted yet. */
const RING_RADIUS = 13;

const ProgressRing = ({ ratio }: { ratio: number | undefined }) => {
    if (ratio === undefined) {
        return <LoaderCircle size={18} aria-hidden className="animate-spin text-muted-foreground" />;
    }
    const circumference = 2 * Math.PI * RING_RADIUS;
    return (
        <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden className="-rotate-90">
            <circle cx="16" cy="16" r={RING_RADIUS} fill="none" strokeWidth="3" className="stroke-foreground/15" />
            <circle
                cx="16"
                cy="16"
                r={RING_RADIUS}
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - ratio)}
                className="stroke-foreground transition-[stroke-dashoffset] duration-200"
            />
        </svg>
    );
};
