import { useMemo, useRef, type KeyboardEvent, type ReactElement } from 'react';
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

import {
    cn,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit';
import { Hint } from '@chatic/design-system-components-desktop';

import { formatFileSize, formatPlaybackTime, splitFileName } from '../../utils';
import { AuthorAvatar, type ImageAuthor } from './ImageViewer';
import { useSmoothProgress, useVoicePlayback } from './voicePlayback';
import { useWaveform } from './voiceWaveform';

const SKIP_SECONDS = 15;
const HINT_DELAY = 500;
const BAR_COUNT = 48;

export interface VoiceDetailDialogProps {
    src: string;
    name: string;
    size?: number;
    author: ImageAuthor;
    onClose: () => void;
    onSave: () => void;
    onShowInChat?: () => void;
    onReply?: () => void;
    onCopyLink?: () => void;
    onForward?: () => void;
    onDelete?: () => void;
}

const HEADER_BUTTON =
    'focus-ring tactile flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-colors ease-tactile hover:bg-foreground/[0.08] data-[state=open]:bg-foreground/[0.08]';
const ROUND_BUTTON =
    'focus-ring tactile flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors ease-tactile hover:bg-foreground/[0.08]';

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
    const progressRef = useSmoothProgress<HTMLDivElement>(src, playing, played);
    const remaining = duration === undefined ? undefined : `-${formatPlaybackTime(duration - position)}`;
    const meta = [
        duration === undefined ? undefined : formatPlaybackTime(duration),
        size === undefined ? undefined : formatFileSize(size),
        extension ? extension.slice(1).toLowerCase() : undefined,
    ]
        .filter(Boolean)
        .join(' · ');

    const onKeyDown = (event: KeyboardEvent) => {
        if ((event.target as HTMLElement).closest('[role="menu"]')) return;
        if (event.key === ' ') voice.toggle();
        else if (event.key === 'ArrowRight') voice.skip(SKIP_SECONDS);
        else if (event.key === 'ArrowLeft') voice.skip(-SKIP_SECONDS);
        else return;
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

                <div ref={progressRef} className="flex flex-col items-center gap-6 px-8 pb-6 pt-10">
                    <div aria-hidden className="relative h-[88px]">
                        <WaveBars bars={bars} className="bg-foreground/20" />
                        <div className="absolute inset-0 [clip-path:inset(0_calc(100%-var(--seek-progress,0%))_0_0)]">
                            <WaveBars bars={bars} className="bg-foreground" />
                        </div>
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

const HeaderHint = ({ label, children }: { label: string; children: ReactElement }) => (
    <Hint label={label} side="bottom" delayDuration={HINT_DELAY}>
        {children}
    </Hint>
);

const WaveBars = ({ bars, className }: { bars: number[]; className: string }) => (
    <div className="flex h-full items-center gap-[3px]">
        {bars.map((height, index) => (
            <span key={index} className={cn('w-[3px] rounded-full', className)} style={{ height: `${height}%` }} />
        ))}
    </div>
);

const barHeights = (seed: string): number[] => {
    let hash = 0;
    for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return Array.from({ length: BAR_COUNT }, (_, index) => {
        const wave = Math.abs(Math.sin(index * 0.7 + hash) * 0.6 + Math.sin(index * 0.23 + hash / 7) * 0.4);
        const taper = Math.sin((Math.PI * (index + 0.5)) / BAR_COUNT);
        return Math.round(15 + 85 * wave * taper);
    });
};
