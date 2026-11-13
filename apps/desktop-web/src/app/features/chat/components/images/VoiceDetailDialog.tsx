import { useMemo, useRef, type CSSProperties, type KeyboardEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import {
    Download,
    Forward,
    Link2,
    LoaderCircle,
    MessageSquareReply,
    MessagesSquare,
    MoreVertical,
    Pause,
    Play,
    RotateCcw,
    RotateCw,
    Trash2,
    X,
} from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import { formatFileSize, formatPlaybackTime, splitFileName } from '../../utils';
import { AuthorAvatar, type ImageAuthor } from './ImageViewer';
import { useVoicePlayback } from './voicePlayback';
import { useWaveform } from './voiceWaveform';
import { Hint } from '../../../../shared';

/** How far the arrow keys and the skip buttons move. */
const SKIP_SECONDS = 15;
/** A hint over an icon button waits this long, so a pointer passing over the row opens none. */
const HINT_DELAY = 500;
const BAR_COUNT = 48;

export interface VoiceDetailDialogProps {
    src: string;
    name: string;
    size?: number;
    author: ImageAuthor;
    onClose: () => void;
    onSave: () => void;
    /** Closes the dialog and takes the feed to the message the file came with. */
    onShowInChat?: () => void;
    onReply?: () => void;
    /** Copies a link to the message the file came with; the dialog stays open. */
    onCopyLink?: () => void;
    /** Closes the dialog and opens the channel picker to send the file again elsewhere. */
    onForward?: () => void;
    /** Asks to delete the message the file came with. Absent where the reader cannot delete it. */
    onDelete?: () => void;
}

const HEADER_BUTTON =
    'focus-ring tactile flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-colors ease-tactile hover:bg-foreground/[0.08] data-[state=open]:bg-foreground/[0.08]';
const ROUND_BUTTON =
    'focus-ring tactile flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors ease-tactile hover:bg-foreground/[0.08]';

/**
 * A voice file at full size (Figma "음성 파일 · 데스크탑 ⑦⑧"): who sent it and when, a bar pattern that
 * fills as it plays, the seek bar with the time played and the time left, the speed, fifteen seconds
 * back and forward, and play. It drives the same player as the card in the feed, so it opens where the
 * card is and the card follows what is done here.
 *
 * Space plays and pauses, ←/→ move fifteen seconds and Esc closes, wherever focus is inside — a focused
 * button does not also take the Space as a click. The bars are the file's own waveform, fetched and
 * decoded once it opens; until then, and for a file the browser cannot decode, a pattern drawn from the
 * name stands in, so the dialog never waits on the decode to play.
 */
export const VoiceDetailDialog = ({
    src,
    name,
    size,
    author,
    onClose,
    onSave,
    onShowInChat,
    onReply,
    onCopyLink,
    onForward,
    onDelete,
}: VoiceDetailDialogProps) => {
    const { t } = useTranslation();
    // Every action that leaves the dialog — to the feed, a thread, a confirm — closes it first.
    const thenClose = (action: () => void) => () => {
        onClose();
        action();
    };
    const voice = useVoicePlayback(src);
    const { playing, loading, time, duration, failed, rate } = voice;
    const contentRef = useRef<HTMLDivElement>(null);
    const { extension } = splitFileName(name);
    const pattern = useMemo(() => barHeights(name), [name]);
    const bars = useWaveform(src, pattern, { size, duration });

    const max = duration || 1;
    const position = duration ? Math.min(time, duration) : 0;
    const played = duration ? position / duration : 0;
    const remaining = duration === undefined ? undefined : `-${formatPlaybackTime(duration - position)}`;
    const meta = [
        duration === undefined ? undefined : formatPlaybackTime(duration),
        size === undefined ? undefined : formatFileSize(size),
        extension ? extension.slice(1).toLowerCase() : undefined,
    ]
        .filter(Boolean)
        .join(' · ');

    const onKeyDown = (event: KeyboardEvent) => {
        // The menu has its own keys while it is open.
        if ((event.target as HTMLElement).closest('[role="menu"]')) return;
        if (event.key === ' ') voice.toggle();
        else if (event.key === 'ArrowRight') voice.skip(SKIP_SECONDS);
        else if (event.key === 'ArrowLeft') voice.skip(-SKIP_SECONDS);
        else return;
        // Space would also click a focused button, and the arrows would also move the seek bar a step.
        event.preventDefault();
    };

    const PlayIcon = playing ? Pause : Play;
    return (
        <Dialog open onOpenChange={open => !open && onClose()}>
            <DialogContent
                closeLabel={t('common.close')}
                variant="bare"
                hideClose
                overlayClassName="bg-overlay/50"
                // Focus lands on the dialog itself, not a control: every control here carries a hint, and
                // focus moved from the button that opened the dialog opens it, which then takes the first
                // Esc for itself. The keys work from here; Tab reaches the controls.
                onOpenAutoFocus={event => {
                    event.preventDefault();
                    contentRef.current?.focus();
                }}
                ref={contentRef}
                tabIndex={-1}
                onKeyDown={onKeyDown}
                className="left-1/2 top-1/2 flex w-[540px] max-w-[calc(100vw-4rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[20px] bg-background shadow-overlay outline-none"
            >
                <DialogDescription className="sr-only">{t('chat.voice.detail')}</DialogDescription>
                <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-hairline px-5">
                    <AuthorAvatar author={author} />
                    <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-callout font-bold text-foreground">{author.name}</span>
                        <span className="flex min-w-0 gap-1.5 text-caption text-description">
                            <span className="shrink-0">{author.time}</span>
                            {onShowInChat && (
                                <>
                                    <span aria-hidden>·</span>
                                    <button
                                        type="button"
                                        onClick={thenClose(onShowInChat)}
                                        className="focus-ring truncate rounded-sm hover:text-foreground hover:underline"
                                    >
                                        {t('chat.file.showInChat')}
                                    </button>
                                </>
                            )}
                        </span>
                    </div>
                    <HeaderHint label={t('chat.file.download')}>
                        <button
                            type="button"
                            onClick={onSave}
                            aria-label={t('chat.file.download')}
                            className={HEADER_BUTTON}
                        >
                            <Download size={16} aria-hidden />
                        </button>
                    </HeaderHint>
                    <DropdownMenu modal={false}>
                        <HeaderHint label={t('chat.file.moreHint')}>
                            <DropdownMenuTrigger asChild>
                                <button type="button" aria-label={t('chat.file.moreHint')} className={HEADER_BUTTON}>
                                    <MoreVertical size={16} aria-hidden />
                                </button>
                            </DropdownMenuTrigger>
                        </HeaderHint>
                        <DropdownMenuContent align="end" className="w-44 shadow-overlay">
                            {onShowInChat && (
                                <DropdownMenuItem onClick={thenClose(onShowInChat)} className="cursor-pointer py-2">
                                    <MessagesSquare size={16} aria-hidden />
                                    {t('chat.file.showInChat')}
                                </DropdownMenuItem>
                            )}
                            {onReply && (
                                <DropdownMenuItem onClick={thenClose(onReply)} className="cursor-pointer py-2">
                                    <MessageSquareReply size={16} aria-hidden />
                                    {t('chat.file.replyInThread')}
                                </DropdownMenuItem>
                            )}
                            {onCopyLink && (
                                <DropdownMenuItem onClick={onCopyLink} className="cursor-pointer py-2">
                                    <Link2 size={16} aria-hidden />
                                    {t('chat.file.copyLink')}
                                </DropdownMenuItem>
                            )}
                            {onForward && (
                                <DropdownMenuItem onClick={thenClose(onForward)} className="cursor-pointer py-2">
                                    <Forward size={16} aria-hidden />
                                    {t('chat.file.forward')}
                                </DropdownMenuItem>
                            )}
                            {onDelete && (
                                <DropdownMenuItem
                                    onClick={thenClose(onDelete)}
                                    className="cursor-pointer py-2 text-destructive focus:text-destructive"
                                >
                                    <Trash2 size={16} aria-hidden />
                                    {t('chat.image.delete')}
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <span aria-hidden className="h-5 w-px bg-hairline" />
                    <HeaderHint label={t('chat.voice.closeHint')}>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={t('common.close')}
                            className={HEADER_BUTTON}
                        >
                            <X size={18} aria-hidden />
                        </button>
                    </HeaderHint>
                </header>

                <div className="flex flex-col items-center gap-6 px-8 pb-6 pt-10">
                    <div aria-hidden className="flex h-[88px] items-center gap-[3px]">
                        {bars.map((height, index) => (
                            <span
                                key={index}
                                className={cn(
                                    'w-[3px] rounded-full transition-colors',
                                    index / bars.length < played ? 'bg-foreground' : 'bg-foreground/20'
                                )}
                                style={{ height: `${height}%` }}
                            />
                        ))}
                    </div>
                    <div className="flex w-full min-w-0 flex-col items-center gap-1 text-center">
                        <DialogTitle className="w-full truncate text-title font-bold text-foreground">
                            {name}
                        </DialogTitle>
                        {meta && <p className="text-caption tabular-nums text-description">{meta}</p>}
                        {failed && <p className="text-caption text-destructive">{t('chat.file.playFailed')}</p>}
                    </div>
                    <div className="flex w-full flex-col gap-1">
                        <input
                            type="range"
                            min={0}
                            max={max}
                            step="any"
                            value={position}
                            disabled={!duration || failed}
                            onChange={event => voice.seek(event.currentTarget.valueAsNumber)}
                            aria-label={t('chat.file.seek', { name })}
                            aria-valuetext={`${formatPlaybackTime(position)} / ${formatPlaybackTime(duration ?? 0)}`}
                            style={{ '--seek-progress': `${played * 100}%` } as CSSProperties}
                            className="seek-slider focus-ring w-full cursor-pointer disabled:cursor-default"
                        />
                        <div className="flex justify-between text-caption tabular-nums text-description">
                            <span>{formatPlaybackTime(position)}</span>
                            {remaining && <span>{remaining}</span>}
                        </div>
                    </div>
                    <div className="flex items-center gap-5">
                        <button
                            type="button"
                            onClick={voice.cycleRate}
                            disabled={failed}
                            aria-label={t('chat.voice.rate', { rate })}
                            className="focus-ring tactile h-10 min-w-10 rounded-lg bg-muted px-2 text-caption font-semibold tabular-nums text-foreground transition-colors ease-tactile hover:bg-accent disabled:opacity-40"
                        >
                            {rate}x
                        </button>
                        <button
                            type="button"
                            onClick={() => voice.skip(-SKIP_SECONDS)}
                            disabled={failed}
                            aria-label={t('chat.voice.back', { seconds: SKIP_SECONDS })}
                            className={cn(ROUND_BUTTON, 'disabled:opacity-40')}
                        >
                            <RotateCcw size={20} aria-hidden />
                        </button>
                        <button
                            type="button"
                            onClick={voice.toggle}
                            disabled={failed}
                            aria-label={t(playing ? 'chat.file.pause' : 'chat.file.play', { name })}
                            aria-busy={loading || undefined}
                            className="focus-ring tactile flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background transition-opacity ease-tactile hover:opacity-90 disabled:opacity-40"
                        >
                            {loading ? (
                                <LoaderCircle size={22} aria-hidden className="animate-spin" />
                            ) : (
                                <PlayIcon
                                    size={22}
                                    aria-hidden
                                    fill="currentColor"
                                    className={cn(!playing && 'translate-x-px')}
                                />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => voice.skip(SKIP_SECONDS)}
                            disabled={failed}
                            aria-label={t('chat.voice.forward', { seconds: SKIP_SECONDS })}
                            className={cn(ROUND_BUTTON, 'disabled:opacity-40')}
                        >
                            <RotateCw size={20} aria-hidden />
                        </button>
                        {/* Balances the speed button, so play sits in the middle. */}
                        <span aria-hidden className="h-10 min-w-10" />
                    </div>
                    <p className="text-micro text-description">
                        {t('chat.voice.shortcuts', { seconds: SKIP_SECONDS })}
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
};

/** Header hints open below their button: above, they would leave the dialog's top edge. */
const HeaderHint = ({ label, children }: { label: string; children: ReactElement }) => (
    <Hint label={label} side="bottom" delayDuration={HINT_DELAY}>
        {children}
    </Hint>
);

/**
 * A fixed pattern of bar heights (percent) for a name: the same file always draws the same bars, and
 * two files side by side do not look alike. A small string hash seeds a sine mix, tapered at both ends.
 */
const barHeights = (seed: string): number[] => {
    let hash = 0;
    for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return Array.from({ length: BAR_COUNT }, (_, index) => {
        const wave = Math.abs(Math.sin(index * 0.7 + hash) * 0.6 + Math.sin(index * 0.23 + hash / 7) * 0.4);
        const taper = Math.sin((Math.PI * (index + 0.5)) / BAR_COUNT);
        return Math.round(15 + 85 * wave * taper);
    });
};
