import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FileText, Film, Pause, Play, X } from 'lucide-react';

import { cn } from '@chatic/ui-kit';
import { Hint } from '@chatic/design-system-components-desktop';

import type { ComposerAttachment } from '../../hooks';
import { MAX_ATTACHMENTS, formatFileSize, formatPlaybackTime } from '../../utils';
import { ComposerPreview, canPreviewAttachment, isAudioAttachment } from './ComposerPreview';
import { ImageSpinner } from './ImageSpinner';
import { useVoicePlayback } from './voicePlayback';
import { hoverReveal } from '../../../../shared';

interface ComposerAttachmentsProps {
    attachments: ComposerAttachment[];
    onRemove: (id: string) => void;
    onEmptied?: () => void;
}

export const ComposerAttachments = ({ attachments, onRemove, onEmptied }: ComposerAttachmentsProps) => {
    const { t } = useTranslation();
    const listRef = useRef<HTMLUListElement>(null);
    const refocusAt = useRef<number | null>(null);
    const [announcement, setAnnouncementState] = useState({ text: '', seq: 0 });
    const setAnnouncement = (text: string) => setAnnouncementState(current => ({ text, seq: current.seq + 1 }));
    const previousCount = useRef(attachments.length);
    const [decoded, setDecoded] = useState<ReadonlySet<string>>(() => new Set());
    const markDecoded = (id: string) => setDecoded(current => (current.has(id) ? current : new Set(current).add(id)));
    const [previewId, setPreviewId] = useState<string | null>(null);
    const previewing = attachments.find(attachment => attachment.id === previewId);

    useEffect(() => {
        const added = attachments.length - previousCount.current;
        previousCount.current = attachments.length;
        if (added > 0) setAnnouncement(t('chat.attach.announce.added', { count: added }));

        const at = refocusAt.current;
        if (at === null) return;
        refocusAt.current = null;
        const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-remove]') ?? [];
        const next = buttons[Math.min(at, buttons.length - 1)];
        if (next) next.focus();
        else onEmptied?.();
    }, [attachments, onEmptied, t]);

    const remove = (index: number, attachment: ComposerAttachment) => {
        refocusAt.current = index;
        setAnnouncement(t('chat.attach.announce.removed', { name: attachment.name }));
        onRemove(attachment.id);
    };

    return (
        <>
            <span role="status" aria-live="polite" className="sr-only">
                <span key={announcement.seq}>{announcement.text}</span>
            </span>
            {attachments.length > 0 && (
                <div className="flex items-end gap-3">
                    <ul
                        ref={listRef}
                        aria-label={t('chat.attach.tray')}
                        className="scrollbar-thin flex min-w-0 flex-1 gap-3.5 overflow-x-auto pb-1 pr-2 pt-2"
                    >
                        {attachments.map((attachment, index) => {
                            const isImage = !attachment.kind || attachment.kind === 'image';
                            const isDecoding = isImage && !decoded.has(attachment.id);
                            const KindIcon = attachment.kind === 'video' ? Film : FileText;
                            const canOpen = canPreviewAttachment(attachment);
                            const Tile = canOpen ? 'button' : 'div';
                            return (
                                <li
                                    key={attachment.id}
                                    aria-busy={isDecoding || undefined}
                                    className="group/att relative h-[92px] w-[92px] shrink-0"
                                >
                                    {isAudioAttachment(attachment) ? (
                                        <AudioTile attachment={attachment} />
                                    ) : (
                                        <Tile
                                            {...(canOpen && {
                                                type: 'button' as const,
                                                onClick: () => setPreviewId(attachment.id),
                                                'aria-label': t('chat.file.open', { name: attachment.name }),
                                            })}
                                            className={cn(
                                                'block h-full w-full overflow-hidden rounded-2xl border border-hairline bg-muted text-left',
                                                canOpen && 'focus-ring cursor-zoom-in'
                                            )}
                                        >
                                            {!isImage && (
                                                <div className="flex h-full w-full flex-col justify-between p-2.5">
                                                    <KindIcon size={20} aria-hidden className="text-muted-foreground" />
                                                    <div className="min-w-0">
                                                        <p className="line-clamp-2 break-all text-caption font-medium text-foreground">
                                                            {attachment.name}
                                                        </p>
                                                        <p className="text-caption tabular-nums text-muted-foreground">
                                                            {formatFileSize(attachment.size)}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                            {isImage && (
                                                <img
                                                    src={attachment.url}
                                                    alt={attachment.name}
                                                    decoding="async"
                                                    draggable={false}
                                                    onLoad={() => markDecoded(attachment.id)}
                                                    onError={() => markDecoded(attachment.id)}
                                                    className={cn(
                                                        'h-full w-full object-cover',
                                                        isDecoding && 'blur-[1px]'
                                                    )}
                                                />
                                            )}
                                            {isDecoding && (
                                                <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-overlay/40">
                                                    <ImageSpinner className="h-5 w-5 border-2" />
                                                </span>
                                            )}
                                        </Tile>
                                    )}
                                    <Hint label={t('chat.attach.remove', { name: attachment.name })}>
                                        <button
                                            type="button"
                                            data-remove=""
                                            onClick={() => remove(index, attachment)}
                                            aria-label={t('chat.attach.remove', { name: attachment.name })}
                                            className={cn(
                                                'focus-ring hit-target absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-background bg-foreground text-background',
                                                hoverReveal('att')
                                            )}
                                        >
                                            <X size={14} aria-hidden />
                                        </button>
                                    </Hint>
                                </li>
                            );
                        })}
                    </ul>
                    <span className="shrink-0 pb-1 text-caption tabular-nums text-muted-foreground">
                        <span aria-hidden>
                            {attachments.length}/{MAX_ATTACHMENTS}
                        </span>
                        <span className="sr-only">
                            {t('chat.attach.countLabel', { count: attachments.length, max: MAX_ATTACHMENTS })}
                        </span>
                    </span>
                </div>
            )}
            {previewing && <ComposerPreview attachment={previewing} onClose={() => setPreviewId(null)} />}
        </>
    );
};

const AudioTile = ({ attachment }: { attachment: ComposerAttachment }) => {
    const { t } = useTranslation();
    const { playing, time, duration, failed, toggle } = useVoicePlayback(attachment.url);
    const name = attachment.name;
    const PlayIcon = playing ? Pause : Play;
    const Tile = failed ? 'div' : 'button';
    const started = time > 0 || playing;
    const caption = failed
        ? t('chat.file.playFailed')
        : started
          ? formatPlaybackTime(time)
          : [t('chat.voice.chip'), duration === undefined ? undefined : formatPlaybackTime(duration)]
                .filter(Boolean)
                .join(' · ');

    return (
        <Tile
            {...(!failed && {
                type: 'button' as const,
                onClick: toggle,
                'aria-label': t(playing ? 'chat.file.pause' : 'chat.file.play', { name }),
            })}
            className={cn(
                'relative block h-full w-full overflow-hidden rounded-2xl border border-hairline bg-muted text-left',
                !failed && 'focus-ring'
            )}
        >
            <div className="flex h-full w-full flex-col justify-between p-2.5">
                <span
                    className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background',
                        failed && 'opacity-40'
                    )}
                >
                    <PlayIcon size={12} aria-hidden fill="currentColor" />
                </span>
                <div className="min-w-0">
                    <p className="line-clamp-2 break-all text-caption font-medium text-foreground">{name}</p>
                    <p
                        className={cn(
                            'text-caption tabular-nums',
                            failed ? 'text-destructive' : 'text-muted-foreground'
                        )}
                    >
                        {caption}
                    </p>
                </div>
            </div>
            {duration !== undefined && started && (
                <span aria-hidden className="absolute inset-x-2.5 bottom-1.5 h-0.5 overflow-hidden rounded-full">
                    <span
                        className="block h-full origin-left bg-foreground"
                        style={{ transform: `scaleX(${Math.min(time / duration, 1)})` }}
                    />
                </span>
            )}
        </Tile>
    );
};
